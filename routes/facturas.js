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
  auditar('marcar_factura_pagada', 'ventas', (req, cuerpo) => `Marcó la factura #${req.params.id} como pagada`
    + (cuerpo && cuerpo.metodo_nombre && !cuerpo.yaEstabaPagada ? ` (${cuerpo.metodo_nombre})` : '')), controlador.marcarPagada);

// Anular: "facturas.anular" (administrador y supervisor). Sin el middleware de auditoría porque la
// función anular_venta deja su propio registro, con el stock devuelto y el asiento de reversión.
const anular = [requireFuncionalidad('facturas'), requireAuth, requirePermiso('facturas', 'anular')];
router.post('/:id(\\d+)/anular', ...anular, controlador.anular);

// El PDF también lo necesita el POS (imprimir al cobrar), por eso sirve con cualquiera de las dos funciones y
// también a quien puede cobrar. Quien no tiene "facturas.ver" solo descarga las suyas (se comprueba en el controlador).
router.get('/:id(\\d+)/pdf', requireAlgunaFuncionalidad('pos', 'facturas'), requireAuth,
  requireAlgunPermiso(['facturas', 'ver'], ['facturas', 'ver_propias'], ['pos', 'crear']), controlador.pdf);

module.exports = router;
