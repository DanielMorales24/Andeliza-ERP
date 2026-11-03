const router = require('express').Router();
const { cargarPermisos } = require('../middlewares/auth');
const controlador = require('../controllers/auth');

router.get('/login', controlador.mostrarLogin);
router.post('/login', controlador.login);
router.post('/logout', controlador.logout);

// Recuperar con el código que da el administrador (no requiere sesión)
router.get('/recuperar', controlador.mostrarRecuperar);
router.post('/recuperar', controlador.recuperar);

// Cambiar la propia contraseña (también es obligatorio si la cuenta tiene una contraseña provisional)
router.get('/cambiar-contrasena', cargarPermisos, controlador.mostrarCambio);
router.post('/cambiar-contrasena', cargarPermisos, controlador.cambiarContrasena);

module.exports = router;
