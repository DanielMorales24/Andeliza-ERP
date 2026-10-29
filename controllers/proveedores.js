const V = require('../utils/validar');
const modelo = require('../models/proveedores');
const { crearControlador } = require('./entidad');

const tipos = [
  { valor: 'empresa', etiqueta: 'Empresa' },
  { valor: 'natural', etiqueta: 'Persona natural' },
];

const descriptor = {
  clave: 'proveedores',
  ruta: '/proveedores',
  plural: 'Proveedores',
  singular: 'proveedor',
  articulo: 'el',
  vistas: ['lista', 'tarjetas'],
  textos: {
    nuevo: 'Nuevo proveedor',
    editar: 'Editar proveedor',
    buscar: 'Buscar por nombre, contacto, teléfono o RTN',
    vacio: 'Todavía no tienes proveedores.',
    vacioAccion: 'Crear el primer proveedor',
    creado: 'Proveedor creado.',
    actualizado: 'Proveedor actualizado.',
    activado: 'Proveedor activado.',
    desactivado: 'Proveedor desactivado.',
  },
  busqueda: ['nombre', 'contacto', 'rtn', 'telefono', 'correo', 'direccion', 'notas'],
  columnas: [
    { campo: 'nombre', etiqueta: 'Nombre', principal: true },
    { campo: 'contacto', etiqueta: 'Contacto' },
    { campo: 'rtn', etiqueta: 'RTN', vacio: 'Sin RTN', tenue: true },
    { campo: 'telefono', etiqueta: 'Teléfono' },
    { campo: 'correo', etiqueta: 'Correo' },
  ],
  tarjeta: {
    titulo: 'nombre',
    insignia: 'tipo',
    lineas: [
      { campo: 'contacto', etiqueta: 'Contacto' },
      { campo: 'telefono', etiqueta: 'Teléfono' },
      { campo: 'correo', etiqueta: 'Correo' },
      { campo: 'rtn', etiqueta: 'RTN', vacio: 'Sin RTN' },
    ],
  },
  campos: [
    { nombre: 'nombre', etiqueta: 'Nombre', tipo: 'texto', requerido: true, ancho: 'completo', max: 150 },
    { nombre: 'tipo', etiqueta: 'Tipo', tipo: 'seleccion', opciones: tipos, defecto: 'empresa' },
    { nombre: 'rtn', etiqueta: 'RTN', tipo: 'texto', max: 20, modo: 'numeric', ayuda: 'Opcional. Déjalo vacío si el proveedor no está registrado en el SAR.' },
    { nombre: 'contacto', etiqueta: 'Persona de contacto', tipo: 'texto', max: 150 },
    { nombre: 'telefono', etiqueta: 'Teléfono', tipo: 'telefono', max: 30 },
    { nombre: 'correo', etiqueta: 'Correo', tipo: 'correo', max: 150, ancho: 'completo' },
    { nombre: 'direccion', etiqueta: 'Dirección', tipo: 'area', ancho: 'completo', max: 500 },
    { nombre: 'notas', etiqueta: 'Notas', tipo: 'area', ancho: 'completo', max: 1000 },
    { nombre: 'activo', etiqueta: 'Proveedor activo', tipo: 'interruptor', soloEditar: true, ayuda: 'Los proveedores inactivos no aparecen al registrar compras.' },
  ],
};

function normalizar(b) {
  return {
    nombre: V.requerido(b.nombre, 'El nombre', 150),
    tipo: V.eleccion(b.tipo, 'El tipo', tipos.map((t) => t.valor), 'empresa'),
    rtn: V.rtn(b.rtn),
    contacto: V.opcional(b.contacto, 'El contacto', 150),
    telefono: V.opcional(b.telefono, 'El teléfono', 30),
    correo: V.correo(b.correo),
    direccion: V.opcional(b.direccion, 'La dirección', 500),
    notas: V.opcional(b.notas, 'Las notas', 1000),
    activo: V.booleano(b.activo, true),
  };
}

module.exports = crearControlador({ modelo, descriptor, normalizar });
