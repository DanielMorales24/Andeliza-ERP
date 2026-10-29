const express = require('express');
const { requireAuth, soloRoles, requireFuncionalidad } = require('../middlewares/auth');
const controlador = require('../controllers/pos');

const router = express.Router();
// El POS lo usan el administrador y el vendedor
const guardas = [requireFuncionalidad('pos'), requireAuth, soloRoles('admin', 'vendedor')];

router.get('/', ...guardas, controlador.index);
router.get('/catalogo', ...guardas, controlador.catalogo);
router.post('/clientes', ...guardas, controlador.crearCliente);
router.post('/cobrar', ...guardas, controlador.cobrar);
router.post('/cotizacion', ...guardas, controlador.cotizacion);

module.exports = router;
