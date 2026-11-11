// DECISIÓN DE ARQUITECTURA D-01 — la Fase 7 (Configuración, usuarios y roles) se construye ANTES que la Fase 6 (Estadísticas).
// Motivo: (1) el entregable universitario de la semana pide "Login y Roles" y (2) las estadísticas necesitan saber QUIÉN vendió
// y con qué ROL ("¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de roles lista, las Estadísticas se apoyan en
// ventas.usuario_id y usuarios.rol_id sin rehacer nada. Es un orden elegido, no un pendiente olvidado. Ver docs/plan.md y
// docs/bitacora/semana-4.md.
// Autenticación y permisos. Dos preguntas distintas:
//   1) ¿quién eres?   -> cargarPermisos (sesión + permisos exactos del rol, leídos en cada petición)
//   2) ¿puedes esto?  -> requirePermiso(modulo, accion): el SERVIDOR responde 403, no solo se oculta el botón
const config = require('../client.config');
const Usuarios = require('../models/usuarios');
const Auditoria = require('../models/auditoria');
const Negocio = require('../models/negocio');
const { pideJSON } = require('../utils/errores');

// Mientras la contraseña es provisional, solo se puede cambiarla o salir
const LIBRES_SI_DEBE_CAMBIAR = ['/cambiar-contrasena', '/logout'];

// Carga en req.user al usuario con su rol y sus permisos. Cierra la sesión si la persona fue
// desactivada, si su rol se desactivó o si alguien cambió su contraseña desde otro lado.
async function cargarPermisos(req, res, next) {
  try {
    const id = req.session && req.session.usuarioId;
    const sinSesion = (mensaje) => {
      req.session = null;
      return pideJSON(req) ? res.status(401).json({ error: mensaje || 'Tu sesión expiró. Vuelve a iniciar sesión.' }) : res.redirect('/login');
    };
    if (!id) return sinSesion();

    const usuario = await Usuarios.cargarSesion(id);
    if (!usuario || !usuario.activo || !usuario.rolActivo || usuario.sesionVersion !== req.session.sv) {
      return sinSesion('Tu sesión terminó. Vuelve a iniciar sesión.');
    }

    req.user = usuario;
    res.locals.usuarioActual = usuario;
    if (!res.locals.negocioActual) res.locals.negocioActual = await Negocio.obtener();   // normalmente ya lo cargó middlewares/negocio.js

    if (usuario.debeCambiar && !LIBRES_SI_DEBE_CAMBIAR.includes(req.originalUrl.split('?')[0])) {
      return pideJSON(req)
        ? res.status(403).json({ error: 'Debes cambiar tu contraseña antes de continuar.', cambiarContrasena: true })
        : res.redirect('/cambiar-contrasena');
    }

    // Asistente de configuración inicial (decisión D-09): mientras el negocio no esté configurado, la persona
    // a quien le toca solo puede usar el asistente o salir. Va después del cambio de contraseña obligatorio.
    // Solo aplica cuando la contraseña ya no es provisional: primero se cambia la contraseña y después se configura.
    if (usuario.debeOnboarding && !usuario.debeCambiar) {
      const ruta = req.originalUrl.split('?')[0];
      const libre = ruta === '/logout' || ruta === '/onboarding' || ruta.startsWith('/onboarding/');
      if (!libre) {
        return pideJSON(req)
          ? res.status(403).json({ error: 'Primero completa la configuración inicial del negocio.', onboarding: true })
          : res.redirect('/onboarding');
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Respuesta de "no puedes". Queda anotada en la auditoría: sirve para detectar intentos.
async function denegar(req, res, pares) {
  try {
    await Auditoria.registrar({
      usuarioId: req.user.id, accion: 'acceso_denegado', entidad: 'permiso',
      descripcion: `Intentó ${req.method} ${req.originalUrl.split('?')[0]} sin el permiso ${pares.map((p) => p.join('.')).join(' o ')}`,
      ip: req.ip,
    });
  } catch (err) {
    console.error('[auditoria] no se pudo anotar el acceso denegado:', err.message);
  }
  if (pideJSON(req)) return res.status(403).json({ error: 'No tienes permiso para hacer esto.' });
  return res.status(403).render('errores/403', { layout: 'layouts/auth', titulo: 'Sin permiso' });
}

// Uso: requirePermiso('finanzas', 'ver')
function requirePermiso(modulo, accion) {
  return (req, res, next) => (req.user.tiene(modulo, accion) ? next() : denegar(req, res, [[modulo, accion]]));
}

// Pasa con cualquiera de los permisos: requireAlgunPermiso(['facturas', 'ver'], ['facturas', 'ver_propias'])
function requireAlgunPermiso(...pares) {
  return (req, res, next) => (req.user.tieneAlguno(pares) ? next() : denegar(req, res, pares));
}

// Si la funcionalidad está apagada en client.config.js, la ruta no existe (404)
function requireFuncionalidad(clave) {
  return (req, res, next) => {
    if (config.funcionalidades[clave] === true) return next();
    if (pideJSON(req)) return res.status(404).json({ error: 'Esta función no está activa.' });
    res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
  };
}

// Pasa si al menos una de las funcionalidades está activa
function requireAlgunaFuncionalidad(...claves) {
  return (req, res, next) => {
    if (claves.some((c) => config.funcionalidades[c] === true)) return next();
    if (pideJSON(req)) return res.status(404).json({ error: 'Esta función no está activa.' });
    res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
  };
}

// requireAuth sigue existiendo con su nombre de siempre: hoy es lo mismo que cargarPermisos
module.exports = {
  cargarPermisos, requireAuth: cargarPermisos, requirePermiso, requireAlgunPermiso, requireFuncionalidad, requireAlgunaFuncionalidad,
};
