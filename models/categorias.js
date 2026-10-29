const { crearModelo } = require('./entidad');

// productos = cuántos productos activos tiene la categoría
module.exports = crearModelo({
  tabla: 'categorias',
  columnas: ['nombre', 'descripcion', 'activo'],
  extras: ', (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = t.id AND p.activo) AS productos',
});
