const router = require('express').Router();
const { requireAuth } = require('../middlewares/auth');
const controlador = require('../controllers/dashboard');

router.get('/', requireAuth, controlador.index);

module.exports = router;
