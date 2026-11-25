// La base de pruebas: se arma desde cero con las mismas migraciones que producción y con datos
// propios (tests/fixtures/datos-prueba.sql). Ningún dato sale de una base real.
require('./entorno');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const RAIZ = path.join(__dirname, '..', '..');
const DB = path.join(RAIZ, 'db');

// Migraciones 01, 02, … en orden, después functions.sql y al final los datos de prueba
function archivosDeInstalacion() {
  const migraciones = fs.readdirSync(path.join(DB, 'migrations'))
    .filter((f) => /^\d{2}_.*\.sql$/.test(f))
    .sort()
    .map((f) => path.join(DB, 'migrations', f));
  return [...migraciones, path.join(DB, 'functions.sql'), path.join(__dirname, '..', 'fixtures', 'datos-prueba.sql')];
}

// Borra el esquema y lo vuelve a crear. Antes de borrar, la propia base confirma que es de pruebas.
async function prepararBase() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query('SELECT current_database() AS base');
    if (!/_test$/.test(rows[0].base)) throw new Error(`La base "${rows[0].base}" no es de pruebas: no se borra nada.`);
    await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    for (const archivo of archivosDeInstalacion()) {
      try {
        await c.query(fs.readFileSync(archivo, 'utf8'));
      } catch (err) {
        err.message = `${path.relative(RAIZ, archivo)}: ${err.message}`;
        throw err;
      }
    }
  } finally {
    await c.end();
  }
}

// Una conexión propia de las pruebas, para preparar y comprobar datos directamente en la base
let cliente = null;
async function conexion() {
  if (!cliente) {
    cliente = new Client({ connectionString: process.env.DATABASE_URL });
    await cliente.connect();
  }
  return cliente;
}
async function consulta(texto, params) {
  return (await (await conexion()).query(texto, params)).rows;
}
async function valor(texto, params) {
  const filas = await consulta(texto, params);
  return filas[0] ? Object.values(filas[0])[0] : undefined;
}
async function cerrar() {
  if (cliente) { await cliente.end(); cliente = null; }
}

// ---- Ayudantes de contabilidad ----

// Líneas de las partidas que cumplen la condición, como [{ clave, debe, haber }] ordenadas
async function lineasDePartida(condicion, params = []) {
  const filas = await consulta(
    `SELECT c.clave, l.debe::numeric AS debe, l.haber::numeric AS haber
       FROM partida_lineas l
       JOIN plan_cuentas c ON c.id = l.cuenta_id
       JOIN partidas p ON p.id = l.partida_id
      WHERE ${condicion}
      ORDER BY c.clave, l.debe, l.haber`, params
  );
  return filas.map((f) => ({ clave: f.clave, debe: Number(f.debe), haber: Number(f.haber) }));
}

// ¿Cuadran todas las partidas (Debe = Haber en cada una y en total)?
async function balanzaCuadra() {
  const descuadradas = await valor(
    'SELECT COUNT(*)::int FROM (SELECT partida_id FROM partida_lineas GROUP BY partida_id HAVING SUM(debe) <> SUM(haber)) x'
  );
  const total = await consulta('SELECT COALESCE(SUM(debe), 0)::numeric AS d, COALESCE(SUM(haber), 0)::numeric AS h FROM partida_lineas');
  return descuadradas === 0 && Number(total[0].d) === Number(total[0].h);
}

const stockProducto = async (sku) => Number(await valor('SELECT stock FROM productos WHERE sku = $1', [sku]));
const stockVariante = async (sku) => Number(await valor('SELECT stock FROM variantes_producto WHERE sku = $1', [sku]));
const idProducto = async (sku) => Number(await valor('SELECT id FROM productos WHERE sku = $1', [sku]));
const idVariante = async (sku) => Number(await valor('SELECT id FROM variantes_producto WHERE sku = $1', [sku]));
const idUsuario = async (usuario) => Number(await valor('SELECT id FROM usuarios WHERE usuario = $1', [usuario]));

module.exports = {
  prepararBase, archivosDeInstalacion, consulta, valor, cerrar,
  lineasDePartida, balanzaCuadra, stockProducto, stockVariante, idProducto, idVariante, idUsuario,
};
