// Estadísticas de ventas (Fase 6, HU-27). Los cálculos pesados viven en funciones SQL de solo lectura
// (db/migrations/06_migracion_fase6.sql) para que el período, el vendedor y la categoría se filtren en la
// base y no en Node. Este archivo valida filtros, arma la respuesta JSON y redacta los insights.
const db = require('../db');
const V = require('../utils/validar');
const { sumarDias, dinero, fecha, fechaHora } = require('../utils/formato');

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const PERIODOS = {
  hoy: 'Hoy', ayer: 'Ayer', semana: 'Esta semana', mes: 'Este mes', mes_pasado: 'Mes pasado',
  '30d': 'Últimos 30 días', anio: 'Este año', todo: 'Todo',
};

const una = async (texto, params) => (await db.query(texto, params)).rows[0];

// "Hoy" según la zona horaria del negocio guardada en la base (la misma que usa la contabilidad)
const hoy = async () => (await una('SELECT hoy_negocio()::text AS h')).h;

// 1 = lunes ... 7 = domingo, sin depender de la zona del servidor
function diaSemanaISO(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  const n = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return n === 0 ? 7 : n;
}

const pad = (n, largo = 2) => String(n).padStart(largo, '0');
const armar = (a, m, d) => `${pad(a, 4)}-${pad(m)}-${pad(d)}`;

// De una clave de período rápido a fechas. "todo" no tiene fecha inicial (desde la primera venta).
function resolverPeriodo(clave, hoyISO) {
  const [a, m] = hoyISO.split('-').map(Number);
  switch (clave) {
    case 'hoy': return { desde: hoyISO, hasta: hoyISO };
    case 'ayer': { const d = sumarDias(hoyISO, -1); return { desde: d, hasta: d }; }
    case 'semana': return { desde: sumarDias(hoyISO, 1 - diaSemanaISO(hoyISO)), hasta: hoyISO };
    case 'mes': return { desde: armar(a, m, 1), hasta: hoyISO };
    case 'mes_pasado': return { desde: armar(m === 1 ? a - 1 : a, m === 1 ? 12 : m - 1, 1), hasta: sumarDias(armar(a, m, 1), -1) };
    case '30d': return { desde: sumarDias(hoyISO, -29), hasta: hoyISO };
    case 'anio': return { desde: armar(a, 1, 1), hasta: hoyISO };
    case 'todo': return { desde: null, hasta: hoyISO };
    default: return null;
  }
}

// Lee y valida los filtros de la consulta. "periodo" es un atajo: si llegan desde/hasta mandan ellas.
function leerFiltros(q, hoyISO) {
  const desdeQ = V.fechaISO(q.desde, 'La fecha inicial');
  const hastaQ = V.fechaISO(q.hasta, 'La fecha final');
  const vendedor = V.idOpcional(q.vendedor, 'El vendedor');
  const categoria = V.idOpcional(q.categoria, 'La categoría');
  let periodo = 'mes_personalizado'; let desde; let hasta;
  if (desdeQ || hastaQ) {
    periodo = 'personalizado'; desde = desdeQ; hasta = hastaQ || hoyISO;
  } else {
    periodo = q.periodo ? String(q.periodo) : 'mes';
    const r = resolverPeriodo(periodo, hoyISO);
    if (!r) throw new V.ErrorValidacion('El período no es válido.');
    ({ desde, hasta } = r);
  }
  // No hay ventas en el futuro: se recorta al día de hoy para no armar series de años vacíos
  if (hasta > hoyISO) hasta = hoyISO;
  if (desde && desde > hoyISO) desde = hoyISO;
  if (desde && desde < '2000-01-01') throw new V.ErrorValidacion('La fecha inicial no es válida.');
  if (desde && desde > hasta) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
  return { periodo, desde, hasta, vendedor, categoria };
}

