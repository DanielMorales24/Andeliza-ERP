const V = require('../utils/validar');
const modelo = require('../models/clientes');
const { crearControlador } = require('./entidad');

const tipos = [
  { valor: 'natural', etiqueta: 'Persona natural' },
  { valor: 'empresa', etiqueta: 'Empresa' },
];

// Lo que ve la interfaz (columnas, tarjeta y formulario)
const descriptor = {
  clave: 'clientes',
  ruta: '/clientes',
  plural: 'Clientes',
  singular: 'cliente',
  articulo: 'el',
  vistas: ['lista', 'tarjetas'],
  textos: {
    nuevo: 'Nuevo cliente',
    editar: 'Editar cliente',
    buscar: 'Buscar por nombre, teléfono, RTN o correo',
    vacio: 'Todavía no tienes clientes.',
    vacioAccion: 'Crear el primer cliente',
    creado: 'Cliente creado.',
    actualizado: 'Cliente actualizado.',
    activado: 'Cliente activado.',
    desactivado: 'Cliente desactivado.',
  },
  busqueda: ['nombre', 'rtn', 'telefono', 'correo', 'direccion', 'notas'],
  columnas: [
    { campo: 'nombre', etiqueta: 'Nombre', principal: true },
    { campo: 'tipo', etiqueta: 'Tipo', insignia: true },
    { campo: 'rtn', etiqueta: 'RTN', vacio: 'Sin RTN', tenue: true },
    { campo: 'telefono', etiqueta: 'Teléfono' },
    { campo: 'correo', etiqueta: 'Correo' },
  ],
  tarjeta: {
    titulo: 'nombre',
    insignia: 'tipo',
    lineas: [
      { campo: 'telefono', etiqueta: 'Teléfono' },
      { campo: 'correo', etiqueta: 'Correo' },
      { campo: 'rtn', etiqueta: 'RTN', vacio: 'Sin RTN' },
      { campo: 'direccion', etiqueta: 'Dirección' },
    ],
  },
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, ancho: 'completo', max: 150 },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', opciones: tipos, defecto: 'natural' },
    { nombre: 'rtn', etiqueta: 'RTN', tipo: 'texto', max: 20, modo: 'numeric', ayuda: 'Opcional. Déjalo vacío si el cliente no está registrado en el SAR.' },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', max: 30 },
    { nombre: 'correo', etiqueta: 'Correo', tipo: 'correo', max: 150 },
    { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'area', ancho: 'completo', max: 500 },
    { nombre: 'notas', etiqueta: 'Notas', tipo: 'area', ancho: 'completo', max: 1000 },
    { nombre: 'activo', etiqueta: 'Cliente activo', tipo: 'interruptor', soloEditar: true, ayuda: 'Los clientes inactivos no aparecen al vender.' },
  ],
};

function normalizar(b) {
  return {
    nombre: V.requerido(b.nombre, 'El nombre', 150),
    tipo: V.eleccion(b.tipo, 'El tipo', tipos.map((t) => t.valor), 'natural'),
    rtn: V.rtn(b.rtn),
    telefono: V.opcional(b.telefono, 'El teléfono', 30),
    correo: V.correo(b.correo),
    direccion: V.opcional(b.direccion, 'La dirección', 500),
    notas: V.opcional(b.notas, 'Las notas', 1000),
    activo: V.booleano(b.activo, true),
  };
}

module.exports = crearControlador({ modelo, descriptor, normalizar });
