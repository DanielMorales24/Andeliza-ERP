const express = require('express');
const { requireAuth, soloRoles, requireFuncionalidad, requireAlgunaFuncionalidad } = require('../middlewares/auth');
const controlador = require('../controllers/facturas');

const router = express.Router();
const soloAdmin = [requireFuncionalidad('facturas'), requireAuth, soloRoles('admin')];

router.get('/', ...soloAdmin, controlador.index);
router.get('/datos', ...soloAdmin, controlador.datos);
router.patch('/:id(\\d+)/pagada', ...soloAdmin, controlador.marcarPagada);

// El PDF lo necesita también el POS (imprimir al cobrar), por eso sirve con cualquiera de las dos funciones.
// El vendedor solo accede a sus propias ventas (se comprueba en el controlador).
router.get('/:id(\\d+)/pdf', requireAlgunaFuncionalidad('pos', 'facturas'), requireAuth, soloRoles('admin', 'vendedor'), controlador.pdf);

module.exports = router;
