const db = require('../db');
const config = require('../client.config');
const { ErrorValidacion } = require('../utils/validar');
const { calcularTotales } = require('../utils/totales');
const { permiteDecimales } = require('../utils/unidades');
const Negocio = require('./negocio');

// Una venta completa con cliente, vendedor y líneas (para el PDF y el resumen del POS)
async function obtener(id) {
  const { rows } = await db.query(
    `SELECT v.id, v.numero_factura, v.tipo_documento, v.estado, v.subtotal, v.impuesto, v.total,
            v.creado_en, v.usuario_id, v.cliente_id,
            c.nombre AS cliente_nombre, c.rtn AS cliente_rtn, c.telefono AS cliente_telefono,
            c.direccion AS cliente_direccion, c.correo AS cliente_correo,
            u.nombre AS vendedor
       FROM ventas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       LEFT JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.id = $1`, [id]
  );
  if (!rows[0]) return null;

  const items = (await db.query(
    `SELECT d.id, d.producto_id, d.variante_id, d.cantidad, d.precio_unitario, d.subtotal,
            p.nombre, p.sku, p.unidad, p.es_compuesto, vp.nombre_variante, vp.sku AS sku_variante
       FROM detalle_venta d
       JOIN productos p ON p.id = d.producto_id
       LEFT JOIN variantes_producto vp ON vp.id = d.variante_id
      WHERE d.venta_id = $1 ORDER BY d.id`, [id]
  )).rows;

  return { ...rows[0], items };
}

async function idPorClave(clave) {
  const { rows } = await db.query('SELECT id FROM ventas WHERE clave_cliente = $1', [clave]);
  return rows[0] ? rows[0].id : null;
}

// Cobra una venta. Los precios y totales los calcula el servidor con lo que hay en la base,
// nunca con lo que diga el navegador.
//   items: [{ producto_id, variante_id|null, cantidad }]  (ya validados y sin repetidos)
//   clave: identificador del cobro; si se repite devuelve la venta que ya existe
async function crear({ clienteId, usuarioId, items, pendiente, clave }) {
  if (clave) {
    const existente = await idPorClave(clave);
    if (existente) return { venta: await obtener(existente), repetida: true };
  }

  const ids = [...new Set(items.map((i) => i.producto_id))];
  const { rows } = await db.query(
    'SELECT id, nombre, precio_venta, unidad, activo FROM productos WHERE id = ANY($1::bigint[])', [ids]
  );
  const porId = new Map(rows.map((r) => [r.id, r]));

  for (const item of items) {
    const p = porId.get(item.producto_id);
    if (!p) throw new ErrorValidacion('Un producto del carrito ya no existe. Actualiza la página e inténtalo de nuevo.');
    if (!p.activo) throw new ErrorValidacion(`"${p.nombre}" está inactivo y no se puede vender.`);
    if (!permiteDecimales(p.unidad) && !Number.isInteger(item.cantidad)) {
      throw new ErrorValidacion(`La cantidad de "${p.nombre}" debe ser un número entero.`);
    }
  }

  if (clienteId) {
    const { rows: c } = await db.query('SELECT nombre, activo FROM clientes WHERE id = $1', [clienteId]);
    if (!c[0]) throw new ErrorValidacion('El cliente elegido ya no existe. Quítalo o elige otro.');
    if (!c[0].activo) throw new ErrorValidacion(`El cliente "${c[0].nombre}" está inactivo. Actívalo o elige otro.`);
  }

  const lineas = items.map((i) => ({
    producto_id: i.producto_id,
    variante_id: i.variante_id,
    cantidad: i.cantidad,
    precio_unitario: Number(porId.get(i.producto_id).precio_venta),
  }));
  const tasa = await Negocio.tasaImpuesto();
  const t = calcularTotales(
    lineas.map((l) => ({ precio: l.precio_unitario, cantidad: l.cantidad })),
    tasa,
    config.valoresPorDefecto.impuestoIncluidoEnPrecio === true
  );

  try {
    const resultado = await db.transaccion(async (cx) => {
      const r = await cx.query(
        'SELECT crear_venta($1, $2, $3::jsonb, $4, $5, $6, NULL, $7) AS resultado',
        [clienteId, usuarioId, JSON.stringify(lineas), t.subtotal, t.impuesto, t.total, pendiente ? 'P' : 'C']
      );
      const v = r.rows[0].resultado;
      if (clave) await cx.query('UPDATE ventas SET clave_cliente = $1 WHERE id = $2', [clave, v.venta_id]);
      return v;
    });
    return { venta: await obtener(resultado.venta_id), repetida: false };
  } catch (err) {
    // Dos cobros con la misma clave a la vez: gana uno, el otro devuelve esa misma venta
    if (clave && err.code === '23505' && /clave_cliente/.test(err.constraint || '')) {
      const existente = await idPorClave(clave);
      if (existente) return { venta: await obtener(existente), repetida: true };
    }
    throw err;
  }
}

