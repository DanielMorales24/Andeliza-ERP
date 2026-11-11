// DECISIÓN DE ARQUITECTURA D-01 — la Fase 7 (Configuración, usuarios y roles) se construye ANTES que la Fase 6 (Estadísticas).
// Motivo: (1) el entregable universitario de la semana pide "Login y Roles" y (2) las estadísticas necesitan saber QUIÉN vendió
// y con qué ROL ("¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de roles lista, las Estadísticas se apoyan en
// ventas.usuario_id y usuarios.rol_id sin rehacer nada. Es un orden elegido, no un pendiente olvidado. Ver docs/plan.md y
// docs/bitacora/semana-4.md.
// Configuración (solo el administrador): negocio y facturación, usuarios, roles con su matriz
// de permisos y auditoría. Las reglas delicadas viven en funciones SQL (functions_es.sql).
const config = require('../client.config');
const V = require('../utils/validar');
const Negocio = require('../models/negocio');
const Usuarios = require('../models/usuarios');
const Roles = require('../models/roles');
const Auditoria = require('../models/auditoria');
const Storage = require('../services/storageService');
const Catalogo = require('../utils/catalogo');
const { ACCIONES } = require('../utils/permisos');
const { hoyISO, fechaHora } = require('../utils/formato');

const aprobar = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (err) { next(err); } };

function idDeRuta(req) { return Number(req.params.id); }

function enteroPositivo(valor, etiqueta) {
  const n = Number(V.texto(valor));
  if (!Number.isInteger(n) || n <= 0) throw new V.ErrorValidacion(`${etiqueta} debe ser un número entero mayor que cero.`);
  return n;
}

// ======================= NEGOCIO =======================

const formatoFiscal = (f) => (f ? {
  activo: f.activo, cai: f.cai, rangoInicio: f.rango_inicio, rangoFin: f.rango_fin, numeroActual: f.numero_actual,
  fechaLimite: f.fecha_limite, tasaPct: Math.round(Number(f.tasa_impuesto) * 10000) / 100, pieLegal: f.pie_legal || '',
} : null);

const negocio = aprobar(async (req, res) => {
  const [efectivo, fiscal, modo, usoUnidades] = await Promise.all([Negocio.obtener(), Negocio.fiscalParaFormulario(), Negocio.modoFacturacion(), Negocio.usoUnidades()]);
  const datos = {
    negocio: { nombre: efectivo.nombre, rtn: efectivo.rtn, direccion: efectivo.direccion, telefono: efectivo.telefono, correo: efectivo.correo, logoUrl: efectivo.logoUrl, logoPropio: efectivo.logoPropio },
    fiscal: formatoFiscal(fiscal),
    modo,
    tasaPorDefecto: Math.round(efectivo.tasaImpuesto * 10000) / 100,
    // Fase 6.5: lo que EXISTE (catálogo maestro) y lo que este negocio ELIGIÓ
    maestro: Catalogo.paraVista(),
    catalogo: efectivo.catalogo,
    paletaId: efectivo.paletaId,
    regional: { moneda: efectivo.moneda, formatoFecha: efectivo.formatoFecha, zonaHoraria: efectivo.zonaHoraria, tasaImpuesto: Math.round(efectivo.tasaImpuesto * 10000) / 100 },
    usoUnidades,
    hoy: hoyISO(),
  };
  res.render('configuracion/negocio', { titulo: 'Configuración', seccion: 'negocio', datos });
});

