// Cuentas por cobrar (v_cxc) y por pagar (v_cxp): lista, historial y abonos o pagos.
const db = require('../db');
const { ErrorValidacion } = require('../utils/validar');

const CFG = {
  cxc: {
    vista: 'v_cxc', tabla: 'abonos_clientes', registrar: 'registrar_abono_cliente', anular: 'anular_abono_cliente',
    columnas: { venta: 'venta_id', ingreso: 'ingreso_id' },
  },
  cxp: {
    vista: 'v_cxp', tabla: 'pagos_proveedores', registrar: 'registrar_pago_proveedor', anular: 'anular_pago_proveedor',
    columnas: { compra: 'compra_id', gasto: 'gasto_id' },
  },
};

function config(tipo) {
  if (!CFG[tipo]) throw new ErrorValidacion('Tipo de cartera no válido.');
  return CFG[tipo];
}

function origenValido(tipo, origen) {
  if (!config(tipo).columnas[origen]) throw new ErrorValidacion('El tipo de documento no es válido.');
}

// Todo lo pendiente, lo más vencido primero (los pendientes son pocos: se filtran en pantalla)
async function listar(tipo) {
  const { vista } = config(tipo);
  const { rows } = await db.query(`SELECT * FROM ${vista} ORDER BY vence, fecha_doc, doc_id`);
  return rows;
}

async function documento(tipo, origen, id) {
  origenValido(tipo, origen);
  const { vista } = config(tipo);
  const { rows } = await db.query(`SELECT * FROM ${vista} WHERE origen = $1 AND doc_id = $2`, [origen, id]);
  return rows[0] || null;
}

async function historial(tipo, origen, id) {
  origenValido(tipo, origen);
  const { tabla, columnas } = config(tipo);
  const { rows } = await db.query(
    `SELECT a.id, a.monto, a.fecha, c.nombre AS cuenta, a.notas, a.anulado, a.motivo_anulacion, a.creado_en, u.nombre AS usuario
       FROM ${tabla} a JOIN plan_cuentas c ON c.id = a.cuenta_id LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE a.${columnas[origen]} = $1 ORDER BY a.id`, [id]
  );
  return rows;
}

// Abono (cobro) o pago. La función SQL valida saldo, fechas y cuentas, y crea la partida.
async function registrar(tipo, origen, id, { monto, fecha, cuenta, notas, usuarioId }) {
  origenValido(tipo, origen);
  const { registrar: fn, columnas } = config(tipo);
  const primero = Object.keys(columnas)[0];
  const args = origen === primero ? [id, null] : [null, id];
  const { rows } = await db.query(`SELECT ${fn}($1, $2, $3, $4::date, $5, $6, $7) AS r`, [...args, monto, fecha, cuenta, notas, usuarioId]);
  return rows[0].r;
}

async function anular(tipo, movimientoId, { motivo, usuarioId }) {
  const { anular: fn } = config(tipo);
  const { rows } = await db.query(`SELECT ${fn}($1, $2, $3) AS r`, [movimientoId, usuarioId, motivo]);
  return rows[0].r;
}

// Para el PDF: cartera con su antigüedad
const TRAMOS = [
  { clave: 'al_dia', etiqueta: 'Al día', min: -Infinity, max: 0 },
  { clave: 't1_30', etiqueta: '1 a 30', min: 1, max: 30 },
  { clave: 't31_60', etiqueta: '31 a 60', min: 31, max: 60 },
  { clave: 't61_90', etiqueta: '61 a 90', min: 61, max: 90 },
  { clave: 't91', etiqueta: 'Más de 90', min: 91, max: Infinity },
];
const tramoDe = (dias) => TRAMOS.find((t) => dias >= t.min && dias <= t.max);

async function antiguedad(tipo) {
  const filas = (await listar(tipo)).map((f) => ({ ...f, tramo: tramoDe(f.dias_vencido).clave }));
  const totales = {};
  TRAMOS.forEach((t) => { totales[t.clave] = Math.round(filas.filter((f) => f.tramo === t.clave).reduce((s, f) => s + Number(f.saldo), 0) * 100) / 100; });
  const total = Math.round(filas.reduce((s, f) => s + Number(f.saldo), 0) * 100) / 100;
  return { filas, totales, total, tramos: TRAMOS };
}

module.exports = { listar, documento, historial, registrar, anular, antiguedad, TRAMOS, tramoDe };
