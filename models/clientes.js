const { crearModelo } = require('./entidad');

module.exports = crearModelo({
  tabla: 'clientes',
  columnas: ['nombre', 'tipo', 'rtn', 'telefono', 'correo', 'direccion', 'notas', 'activo'],
});
