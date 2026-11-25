// Peticiones HTTP a la aplicación real (Express completo, sin abrir un puerto) con Supertest.
require('./entorno');
const request = require('supertest');
const app = require('../../app');
const db = require('../../db');

const CLAVE = 'Pruebas.2026';   // la de todos los usuarios de tests/fixtures/datos-prueba.sql

// Inicia sesión y devuelve un agente que conserva la cookie de sesión
async function entrar(usuario, clave = CLAVE) {
  const agente = request.agent(app);
  const r = await agente.post('/login').type('form').send({ usuario, contrasena: clave });
  if (r.status !== 302 || /\/login/.test(r.headers.location || '')) {
    throw new Error(`No se pudo iniciar sesión como ${usuario} (respuesta ${r.status} → ${r.headers.location || 'sin redirección'})`);
  }
  return agente;
}

// Atajos que piden JSON, como hacen las pantallas con fetch
const json = {
  get: (agente, ruta) => agente.get(ruta).set('Accept', 'application/json'),
  post: (agente, ruta, cuerpo = {}) => agente.post(ruta).set('Accept', 'application/json').send(cuerpo),
  patch: (agente, ruta, cuerpo = {}) => agente.patch(ruta).set('Accept', 'application/json').send(cuerpo),
};

// Clave única de cobro (el POS manda una para que un doble clic no cree dos ventas)
let n = 0;
const claveCobro = () => `prueba-${process.pid}-${Date.now()}-${++n}`;

// Cierra el pool de la aplicación al terminar cada archivo de pruebas
const cerrarApp = () => db.pool.end();

module.exports = { app, request, entrar, json, claveCobro, cerrarApp, CLAVE };
