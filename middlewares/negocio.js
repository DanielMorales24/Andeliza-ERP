// Carga el negocio de ESTA instancia en cada petición (una lectura por llave primaria) y lo deja
// disponible para todas las vistas, con sesión o sin ella: nombre, logo, colores y elecciones del catálogo.
// También aplica su formato regional (moneda, formato de fecha, zona horaria) a utils/formato.js.
const Negocio = require('../models/negocio');
const formato = require('../utils/formato');

module.exports = async function cargarNegocio(req, res, next) {
  const negocio = await Negocio.obtener();   // nunca lanza: si la base no responde devuelve los valores de fábrica
  res.locals.negocioActual = negocio;
  formato.aplicarRegional(negocio);
  next();
};
