const db = require('../db');
const { ErrorValidacion } = require('../utils/validar');

// Una fila por producto, con lo necesario para el listado: stock real (del producto,
// de sus variantes o de sus componentes si es kit) y los textos para buscar.
const SELECT_LISTA = `
  SELECT p.id, p.sku, p.nombre, p.categoria_id, c.nombre AS categoria,
         p.proveedor_id, pr.nombre AS proveedor,
         p.precio_compra, p.precio_venta, p.unidad, p.stock, p.stock_minimo,
         p.descripcion, p.imagen_url, p.es_compuesto, p.activo,
         COALESCE(v.num, 0)    AS num_variantes,
         COALESCE(v.total, 0)  AS stock_variantes,
         COALESCE(v.bajas, 0)  AS variantes_bajas,
         COALESCE(v.skus, '')  AS skus_variantes,
         COALESCE(k.num, 0)    AS num_componentes,
         k.disponibles         AS kits_disponibles
    FROM productos p
    LEFT JOIN categorias  c  ON c.id  = p.categoria_id
    LEFT JOIN proveedores pr ON pr.id = p.proveedor_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS num, SUM(stock) AS total,
             COUNT(*) FILTER (WHERE stock <= stock_minimo) AS bajas,
             string_agg(sku, ' ') AS skus
        FROM variantes_producto
       WHERE producto_id = p.id AND activo
    ) v ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS num, MIN(FLOOR(h.stock / cp.cantidad)) AS disponibles
        FROM componentes_producto cp
        JOIN productos h ON h.id = cp.producto_hijo_id
       WHERE cp.producto_padre_id = p.id
    ) k ON p.es_compuesto`;

// Agrega lo que la interfaz muestra: stock, estado (ok / bajo / agotado) y una nota
function enriquecer(p) {
  let stock;
  let estado;
  let detalle;

  if (p.es_compuesto) {
    stock = p.kits_disponibles || 0;
    estado = stock <= 0 ? 'agotado' : 'ok';
    detalle = p.num_componentes
      ? `Kit de ${p.num_componentes} ${p.num_componentes === 1 ? 'componente' : 'componentes'}`
      : 'Kit sin componentes';
  } else if (p.num_variantes > 0) {
    stock = p.stock_variantes;
    estado = stock <= 0 ? 'agotado' : p.variantes_bajas > 0 ? 'bajo' : 'ok';
    detalle = `${p.num_variantes} variantes`
      + (p.variantes_bajas > 0 ? `, ${p.variantes_bajas} con stock bajo` : '');
  } else {
    stock = p.stock;
    estado = stock <= 0 ? 'agotado' : stock <= p.stock_minimo ? 'bajo' : 'ok';
    detalle = `Mínimo ${p.stock_minimo}`;
  }
  return { ...p, stock_mostrar: stock, estado_stock: estado, detalle_stock: detalle };
}

async function listar() {
  const { rows } = await db.query(`${SELECT_LISTA} ORDER BY p.nombre`);
  return rows.map(enriquecer);
}

async function obtenerBasico(id) {
  const { rows } = await db.query('SELECT id, unidad, imagen_url FROM productos WHERE id = $1', [id]);
  return rows[0] || null;
}

// Producto completo + variantes activas + componentes, para el formulario de edición
async function obtener(id) {
  const { rows } = await db.query('SELECT * FROM productos WHERE id = $1', [id]);
  if (!rows[0]) return null;

  const variantes = (await db.query(
    `SELECT id, sku, nombre_variante, atributos, stock, stock_minimo
       FROM variantes_producto WHERE producto_id = $1 AND activo ORDER BY id`, [id]
  )).rows;

  const componentes = (await db.query(
    `SELECT cp.producto_hijo_id AS producto_id, h.nombre, h.sku, h.unidad, h.stock, h.precio_compra, cp.cantidad
       FROM componentes_producto cp
       JOIN productos h ON h.id = cp.producto_hijo_id
      WHERE cp.producto_padre_id = $1 ORDER BY h.nombre`, [id]
  )).rows;

  return { producto: rows[0], variantes, componentes };
}

// Productos que se pueden usar como componente de un kit: simples y sin variantes
async function candidatosKit(idExcluir) {
  const { rows } = await db.query(
    `SELECT p.id, p.sku, p.nombre, p.unidad, p.stock, p.precio_compra
       FROM productos p
      WHERE p.activo AND NOT p.es_compuesto AND p.id <> COALESCE($1::bigint, 0)
        AND NOT EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo)
      ORDER BY p.nombre`,
    [idExcluir || null]
  );
  return rows;
}

