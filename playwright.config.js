// Prueba de extremo a extremo (E2E) con Playwright: un navegador real contra la aplicación real.
// La base es la de pruebas (andeliza_test) y se reconstruye al arrancar el servidor (tests/e2e/servidor.js).
const { defineConfig, devices } = require('@playwright/test');
require('./tests/soporte/entorno');   // carga .env.test y se detiene si la base no es local y de pruebas

const PUERTO = Number(process.env.PUERTO_E2E || 3100);
const enCI = Boolean(process.env.CI);

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.js',
  timeout: 60 * 1000,
  expect: { timeout: 10 * 1000 },
  fullyParallel: false,
  workers: 1,                       // una sola base de pruebas
  forbidOnly: enCI,                 // un test.only olvidado hace fallar el pipeline
  retries: enCI ? 1 : 0,            // un reintento en CI por si el CDN de estilos tarda; localmente, ninguno
  reporter: enCI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    locale: 'es-HN',
    timezoneId: 'America/Tegucigalpa',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'node tests/e2e/servidor.js',
    url: `http://127.0.0.1:${PUERTO}/salud`,
    reuseExistingServer: false,
    timeout: 60 * 1000,
    stdout: 'pipe',
  },
});
