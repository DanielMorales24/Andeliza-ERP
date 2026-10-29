// Fábrica de modelos para tablas simples con las columnas nombre y activo
// (clientes, proveedores, categorias). "columnas" son nombres fijos del código,
// nunca vienen del usuario; los valores siempre van como parámetros.
const db = require('../db');

function crearModelo({ tabla, columnas, extras = '' }) {
  const seleccion = `SELECT t.id, ${columnas.map((c) => 't.' + c).join(', ')}${extras} FROM ${tabla} t`;

  return {
    async listar() {
      const { rows } = await db.query(`${seleccion} ORDER BY t.nombre`);
      return rows;
    },

    async obtener(id) {
      const { rows } = await db.query(`${seleccion} WHERE t.id = $1`, [id]);
      return rows[0] || null;
    },

    async crear(datos) {
      const marcas = columnas.map((_, i) => `$${i + 1}`).join(', ');
      const { rows } = await db.query(
        `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${marcas}) RETURNING id`,
        columnas.map((c) => datos[c])
      );
      return rows[0].id;
    },

    async actualizar(id, datos) {
      const sets = columnas.map((c, i) => `${c} = $${i + 1}`).join(', ');
      const { rowCount } = await db.query(
        `UPDATE ${tabla} SET ${sets} WHERE id = $${columnas.length + 1}`,
        [...columnas.map((c) => datos[c]), id]
      );
      return rowCount > 0;
    },

    async cambiarActivo(id, activo) {
      const { rowCount } = await db.query(`UPDATE ${tabla} SET activo = $2 WHERE id = $1`, [id, activo]);
      return rowCount > 0;
    },

    // Para tablas donde el nombre no puede repetirse (sin distinguir mayúsculas)
    async existeNombre(nombre, idExcluir) {
      const { rowCount } = await db.query(
        `SELECT 1 FROM ${tabla} WHERE LOWER(nombre) = LOWER($1) AND id <> COALESCE($2::bigint, 0)`,
        [nombre, idExcluir]
      );
      return rowCount > 0;
    },
  };
}

module.exports = { crearModelo };
