// Inicio y cierre de sesión, cambio de contraseña y recuperación con código.
const Usuarios = require('../models/usuarios');
const Auditoria = require('../models/auditoria');
const { rutaInicial } = require('../modulos');

const PAGINA_LOGIN = { layout: 'layouts/auth', titulo: 'Iniciar sesión' };

function mostrarLogin(req, res) {
  if (req.session && req.session.usuarioId) return res.redirect('/');
  const exito = req.query.ok === 'recuperada' ? 'Tu contraseña cambió. Ya puedes iniciar sesión.' : '';
  res.render('auth/login', { ...PAGINA_LOGIN, error: '', exito, usuario: '' });
}

async function login(req, res, next) {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const contrasena = String(req.body.contrasena || '');
    const falla = (estado, error) => res.status(estado).render('auth/login', { ...PAGINA_LOGIN, error, exito: '', usuario });

    const r = await Usuarios.autenticar(usuario, contrasena, req.ip);
    if (!r.ok) {
      if (r.motivo === 'bloqueado') return falla(429, `Demasiados intentos fallidos. Por seguridad, la cuenta quedó bloqueada: intenta de nuevo en ${r.minutos} minuto${r.minutos === 1 ? '' : 's'}.`);
      if (r.motivo === 'inactivo') return falla(403, 'Tu cuenta está desactivada. Habla con el administrador.');
      if (r.motivo === 'rol_inactivo') return falla(403, 'Tu rol está desactivado. Habla con el administrador.');
      return falla(401, 'Usuario o contraseña incorrectos.');
    }

    // La versión de sesión liga la cookie a esta contraseña y a este estado de la cuenta
    req.session = { usuarioId: r.usuario_id, sv: r.sesion_version };
    res.redirect(r.debe_cambiar ? '/cambiar-contrasena' : '/');
  } catch (err) {
    next(err);
  }
}

async function logout(req, res) {
  const id = req.session && req.session.usuarioId;
  if (id) {
    try {
      await Auditoria.registrar({ usuarioId: id, accion: 'logout', entidad: 'usuarios', entidadId: id, descripcion: 'Cerró sesión', ip: req.ip });
    } catch (err) {
      console.error('[auditoria] no se pudo anotar el cierre de sesión:', err.message);
    }
  }
  req.session = null;
  res.redirect('/login');
}

// ---------- Cambiar la propia contraseña (también es obligatorio en el primer inicio) ----------
const PAGINA_CAMBIO = { layout: 'layouts/auth', titulo: 'Cambiar contraseña' };

function mostrarCambio(req, res) {
  res.render('auth/cambiar_contrasena', { ...PAGINA_CAMBIO, error: '', obligatorio: req.user.debeCambiar });
}

async function cambiarContrasena(req, res, next) {
  const mostrar = (estado, error) => res.status(estado).render('auth/cambiar_contrasena', { ...PAGINA_CAMBIO, error, obligatorio: req.user.debeCambiar });
  try {
    const actual = String(req.body.actual || '');
    const nueva = String(req.body.nueva || '');
    if (!actual) return mostrar(422, 'Escribe tu contraseña actual.');
    if (nueva !== String(req.body.confirmar || '')) return mostrar(422, 'La contraseña nueva y su confirmación no coinciden.');

    const r = await Usuarios.cambiarContrasena(req.user.id, actual, nueva, req.ip);
    if (!r.ok) return mostrar(422, 'La contraseña actual no es correcta.');

    req.session.sv = r.sesion_version;   // esta sesión sigue; las demás de la misma persona se cierran
    res.redirect(rutaInicial(req.user) || '/');
  } catch (err) {
    if (err && err.code === 'P0001') return mostrar(422, err.message);
    next(err);
  }
}

// ---------- Recuperación: el administrador da un código y la persona elige su contraseña ----------
const PAGINA_RECUPERAR = { layout: 'layouts/auth', titulo: 'Recuperar contraseña' };

function mostrarRecuperar(req, res) {
  res.render('auth/recuperar', { ...PAGINA_RECUPERAR, error: '', usuario: '', codigo: '' });
}

async function recuperar(req, res, next) {
  const usuario = String(req.body.usuario || '').trim();
  const codigo = String(req.body.codigo || '').trim();
  const mostrar = (estado, error) => res.status(estado).render('auth/recuperar', { ...PAGINA_RECUPERAR, error, usuario, codigo });
  try {
    const nueva = String(req.body.nueva || '');
    if (!usuario || !codigo) return mostrar(422, 'Escribe tu usuario y el código que te dio el administrador.');
    if (nueva !== String(req.body.confirmar || '')) return mostrar(422, 'La contraseña nueva y su confirmación no coinciden.');

    const r = await Usuarios.usarCodigo(usuario, codigo, nueva, req.ip);
    if (!r.ok) {
      if (r.motivo === 'bloqueado') return mostrar(429, `Demasiados intentos fallidos. Intenta de nuevo en ${r.minutos} minuto${r.minutos === 1 ? '' : 's'}.`);
      return mostrar(422, 'El código no es válido o ya venció. Pide uno nuevo al administrador.');
    }
    req.session = null;
    res.redirect('/login?ok=recuperada');
  } catch (err) {
    if (err && err.code === 'P0001') return mostrar(422, err.message);
    next(err);
  }
}

module.exports = { mostrarLogin, login, logout, mostrarCambio, cambiarContrasena, mostrarRecuperar, recuperar };
