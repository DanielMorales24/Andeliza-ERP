const { crearRouter } = require('./entidad');

// Las categorías son parte del módulo de inventario para los permisos
module.exports = crearRouter(require('../controllers/categorias'), 'inventario', 'inventario');
