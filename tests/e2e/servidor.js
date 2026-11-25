// Servidor de la prueba de extremo a extremo. Playwright lo arranca solo (playwright.config.js → webServer):
// 1) comprueba que la base sea local y de pruebas, 2) la reconstruye desde las migraciones con los datos
// de prueba y 3) levanta la aplicación real en el puerto PUERTO_E2E (3100 por defecto).
require('../soporte/entorno');
const { prepararBase } = require('../soporte/base');

(async () => {
  await prepararBase();
  const app = require('../../app');
  const puerto = Number(process.env.PUERTO_E2E || 3100);
  app.listen(puerto, '127.0.0.1', () => console.log(`Servidor de pruebas E2E en http://127.0.0.1:${puerto}`));
})().catch((err) => {
  console.error('No se pudo preparar el servidor de pruebas:', err.message);
  process.exit(1);
});
