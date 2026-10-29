// Lista de módulos del sistema: alimenta el menú lateral y las rutas pendientes.
// "funcionalidad" apunta a una bandera de client.config.js (sin bandera = siempre activo).
const config = require('./client.config');

const modulos = [
  { clave: 'dashboard',     ruta: '/',              nombre: 'Inicio',        roles: ['admin'] },
  { clave: 'pos',           ruta: '/pos',           nombre: 'Punto de venta', roles: ['admin', 'vendedor'], funcionalidad: 'pos', fase: 3 },
  { clave: 'inventario',    ruta: '/inventario',    nombre: 'Inventario',    roles: ['admin'], funcionalidad: 'inventario', fase: 2 },
  { clave: 'categorias',    ruta: '/categorias',    nombre: 'Categorías',    roles: ['admin'], funcionalidad: 'inventario', fase: 2 },
  { clave: 'clientes',      ruta: '/clientes',      nombre: 'Clientes',      roles: ['admin'], fase: 2 },
  { clave: 'proveedores',   ruta: '/proveedores',   nombre: 'Proveedores',   roles: ['admin'], fase: 2 },
  { clave: 'facturas',      ruta: '/facturas',      nombre: 'Facturas',      roles: ['admin'], funcionalidad: 'facturas', fase: 3 },
  { clave: 'finanzas',      ruta: '/finanzas',      nombre: 'Finanzas',      roles: ['admin'], funcionalidad: 'finanzas', fase: 5 },
  { clave: 'estadisticas',  ruta: '/estadisticas',  nombre: 'Estadísticas',  roles: ['admin'], funcionalidad: 'estadisticas', fase: 6 },
  { clave: 'configuracion', ruta: '/configuracion', nombre: 'Configuración', roles: ['admin'], fase: 7 },
];

function habilitado(modulo) {
  return !modulo.funcionalidad || config.funcionalidades[modulo.funcionalidad] === true;
}

function modulosVisibles(rol) {
  return modulos.filter((m) => habilitado(m) && m.roles.includes(rol));
}

module.exports = { modulos, modulosVisibles };
