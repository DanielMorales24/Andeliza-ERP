const config = require('../client.config');
const Dashboard = require('../models/dashboard');
const { modulosVisibles, rutaInicial } = require('../modulos');

async function index(req, res, next) {
  try {
    // Quien no tiene el panel va a su módulo principal (el vendedor al POS, el contador a Finanzas…).
    // El vendedor no tiene dashboard.ver: por eso nunca llega al panel nuevo.
    if (!req.user.tiene('dashboard', 'ver')) {
      const destino = rutaInicial(req.user);
      if (destino) return res.redirect(destino);
      return res.status(403).render('errores/403', { layout: 'layouts/auth', titulo: 'Sin permiso' });
    }
    // Qué bloques puede ver esta persona: módulo visible = permiso + funcionalidad activa en client.config.js
    const claves = new Set(modulosVisibles(req.user).map((m) => m.clave));
    const ve = { pos: claves.has('pos'), inventario: claves.has('inventario'), finanzas: claves.has('finanzas'), facturas: claves.has('facturas'), estadisticas: claves.has('estadisticas') };
    const d = await Dashboard.panel(req.user, ve);
    res.render('dashboard/index', { titulo: 'Inicio', d, moneda: config.valoresPorDefecto.moneda });
  } catch (err) {
    next(err);
  }
}

module.exports = { index };
