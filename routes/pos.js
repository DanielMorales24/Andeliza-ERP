const express = require('express');
const { requireAuth, requirePermiso, requireFuncionalidad } = require('../middlewares/auth');
const controlador = require('../controllers/pos');

const router = express.Router();
const g = (modulo, accion) => [requireFuncionalidad('pos'), requireAuth, requirePermiso(modulo, accion)];

router.get('/', ...g('pos', 'ver'), controlador.index);
router.get('/catalogo', ...g('pos', 'ver'), controlador.catalogo);
router.post('/clientes', ...g('clientes', 'crear'), controlador.crearCliente);   // alta rápida: es crear un cliente
router.post('/cobrar', ...g('pos', 'crear'), controlador.cobrar);
router.post('/cotizacion', ...g('pos', 'crear'), controlador.cotizacion);

module.exports = router;
