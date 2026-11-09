// Panel de inicio (/). Reúne lo que cuenta la historia del día: ventas, cobros, stock, facturación y alertas.
// Reutiliza las funciones de estadísticas (models/estadisticas.js) para no calcular dos veces lo mismo.
// Cada bloque se consulta solo si la persona tiene permiso para verlo (ver el parámetro "ve").
const db = require('../db');
const config = require('../client.config');
const Negocio = require('./negocio');
const Ventas = require('./ventas');
const Contab = require('./contabilidad');
const Est = require('./estadisticas');
const { sumarDias, dinero, fecha } = require('../utils/formato');

// Umbrales de las alertas del CAI: urgente con 5 números o 7 días, aviso con 30 días
const UMBRAL = { numeros: 5, diasUrgente: 7, diasAviso: 30 };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Productos simples con stock <= mínimo, más variantes con stock <= mínimo
async function stockBajo() {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM productos p
         WHERE p.activo AND NOT p.es_compuesto
           AND NOT EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo)
           AND p.stock <= p.stock_minimo)
       +
       (SELECT COUNT(*) FROM variantes_producto v
          JOIN productos p ON p.id = v.producto_id
         WHERE v.activo AND p.activo AND v.stock <= v.stock_minimo)
       AS total`
  );
  return Number(rows[0].total);
}

async function facturasPendientes() {
  const { rows } = await db.query("SELECT COUNT(*)::int AS total FROM ventas WHERE estado = 'P'");
  return rows[0].total;
}

async function totalProductos() {
  const { rows } = await db.query('SELECT COUNT(*)::int AS total FROM productos WHERE activo');
  return rows[0].total;
}

// Diferencia entre el inventario físico y el libro contable (solo tiene sentido con la contabilidad iniciada)
async function inventarioContable() {
  const { rows } = await db.query("SELECT valor_inventario()::float AS valor, saldo_cuenta('inventario')::float AS libro");
  return { ...rows[0], diferencia: Math.round((rows[0].valor - rows[0].libro) * 100) / 100 };
}

function saludo(horaLocal) { return horaLocal < 12 ? 'Buenos días' : horaLocal < 19 ? 'Buenas tardes' : 'Buenas noches'; }

function horaLocal() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: config.valoresPorDefecto.zonaHoraria, hour: '2-digit', hour12: false }).format(new Date());
  return Number(p) % 24;
}

// Alertas del CAI según lo que queda de números y de días
function alertaFacturacion(fa, puedeConfigurar) {
  if (!fa || fa.modo !== 'sar') return null;
  const enlace = puedeConfigurar ? { href: '/configuracion', texto: 'Ir a Configuración' } : null;
  if (fa.dias < 0) return { nivel: 'urgente', titulo: 'CAI vencido', texto: `La fecha límite de emisión venció el ${fecha(fa.fechaLimite)}. No se podrá facturar hasta registrar un nuevo CAI.`, enlace };
  if (fa.restantes <= 0) return { nivel: 'urgente', titulo: 'Rango de facturas agotado', texto: 'Se agotó el rango de numeración. No se podrá facturar hasta registrar un nuevo rango.', enlace };
  if (fa.restantes <= UMBRAL.numeros) return { nivel: 'urgente', titulo: 'Quedan pocas facturas del CAI', texto: `Quedan solo ${fa.restantes} ${fa.restantes === 1 ? 'número' : 'números'} del rango autorizado.`, enlace };
  if (fa.dias <= UMBRAL.diasUrgente) return { nivel: 'urgente', titulo: 'El CAI vence esta semana', texto: `La fecha límite de emisión es el ${fecha(fa.fechaLimite)}, dentro de ${fa.dias} ${fa.dias === 1 ? 'día' : 'días'}.`, enlace };
  if (fa.dias <= UMBRAL.diasAviso) return { nivel: 'aviso', titulo: 'El CAI vence pronto', texto: `La fecha límite de emisión es el ${fecha(fa.fechaLimite)}, dentro de ${fa.dias} días. Conviene tramitar el siguiente.`, enlace };
  return null;
}

// user: req.user. ve: los módulos que esa persona puede abrir (ya filtrados por permiso y por funcionalidad activa).
async function panel(user, ve) {
  const hoy = await Est.hoy();
  const ayer = sumarDias(hoy, -1);
  const [anio, mes, dia] = hoy.split('-').map(Number);
  const inicioMes = `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-01`;
  const dow = Est.diaSemanaISO(hoy);
  const vePropias = user.tiene('facturas', 'ver');
  const veFacturas = ve.facturas && user.tieneAlguno([['facturas', 'ver'], ['facturas', 'ver_propias']]);

  const [kHoy, kAyer, kMes, serie30, top, bajo, pend, facturacion, cxc, contab, productos, ultimas] = await Promise.all([
    Est.kpis(hoy, hoy), Est.kpis(ayer, ayer), Est.kpis(inicioMes, hoy),
    Est.serie(sumarDias(hoy, -29), hoy, null, null, 'dia'),
    Est.topProductos(inicioMes, hoy, null, null, 5),
    stockBajo(), facturasPendientes(), Negocio.modoFacturacion(),
    ve.finanzas ? Est.cuentasPorCobrar() : null,
    ve.finanzas ? Contab.estado() : null,
    ve.inventario ? totalProductos() : null,
    veFacturas ? Ventas.listar({ limite: 5, soloUsuarioId: vePropias ? null : user.id }) : null,
  ]);
  const inv = ve.finanzas && contab && contab.iniciada ? await inventarioContable() : null;

  // Alertas: solo las que aplican; si no hay ninguna la sección no se muestra
  const alertas = [];
  const aF = alertaFacturacion(facturacion, user.tiene('configuracion', 'ver'));
  if (aF) alertas.push(aF);
  if (ve.finanzas && contab && !contab.iniciada) alertas.push({ nivel: 'aviso', titulo: 'La contabilidad aún no se ha iniciado', texto: 'Las ventas todavía no generan partidas contables. Se inicia desde Finanzas.', enlace: { href: '/finanzas', texto: 'Ir a Finanzas' } });
  if (inv && Math.abs(inv.diferencia) >= 1) alertas.push({ nivel: 'aviso', titulo: 'Conciliación de inventario pendiente', texto: `El inventario en existencias (${dinero(inv.valor)}) difiere del libro contable (${dinero(inv.libro)}) en ${dinero(Math.abs(inv.diferencia))}.`, enlace: { href: '/finanzas', texto: 'Conciliar en Finanzas' } });

  const variacionHoy = Est.variacion(kHoy.ventas_total, kAyer.ventas_total);
  return {
    hoy, ve,
    bienvenida: {
      saludo: saludo(horaLocal()),
      nombre: String(user.nombre).split(' ')[0],
      fechaLarga: `${Est.DIAS[dow - 1]}, ${dia} de ${MESES[mes - 1]} de ${anio}`,
      ventasHoy: kHoy.ventas_total, facturasHoy: kHoy.facturas, pendientes: pend,
    },
    hoyVsAyer: { hoy: kHoy.ventas_total, ayer: kAyer.ventas_total, facturasHoy: kHoy.facturas, variacionPct: variacionHoy },
    cxc, stockBajo: bajo, facturacion,
    mes: { ventas: kMes.ventas_total, facturas: kMes.facturas },
    serie30: serie30.puntos.map((p) => ({ inicio: p.inicio, total: p.total, facturas: p.facturas })),
    topProductos: top.por_cantidad,
    totalProductos: productos,
    ultimasVentas: ultimas ? ultimas.filas : null,
    soloPropias: veFacturas && !vePropias,
    alertas,
  };
}

module.exports = { panel, alertaFacturacion, UMBRAL };
