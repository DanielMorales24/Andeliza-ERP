const db = require('../db');

// Compara usuario y contraseña directo en SQL (texto plano, decisión del proyecto).
// El usuario no distingue mayúsculas: el teclado del celular suele poner la primera en mayúscula.
async function autenticar(usuario, contrasena) {
  const { rows } = await db.query(
    `SELECT id, nombre, usuario, rol
       FROM usuarios
      WHERE LOWER(usuario) = LOWER($1) AND contrasena = $2 AND activo = TRUE`,
    [usuario, contrasena]
  );
  return rows[0] || null;
}

async function obtenerActivoPorId(id) {
  const { rows } = await db.query(
    'SELECT id, nombre, usuario, rol FROM usuarios WHERE id = $1 AND activo = TRUE',
    [id]
  );
  return rows[0] || null;
}

module.exports = { autenticar, obtenerActivoPorId };
