// Rutas de los módulos que todavía no existen: muestran "próximamente".
// Al construir un módulo, su router real se registra en app.js antes de este
// archivo y esta ruta deja de usarse para él.
const router = require('express').Router();
const { requireAuth, soloRoles, requireFuncionalidad } = require('../middlewares/auth');
const { modulos } = require('../modulos');

const pasar = (req, res, next) => next();

modulos
  .filter((m) => m.clave !== 'dashboard')
  .forEach((m) => {
    router.get(
      m.ruta,
      m.funcionalidad ? requireFuncionalidad(m.funcionalidad) : pasar,
      requireAuth,
      soloRoles(...m.roles),
      (req, res) => res.render('proximamente', { titulo: m.nombre, modulo: m })
    );
  });

module.exports = router;
