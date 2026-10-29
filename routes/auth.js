const router = require('express').Router();
const controlador = require('../controllers/auth');

router.get('/login', controlador.mostrarLogin);
router.post('/login', controlador.login);
router.post('/logout', controlador.logout);

module.exports = router;
