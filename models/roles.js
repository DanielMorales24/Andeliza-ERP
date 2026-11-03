// Roles y su matriz de permisos. Las reglas (admin intocable, Configuración solo del admin,
// "crear/editar/eliminar" exigen "ver") las impone la base de datos.
const db = require('../db');
const { MODULOS } = require('../utils/permisos');

const una = async (texto, params) => (await db.query(texto, params)).rows[0].r;

async function listar() {
  const { rows } = await db.query(
    `SELECT r.id, r.nombre, r.descripcion, r.activo, r.es_sistema,
            (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id) AS usuarios,
            (SELECT COUNT(*) FROM usuarios u WHERE u.rol_id = r.id AND u.activo) AS usuarios_activos,
            (SELECT COUNT(*) FROM roles_permisos rp WHERE rp.rol_id = r.id) AS permisos
       FROM roles r ORDER BY r.es_sistema DESC, r.id`
  );
  return rows;
}

async function obtener(id) {
  const { rows } = await db.query('SELECT id, nombre, descripcion, activo, es_sistema FROM roles WHERE id = $1', [id]);
  return rows[0] || null;
}

// Catálogo agrupado por módulo, en el orden del menú
async function catalogo() {
  const { rows } = await db.query('SELECT id, modulo, accion, descripcion FROM permisos ORDER BY id');
  const orden = Object.keys(MODULOS);
  const por = new Map();
  rows.forEach((p) => {
    if (!por.has(p.modulo)) por.set(p.modulo, { modulo: p.modulo, etiqueta: MODULOS[p.modulo] || p.modulo, permisos: {} });
    por.get(p.modulo).permisos[p.accion] = { id: p.id, descripcion: p.descripcion };
  });
  const pos = (m) => (orden.indexOf(m) === -1 ? 99 : orden.indexOf(m));
  return [...por.values()].sort((a, b) => pos(a.modulo) - pos(b.modulo));
}

async function permisosDe(rolId) {
  const { rows } = await db.query('SELECT permiso_id FROM roles_permisos WHERE rol_id = $1 ORDER BY permiso_id', [rolId]);
  return rows.map((r) => r.permiso_id);
}

const crear = (d, actorId) => una('SELECT crear_rol($1, $2, $3, $4) AS r', [d.nombre, d.descripcion, d.copiarDe, actorId]);
const actualizar = (id, d, actorId) => una('SELECT actualizar_rol($1, $2, $3, $4, $5) AS r', [id, d.nombre, d.descripcion, d.activo, actorId]);
const eliminar = (id, actorId) => una('SELECT eliminar_rol($1, $2) AS r', [id, actorId]);
const guardarPermisos = (id, ids, actorId) => una('SELECT guardar_permisos_rol($1, $2::bigint[], $3) AS r', [id, ids, actorId]);

module.exports = { listar, obtener, catalogo, permisosDe, crear, actualizar, eliminar, guardarPermisos };
