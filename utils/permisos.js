// DECISIÓN DE ARQUITECTURA D-01 — la Fase 7 (Configuración, usuarios y roles) se construye ANTES que la Fase 6 (Estadísticas).
// Motivo: (1) el entregable universitario de la semana pide "Login y Roles" y (2) las estadísticas necesitan saber QUIÉN vendió
// y con qué ROL ("¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de roles lista, las Estadísticas se apoyan en
// ventas.usuario_id y usuarios.rol_id sin rehacer nada. Es un orden elegido, no un pendiente olvidado. Ver docs/plan.md y
// docs/bitacora/semana-4.md.
// Permisos: módulos, acciones y el objeto de usuario que viaja en req.user.
//
// Un permiso es "modulo.accion" (por ejemplo "pos.crear"). El rol admin tiene TODOS
// (los actuales y los que se agreguen). Los permisos de Configuración solo existen
// para el admin: la base de datos rechaza dárselos a otro rol.

// Etiquetas de la matriz de permisos y del menú
const MODULOS = {
  dashboard: 'Inicio',
  pos: 'Punto de venta',
  inventario: 'Inventario y categorías',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  facturas: 'Facturas',
  finanzas: 'Finanzas y reportes',
  estadisticas: 'Estadísticas',
  configuracion: 'Configuración',
};

// Columnas de la matriz. ver_propias = ver solo lo que la persona misma generó.
const ACCIONES = [
  { clave: 'ver', etiqueta: 'Ver' },
  { clave: 'crear', etiqueta: 'Crear' },
  { clave: 'editar', etiqueta: 'Editar' },
  { clave: 'eliminar', etiqueta: 'Eliminar' },
  { clave: 'ver_propias', etiqueta: 'Solo propias' },
];

function crearUsuarioSesion(f) {
  const esAdmin = f.rol === 'admin' && f.rol_sistema === true;
  const permisos = new Set(f.permisos || []);
  return {
    id: f.id,
    nombre: f.nombre,
    usuario: f.usuario,
    activo: f.activo,
    rol: f.rol,
    rolId: f.rol_id,
    rolActivo: f.rol_activo,
    esAdmin,
    sesionVersion: f.sesion_version,
    debeCambiar: f.debe_cambiar_contrasena,
    permisos,
    // ¿Puede hacer esta acción en este módulo?
    tiene(modulo, accion) { return esAdmin || permisos.has(`${modulo}.${accion}`); },
    // ¿Tiene al menos uno de estos permisos? ([['facturas','ver'], ['facturas','ver_propias']])
    tieneAlguno(pares) { return pares.some(([m, a]) => esAdmin || permisos.has(`${m}.${a}`)); },
  };
}

module.exports = { MODULOS, ACCIONES, crearUsuarioSesion };
