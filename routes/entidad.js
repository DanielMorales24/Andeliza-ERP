// Router estándar de un listado con modal: página + crear + editar + activar/desactivar.
// Cada ruta exige su permiso sobre el módulo: ver (lista), crear, editar y eliminar (desactivar/reactivar).
const express = require('express');
const { requireAuth, requirePermiso, requireFuncionalidad } = require('../middlewares/auth');

const pasar = (req, res, next) => next();

function crearRouter(controlador, funcionalidad, modulo) {
  const router = express.Router();
  const g = (accion) => [funcionalidad ? requireFuncionalidad(funcionalidad) : pasar, requireAuth, requirePermiso(modulo, accion)];

  router.get('/', ...g('ver'), controlador.index);
  router.post('/', ...g('crear'), controlador.crear);
  router.put('/:id(\\d+)', ...g('editar'), controlador.actualizar);
  router.patch('/:id(\\d+)/activo', ...g('eliminar'), controlador.cambiarActivo);

  return router;
}

module.exports = { crearRouter };
