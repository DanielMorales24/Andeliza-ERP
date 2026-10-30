const express = require('express');
const { requireAuth, soloRoles, requireFuncionalidad } = require('../middlewares/auth');
const F = require('../controllers/finanzas');
const C = require('../controllers/cartera');
const M = require('../controllers/movimientos');

const router = express.Router();
const g = [requireFuncionalidad('finanzas'), requireAuth, soloRoles('admin')];
const conCompras = [requireFuncionalidad('compras')];

router.get('/', ...g, F.resumen);
router.post('/iniciar', ...g, F.iniciar);
router.post('/conciliar-inventario', ...g, F.conciliarInventario);
router.post('/saldo-inicial', ...g, F.saldoInicial);

for (const tipo of ['cxc', 'cxp']) {
  const c = C[tipo];
  router.get(`/${tipo}`, ...g, c.pagina);
  router.get(`/${tipo}/datos`, ...g, c.datos);
  router.get(`/${tipo}/:origen/:id(\\d+)`, ...g, c.historial);
  router.post(tipo === 'cxc' ? '/cxc/abonos' : '/cxp/pagos', ...g, c.registrar);
  router.post(tipo === 'cxc' ? '/cxc/abonos/:id(\\d+)/anular' : '/cxp/pagos/:id(\\d+)/anular', ...g, c.anular);
}

router.get('/movimientos', ...g, M.pagina);
router.get('/movimientos/datos', ...g, M.datos);
router.post('/ingresos', ...g, M.crearIngreso);
router.post('/ingresos/:id(\\d+)/anular', ...g, M.anularIngreso);
router.post('/gastos', ...g, M.crearGasto);
router.post('/gastos/:id(\\d+)/anular', ...g, M.anularGasto);
router.post('/compras', ...g, ...conCompras, M.crearCompra);

router.get('/partidas', ...g, F.partidas);
router.get('/partidas/datos', ...g, F.partidasDatos);
router.get('/partidas/balanza', ...g, F.balanzaDatos);
router.post('/partidas', ...g, F.partidaManual);
router.post('/partidas/:id(\\d+)/anular', ...g, F.anularPartida);

router.get('/reportes', ...g, F.reportes);
router.get('/reportes/estado-resultados.pdf', ...g, F.pdfEstadoResultados);
router.get('/reportes/flujo-caja.pdf', ...g, F.pdfFlujoCaja);
router.get('/reportes/balance-general.pdf', ...g, F.pdfBalanceGeneral);
router.get('/reportes/antiguedad-saldos.pdf', ...g, F.pdfAntiguedad);

module.exports = router;
