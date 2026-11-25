// npm run test:db — reconstruye la base de pruebas (migraciones 01 a 09, functions.sql y datos de prueba)
// sin correr ninguna prueba. Sirve para revisar a mano en psql o en DBeaver lo que ven las pruebas.
require('./entorno');
const path = require('path');
const { prepararBase, archivosDeInstalacion } = require('./base');
const { validarBaseDePruebas } = require('./guardas');

(async () => {
  const base = validarBaseDePruebas(process.env.DATABASE_URL);
  const inicio = Date.now();
  await prepararBase();
  for (const f of archivosDeInstalacion()) console.log('  ✓', path.relative(path.join(__dirname, '..', '..'), f));
  console.log(`Base de pruebas "${base}" lista en ${Date.now() - inicio} ms.`);
})().catch((err) => { console.error(err.message); process.exit(1); });
