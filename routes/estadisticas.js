// /estadisticas: exige el permiso estadisticas.ver (admin y supervisor de fábrica). El servidor lo comprueba en cada ruta.
const express = require('express');
const { requireAuth, requirePermiso, requireFuncionalidad } = require('../middlewares/auth');
const C = require('../controllers/estadisticas');

const router = express.Router();
const g = [requireFuncionalidad('estadisticas'), requireAuth, requirePermiso('estadisticas', 'ver')];

router.get('/', ...g, C.pantalla);
router.get('/datos', ...g, C.datos);
router.get('/reporte.pdf', ...g, C.reportePdf);

module.exports = router;