const guardarNegocio = aprobar(async (req, res) => {
  const d = {
    nombre: V.requerido(req.body.nombre, 'El nombre del negocio', 150),
    rtn: V.rtn(req.body.rtn),
    direccion: V.opcional(req.body.direccion, 'La dirección', 255),
    telefono: V.opcional(req.body.telefono, 'El teléfono', 40),
    correo: V.correo(req.body.correo, 'El correo'),
  };
  const anterior = (await Negocio.obtenerCrudo()).logo_url || null;
  let logoUrl = anterior;

  if (req.file) {
    if (req.file.size > 3 * 1024 * 1024) throw new V.ErrorValidacion('El logo no puede pesar más de 3 MB.');
    logoUrl = await Storage.subirImagen(req.file.buffer, req.file.mimetype);
  } else if (V.booleano(req.body.quitar_logo)) {
    logoUrl = null;
  }

  await Negocio.actualizar({ ...d, logoUrl });
  if (anterior && anterior !== logoUrl) await Storage.eliminarImagen(anterior);   // no es crítico: si falla solo se registra

  await Auditoria.registrar({
    usuarioId: req.user.id, accion: 'actualizar_negocio', entidad: 'configuracion_negocio', entidadId: 1,
    descripcion: `Actualizó los datos del negocio${req.file ? ' y cambió el logo' : ''}${!req.file && anterior && !logoUrl ? ' y quitó el logo' : ''}`, ip: req.ip,
  });
  const efectivo = await Negocio.obtener();
  const { nombre, logoUrl: logo, rtn, direccion, telefono, correo, logoPropio } = efectivo;
  res.json({ ok: true, negocio: { nombre, logoUrl: logo, rtn, direccion, telefono, correo, logoPropio } });
});

// ---------- Fase 6.5: paleta, formato regional y catálogo del negocio ----------
// En los tres casos solo se aceptan valores que existan en el catálogo maestro (client.config.js).

const guardarPaleta = aprobar(async (req, res) => {
  const paleta = Catalogo.validarPaleta(req.body.paleta_id);   // los colores salen del catálogo, no del navegador
  await Negocio.guardarPaleta(paleta);
  await Auditoria.registrar({
    usuarioId: req.user.id, accion: 'actualizar_paleta', entidad: 'configuracion_negocio', entidadId: 1,
    descripcion: `Cambió la paleta de colores a ${paleta.nombre}`, ip: req.ip,
  });
  res.json({ ok: true, paleta, colores: (await Negocio.obtener()).colores });
});

const guardarRegional = aprobar(async (req, res) => {
  const d = Catalogo.validarRegional(req.body);
  await Negocio.guardarRegional(d);
  await Auditoria.registrar({
    usuarioId: req.user.id, accion: 'actualizar_regional', entidad: 'configuracion_negocio', entidadId: 1,
    descripcion: `Cambió el formato regional: moneda ${d.moneda}, fecha ${d.formatoFecha}, zona ${d.zonaHoraria}, impuesto por defecto ${Math.round(d.tasaImpuesto * 10000) / 100} %`, ip: req.ip,
  });
  res.json({ ok: true, regional: d });
});

const guardarCatalogo = aprobar(async (req, res) => {
  const e = Catalogo.validarEleccion(req.body);
  await Negocio.guardarCatalogo(e);
  await Auditoria.registrar({
    usuarioId: req.user.id, accion: 'actualizar_catalogo', entidad: 'configuracion_negocio', entidadId: 1,
    descripcion: `Cambió el catálogo del negocio: unidades ${e.unidades.join(', ')}; variantes ${e.tiposVariante.join(', ') || 'ninguna'}`,
    detalles: e, ip: req.ip,
  });
  res.json({ ok: true, catalogo: (await Negocio.obtener()).catalogo });
});

