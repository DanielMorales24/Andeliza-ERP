const db = require('../db');

// Todo lo que el POS necesita para vender sin ir al servidor en cada toque:
// productos activos con su stock, variantes activas y componentes de los kits.
async function catalogo() {
  const productos = (await db.query(
    `SELECT p.id, p.sku, p.nombre, p.categoria_id, c.nombre AS categoria, p.precio_venta,
            p.unidad, p.imagen_url, p.es_compuesto, p.stock, p.stock_minimo
       FROM productos p
       LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE p.activo
      ORDER BY p.nombre`
  )).rows;
  if (!productos.length) return [];

  const ids = productos.map((p) => p.id);

  const variantes = (await db.query(
    `SELECT id, producto_id, sku, nombre_variante, atributos, stock
       FROM variantes_producto WHERE activo AND producto_id = ANY($1::bigint[]) ORDER BY id`, [ids]
  )).rows;

  const componentes = (await db.query(
    `SELECT cp.producto_padre_id, cp.producto_hijo_id AS producto_id, cp.cantidad, h.nombre, h.stock
       FROM componentes_producto cp JOIN productos h ON h.id = cp.producto_hijo_id
      WHERE cp.producto_padre_id = ANY($1::bigint[]) ORDER BY h.nombre`, [ids]
  )).rows;

  const variantesDe = new Map();
  variantes.forEach((v) => {
    if (!variantesDe.has(v.producto_id)) variantesDe.set(v.producto_id, []);
    variantesDe.get(v.producto_id).push({
      id: v.id, sku: v.sku, nombre: v.nombre_variante, atributos: v.atributos || {}, stock: v.stock,
    });
  });
  const componentesDe = new Map();
  componentes.forEach((c) => {
    if (!componentesDe.has(c.producto_padre_id)) componentesDe.set(c.producto_padre_id, []);
    componentesDe.get(c.producto_padre_id).push({
      producto_id: c.producto_id, nombre: c.nombre, cantidad: c.cantidad, stock: c.stock,
    });
  });

  return productos.map((p) => ({
    ...p,
    variantes: p.es_compuesto ? [] : variantesDe.get(p.id) || [],
    componentes: p.es_compuesto ? componentesDe.get(p.id) || [] : [],
  }));
}

// Clientes activos para el buscador del carrito (se busca en el navegador, sin acentos)
async function clientes() {
  const { rows } = await db.query(
    'SELECT id, nombre, telefono, rtn FROM clientes WHERE activo ORDER BY nombre LIMIT 5000'
  );
  return rows;
}

module.exports = { catalogo, clientes };
