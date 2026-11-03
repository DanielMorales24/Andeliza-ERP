const config = require('../client.config');
const Dashboard = require('../models/dashboard');
const { rutaInicial } = require('../modulos');

async function index(req, res, next) {
  try {
    // Quien no tiene el panel va a su módulo principal (el vendedor al POS, el contador a Finanzas…)
    if (!req.user.tiene('dashboard', 'ver')) {
      const destino = rutaInicial(req.user);
      if (destino) return res.redirect(destino);
      return res.status(403).render('errores/403', { layout: 'layouts/auth', titulo: 'Sin permiso' });
    }
    const resumen = await Dashboard.resumen(config.valoresPorDefecto.zonaHoraria);
    res.render('dashboard/index', { titulo: 'Inicio', resumen });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
