const config = require('../client.config');
const Dashboard = require('../models/dashboard');

async function index(req, res, next) {
  try {
    if (req.user.rol !== 'admin') return res.redirect('/pos'); // el vendedor solo usa el POS
    const resumen = await Dashboard.resumen(config.valoresPorDefecto.zonaHoraria);
    res.render('dashboard/index', { titulo: 'Inicio', resumen });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
