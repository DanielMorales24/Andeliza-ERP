// Usuarios y cuentas. La contraseña se guarda con bcrypt y todo lo delicado
// (iniciar sesión, bloqueo por intentos, códigos de recuperación, último administrador)
// lo decide una función SQL, no este archivo. Mira functions_es.sql, sección SEGURIDAD.
const db = require('../db');
const { crearUsuarioSesion } = require('../utils/permisos');

const una = async (texto, params) => (await db.query(texto, params)).rows[0].r;

// Devuelve { ok, motivo, ... } sin lanzar error (para que se guarden los intentos fallidos)
const autenticar = (usuario, contrasena, ip) => una('SELECT autenticar_usuario($1, $2, $3) AS r', [usuario, contrasena, ip || null]);

// El usuario con su rol y los permisos exactos de su rol. Se lee en CADA petición: si el administrador
// cambia un permiso o desactiva a alguien, el efecto es inmediato.
async function cargarSesion(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.usuario, u.activo, u.debe_cambiar_contrasena, u.sesion_version, u.rol_id, u.ultimo_acceso, u.creado_en, u.onboarding_pendiente,
                (SELECT NOT onboarding_completado FROM configuracion_negocio WHERE id = 1) AS onboarding_abierto,
            r.nombre AS rol, r.es_sistema AS rol_sistema, r.activo AS rol_activo,
            COALESCE(ARRAY_AGG(p.modulo || '.' || p.accion) FILTER (WHERE p.id IS NOT NULL), '{}') AS permisos
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       LEFT JOIN roles_permisos rp ON rp.rol_id = r.id
       LEFT JOIN permisos p ON p.id = rp.permiso_id
      WHERE u.id = $1
      GROUP BY u.id, r.id`, [id]
  );
  return rows[0] ? crearUsuarioSesion(rows[0]) : null;
}

async function listar() {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.usuario, u.activo, u.rol_id, r.nombre AS rol, u.ultimo_acceso,
            u.debe_cambiar_contrasena, (u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW()) AS bloqueado, u.creado_en
       FROM usuarios u JOIN roles r ON r.id = u.rol_id
      ORDER BY u.activo DESC, LOWER(u.nombre), u.id`
  );
  return rows;
}

async function obtener(id) {
  const { rows } = await db.query(
    `SELECT u.id, u.nombre, u.usuario, u.activo, u.rol_id, r.nombre AS rol
       FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE u.id = $1`, [id]
  );
  return rows[0] || null;
}

const crear = (d, actorId) => una('SELECT crear_usuario($1, $2, $3, $4, $5, $6) AS r', [d.nombre, d.usuario, d.contrasena, d.rolId, d.debeCambiar, actorId]);
const actualizar = (id, d, actorId) => una('SELECT actualizar_usuario($1, $2, $3, $4) AS r', [id, d.nombre, d.rolId, actorId]);
const cambiarEstado = (id, activo, actorId) => una('SELECT cambiar_estado_usuario($1, $2, $3) AS r', [id, activo, actorId]);
const generarCodigo = (id, actorId) => una('SELECT generar_codigo_recuperacion($1, $2) AS r', [id, actorId]);
const usarCodigo = (usuario, codigo, nueva, ip) => una('SELECT usar_codigo_recuperacion($1, $2, $3, $4) AS r', [usuario, codigo, nueva, ip || null]);
const cambiarContrasena = (id, actual, nueva, ip) => una('SELECT cambiar_contrasena($1, $2, $3, $4) AS r', [id, actual, nueva, ip || null]);

module.exports = { autenticar, cargarSesion, listar, obtener, crear, actualizar, cambiarEstado, generarCodigo, usarCodigo, cambiarContrasena };
