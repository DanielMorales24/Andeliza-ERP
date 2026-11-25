// Pruebas con Jest. Dos proyectos:
//   unit         funciones puras (cálculo de totales, validación, errores, guardas): no tocan la base
//   integracion  la aplicación y la base de pruebas reales (Supertest + PostgreSQL andeliza_test)
// Las de extremo a extremo (tests/e2e) las corre Playwright: ver playwright.config.js.
module.exports = {
  // Una sola base de pruebas: los archivos corren uno tras otro y cada uno la reconstruye
  maxWorkers: 1,
  testTimeout: 30000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
    },
    {
      displayName: 'integracion',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
      setupFiles: ['<rootDir>/tests/soporte/entorno.js'],
    },
  ],
};
