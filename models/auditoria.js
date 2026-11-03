// Auditoría: quién hizo qué, cuándo y desde dónde. Solo se agrega, nunca se modifica ni se borra.
const db = require('../db');

async function registrar({ usuarioId = null, accion, entidad = null, entidadId = null, descripcion, detalles = null, ip = null }) {
  const { rows } = await db.query(
    'SELECT registrar_auditoria($1, $2, $3, $4, $5, $6::jsonb, $7) AS id',
    [usuarioId, accion, entidad, entidadId, descripcion, detalles ? JSON.stringify(detalles) : null, ip]
  );
  return rows[0].id;
}

// Los últimos movimientos, el más reciente primero
async function ultimos(limite = 50) {
  const { rows } = await db.query(
    `SELECT id, creado_en, usuario_id, usuario_nombre, accion, entidad, entidad_id, descripcion, ip
       FROM auditoria ORDER BY creado_en DESC, id DESC LIMIT $1`, [Math.min(Number(limite) || 50, 200)]
  );
  return rows;
}

module.exports = { registrar, ultimos };
