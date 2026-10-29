const Usuarios = require('../models/usuarios');

function mostrarLogin(req, res) {
  if (req.session && req.session.usuarioId) return res.redirect('/');
  res.render('auth/login', { layout: 'layouts/auth', titulo: 'Iniciar sesión', error: '', usuario: '' });
}

async function login(req, res, next) {
  try {
    const usuario = String(req.body.usuario || '').trim();
    const contrasena = String(req.body.contrasena || '');

    const encontrado = await Usuarios.autenticar(usuario, contrasena);
    if (!encontrado) {
      return res.status(401).render('auth/login', {
        layout: 'layouts/auth',
        titulo: 'Iniciar sesión',
        error: 'Usuario o contraseña incorrectos.',
        usuario,
      });
    }

    req.session = { usuarioId: encontrado.id };
    res.redirect(encontrado.rol === 'admin' ? '/' : '/pos');
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  req.session = null;
  res.redirect('/login');
}

module.exports = { mostrarLogin, login, logout };