// Arma una cotización con los precios de hoy. No toca stock ni números de factura.
async function cotizar({ clienteId, items }) {
  const ids = [...new Set(items.map((i) => i.producto_id))];
  const { rows } = await db.query(
    'SELECT id, nombre, sku, precio_venta, unidad, es_compuesto, activo FROM productos WHERE id = ANY($1::bigint[])', [ids]
  );
  const porId = new Map(rows.map((r) => [r.id, r]));

  const idsVariantes = items.map((i) => i.variante_id).filter(Boolean);
  const variantes = idsVariantes.length
    ? (await db.query(
      'SELECT id, producto_id, nombre_variante, sku FROM variantes_producto WHERE id = ANY($1::bigint[])', [idsVariantes]
    )).rows
    : [];
  const variantePorId = new Map(variantes.map((v) => [v.id, v]));

  const lineas = items.map((i) => {
    const p = porId.get(i.producto_id);
    if (!p) throw new ErrorValidacion('Un producto del carrito ya no existe. Actualiza la página e inténtalo de nuevo.');
    if (!p.activo) throw new ErrorValidacion(`"${p.nombre}" está inactivo y no se puede cotizar.`);
    let v = null;
    if (i.variante_id) {
      v = variantePorId.get(i.variante_id);
      if (!v || v.producto_id !== p.id) throw new ErrorValidacion(`La variante elegida de "${p.nombre}" ya no existe.`);
    }
    return {
      nombre: p.nombre, detalle: v ? v.nombre_variante : '', sku: v && v.sku ? v.sku : p.sku,
      esKit: p.es_compuesto, cantidad: i.cantidad, precio: Number(p.precio_venta),
    };
  });

  let cliente = null;
  if (clienteId) {
    const { rows: c } = await db.query('SELECT nombre, rtn, telefono, direccion, correo FROM clientes WHERE id = $1', [clienteId]);
    if (!c[0]) throw new ErrorValidacion('El cliente elegido ya no existe.');
    cliente = c[0];
  }

  const tasa = await Negocio.tasaImpuesto();
  const incluido = config.valoresPorDefecto.impuestoIncluidoEnPrecio === true;
  const t = calcularTotales(lineas.map((l) => ({ precio: l.precio, cantidad: l.cantidad })), tasa, incluido);
  return {
    cliente,
    items: lineas.map((l, i) => ({ ...l, importe: t.importes[i] })),
    subtotal: t.subtotal, impuesto: t.impuesto, total: t.total, tasa, incluido,
  };
}

// ---------- Historial ----------
const SIN_ACENTOS = (col) => `translate(lower(${col}), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')`;

// filtros: { desde, hasta (YYYY-MM-DD, inclusivos, hora del negocio), tipo, estado, q, offset, limite }
async function listar(filtros) {
  const { desde, hasta, tipo, estado, q, offset = 0, limite = 50 } = filtros;
  const params = [];
  const cond = [];
  const param = (valor) => { params.push(valor); return '$' + params.length; };
  // La zona horaria solo se manda si hay fechas: un parámetro que el SQL no usa lo rechaza Postgres
  let zonaParam = null;
  const zona = () => zonaParam || (zonaParam = param(config.valoresPorDefecto.zonaHoraria));

  if (desde) cond.push(`v.creado_en >= ((${param(desde)}::date)::timestamp AT TIME ZONE ${zona()})`);
  if (hasta) cond.push(`v.creado_en < (((${param(hasta)}::date + 1))::timestamp AT TIME ZONE ${zona()})`);
  if (tipo) cond.push(`v.tipo_documento = ${param(tipo)}`);
  if (estado) cond.push(`v.estado = ${param(estado)}`);
  if (q) {
    const patron = param('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
    cond.push(`(${SIN_ACENTOS('v.numero_factura')} LIKE ${patron} ESCAPE '\\'
             OR ${SIN_ACENTOS("COALESCE(c.nombre, 'Consumidor Final')")} LIKE ${patron} ESCAPE '\\')`);
  }
  const donde = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  const desdeSql = `FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id LEFT JOIN usuarios u ON u.id = v.usuario_id ${donde}`;

  const resumen = (await db.query(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(v.total), 0) AS suma,
            COALESCE(SUM(v.total) FILTER (WHERE v.estado = 'P'), 0) AS pendiente ${desdeSql}`, params
  )).rows[0];

  const filas = (await db.query(
    `SELECT v.id, v.numero_factura, v.tipo_documento, v.estado, v.subtotal, v.impuesto, v.total, v.creado_en,
            COALESCE(c.nombre, 'Consumidor Final') AS cliente, u.nombre AS vendedor
       ${desdeSql}
      ORDER BY v.creado_en DESC, v.id DESC
      LIMIT ${Number(limite) + 1} OFFSET ${Number(offset)}`, params
  )).rows;

  const hayMas = filas.length > limite;
  return { filas: hayMas ? filas.slice(0, limite) : filas, hayMas, resumen };
}

// 'P' -> 'C'. Devuelve 'pagada', 'ya_estaba_pagada' o null si no existe.
async function marcarPagada(id) {
  const { rowCount } = await db.query("UPDATE ventas SET estado = 'C' WHERE id = $1 AND estado = 'P'", [id]);
  if (rowCount > 0) return 'pagada';
  const { rows } = await db.query('SELECT estado FROM ventas WHERE id = $1', [id]);
  return rows[0] ? 'ya_estaba_pagada' : null;
}

module.exports = { obtener, crear, cotizar, listar, marcarPagada, idPorClave };
