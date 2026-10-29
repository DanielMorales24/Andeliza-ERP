const express = require('express');
const multer = require('multer');
const { requireAuth, soloRoles, requireFuncionalidad } = require('../middlewares/auth');
const { ErrorValidacion } = require('../utils/validar');
const controlador = require('../controllers/inventario');

// La imagen llega en memoria y se sube a Supabase Storage. Vercel limita el cuerpo
// de la petición a unos 4.5 MB; la interfaz ya la reduce antes de enviarla.
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) return cb(null, true);
    cb(new ErrorValidacion('La imagen debe ser JPG, PNG o WebP.'));
  },
});

const router = express.Router();
const guardas = [requireFuncionalidad('inventario'), requireAuth, soloRoles('admin')];

router.get('/', ...guardas, controlador.index);
router.get('/nuevo', ...guardas, controlador.formulario);
router.get('/:id(\\d+)/editar', ...guardas, controlador.formulario);
router.post('/', ...guardas, subida.single('imagen'), controlador.guardar);
router.post('/:id(\\d+)', ...guardas, subida.single('imagen'), controlador.guardar);
router.patch('/:id(\\d+)/activo', ...guardas, controlador.cambiarActivo);

module.exports = router;
