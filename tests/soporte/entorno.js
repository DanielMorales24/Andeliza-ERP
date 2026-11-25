// Prepara el entorno de las pruebas de integración y del servidor E2E. Se carga ANTES que cualquier
// módulo de la aplicación (jest.config.js → setupFiles), así db.js ya nace apuntando a la base de pruebas.
//
// De dónde salen las variables, de mayor a menor prioridad:
//   1. Las del entorno (el pipeline de GitHub Actions las define en ci.yml).
//   2. .env.test (copia local de .env.test.example; está en .gitignore).
//   3. .env.test.example (valores de ejemplo, versionados).
// El .env normal NUNCA se lee: app.js lo salta cuando NODE_ENV=test.
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { validarBaseDePruebas } = require('./guardas');

const RAIZ = path.join(__dirname, '..', '..');
const archivo = ['.env.test', '.env.test.example'].map((a) => path.join(RAIZ, a)).find((a) => fs.existsSync(a));
if (archivo) dotenv.config({ path: archivo, override: false });

process.env.NODE_ENV = 'test';
process.env.TZ = process.env.TZ || 'America/Tegucigalpa';
// Sin credenciales de Storage: ninguna prueba sube imágenes ni habla con Supabase
process.env.SUPABASE_URL = '';
process.env.SUPABASE_KEY = '';
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'solo-para-pruebas';

validarBaseDePruebas(process.env.DATABASE_URL);

module.exports = { RAIZ };
