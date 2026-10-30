// Lecturas y reportes del libro contable. Todo sale de partidas y partida_lineas.
const db = require('../db');

const SIN_ACENTOS = (col) => `translate(lower(${col}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;
const r2 = (n) => Math.round((Number(n) + 1e-9) * 100) / 100;

async function estado() {
  const { rows } = await db.query(
    'SELECT contabilidad_inicio, dias_credito, zona_horaria, hoy_negocio() AS hoy FROM configuracion_negocio WHERE id = 1'
  );
  const f = rows[0] || {};
  return { iniciada: !!f.contabilidad_inicio, inicio: f.contabilidad_inicio || null, diasCredito: f.dias_credito || 30, hoy: f.hoy };
}

async function iniciar() {
  const { rows } = await db.query('SELECT generar_apertura_contable() AS r');
  return rows[0].r;
}

// Saldo de cada cuenta con su signo natural, entre dos fechas (null = sin límite)
async function saldosPorCuenta(desde, hasta) {
  const { rows } = await db.query(
    `SELECT c.id, c.codigo, c.clave, c.nombre, c.tipo, c.es_efectivo,
            COALESCE(SUM(l.debe), 0) AS debe, COALESCE(SUM(l.haber), 0) AS haber
       FROM plan_cuentas c
       LEFT JOIN (SELECT l.cuenta_id, l.debe, l.haber
                    FROM partida_lineas l JOIN partidas p ON p.id = l.partida_id
                   WHERE ($1::date IS NULL OR p.fecha >= $1::date) AND ($2::date IS NULL OR p.fecha <= $2::date)) l
              ON l.cuenta_id = c.id
      GROUP BY c.id
      ORDER BY c.codigo`, [desde || null, hasta || null]
  );
  return rows.map((c) => ({
    ...c,
    saldo: r2(['activo', 'gasto'].includes(c.tipo) ? c.debe - c.haber : c.haber - c.debe),
  }));
}

// ---------- Tarjetas y gráficos del resumen ----------
async function resumen() {
  const e = await estado();
  const hoy = e.hoy;
  const [caja] = (await db.query("SELECT saldo_cuenta('caja') AS caja, saldo_cuenta('bancos') AS bancos")).rows;
  const cartera = async (vista) => (await db.query(
    `SELECT COALESCE(SUM(saldo), 0) AS total, COALESCE(SUM(saldo) FILTER (WHERE dias_vencido > 0), 0) AS vencido,
            COUNT(*) AS documentos, COUNT(*) FILTER (WHERE dias_vencido > 0) AS vencidos FROM ${vista}`
  )).rows[0];
  const [cxc, cxp] = await Promise.all([cartera('v_cxc'), cartera('v_cxp')]);

  const util = async (desde, hasta) => (await db.query(
    `SELECT COALESCE(SUM(CASE WHEN c.tipo = 'ingreso' THEN l.haber - l.debe END), 0) AS ingresos,
            COALESCE(SUM(CASE WHEN c.tipo = 'gasto' THEN l.debe - l.haber END), 0) AS gastos
       FROM partida_lineas l JOIN partidas p ON p.id = l.partida_id JOIN plan_cuentas c ON c.id = l.cuenta_id
      WHERE p.fecha >= $1::date AND p.fecha <= $2::date`, [desde, hasta]
  )).rows[0];
  const inicioMes = hoy.slice(0, 8) + '01';
  const mesAnt = (await db.query("SELECT (date_trunc('month', $1::date) - interval '1 month')::date AS d, (date_trunc('month', $1::date) - interval '1 day')::date AS h", [hoy])).rows[0];
  const [um, ua] = await Promise.all([util(inicioMes, hoy), util(mesAnt.d, mesAnt.h)]);

  const meses = (await db.query(
    `WITH meses AS (SELECT generate_series(date_trunc('month', $1::date) - interval '5 months', date_trunc('month', $1::date), interval '1 month')::date AS mes)
     SELECT to_char(m.mes, 'YYYY-MM') AS mes,
            COALESCE(SUM(CASE WHEN c.es_efectivo AND p.origen_tipo <> 'saldo_inicial' THEN l.debe - l.haber END), 0) AS flujo,
            COALESCE(SUM(CASE WHEN c.tipo IN ('ingreso', 'gasto') THEN l.haber - l.debe END), 0) AS utilidad
       FROM meses m
       LEFT JOIN partidas p ON p.fecha >= m.mes AND p.fecha < (m.mes + interval '1 month')::date
       LEFT JOIN partida_lineas l ON l.partida_id = p.id
       LEFT JOIN plan_cuentas c ON c.id = l.cuenta_id
      GROUP BY m.mes ORDER BY m.mes`, [hoy]
  )).rows;

  const [inv] = (await db.query("SELECT valor_inventario() AS valor, saldo_cuenta('inventario') AS libro")).rows;
  const utilidadMes = r2(um.ingresos - um.gastos);
  const utilidadAnt = r2(ua.ingresos - ua.gastos);
  return {
    estado: e,
    caja: { caja: caja.caja, bancos: caja.bancos, total: r2(caja.caja + caja.bancos) },
    cxc, cxp,
    utilidadMes: { ingresos: r2(um.ingresos), gastos: r2(um.gastos), utilidad: utilidadMes, anterior: utilidadAnt },
    meses: meses.map((m) => ({ mes: m.mes, flujo: r2(m.flujo), utilidad: r2(m.utilidad) })),
    inventario: { existencias: inv.valor, libro: inv.libro, diferencia: r2(inv.valor - inv.libro) },
  };
}

// ---------- Libro diario ----------
async function libro({ desde, hasta, cuenta, origen, q, orden = 'desc', offset = 0, limite = 50 }) {
  const params = [];
  const cond = [];
  const param = (v) => { params.push(v); return '$' + params.length; };
  if (desde) cond.push(`p.fecha >= ${param(desde)}::date`);
  if (hasta) cond.push(`p.fecha <= ${param(hasta)}::date`);
  if (origen) cond.push(`p.origen_tipo = ${param(origen)}`);
  if (cuenta) cond.push(`EXISTS (SELECT 1 FROM partida_lineas x WHERE x.partida_id = p.id AND x.cuenta_id = ${param(cuenta)})`);
  if (q) {
    const patron = param('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
    cond.push(`(${SIN_ACENTOS('p.descripcion')} LIKE ${patron} ESCAPE '\\' OR lower(p.numero) LIKE ${patron} ESCAPE '\\')`);
  }
  const donde = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const sentido = orden === 'asc' ? 'ASC' : 'DESC';

  const resumen = (await db.query(
    `SELECT COUNT(*) AS cantidad FROM partidas p ${donde}`, params
  )).rows[0];
  const partidas = (await db.query(
    `SELECT p.id, p.numero, p.fecha, p.descripcion, p.origen_tipo, p.origen_id, p.reversa_de,
            EXISTS (SELECT 1 FROM partidas r WHERE r.reversa_de = p.id) AS anulada,
            (SELECT SUM(debe) FROM partida_lineas WHERE partida_id = p.id) AS total
       FROM partidas p ${donde}
      ORDER BY p.fecha ${sentido}, p.id ${sentido}
      LIMIT ${Number(limite) + 1} OFFSET ${Number(offset)}`, params
  )).rows;
  const hayMas = partidas.length > limite;
  const pagina = hayMas ? partidas.slice(0, limite) : partidas;

  const lineas = pagina.length ? (await db.query(
    `SELECT l.partida_id, l.debe, l.haber, l.detalle, c.codigo, c.nombre
       FROM partida_lineas l JOIN plan_cuentas c ON c.id = l.cuenta_id
      WHERE l.partida_id = ANY($1::bigint[]) ORDER BY l.id`, [pagina.map((p) => p.id)]
  )).rows : [];
  const porPartida = new Map();
  lineas.forEach((l) => { if (!porPartida.has(l.partida_id)) porPartida.set(l.partida_id, []); porPartida.get(l.partida_id).push(l); });
  return { partidas: pagina.map((p) => ({ ...p, lineas: porPartida.get(p.id) || [] })), hayMas, cantidad: resumen.cantidad };
}

async function cuentas() {
  return (await db.query('SELECT id, codigo, clave, nombre, tipo, es_efectivo FROM plan_cuentas WHERE activo ORDER BY codigo')).rows;
}

// Balanza de comprobación
async function balanza(desde, hasta) {
  const filas = await saldosPorCuenta(desde, hasta);
  const totales = filas.reduce((t, c) => ({ debe: t.debe + Number(c.debe), haber: t.haber + Number(c.haber) }), { debe: 0, haber: 0 });
  return { filas, debe: r2(totales.debe), haber: r2(totales.haber), cuadra: r2(totales.debe) === r2(totales.haber) };
}

// ---------- Reportes ----------
async function estadoResultados(desde, hasta) {
  const cuentasP = await saldosPorCuenta(desde, hasta);
  const monto = (c) => c.saldo;
  const ingresos = cuentasP.filter((c) => c.tipo === 'ingreso' && c.saldo !== 0).map((c) => ({ codigo: c.codigo, nombre: c.nombre, monto: monto(c) }));
  const costo = cuentasP.find((c) => c.clave === 'costo_ventas');
  const gastos = cuentasP.filter((c) => c.tipo === 'gasto' && c.clave !== 'costo_ventas' && c.saldo !== 0).map((c) => ({ codigo: c.codigo, nombre: c.nombre, monto: monto(c) }));
  const totalIngresos = r2(ingresos.reduce((s, c) => s + c.monto, 0));
  const costoVentas = costo ? costo.saldo : 0;
  const totalGastos = r2(gastos.reduce((s, c) => s + c.monto, 0));
  const ventas = cuentasP.find((c) => c.clave === 'ventas');
  return {
    desde, hasta, ingresos, totalIngresos, costoVentas,
    utilidadBruta: r2(totalIngresos - costoVentas), gastos, totalGastos,
    utilidadNeta: r2(totalIngresos - costoVentas - totalGastos),
    ventas: ventas ? ventas.saldo : 0,
  };
}

const CONCEPTOS_FLUJO = {
  venta: 'Ventas al contado',
  abono_cliente: 'Cobros de cuentas por cobrar',
  ingreso: 'Otros ingresos cobrados',
  gasto: 'Pago de gastos',
  compra: 'Compras de inventario pagadas',
  pago_proveedor: 'Pagos a proveedores',
  saldo_inicial: 'Saldos iniciales registrados',
  manual: 'Asientos manuales',
  ajuste_inventario: 'Ajustes',
  apertura: 'Apertura',
  anulacion: 'Anulaciones',
};

// Flujo de caja: solo lo que movió Caja y Bancos (método directo, desde el libro)
async function flujoCaja(desde, hasta) {
  const e = await estado();
  const antes = desde ? await saldosPorCuenta(null, (await db.query("SELECT ($1::date - 1)::date AS d", [desde])).rows[0].d) : null;
  const efectivo = (filas) => (filas || []).filter((c) => c.es_efectivo);
  const inicial = { caja: 0, bancos: 0 };
  if (antes) efectivo(antes).forEach((c) => { inicial[c.clave] = c.saldo; });

  const { rows } = await db.query(
    `SELECT p.origen_tipo, COALESCE(SUM(l.debe), 0) AS entra, COALESCE(SUM(l.haber), 0) AS sale
       FROM partida_lineas l JOIN partidas p ON p.id = l.partida_id JOIN plan_cuentas c ON c.id = l.cuenta_id
      WHERE c.es_efectivo AND ($1::date IS NULL OR p.fecha >= $1::date) AND p.fecha <= $2::date
      GROUP BY p.origen_tipo`, [desde || null, hasta]
  );
  const entradas = []; const salidas = [];
  rows.forEach((r) => {
    const neto = r2(r.entra - r.sale);
    const concepto = CONCEPTOS_FLUJO[r.origen_tipo] || r.origen_tipo;
    if (neto > 0) entradas.push({ concepto, monto: neto, origen: r.origen_tipo });
    else if (neto < 0) salidas.push({ concepto, monto: -neto, origen: r.origen_tipo });
  });
  entradas.sort((a, b) => b.monto - a.monto); salidas.sort((a, b) => b.monto - a.monto);
  const totalEntradas = r2(entradas.reduce((s, x) => s + x.monto, 0));
  const totalSalidas = r2(salidas.reduce((s, x) => s + x.monto, 0));
  const saldoInicial = r2(inicial.caja + inicial.bancos);
  const finales = efectivo(await saldosPorCuenta(null, hasta));
  const final = {}; finales.forEach((c) => { final[c.clave] = c.saldo; });
  return {
    desde, hasta, saldoInicial, entradas, totalEntradas, salidas, totalSalidas,
    flujoNeto: r2(totalEntradas - totalSalidas), saldoFinal: r2(saldoInicial + totalEntradas - totalSalidas),
    inicial, final, estado: e,
  };
}

async function balanceGeneral(fecha) {
  const c = await saldosPorCuenta(null, fecha);
  const lista = (tipo) => c.filter((x) => x.tipo === tipo && x.saldo !== 0).map((x) => ({ codigo: x.codigo, nombre: x.nombre, monto: x.saldo }));
  const activos = lista('activo'); const pasivos = lista('pasivo'); const patrimonio = lista('patrimonio');
  const resultado = r2(c.filter((x) => x.tipo === 'ingreso').reduce((s, x) => s + x.saldo, 0) - c.filter((x) => x.tipo === 'gasto').reduce((s, x) => s + x.saldo, 0));
  const totalActivos = r2(activos.reduce((s, x) => s + x.monto, 0));
  const totalPasivos = r2(pasivos.reduce((s, x) => s + x.monto, 0));
  const totalPatrimonio = r2(patrimonio.reduce((s, x) => s + x.monto, 0) + resultado);
  const inv = (await db.query("SELECT valor_inventario() AS valor")).rows[0].valor;
  const libroInv = (c.find((x) => x.clave === 'inventario') || {}).saldo || 0;
  return {
    fecha, activos, totalActivos, pasivos, totalPasivos, patrimonio, resultado, totalPatrimonio,
    diferencia: r2(totalActivos - totalPasivos - totalPatrimonio),
    inventarioExistencias: inv, diferenciaInventario: r2(inv - libroInv),
  };
}

module.exports = { estado, iniciar, saldosPorCuenta, resumen, libro, cuentas, balanza, estadoResultados, flujoCaja, balanceGeneral, r2 };