// Crea o actualiza el producto con sus variantes y componentes en UNA transacción.
// imagen = { cambiar: boolean, url: string|null }  (cambiar=false deja la imagen como está)
async function guardar(id, d, variantes, componentes, imagen) {
  return db.transaccion(async (cx) => {
    const conVariantes = variantes.length > 0 && !d.es_compuesto;
    let imagenAnterior = null;

    if (id) {
      const actual = await cx.query('SELECT imagen_url FROM productos WHERE id = $1 FOR UPDATE', [id]);
      if (!actual.rowCount) throw new ErrorValidacion('El producto ya no existe. Recarga la página.');
      imagenAnterior = actual.rows[0].imagen_url;
    }

    // Reglas entre productos
    if (id && (conVariantes || d.es_compuesto)) {
      const { rows } = await cx.query(
        `SELECT pa.nombre FROM componentes_producto cp
           JOIN productos pa ON pa.id = cp.producto_padre_id
          WHERE cp.producto_hijo_id = $1 LIMIT 1`, [id]
      );
      if (rows[0]) {
        throw new ErrorValidacion(`Este producto es componente del kit "${rows[0].nombre}". Un componente no puede tener variantes ni ser un kit.`);
      }
    }

    if (d.es_compuesto) {
      const ids = componentes.map((c) => c.producto_id);
      const { rows } = await cx.query(
        `SELECT p.id, p.nombre, p.es_compuesto, p.activo,
                EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo) AS con_variantes
           FROM productos p WHERE p.id = ANY($1::bigint[])`, [ids]
      );
      if (rows.length !== ids.length) throw new ErrorValidacion('Uno de los componentes ya no existe.');
      for (const r of rows) {
        if (id && r.id === id) throw new ErrorValidacion('Un kit no puede contenerse a sí mismo.');
        if (r.es_compuesto) throw new ErrorValidacion(`"${r.nombre}" es un kit y no puede ser componente de otro kit.`);
        if (r.con_variantes) throw new ErrorValidacion(`"${r.nombre}" tiene variantes. Un componente de kit no puede tener variantes.`);
        if (!r.activo) throw new ErrorValidacion(`"${r.nombre}" está inactivo.`);
      }
    }

    // Con variantes o como kit, el stock del producto en sí no se usa
    const stock = conVariantes || d.es_compuesto ? 0 : d.stock;
    const stockMinimo = conVariantes || d.es_compuesto ? 0 : d.stock_minimo;
    const campos = [d.sku, d.nombre, d.categoria_id, d.proveedor_id, d.precio_compra, d.precio_venta,
      d.unidad, stock, stockMinimo, d.descripcion, d.es_compuesto, d.activo];

    let productoId = id;
    if (id) {
      await cx.query(
        `UPDATE productos SET sku=$1, nombre=$2, categoria_id=$3, proveedor_id=$4, precio_compra=$5,
                precio_venta=$6, unidad=$7, stock=$8, stock_minimo=$9, descripcion=$10,
                es_compuesto=$11, activo=$12,
                imagen_url = CASE WHEN $14::boolean THEN $15 ELSE imagen_url END
          WHERE id=$13`,
        [...campos, id, imagen.cambiar, imagen.url]
      );
    } else {
      const r = await cx.query(
        `INSERT INTO productos (sku, nombre, categoria_id, proveedor_id, precio_compra, precio_venta,
                                unidad, stock, stock_minimo, descripcion, es_compuesto, activo, imagen_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [...campos, imagen.url]
      );
      productoId = r.rows[0].id;
    }

    // Variantes: las que ya no vienen se desactivan (no se borran: pueden tener ventas)
    if (conVariantes) {
      const conservar = [];
      for (const v of variantes) {
        const valores = [v.sku, v.nombre_variante, JSON.stringify(v.atributos), v.stock, v.stock_minimo];
        if (v.id) {
          const r = await cx.query(
            `UPDATE variantes_producto SET sku=$1, nombre_variante=$2, atributos=$3, stock=$4, stock_minimo=$5, activo=TRUE
              WHERE id=$6 AND producto_id=$7 RETURNING id`, [...valores, v.id, productoId]
          );
          if (!r.rowCount) throw new ErrorValidacion(`La variante "${v.nombre_variante}" ya no existe. Recarga la página.`);
          conservar.push(r.rows[0].id);
        } else {
          // Si existía una variante inactiva con ese nombre, se reactiva
          const r = await cx.query(
            `INSERT INTO variantes_producto (producto_id, sku, nombre_variante, atributos, stock, stock_minimo)
             VALUES ($1,$2,$3,$4,$5,$6)
             ON CONFLICT (producto_id, nombre_variante)
             DO UPDATE SET sku=EXCLUDED.sku, atributos=EXCLUDED.atributos, stock=EXCLUDED.stock,
                           stock_minimo=EXCLUDED.stock_minimo, activo=TRUE
             RETURNING id`, [productoId, ...valores]
          );
          conservar.push(r.rows[0].id);
        }
      }
      await cx.query(
        'UPDATE variantes_producto SET activo = FALSE WHERE producto_id = $1 AND NOT (id = ANY($2::bigint[]))',
        [productoId, conservar]
      );
    } else if (id) {
      await cx.query('UPDATE variantes_producto SET activo = FALSE WHERE producto_id = $1', [productoId]);
    }

    // Componentes del kit
    await cx.query('DELETE FROM componentes_producto WHERE producto_padre_id = $1', [productoId]);
    if (d.es_compuesto) {
      for (const c of componentes) {
        await cx.query(
          'INSERT INTO componentes_producto (producto_padre_id, producto_hijo_id, cantidad) VALUES ($1,$2,$3)',
          [productoId, c.producto_id, c.cantidad]
        );
      }
    }

    return { id: productoId, imagenAnterior };
  });
}

async function cambiarActivo(id, activo) {
  const { rowCount } = await db.query('UPDATE productos SET activo = $2 WHERE id = $1', [id, activo]);
  return rowCount > 0;
}

async function obtenerLista(id) {
  const { rows } = await db.query(`${SELECT_LISTA} WHERE p.id = $1`, [id]);
  return rows[0] ? enriquecer(rows[0]) : null;
}

module.exports = { listar, obtener, obtenerBasico, obtenerLista, candidatosKit, guardar, cambiarActivo };