async function panel({ desde, hasta, vendedor, categoria }) {
  return (await una('SELECT estadisticas_panel($1::date, $2::date, $3::bigint, $4::bigint, NULL) AS r', [desde, hasta, vendedor, categoria])).r;
}
const kpis = async (desde, hasta, vendedor = null, categoria = null) =>
  (await una('SELECT estadisticas_kpis($1::date, $2::date, $3::bigint, $4::bigint) AS r', [desde, hasta, vendedor, categoria])).r;
const serie = async (desde, hasta, vendedor = null, categoria = null, agrupar = null) =>
  (await una('SELECT estadisticas_serie($1::date, $2::date, $3::bigint, $4::bigint, $5::text) AS r', [desde, hasta, vendedor, categoria, agrupar])).r;
const topProductos = async (desde, hasta, vendedor = null, categoria = null, limite = 10) =>
  (await una('SELECT estadisticas_top_productos($1::date, $2::date, $3::bigint, $4::bigint, $5::int) AS r', [desde, hasta, vendedor, categoria, limite])).r;

// Opciones de los filtros. Vendedores = usuarios activos que pueden vender (permiso pos.crear; el admin siempre puede).
async function opciones() {
  const [vendedores, categorias] = await Promise.all([
    db.query(
      `SELECT u.id, u.nombre, r.nombre AS rol
         FROM usuarios u JOIN roles r ON r.id = u.rol_id
        WHERE u.activo AND r.activo
          AND ((r.nombre = 'admin' AND r.es_sistema)
               OR EXISTS (SELECT 1 FROM roles_permisos rp JOIN permisos p ON p.id = rp.permiso_id
                           WHERE rp.rol_id = r.id AND p.modulo = 'pos' AND p.accion = 'crear'))
        ORDER BY LOWER(u.nombre), u.id`
    ),
    db.query('SELECT id, nombre FROM categorias WHERE activo ORDER BY LOWER(nombre), id'),
  ]);
  return { vendedores: vendedores.rows, categorias: categorias.rows };
}

async function nombres(vendedor, categoria) {
  const [v, c] = await Promise.all([
    vendedor ? una('SELECT nombre FROM usuarios WHERE id = $1', [vendedor]) : null,
    categoria ? una('SELECT nombre FROM categorias WHERE id = $1', [categoria]) : null,
  ]);
  return { vendedorNombre: v ? v.nombre : null, categoriaNombre: c ? c.nombre : null };
}

// Cuentas por cobrar (vista v_cxc). Es la misma consulta que usa Finanzas, sin cargar todo el resumen contable.
async function cuentasPorCobrar() {
  return una(
    `SELECT COALESCE(SUM(saldo), 0)::float AS total, COALESCE(SUM(saldo) FILTER (WHERE dias_vencido > 0), 0)::float AS vencido,
            COUNT(*)::int AS documentos, (COUNT(*) FILTER (WHERE dias_vencido > 0))::int AS vencidos
       FROM v_cxc WHERE saldo > 0`
  );
}

// ---------------------------------------------------------------------
// Armado de la respuesta
// ---------------------------------------------------------------------
const redondear1 = (n) => Math.round(Number(n) * 10) / 10;
const variacion = (act, ant) => (ant === null || ant === undefined || !(Number(ant) > 0) ? null : redondear1((Number(act) - Number(ant)) / Number(ant) * 100));
const pctTexto = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1)) + '%';
const unidadesTexto = (n) => { const x = Number(n); return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100); };

function etiquetaPunto(inicio, agrupar) {
  const [a, m, d] = inicio.split('-');
  if (agrupar === 'mes') return `${MESES_CORTOS[Number(m) - 1]} ${a}`;
  return (agrupar === 'semana' ? 'Sem. ' : '') + `${d}/${m}`;
}

