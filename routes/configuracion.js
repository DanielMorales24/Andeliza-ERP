// DECISIÓN DE ARQUITECTURA D-01 — la Fase 7 (Configuración, usuarios y roles) se construye ANTES que la Fase 6 (Estadísticas).
// Motivo: (1) el entregable universitario de la semana pide "Login y Roles" y (2) las estadísticas necesitan saber QUIÉN vendió
// y con qué ROL ("¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de roles lista, las Estadísticas se apoyan en
// ventas.usuario_id y usuarios.rol_id sin rehacer nada. Es un orden elegido, no un pendiente olvidado. Ver docs/plan.md y
// docs/bitacora/semana-4.md.
// /configuracion: solo para quien tenga permisos de "configuracion" (que son únicamente del rol admin).
// El servidor bloquea cada ruta: ocultar el menú no es seguridad.
const express = require('express');
const multer = require('multer');
const { requireAuth, requirePermiso } = require('../middlewares/auth');
const { ErrorValidacion } = require('../utils/validar');
const C = require('../controllers/configuracion');

// El logo llega en memoria y se sube a Supabase Storage. El PDF solo admite PNG y JPEG.
const subidaLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png'].includes(file.mimetype)) return cb(null, true);
    cb(new ErrorValidacion('El logo debe ser PNG o JPG (el PDF no admite otros formatos).'));
  },
});

const router = express.Router();
const g = (accion) => [requireAuth, requirePermiso('configuracion', accion)];

router.get('/', ...g('ver'), C.negocio);
router.put('/negocio', ...g('editar'), subidaLogo.single('logo'), C.guardarNegocio);
router.put('/facturacion', ...g('editar'), C.guardarFacturacion);

router.get('/usuarios', ...g('ver'), C.usuarios);
router.get('/usuarios/datos', ...g('ver'), C.usuariosDatos);
router.post('/usuarios', ...g('crear'), C.crearUsuario);
router.put('/usuarios/:id(\\d+)', ...g('editar'), C.actualizarUsuario);
router.patch('/usuarios/:id(\\d+)/activo', ...g('editar'), C.cambiarEstadoUsuario);
router.post('/usuarios/:id(\\d+)/codigo', ...g('editar'), C.generarCodigo);

router.get('/roles', ...g('ver'), C.roles);
router.get('/roles/datos', ...g('ver'), C.rolesDatos);
router.post('/roles', ...g('crear'), C.crearRol);
router.put('/roles/:id(\\d+)', ...g('editar'), C.actualizarRol);
router.delete('/roles/:id(\\d+)', ...g('eliminar'), C.eliminarRol);
router.get('/roles/:id(\\d+)/permisos', ...g('ver'), C.permisosRol);
router.put('/roles/:id(\\d+)/permisos', ...g('editar'), C.guardarPermisosRol);

router.get('/auditoria', ...g('ver'), C.auditoria);
router.get('/auditoria/datos', ...g('ver'), C.auditoriaDatos);

module.exports = router;
