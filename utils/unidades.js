// Unidades que se pueden vender en fracciones (1.5 metros). El resto va en enteros.
// Sale del catálogo maestro (client.config.js > catalogo.unidades, "decimal: true") y no depende
// de que la unidad esté activa: un producto que ya la usa se sigue vendiendo igual.
const Catalogo = require('./catalogo');

const unidadesDecimales = () => Catalogo.unidadesDecimales();

function permiteDecimales(unidad) {
  return unidadesDecimales().includes(String(unidad || '').toLowerCase());
}

module.exports = { unidadesDecimales, permiteDecimales };
