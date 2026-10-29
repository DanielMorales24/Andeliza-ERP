const config = require('../client.config');
const Usuarios = require('../models/usuarios');
const { pideJSON } = require('../utils/errores');

// Exige sesión iniciada y carga al usuario en req.user
async function requireAuth(req, res, next) {
  try {
    const id = req.session && req.session.usuarioId;
    const sinSesion = () => (pideJSON(req)
      ? res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' })
      : res.redirect('/login'));
    if (!id) return sinSesion();

    const usuario = await Usuarios.obtenerActivoPorId(id);
    if (!usuario) {            // borrado o desactivado después de iniciar sesión
      req.session = null;
      return sinSesion();
    }

    req.user = usuario;
    res.locals.usuarioActual = usuario;
    next();
  } catch (err) {
    next(err);
  }
}

// Uso: soloRoles('admin')
function soloRoles(...roles) {
  return (req, res, next) => {
    if (roles.includes(req.user.rol)) return next();
    if (pideJSON(req)) return res.status(403).json({ error: 'No tienes permiso para hacer esto.' });
    res.status(403).render('errores/403', { layout: 'layouts/auth', titulo: 'Sin permiso' });
  };
}

// Si la funcionalidad está apagada en client.config.js, la ruta no existe (404)
function requireFuncionalidad(clave) {
  return (req, res, next) => {
    if (config.funcionalidades[clave] === true) return next();
    if (pideJSON(req)) return res.status(404).json({ error: 'Esta función no está activa.' });
    res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
  };
}

module.exports = { requireAuth, soloRoles, requireFuncionalidad };
