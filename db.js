const { Pool, types } = require('pg');

// pg devuelve BIGINT, NUMERIC y DATE como texto. Los convertimos:
types.setTypeParser(20, (v) => parseInt(v, 10));    // BIGINT y COUNT(*)
types.setTypeParser(1700, (v) => parseFloat(v));    // NUMERIC
types.setTypeParser(1082, (v) => v);                // DATE se queda 'YYYY-MM-DD' (sin corrimiento de zona)

const url = process.env.DATABASE_URL || '';
const esLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

const pool = new Pool({
  connectionString: url,
  max: 5,
  ssl: esLocal ? false : { rejectUnauthorized: false }, // Supabase exige SSL
});

pool.on('error', (err) => console.error('[db] error en una conexión inactiva:', err.message));

// Corre fn(cliente) dentro de una transacción: todo se guarda o nada.
async function transaccion(fn) {
  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = await fn(cliente);
    await cliente.query('COMMIT');
    return resultado;
  } catch (err) {
    try { await cliente.query('ROLLBACK'); } catch (_) { /* la conexión ya se cayó */ }
    throw err;
  } finally {
    cliente.release();
  }
}

module.exports = {
  pool,
  query: (texto, params) => pool.query(texto, params),
  transaccion,
};