// Redacta los insights con los valores reales del período. Función pura: se prueba sin base de datos.
function construirInsights(r, ctx = {}) {
  const k = r.kpis; const a = r.kpis_anterior; const out = [];
  if (!k.facturas) return out;
  const nuevo = (clave, icono, tono, texto, enlace) => out.push({ clave, icono, tono, texto, enlace: enlace || null });

  if (r.comparar && a) {
    const v = variacion(k.ventas_total, a.ventas_total);
    if (v === null) nuevo('variacion', 'chart', 'neutro', 'No hubo ventas en el período anterior para comparar.');
    else if (v === 0) nuevo('variacion', 'equal', 'neutro', 'Las ventas se mantuvieron iguales que en el período anterior.');
    else nuevo('variacion', v > 0 ? 'trend-up' : 'trend-down', v > 0 ? 'positivo' : 'negativo',
      `Ventas ${v > 0 ? '↑' : '↓'} ${pctTexto(Math.abs(v))} respecto al período anterior (${fecha(r.anterior.desde)} al ${fecha(r.anterior.hasta)}).`);
  }
  if (r.mejor_dia && r.dias > 1) {
    nuevo('mejor_dia', 'calendar', 'positivo', `Tu mejor día fue el ${DIAS[diaSemanaISO(r.mejor_dia.fecha) - 1]} ${fecha(r.mejor_dia.fecha)} con ${dinero(r.mejor_dia.total)}.`);
  }
  const p = r.top_productos.por_cantidad[0];
  if (p) nuevo('producto_estrella', 'box', 'neutro', `El producto más vendido es ${p.nombre} (${unidadesTexto(p.unidades)} ${Number(p.unidades) === 1 ? 'unidad' : 'unidades'}).`);
  const lider = r.vendedores[0];
  if (lider && r.vendedores.length > 1) nuevo('vendedor_lider', 'user', 'neutro', `El vendedor ${lider.nombre} lidera con ${dinero(lider.monto)} (${pctTexto(lider.porcentaje)} del total).`);
  const mm = r.top_productos.mejor_margen;
  if (mm) nuevo('mejor_margen', 'percent', 'positivo', `El producto con mejor margen es ${mm.nombre} al ${pctTexto(mm.margen_pct)}.`);
  if (ctx.cxc) {
    if (ctx.cxc.vencido > 0) nuevo('cxc_vencida', 'alert', 'alerta', `Tienes ${dinero(ctx.cxc.vencido)} en cuentas por cobrar vencidas (${ctx.cxc.vencidos} ${ctx.cxc.vencidos === 1 ? 'documento' : 'documentos'}).`, '/finanzas/cxc');
    else if (ctx.cxc.total > 0) nuevo('cxc_al_dia', 'check', 'positivo', 'Ninguna de tus cuentas por cobrar está vencida.', '/finanzas/cxc');
  }
  if (r.comparar && a && a.facturas > 0) {
    const t = variacion(k.ticket_promedio, a.ticket_promedio);
    if (t !== null && t !== 0) nuevo('ticket', 'receipt', t > 0 ? 'positivo' : 'negativo', `El ticket promedio ${t > 0 ? 'subió' : 'bajó'} ${pctTexto(Math.abs(t))} y ahora es ${dinero(k.ticket_promedio)}.`);
  }
  if (k.facturas_credito > 0 && k.ventas_total > 0) {
    nuevo('credito', 'credit', 'neutro', `El ${pctTexto(redondear1(k.monto_credito / k.ventas_total * 100))} de lo vendido fue a crédito (${dinero(k.monto_credito)} por cobrar).`);
  }
  if (r.dias >= 14) {
    const fuerte = [...r.dia_semana].sort((x, y) => y.promedio - x.promedio || x.dow - y.dow)[0];
    if (fuerte && fuerte.promedio > 0) nuevo('dia_fuerte', 'calendar', 'neutro', `El ${DIAS[fuerte.dow - 1]} es tu día más fuerte, con un promedio de ${dinero(fuerte.promedio)} por día.`);
  }
  if (k.cobertura_costo_pct < 100) {
    nuevo('costos', 'alert', 'alerta', `Solo el ${pctTexto(k.cobertura_costo_pct)} de las ventas tiene costo registrado: el margen puede estar sobrestimado.`);
  }
  return out;
}

