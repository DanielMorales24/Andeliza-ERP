// DECISIÓN DE ARQUITECTURA D-01 — la Fase 7 (Configuración, usuarios y roles) se construye ANTES que la Fase 6 (Estadísticas).
// Motivo: (1) el entregable universitario de la semana pide "Login y Roles" y (2) las estadísticas necesitan saber QUIÉN vendió
// y con qué ROL ("¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de roles lista, las Estadísticas se apoyan en
// ventas.usuario_id y usuarios.rol_id sin rehacer nada. Es un orden elegido, no un pendiente olvidado. Ver docs/plan.md y
// docs/bitacora/semana-4.md.
// Lista de módulos del sistema: alimenta el menú lateral y las rutas pendientes.
// "funcionalidad" apunta a una bandera de client.config.js (sin bandera = siempre activo).
// "permisos" son las alternativas con las que un usuario VE el módulo en el menú: con cualquiera de ellas basta.
// (El servidor protege cada ruta por su cuenta con requirePermiso: el menú solo es comodidad.)
const config = require('./client.config');

const modulos = [
  { clave: 'dashboard',     ruta: '/',              nombre: 'Inicio',         permisos: [['dashboard', 'ver']] },
  { clave: 'pos',           ruta: '/pos',           nombre: 'Punto de venta', permisos: [['pos', 'ver']], funcionalidad: 'pos', fase: 3 },
  { clave: 'inventario',    ruta: '/inventario',    nombre: 'Inventario',     permisos: [['inventario', 'ver']], funcionalidad: 'inventario', fase: 2 },
  { clave: 'categorias',    ruta: '/categorias',    nombre: 'Categorías',     permisos: [['inventario', 'ver']], funcionalidad: 'inventario', fase: 2 },
  { clave: 'clientes',      ruta: '/clientes',      nombre: 'Clientes',       permisos: [['clientes', 'ver']], fase: 2 },
  { clave: 'proveedores',   ruta: '/proveedores',   nombre: 'Proveedores',    permisos: [['proveedores', 'ver']], fase: 2 },
  { clave: 'facturas',      ruta: '/facturas',      nombre: 'Facturas',       permisos: [['facturas', 'ver'], ['facturas', 'ver_propias']], funcionalidad: 'facturas', fase: 3 },
  { clave: 'finanzas',      ruta: '/finanzas',      nombre: 'Finanzas',       permisos: [['finanzas', 'ver']], funcionalidad: 'finanzas', fase: 4 },
  { clave: 'estadisticas',  ruta: '/estadisticas',  nombre: 'Estadísticas',   permisos: [['estadisticas', 'ver']], funcionalidad: 'estadisticas', fase: 6 },
  { clave: 'configuracion', ruta: '/configuracion', nombre: 'Configuración',  permisos: [['configuracion', 'ver']], fase: 7 },
];

function habilitado(modulo) {
  return !modulo.funcionalidad || config.funcionalidades[modulo.funcionalidad] === true;
}

// Los módulos que esta persona puede ver en el menú
function modulosVisibles(usuario) {
  return modulos.filter((m) => habilitado(m) && usuario.tieneAlguno(m.permisos));
}

// A dónde llega al iniciar sesión: el primero de esta lista al que tenga acceso
// (el administrador y el supervisor al panel, el vendedor al POS, el contador a Finanzas)
const PRIORIDAD_INICIO = ['dashboard', 'pos', 'finanzas', 'facturas', 'inventario', 'categorias', 'clientes', 'proveedores', 'estadisticas', 'configuracion'];

function rutaInicial(usuario) {
  const visibles = modulosVisibles(usuario);
  for (const clave of PRIORIDAD_INICIO) {
    const m = visibles.find((v) => v.clave === clave);
    if (m) return m.ruta;
  }
  return null;
}

module.exports = { modulos, modulosVisibles, rutaInicial };
