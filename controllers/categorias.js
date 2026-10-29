const V = require('../utils/validar');
const modelo = require('../models/categorias');
const { crearControlador } = require('./entidad');

const descriptor = {
  clave: 'categorias',
  ruta: '/categorias',
  plural: 'Categorías',
  singular: 'categoría',
  articulo: 'la',
  vistas: ['lista'],
  mensajeDuplicado: 'Ya existe una categoría con ese nombre.',
  textos: {
    nuevo: 'Nueva categoría',
    editar: 'Editar categoría',
    buscar: 'Buscar categoría',
    vacio: 'Todavía no tienes categorías.',
    vacioAccion: 'Crear la primera categoría',
    creado: 'Categoría creada.',
    actualizado: 'Categoría actualizada.',
    activado: 'Categoría activada.',
    desactivado: 'Categoría desactivada.',
  },
  busqueda: ['nombre', 'descripcion'],
  columnas: [
    { campo: 'nombre', etiqueta: 'Nombre', principal: true },
    { campo: 'descripcion', etiqueta: 'Descripción', tenue: true },
    { campo: 'productos', etiqueta: 'Productos', alinear: 'der' },
  ],
  tarjeta: { titulo: 'nombre', lineas: [] },
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, ancho: 'completo', max: 100 },
    { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'area', ancho: 'completo', max: 500 },
    { nombre: 'activo', etiqueta: 'Categoría activa', tipo: 'interruptor', soloEditar: true, ayuda: 'Las categorías inactivas no se ofrecen en productos nuevos.' },
  ],
};

function normalizar(b) {
  return {
    nombre: V.requerido(b.nombre, 'El nombre', 100),
    descripcion: V.opcional(b.descripcion, 'La descripción', 500),
    activo: V.booleano(b.activo, true),
  };
}

module.exports = crearControlador({ modelo, descriptor, normalizar });
