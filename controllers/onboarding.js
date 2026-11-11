// Asistente de configuración inicial (decisión D-09). Seis pasos: 1 bienvenida, 2 datos del negocio,
// 3 logo, 4 paleta (los tres esenciales), 5 unidades de venta y 6 primer vendedor (opcionales).
// Cada paso se guarda al continuar, así que se puede cerrar el navegador y retomar donde se quedó.
// Que los esenciales estén completos lo comprueba la base (función completar_onboarding).
const V = require('../utils/validar');
const Negocio = require('../models/negocio');
const Usuarios = require('../models/usuarios');
const Roles = require('../models/roles');
const Auditoria = require('../models/auditoria');
const Storage = require('../services/storageService');
const Catalogo = require('../utils/catalogo');
const { dimensiones } = require('../utils/imagen');
const { rutaInicial } = require('../modulos');

const LOGO_MINIMO = 200;   // píxeles por lado
const PASOS = [
  { titulo: 'Bienvenida' },
  { titulo: 'Datos del negocio' },
  { titulo: 'Logo' },
  { titulo: 'Colores' },
  { titulo: 'Unidades y movimientos', opcional: true },
  { titulo: 'Primer vendedor', opcional: true },
];

// Quien no lo tiene pendiente (o ya se completó) no tiene nada que hacer aquí
function soloPendiente(req, res, next) {
  if (req.user.debeOnboarding) return next();
  return res.redirect(rutaInicial(req.user) || '/');
}

const anotar = (req, descripcion) => Auditoria.registrar({
  usuarioId: req.user.id, accion: 'onboarding', entidad: 'configuracion_negocio', entidadId: 1, descripcion, ip: req.ip,
});

function pintar(res, negocio, paso, extra, estado) {
  const maestro = Catalogo.paraVista();
  const e = extra || {};
  res.status(estado || 200).render('onboarding/index', {
    layout: 'layouts/onboarding', titulo: 'Configuración inicial',
    paso, total: PASOS.length, pasos: PASOS, alcanzado: negocio.onboardingPaso, negocio,
    // Solo se puede volver un paso, y solo desde el paso más avanzado
    puedeVolver: paso > 1 && paso === negocio.onboardingPaso,
    error: e.error || '', valores: e.valores || {},
    paletas: maestro.paletas, unidades: maestro.unidades, logoMinimo: LOGO_MINIMO,
    categoriasGasto: maestro.categoriasGasto, tiposIngreso: maestro.tiposIngreso,
  });
}

async function mostrar(req, res, next) {
  try {
    const negocio = await Negocio.obtener();
    const alcanzado = negocio.onboardingPaso;
    const minimo = Math.max(1, alcanzado - 1);
    let paso = Number(req.query.paso);
    if (!Number.isInteger(paso) || paso > alcanzado) paso = alcanzado;   // no se pueden saltar pasos
    if (paso < minimo) paso = minimo;                                    // ni volver más de uno
    pintar(res, negocio, paso);
  } catch (err) { next(err); }
}

// Envoltura de cada paso: exige haber llegado a él y, si algo no es válido, lo explica en la misma pantalla
const paso = (n, accion) => async (req, res, next) => {
  try {
    const negocio = await Negocio.obtener();
    if (negocio.onboardingPaso < n) return res.redirect('/onboarding');
    await accion(req, res, negocio);
  } catch (err) {
    if (err instanceof V.ErrorValidacion || (err && err.code === 'P0001')) {
      try { return pintar(res, await Negocio.obtener(), n, { error: err.message, valores: req.body || {} }, 422); } catch (otro) { return next(otro); }
    }
    next(err);
  }
};

const siguiente = async (res, n) => { await Negocio.avanzarOnboarding(n); res.redirect(`/onboarding?paso=${n}`); };

const bienvenida = paso(1, async (req, res) => siguiente(res, 2));

const datos = paso(2, async (req, res) => {
  const rtn = V.rtn(req.body.rtn);
  if (!rtn || rtn.length !== 14) throw new V.ErrorValidacion('Escribe el RTN del negocio: son 14 dígitos.');
  const direccion = V.requerido(req.body.direccion, 'La dirección', 255);
  if (direccion.length < 5) throw new V.ErrorValidacion('Escribe la dirección completa del negocio.');
  const telefono = V.requerido(req.body.telefono, 'El teléfono', 30);
  if (!/^[0-9+()\s-]+$/.test(telefono) || telefono.replace(/\D/g, '').length < 8) throw new V.ErrorValidacion('El teléfono debe tener al menos 8 dígitos.');
  const correo = V.correo(req.body.correo, 'El correo');
  if (!correo) throw new V.ErrorValidacion('Escribe el correo del negocio.');

  await Negocio.guardarContacto({ rtn, direccion, telefono, correo });
  await anotar(req, 'Asistente inicial: registró los datos del negocio');
  await siguiente(res, 3);
});

