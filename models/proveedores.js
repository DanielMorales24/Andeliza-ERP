const { crearModelo } = require('./entidad');

module.exports = crearModelo({
  tabla: 'proveedores',
  columnas: ['nombre', 'tipo', 'rtn', 'contacto', 'telefono', 'correo', 'direccion', 'notas', 'activo'],
});
