const { crearRouter } = require('./entidad');

module.exports = crearRouter(require('../controllers/clientes'), null, 'clientes');