// El interruptor del SAR: encendido = se factura con CAI; apagado = comprobantes internos
const guardarFacturacion = aprobar(async (req, res) => {
  const sar = V.booleano(req.body.sar);

  if (!sar) {
    const habia = await Negocio.apagarFiscal();
    if (habia) {
      await Auditoria.registrar({ usuarioId: req.user.id, accion: 'desactivar_sar', entidad: 'configuracion_fiscal', descripcion: 'Desactivó la facturación con CAI del SAR: las ventas nuevas serán comprobantes internos', ip: req.ip });
    }
    return res.json({ ok: true, modo: await Negocio.modoFacturacion(), fiscal: formatoFiscal(await Negocio.fiscalParaFormulario()) });
  }

  const cai = V.requerido(req.body.cai, 'El CAI', 100).toUpperCase();
  if (!/^[A-Z0-9]{6}(-[A-Z0-9]{6}){4}-[A-Z0-9]{2}$/.test(cai)) {
    throw new V.ErrorValidacion('El CAI debe tener el formato XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX.');
  }
  const rangoInicio = enteroPositivo(req.body.rango_inicio, 'El inicio del rango');
  const rangoFin = enteroPositivo(req.body.rango_fin, 'El fin del rango');
  if (rangoFin < rangoInicio) throw new V.ErrorValidacion('El fin del rango no puede ser menor que el inicio.');
  const fechaLimite = V.fechaISO(req.body.fecha_limite, 'La fecha límite');
  if (!fechaLimite) throw new V.ErrorValidacion('La fecha límite de emisión es obligatoria.');
  if (fechaLimite < hoyISO()) throw new V.ErrorValidacion('La fecha límite del CAI ya venció: no se puede activar un CAI vencido.');
  const tasaPct = V.numero(req.body.tasa, 'La tasa de impuesto', { min: 0, max: 100, defecto: res.locals.negocioActual.tasaImpuesto * 100 });
  const pieLegal = V.opcional(req.body.pie_legal, 'El pie legal', 500);

  const r = await Negocio.guardarFiscal({ cai, rangoInicio, rangoFin, fechaLimite, tasa: Math.round(tasaPct * 100) / 10000, pieLegal });
  await Auditoria.registrar({
    usuarioId: req.user.id, accion: 'activar_sar', entidad: 'configuracion_fiscal', entidadId: r.id,
    descripcion: `${r.nuevo ? 'Activó un CAI nuevo' : 'Actualizó el CAI activo'} (${cai}, rango ${rangoInicio} a ${rangoFin}, vence ${fechaLimite})`,
    detalles: { cai, rangoInicio, rangoFin, fechaLimite, tasaPct }, ip: req.ip,
  });
  res.json({ ok: true, modo: await Negocio.modoFacturacion(), fiscal: formatoFiscal(await Negocio.fiscalParaFormulario()) });
});

// ======================= USUARIOS =======================

const prepararUsuario = (u) => ({ ...u, ultimo_acceso_texto: u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : 'Nunca' });

const usuarios = aprobar(async (req, res) => {
  const [lista, roles] = await Promise.all([Usuarios.listar(), Roles.listar()]);
  res.render('configuracion/usuarios', {
    titulo: 'Configuración', seccion: 'usuarios',
    datos: { usuarios: lista.map(prepararUsuario), roles: roles.map((r) => ({ id: r.id, nombre: r.nombre, activo: r.activo })), yo: req.user.id },
  });
});

const usuariosDatos = aprobar(async (req, res) => {
  const [lista, roles] = await Promise.all([Usuarios.listar(), Roles.listar()]);
  res.json({ ok: true, usuarios: lista.map(prepararUsuario), roles: roles.map((r) => ({ id: r.id, nombre: r.nombre, activo: r.activo })) });
});

const crearUsuario = aprobar(async (req, res) => {
  const r = await Usuarios.crear({
    nombre: V.requerido(req.body.nombre, 'El nombre', 150),
    usuario: V.requerido(req.body.usuario, 'El usuario', 60),
    contrasena: String(req.body.contrasena || ''),
    rolId: enteroPositivo(req.body.rol_id, 'El rol'),
    debeCambiar: V.booleano(req.body.debe_cambiar, true),
  }, req.user.id);
  res.status(201).json({ ok: true, usuario: prepararUsuario((await Usuarios.listar()).find((u) => u.id === r.id)) });
});

const actualizarUsuario = aprobar(async (req, res) => {
  const id = idDeRuta(req);
  await Usuarios.actualizar(id, { nombre: V.requerido(req.body.nombre, 'El nombre', 150), rolId: enteroPositivo(req.body.rol_id, 'El rol') }, req.user.id);
  res.json({ ok: true, usuario: prepararUsuario((await Usuarios.listar()).find((u) => u.id === id)) });
});

const cambiarEstadoUsuario = aprobar(async (req, res) => {
  const id = idDeRuta(req);
  await Usuarios.cambiarEstado(id, V.booleano(req.body.activo), req.user.id);
  res.json({ ok: true, usuario: prepararUsuario((await Usuarios.listar()).find((u) => u.id === id)) });
});

