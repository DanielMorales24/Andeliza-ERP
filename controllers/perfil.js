// Mi perfil y Mi actividad: la información de la propia persona. Solo exigen sesión iniciada.
const Perfil = require('../models/perfil');
const { modulosVisibles } = require('../modulos');
const { ACCIONES } = require('../utils/permisos');

async function index(req, res, next) {
  try {
    const u = req.user;
    const [perfil, anterior, matriz] = await Promise.all([Perfil.obtener(u.id), Perfil.accesoAnterior(u.id), Perfil.matrizDelRol(u.rolId, u.esAdmin)]);
    res.render('perfil/index', {
      titulo: 'Mi perfil',
      perfil, anterior, matriz, acciones: ACCIONES,
      modulos: modulosVisibles(u),
      permisosActivos: matriz.reduce((t, m) => t + Object.values(m.acciones).filter(Boolean).length, 0),
      permisosTotales: matriz.reduce((t, m) => t + Object.keys(m.acciones).length, 0),
    });
  } catch (err) { next(err); }
}

async function actividad(req, res, next) {
  try {
    res.render('perfil/actividad', { titulo: 'Mi actividad', filas: await Perfil.actividad(req.user.id, 20) });
  } catch (err) { next(err); }
}

module.exports = { index, actividad };