const logo = paso(3, async (req, res, negocio) => {
  if (req.errorSubida) throw new V.ErrorValidacion(req.errorSubida);
  if (!req.file) {
    if (negocio.logoPropio) return siguiente(res, 4);   // ya lo había subido y no quiso cambiarlo
    throw new V.ErrorValidacion('Elige el archivo de tu logo para continuar.');
  }
  const dim = dimensiones(req.file.buffer);
  if (!dim) throw new V.ErrorValidacion('El logo debe ser una imagen PNG o JPG.');
  if (dim.ancho < LOGO_MINIMO || dim.alto < LOGO_MINIMO) {
    throw new V.ErrorValidacion(`El logo mide ${dim.ancho} x ${dim.alto} píxeles. Necesita al menos ${LOGO_MINIMO} x ${LOGO_MINIMO} para verse bien en pantalla y en las facturas.`);
  }
  const anterior = (await Negocio.obtenerCrudo()).logo_url || null;
  const url = await Storage.subirImagen(req.file.buffer, dim.tipo === 'png' ? 'image/png' : 'image/jpeg');
  await Negocio.guardarLogo(url);
  if (anterior && anterior !== url && anterior !== Negocio.LOGO_GENERICO) await Storage.eliminarImagen(anterior);
  await anotar(req, 'Asistente inicial: subió el logo del negocio');
  await siguiente(res, 4);
});

const paleta = paso(4, async (req, res) => {
  const elegida = Catalogo.validarPaleta(req.body.paleta_id);
  await Negocio.guardarPaleta(elegida);
  await anotar(req, `Asistente inicial: eligió la paleta ${elegida.nombre}`);
  await siguiente(res, 5);
});

const unidades = paso(5, async (req, res) => {
  if (req.body.accion !== 'saltar') {
    const crudas = req.body.unidades === undefined ? [] : [].concat(req.body.unidades);
    const lista = Catalogo.validarUnidades(crudas);
    // Las categorías de gasto y los tipos de ingreso solo se tocan si el formulario los traía
    // (la marca "seccion_movimientos" viene con la sección); si no, se conservan como estaban
    let gastos = null; let ingresos = null;
    if (req.body.seccion_movimientos !== undefined) {
      gastos = Catalogo.validarCategoriasGasto(req.body.categorias_gasto === undefined ? [] : [].concat(req.body.categorias_gasto));
      ingresos = Catalogo.validarTiposIngreso(req.body.tipos_ingreso === undefined ? [] : [].concat(req.body.tipos_ingreso));
    }
    await Negocio.guardarUnidades(lista);
    if (gastos) await Negocio.guardarMovimientos(gastos, ingresos);
    await anotar(req, `Asistente inicial: activó las unidades ${lista.join(', ')}${gastos ? `; gastos ${gastos.join(', ')}; ingresos ${ingresos.join(', ')}` : ''}`);
  }
  await siguiente(res, 6);
});

// Último paso: crea al primer vendedor (o se salta) y cierra el asistente
const vendedor = paso(6, async (req, res) => {
  if (req.body.accion !== 'saltar') {
    const contrasena = String(req.body.contrasena || '');
    if (contrasena !== String(req.body.confirmar || '')) throw new V.ErrorValidacion('Las contraseñas no coinciden.');
    const rol = (await Roles.listar()).find((r) => r.nombre === 'vendedor' && r.activo);
    if (!rol) throw new V.ErrorValidacion('No existe un rol de vendedor activo. Usa "Saltar" y créalo después en Configuración.');
    // La política de contraseñas y el nombre de usuario los valida la base (crear_usuario)
    await Usuarios.crear({
      nombre: V.requerido(req.body.nombre, 'El nombre del vendedor', 150),
      usuario: V.requerido(req.body.usuario, 'El usuario', 60),
      contrasena, rolId: rol.id, debeCambiar: true,
    }, req.user.id);
  }
  await Negocio.completarOnboarding(req.user.id, req.ip);
  res.redirect('/');
});

module.exports = { soloPendiente, mostrar, bienvenida, datos, logo, paleta, unidades, vendedor };
