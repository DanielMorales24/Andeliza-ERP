const express = require('express');
const multer = require('multer');
const { requireAuth, requirePermiso, requireFuncionalidad } = require('../middlewares/auth');
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
const g = (accion) => [requireFuncionalidad('inventario'), requireAuth, requirePermiso('inventario', accion)];

router.get('/', ...g('ver'), controlador.index);
router.get('/nuevo', ...g('crear'), controlador.formulario);
router.get('/:id(\\d+)/editar', ...g('editar'), controlador.formulario);
router.post('/', ...g('crear'), subida.single('imagen'), controlador.guardar);
router.post('/:id(\\d+)', ...g('editar'), subida.single('imagen'), controlador.guardar);
router.patch('/:id(\\d+)/activo', ...g('eliminar'), controlador.cambiarActivo);

module.exports = router;