// Respuesta de /estadisticas/datos (y base del PDF)
async function respuesta(filtros, ctx = {}) {
  const r = await panel(filtros);
  const k = r.kpis; const a = r.kpis_anterior;
  const pct = (parte, todo) => (todo > 0 ? redondear1(parte / todo * 100) : 0);
  const kp = (valor, ant) => ({ valor, anterior: a ? ant : null, variacionPct: a ? variacion(valor, ant) : null });
  const vacio = k.facturas === 0;

  return {
    ok: true,
    vacio,
    rango: { periodo: filtros.periodo, desde: r.desde, hasta: r.hasta, dias: r.dias, comparar: r.comparar, anterior: r.anterior },
    filtros: { vendedor: filtros.vendedor, categoria: filtros.categoria },
    kpis: {
      ventasTotales: kp(k.ventas_total, a && a.ventas_total),
      facturas: kp(k.facturas, a && a.facturas),
      ticketPromedio: kp(k.ticket_promedio, a && a.ticket_promedio),
      margenBruto: {
        ...kp(k.margen, a && a.margen), pct: k.margen_pct, anteriorPct: a ? a.margen_pct : null,
        difPuntos: a && a.ventas_netas > 0 ? redondear1(k.margen_pct - a.margen_pct) : null, coberturaCostoPct: k.cobertura_costo_pct,
      },
      productosDistintos: kp(k.productos_distintos, a && a.productos_distintos),
      documentos: { fiscales: k.facturas_fiscales, internas: k.facturas_internas, pctFiscal: pct(k.facturas_fiscales, k.facturas), pctInterno: pct(k.facturas_internas, k.facturas) },
      ventasNetas: k.ventas_netas, unidades: k.unidades,
    },
    serie: {
      agrupar: r.serie.agrupar,
      puntos: r.serie.puntos.map((x) => ({ inicio: x.inicio, etiqueta: etiquetaPunto(x.inicio, r.serie.agrupar), total: x.total, facturas: x.facturas })),
    },
    topProductos: {
      porCantidad: r.top_productos.por_cantidad.map(mapearProducto),
      porMonto: r.top_productos.por_monto.map(mapearProducto),
    },
    topCategorias: {
      categorias: r.top_categorias.categorias.map((c) => ({ categoriaId: c.categoria_id, nombre: c.nombre, monto: c.monto, unidades: c.unidades, pct: pct(c.monto, r.top_categorias.total) })),
      otras: r.top_categorias.otras, otrasPct: pct(r.top_categorias.otras, r.top_categorias.total), total: r.top_categorias.total,
    },
    rankingVendedores: r.vendedores.map((v) => ({
      usuarioId: v.usuario_id, nombre: v.nombre, usuario: v.usuario, rol: v.rol, activo: v.activo, facturas: v.facturas, monto: v.monto,
      ticketPromedio: v.ticket_promedio, porcentaje: v.porcentaje, ultimaVenta: v.ultima_venta, ultimaVentaTexto: fechaHora(v.ultima_venta),
    })),
    fiscalVsInterno: {
      fiscales: { facturas: k.facturas_fiscales, monto: k.monto_fiscal, pct: pct(k.facturas_fiscales, k.facturas) },
      internas: { facturas: k.facturas_internas, monto: k.monto_interno, pct: pct(k.facturas_internas, k.facturas) },
    },
    porDiaSemana: r.dia_semana.map((d) => ({ dow: d.dow, nombre: DIAS[d.dow - 1], dias: d.dias, total: d.total, facturas: d.facturas, promedio: d.promedio })),
    insights: construirInsights(r, ctx),
  };
}

function mapearProducto(p) {
  return { productoId: p.producto_id, nombre: p.nombre, imagenUrl: p.imagen_url, unidades: p.unidades, monto: p.monto, margen: p.margen, margenPct: p.margen_pct, facturas: p.facturas };
}

module.exports = {
  PERIODOS, DIAS, hoy, diaSemanaISO, resolverPeriodo, leerFiltros, panel, kpis, serie, topProductos, opciones, nombres,
  cuentasPorCobrar, construirInsights, respuesta, variacion,
};
