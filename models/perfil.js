// Perfil de la persona que inició sesión: sus datos, la matriz de permisos de SU rol y su propia actividad.
// Todo se consulta con el id de la sesión: nunca se recibe un id de usuario desde la petición.
const db = require('../db');
const { MODULOS } = require('../utils/permisos');

async function obtener(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.usuario, u.activo, u.ultimo_acceso, u.creado_en, u.contrasena_cambiada_en,
            u.rol_id, r.nombre AS rol, r.descripcion AS rol_descripcion
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`, [id]
  );
  return rows[0] || null;
}

// El inicio de sesión actual ya está registrado, así que el "anterior" es el segundo más reciente
async function accesoAnterior(id) {
  const { rows } = await db.query(
    "SELECT creado_en FROM auditoria WHERE usuario_id = $1 AND accion = 'login' ORDER BY id DESC OFFSET 1 LIMIT 1", [id]
  );
  return rows[0] ? rows[0].creado_en : null;
}

// Matriz del rol leída de roles_permisos: una fila por módulo con las acciones que tiene (true/false)
// y las que ese módulo no ofrece (ausentes). El admin tiene todo por definición, aunque se agreguen permisos nuevos.
async function matrizDelRol(rolId, esAdmin) {
  const { rows } = await db.query(
    `SELECT p.modulo, p.accion, (rp.rol_id IS NOT NULL) AS tiene
       FROM permisos p LEFT JOIN roles_permisos rp ON rp.permiso_id = p.id AND rp.rol_id = $1
      ORDER BY p.id`, [rolId]
  );
  const por = new Map();
  rows.forEach((r) => {
    if (!por.has(r.modulo)) por.set(r.modulo, { modulo: r.modulo, etiqueta: MODULOS[r.modulo] || r.modulo, acciones: {} });
    por.get(r.modulo).acciones[r.accion] = esAdmin ? true : r.tiene;
  });
  const orden = Object.keys(MODULOS);
  const pos = (m) => (orden.indexOf(m) === -1 ? 99 : orden.indexOf(m));
  return [...por.values()].sort((a, b) => pos(a.modulo) - pos(b.modulo));
}

// Los últimos movimientos de la propia persona (regla de propiedad: WHERE usuario_id = yo)
async function actividad(id, limite = 20) {
  const { rows } = await db.query(
    `SELECT id, creado_en, accion, entidad, entidad_id, descripcion, ip
       FROM auditoria WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC LIMIT $2`, [id, Math.min(Number(limite) || 20, 100)]
  );
  return rows;
}

module.exports = { obtener, accesoAnterior, matrizDelRol, actividad };
