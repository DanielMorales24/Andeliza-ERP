// Unidades que se pueden vender en fracciones (1.5 kilos). El resto va en enteros.
// Se puede cambiar en client.config.js > valoresPorDefecto.unidadesDecimales
const config = require('../client.config');

const POR_DEFECTO = ['kilo', 'libra', 'metro', 'yarda', 'litro', 'galon', 'onza'];

function unidadesDecimales() {
  return config.valoresPorDefecto.unidadesDecimales || POR_DEFECTO;
}

function permiteDecimales(unidad) {
  return unidadesDecimales().includes(String(unidad || '').toLowerCase());
}

module.exports = { unidadesDecimales, permiteDecimales };
