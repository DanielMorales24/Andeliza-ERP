const express = require('express');
const { requireAuth, requirePermiso, requireAlgunPermiso, requireFuncionalidad, requireAlgunaFuncionalidad } = require('../middlewares/auth');
const { auditar } = require('../middlewares/auditar');
const controlador = require('../controllers/facturas');

const router = express.Router();

// Ver el listado: "facturas.ver" (todas) o "facturas.ver_propias" (solo las que la persona emitió).
// El filtro por dueño lo aplica el controlador en la consulta.
const ver = [requireFuncionalidad('facturas'), requireAuth, requireAlgunPermiso(['facturas', 'ver'], ['facturas', 'ver_propias'])];
const editar = [requireFuncionalidad('facturas'), requireAuth, requirePermiso('facturas', 'editar')];

router.get('/', ...ver, controlador.index);
router.get('/datos', ...ver, controlador.datos);
router.patch('/:id(\\d+)/pagada', ...editar,
  auditar('marcar_factura_pagada', 'ventas', (req) => `Marcó la factura #${req.params.id} como pagada`), controlador.marcarPagada);

// El PDF también lo necesita el POS (imprimir al cobrar), por eso sirve con cualquiera de las dos funciones y
// también a quien puede cobrar. Quien no tiene "facturas.ver" solo descarga las suyas (se comprueba en el controlador).
router.get('/:id(\\d+)/pdf', requireAlgunaFuncionalidad('pos', 'facturas'), requireAuth,
  requireAlgunPermiso(['facturas', 'ver'], ['facturas', 'ver_propias'], ['pos', 'crear']), controlador.pdf);

module.exports = router;