// El código se muestra UNA vez en pantalla; en la base solo queda su hash
const generarCodigo = aprobar(async (req, res) => {
  const id = idDeRuta(req);
  const u = await Usuarios.obtener(id);
  if (!u) return res.status(404).json({ error: 'No se encontró al usuario.' });
  const r = await Usuarios.generarCodigo(id, req.user.id);
  res.json({ ok: true, usuario: u.usuario, nombre: u.nombre, codigo: r.codigo, minutos: r.minutos, expiracion: r.expiracion });
});

// ======================= ROLES Y PERMISOS =======================

async function datosRoles() {
  const [roles, catalogo] = await Promise.all([Roles.listar(), Roles.catalogo()]);
  return { roles, catalogo, acciones: ACCIONES };
}

const roles = aprobar(async (req, res) => {
  res.render('configuracion/roles', { titulo: 'Configuración', seccion: 'roles', datos: await datosRoles() });
});

const rolesDatos = aprobar(async (req, res) => {
  res.json({ ok: true, ...(await datosRoles()) });
});

const crearRol = aprobar(async (req, res) => {
  const r = await Roles.crear({
    nombre: V.requerido(req.body.nombre, 'El nombre del rol', 40),
    descripcion: V.opcional(req.body.descripcion, 'La descripción', 200),
    copiarDe: V.idOpcional(req.body.copiar_de, 'El rol a copiar'),
  }, req.user.id);
  res.status(201).json({ ok: true, id: r.id, ...(await datosRoles()) });
});

const actualizarRol = aprobar(async (req, res) => {
  const id = idDeRuta(req);
  await Roles.actualizar(id, {
    nombre: V.requerido(req.body.nombre, 'El nombre del rol', 40),
    descripcion: V.opcional(req.body.descripcion, 'La descripción', 200),
    activo: V.booleano(req.body.activo, true),
  }, req.user.id);
  res.json({ ok: true, ...(await datosRoles()) });
});

const eliminarRol = aprobar(async (req, res) => {
  await Roles.eliminar(idDeRuta(req), req.user.id);
  res.json({ ok: true, ...(await datosRoles()) });
});

const permisosRol = aprobar(async (req, res) => {
  const rol = await Roles.obtener(idDeRuta(req));
  if (!rol) return res.status(404).json({ error: 'No se encontró el rol.' });
  res.json({ ok: true, rol, ids: await Roles.permisosDe(rol.id) });
});

const guardarPermisosRol = aprobar(async (req, res) => {
  const id = idDeRuta(req);
  const ids = Array.isArray(req.body.permisos) ? req.body.permisos.map(Number) : null;
  if (!ids || ids.some((n) => !Number.isInteger(n) || n <= 0)) throw new V.ErrorValidacion('La lista de permisos no es válida.');
  const r = await Roles.guardarPermisos(id, ids, req.user.id);
  res.json({ ok: true, resultado: r, ids: await Roles.permisosDe(id), ...(await datosRoles()) });
});

// ======================= AUDITORÍA =======================

const prepararAuditoria = (a) => ({ ...a, fecha_texto: fechaHora(a.creado_en) });

const auditoria = aprobar(async (req, res) => {
  res.render('configuracion/auditoria', { titulo: 'Configuración', seccion: 'auditoria', datos: { filas: (await Auditoria.ultimos(50)).map(prepararAuditoria) } });
});

const auditoriaDatos = aprobar(async (req, res) => {
  res.json({ ok: true, filas: (await Auditoria.ultimos(50)).map(prepararAuditoria) });
});

module.exports = {
  guardarPaleta, guardarRegional, guardarCatalogo,
  negocio, guardarNegocio, guardarFacturacion,
  usuarios, usuariosDatos, crearUsuario, actualizarUsuario, cambiarEstadoUsuario, generarCodigo,
  roles, rolesDatos, crearRol, actualizarRol, eliminarRol, permisosRol, guardarPermisosRol,
  auditoria, auditoriaDatos,
};
