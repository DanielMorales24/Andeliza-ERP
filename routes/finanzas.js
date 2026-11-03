const express = require('express');
const { requireAuth, requirePermiso, requireFuncionalidad } = require('../middlewares/auth');
const { auditar } = require('../middlewares/auditar');
const F = require('../controllers/finanzas');
const C = require('../controllers/cartera');
const M = require('../controllers/movimientos');

const router = express.Router();
// Permisos de finanzas: ver (todo lo que se consulta y los reportes), crear (registrar movimientos),
// editar (conciliar el inventario) y eliminar (anular).
const permiso = (accion) => [requireFuncionalidad('finanzas'), requireAuth, requirePermiso('finanzas', accion)];
const ver = permiso('ver');
const crear = permiso('crear');
const editar = permiso('editar');
const anular = permiso('eliminar');
const monto = (req) => (req.body && req.body.monto ? ` de L ${req.body.monto}` : '');
const conCompras = [requireFuncionalidad('compras')];

router.get('/', ...ver, F.resumen);
router.post('/iniciar', ...crear, auditar('iniciar_contabilidad', 'contabilidad', 'Inició la contabilidad del negocio'), F.iniciar);
router.post('/conciliar-inventario', ...editar, auditar('conciliar_inventario', 'contabilidad', 'Concilió el inventario con la contabilidad'), F.conciliarInventario);
router.post('/saldo-inicial', ...crear, auditar('saldo_inicial', 'contabilidad', 'Registró el saldo inicial de caja y bancos'), F.saldoInicial);

for (const tipo of ['cxc', 'cxp']) {
  const c = C[tipo];
  const cobro = tipo === 'cxc';
  router.get(`/${tipo}`, ...ver, c.pagina);
  router.get(`/${tipo}/datos`, ...ver, c.datos);
  router.get(`/${tipo}/:origen/:id(\\d+)`, ...ver, c.historial);
  router.post(cobro ? '/cxc/abonos' : '/cxp/pagos', ...crear,
    auditar(cobro ? 'registrar_abono' : 'registrar_pago_proveedor', cobro ? 'abonos_clientes' : 'pagos_proveedores', (req) => `${cobro ? 'Registró un abono de un cliente' : 'Registró un pago a un proveedor'}${monto(req)}`), c.registrar);
  router.post(cobro ? '/cxc/abonos/:id(\\d+)/anular' : '/cxp/pagos/:id(\\d+)/anular', ...anular,
    auditar(cobro ? 'anular_abono' : 'anular_pago_proveedor', cobro ? 'abonos_clientes' : 'pagos_proveedores', (req) => `${cobro ? 'Anuló el abono' : 'Anuló el pago'} #${req.params.id}`), c.anular);
}

router.get('/movimientos', ...ver, M.pagina);
router.get('/movimientos/datos', ...ver, M.datos);
router.post('/ingresos', ...crear, auditar('crear_ingreso', 'ingresos', (req) => `Registró un ingreso${monto(req)}`), M.crearIngreso);
router.post('/ingresos/:id(\\d+)/anular', ...anular, auditar('anular_ingreso', 'ingresos', (req) => `Anuló el ingreso #${req.params.id}`), M.anularIngreso);
router.post('/gastos', ...crear, auditar('crear_gasto', 'gastos', (req) => `Registró un gasto${monto(req)}`), M.crearGasto);
router.post('/gastos/:id(\\d+)/anular', ...anular, auditar('anular_gasto', 'gastos', (req) => `Anuló el gasto #${req.params.id}`), M.anularGasto);
router.post('/compras', ...crear, ...conCompras, auditar('crear_compra', 'compras', 'Registró una compra a proveedor'), M.crearCompra);

router.get('/partidas', ...ver, F.partidas);
router.get('/partidas/datos', ...ver, F.partidasDatos);
router.get('/partidas/balanza', ...ver, F.balanzaDatos);
router.post('/partidas', ...crear, auditar('crear_partida_manual', 'partidas', 'Registró un asiento contable manual'), F.partidaManual);
router.post('/partidas/:id(\\d+)/anular', ...anular, auditar('anular_partida', 'partidas', (req) => `Anuló el asiento #${req.params.id}`), F.anularPartida);

router.get('/reportes', ...ver, F.reportes);
router.get('/reportes/estado-resultados.pdf', ...ver, F.pdfEstadoResultados);
router.get('/reportes/flujo-caja.pdf', ...ver, F.pdfFlujoCaja);
router.get('/reportes/balance-general.pdf', ...ver, F.pdfBalanceGeneral);
router.get('/reportes/antiguedad-saldos.pdf', ...ver, F.pdfAntiguedad);

module.exports = router;
