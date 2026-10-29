// Router estándar de un listado con modal: página + crear + editar + activar/desactivar.
const express = require('express');
const { requireAuth, soloRoles, requireFuncionalidad } = require('../middlewares/auth');

const pasar = (req, res, next) => next();

function crearRouter(controlador, funcionalidad) {
  const router = express.Router();
  const guardas = [funcionalidad ? requireFuncionalidad(funcionalidad) : pasar, requireAuth, soloRoles('admin')];

  router.get('/', ...guardas, controlador.index);
  router.post('/', ...guardas, controlador.crear);
  router.put('/:id(\\d+)', ...guardas, controlador.actualizar);
  router.patch('/:id(\\d+)/activo', ...guardas, controlador.cambiarActivo);

  return router;
}

module.exports = { crearRouter };
