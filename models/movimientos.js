// Ingresos varios, gastos y compras de inventario (con su condición de pago).
const db = require('../db');

const SIN_ACENTOS = (col) => `translate(lower(${col}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;

function filtros(base, { desde, hasta, q, estado }, columnas) {
  const params = [];
  const cond = [];
  const param = (v) => { params.push(v); return '$' + params.length; };
  if (desde) cond.push(`${base}.fecha >= ${param(desde)}::date`);
  if (hasta) cond.push(`${base}.fecha <= ${param(hasta)}::date`);
  if (q) {
    const patron = param('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
    cond.push('(' + columnas.map((c) => `${SIN_ACENTOS(c)} LIKE ${patron} ESCAPE '\\'`).join(' OR ') + ')');
  }
  return { params, cond, param, estado };
}

async function pagina(sqlBase, f, orden, offset, limite) {
  const donde = f.cond.length ? 'WHERE ' + f.cond.join(' AND ') : '';
  const resumen = (await db.query(`SELECT COUNT(*) AS cantidad, COALESCE(SUM(t.monto), 0) AS suma FROM (${sqlBase} ${donde}) t`, f.params)).rows[0];
  const filas = (await db.query(`${sqlBase} ${donde} ${orden} LIMIT ${Number(limite) + 1} OFFSET ${Number(offset)}`, f.params)).rows;
  const hayMas = filas.length > limite;
  return { filas: hayMas ? filas.slice(0, limite) : filas, hayMas, resumen };
}

// estado: 'P' pendientes, 'C' cobrados/pagados, 'anulado'
const condEstado = (f, columna, estado) => {
  if (estado === 'anulado') f.cond.push('x.anulado');
  else if (estado === 'P' || estado === 'C') f.cond.push(`NOT x.anulado AND x.${columna} = ${f.param(estado)}`);
};

async function ingresos(o) {
  const f = filtros('x', o, ['x.descripcion', "COALESCE(c.nombre, '')"]);
  condEstado(f, 'estado_cobro', o.estado);
  const base = `SELECT x.id, x.fecha, x.tipo, x.descripcion, x.monto, x.estado_cobro AS estado, x.fecha_vencimiento, x.anulado,
                       COALESCE(c.nombre, '') AS tercero, (x.partida_id IS NOT NULL) AS contabilizado,
                       COALESCE((SELECT SUM(a.monto) FROM abonos_clientes a WHERE a.ingreso_id = x.id AND NOT a.anulado), 0) AS movido
                  FROM ingresos x LEFT JOIN clientes c ON c.id = x.cliente_id`;
  return pagina(base, f, 'ORDER BY fecha DESC, id DESC', o.offset || 0, 50);
}

async function gastos(o) {
  const f = filtros('x', o, ['x.descripcion', "COALESCE(p.nombre, '')"]);
  condEstado(f, 'estado_pago', o.estado);
  const base = `SELECT x.id, x.fecha, x.categoria AS tipo, x.descripcion, x.monto, x.estado_pago AS estado, x.fecha_vencimiento, x.anulado,
                       COALESCE(p.nombre, '') AS tercero, (x.partida_id IS NOT NULL) AS contabilizado,
                       COALESCE((SELECT SUM(a.monto) FROM pagos_proveedores a WHERE a.gasto_id = x.id AND NOT a.anulado), 0) AS movido
                  FROM gastos x LEFT JOIN proveedores p ON p.id = x.proveedor_id`;
  return pagina(base, f, 'ORDER BY fecha DESC, id DESC', o.offset || 0, 50);
}

async function compras(o) {
  const f = filtros('x', o, ["COALESCE(p.nombre, '')", "'compra ' || x.id::text"]);
  if (o.estado === 'P' || o.estado === 'C') f.cond.push(`x.estado_pago = ${f.param(o.estado)}`);
  const base = `SELECT x.id, x.fecha, 'compra'::text AS tipo, ('Compra #' || x.id) AS descripcion, x.total AS monto, x.estado_pago AS estado,
                       x.fecha_vencimiento, FALSE AS anulado, COALESCE(p.nombre, 'Sin proveedor') AS tercero, (x.partida_id IS NOT NULL) AS contabilizado,
                       (SELECT COUNT(*) FROM detalle_compra d WHERE d.compra_id = x.id) AS lineas,
                       COALESCE((SELECT SUM(a.monto) FROM pagos_proveedores a WHERE a.compra_id = x.id AND NOT a.anulado), 0) AS movido
                  FROM compras x LEFT JOIN proveedores p ON p.id = x.proveedor_id`;
  return pagina(base, f, 'ORDER BY fecha DESC, id DESC', o.offset || 0, 50);
}

const LISTAR = { ingresos, gastos, compras };
async function listar(tipo, o) { return LISTAR[tipo](o); }

async function registrarIngreso(d) {
  const { rows } = await db.query(
    'SELECT registrar_ingreso($1,$2,$3,$4::date,$5,$6,$7,$8,$9::date,$10) AS r',
    [d.tipo, d.descripcion, d.monto, d.fecha, d.notas, d.estado, d.cuenta, d.clienteId, d.vencimiento, d.usuarioId]
  );
  return rows[0].r;
}

async function registrarGasto(d) {
  const { rows } = await db.query(
    'SELECT registrar_gasto($1,$2,$3,$4::date,$5,$6,$7,$8,$9::date,$10) AS r',
    [d.categoria, d.descripcion, d.monto, d.fecha, d.notas, d.estado, d.cuenta, d.proveedorId, d.vencimiento, d.usuarioId]
  );
  return rows[0].r;
}

async function registrarCompra(d) {
  const { rows } = await db.query(
    'SELECT registrar_compra($1,$2::jsonb,$3::date,$4,$5,$6,$7::date,$8) AS r',
    [d.proveedorId, JSON.stringify(d.items), d.fecha, d.notas, d.estado, d.cuenta, d.vencimiento, d.usuarioId]
  );
  return rows[0].r;
}

async function anularIngreso(id, usuarioId, motivo) {
  return (await db.query('SELECT anular_ingreso($1,$2,$3) AS r', [id, usuarioId, motivo])).rows[0].r;
}
async function anularGasto(id, usuarioId, motivo) {
  return (await db.query('SELECT anular_gasto($1,$2,$3) AS r', [id, usuarioId, motivo])).rows[0].r;
}

// Datos para los formularios
async function catalogosFormularios() {
  const [clientes, proveedores, productos] = await Promise.all([
    db.query('SELECT id, nombre FROM clientes WHERE activo ORDER BY nombre'),
    db.query('SELECT id, nombre FROM proveedores WHERE activo ORDER BY nombre'),
    db.query(
      `SELECT p.id, p.sku, p.nombre, p.precio_compra, p.unidad, p.stock,
              COALESCE((SELECT json_agg(json_build_object('id', v.id, 'nombre', v.nombre_variante, 'stock', v.stock) ORDER BY v.id)
                          FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo), '[]'::json) AS variantes
         FROM productos p WHERE p.activo AND NOT p.es_compuesto ORDER BY p.nombre`
    ),
  ]);
  return { clientes: clientes.rows, proveedores: proveedores.rows, productos: productos.rows };
}

module.exports = { listar, registrarIngreso, registrarGasto, registrarCompra, anularIngreso, anularGasto, catalogosFormularios };
