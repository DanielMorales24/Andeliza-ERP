// Asistente de configuración inicial (decisión D-09). Solo entra la persona que lo tiene pendiente.
const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middlewares/auth');
const C = require('../controllers/onboarding');

const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });
// Si el archivo es demasiado grande, el paso lo explica en pantalla en lugar de responder con un error genérico
const subirLogo = (req, res, next) => subida.single('logo')(req, res, (err) => {
  if (err) req.errorSubida = err.code === 'LIMIT_FILE_SIZE' ? 'El logo no puede pesar más de 3 MB.' : 'No se pudo leer el archivo. Intenta con otro.';
  next();
});

const router = express.Router();
router.use(requireAuth, C.soloPendiente);

router.get('/', C.mostrar);
router.post('/1', C.bienvenida);
router.post('/2', C.datos);
router.post('/3', subirLogo, C.logo);
router.post('/4', C.paleta);
router.post('/5', C.unidades);
router.post('/6', C.vendedor);

module.exports = router;
