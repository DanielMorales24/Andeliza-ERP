const config = require('../client.config');
const V = require('../utils/validar');
const { numeroCorto } = require('../utils/documentos');
const { hoyISO, fechaHora } = require('../utils/formato');
const Ventas = require('../models/ventas');
const Catalogo = require('../utils/catalogo');
const Documentos = require('./documentos');

const TAMANO_PAGINA = 50;

const quitarAcentos = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esFecha = (t) => /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(t));

// Lee los filtros de la URL. Con estricto=true un valor malo es un error; si no, se usa el valor por defecto.
function leerFiltros(q, estricto) {
  const hoy = hoyISO();
  const primeroDeMes = hoy.slice(0, 8) + '01';
  const f = { desde: primeroDeMes, hasta: hoy, tipo: '', estado: '', q: '', offset: 0 };

  const fecha = (valor, defecto, etiqueta) => {
    if (valor === undefined) return defecto;
    const t = V.texto(valor);
    if (t === '') return '';              // vacío = sin límite
    if (esFecha(t)) return t;
    if (estricto) throw new V.ErrorValidacion(`La fecha ${etiqueta} no es válida.`);
    return defecto;
  };
  f.desde = fecha(q.desde, f.desde, 'inicial');
  f.hasta = fecha(q.hasta, f.hasta, 'final');
  if (f.desde && f.hasta && f.desde > f.hasta) {
    if (estricto) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
    f.desde = f.hasta;
  }

  const tipo = V.texto(q.tipo);
  if (['fiscal', 'interno'].includes(tipo)) f.tipo = tipo;
  else if (tipo && estricto) throw new V.ErrorValidacion('El tipo de documento no es válido.');

  const estado = V.texto(q.estado);   // P pendientes, C pagadas, A anuladas
  if (['P', 'C', 'A'].includes(estado)) f.estado = estado;
  else if (estado && estricto) throw new V.ErrorValidacion('El estado no es válido.');

  f.q = quitarAcentos(V.texto(q.q)).slice(0, 60);

  const offset = Number(q.offset);
  f.offset = Number.isInteger(offset) && offset > 0 ? Math.min(offset, 100000) : 0;
  return f;
}

function darFormato(filas) {
  return filas.map((f) => ({
    ...f,
    numero_corto: numeroCorto(f.numero_factura, f.tipo_documento),
    fecha_texto: fechaHora(f.creado_en),
    metodo_nombre: f.metodo_pago ? Catalogo.nombreDe('metodosPago', f.metodo_pago) : '',
    anulada_texto: f.anulada_en ? fechaHora(f.anulada_en) : '',
  }));
}

// Método con el que se cobra desde Facturas: uno de los activos del negocio. Si no llega
// (una pantalla abierta con la versión anterior), efectivo, que es lo que se hacía antes.
function metodoDeCobro(valor, activos) {
  const defecto = activos.includes('efectivo') ? 'efectivo' : activos[0];
  return V.eleccion(valor, 'El método de pago', activos, defecto);
}

// Regla de propiedad del dato: con "facturas.ver" se ven todas; con solo "facturas.ver_propias",
// únicamente las que la misma persona emitió (el filtro se aplica en la consulta, no en la pantalla).
const soloLoPropio = (req) => !req.user.tiene('facturas', 'ver');

async function consultar(filtros, soloPropias, soloPropiasId) {
  const r = await Ventas.listar({ ...filtros, limite: TAMANO_PAGINA, soloUsuarioId: soloPropias ? soloPropiasId : null });
  return {
    filas: darFormato(r.filas),
    hayMas: r.hayMas,
    resumen: { cantidad: r.resumen.cantidad, suma: r.resumen.suma, pendiente: r.resumen.pendiente, anuladas: r.resumen.anuladas },
  };
}

async function index(req, res, next) {
  try {
    const filtros = leerFiltros(req.query, false);
    const datos = {
      ...(await consultar(filtros, soloLoPropio(req), req.user.id)),
      filtros,
      hoy: hoyISO(),
      tamanoPagina: TAMANO_PAGINA,
      // La interfaz solo muestra lo que el servidor además permitirá hacer
      permisos: {
        marcarPagada: req.user.tiene('facturas', 'editar'),
        anular: req.user.tiene('facturas', 'anular'),
        // El enlace al asiento solo sirve si el libro diario está activo y la persona puede verlo
        verAsiento: config.funcionalidades.finanzas === true && req.user.tiene('finanzas', 'ver'),
        soloPropias: soloLoPropio(req),
      },
      metodosPago: Catalogo.pares('metodosPago', res.locals.negocioActual.catalogo.metodosPago),
    };
    res.render('facturas/index', { titulo: 'Facturas', datos });
  } catch (err) {
    next(err);
  }
}

async function datos(req, res, next) {
  try {
    const filtros = leerFiltros(req.query, true);
    res.json({ ok: true, ...(await consultar(filtros, soloLoPropio(req), req.user.id)) });
  } catch (err) {
    next(err);
  }
}

async function marcarPagada(req, res, next) {
  try {
    const metodo = metodoDeCobro((req.body || {}).metodo_pago, res.locals.negocioActual.catalogo.metodosPago);
    const r = await Ventas.marcarPagada(Number(req.params.id), req.user.id, metodo);
    if (!r) return res.status(404).json({ error: 'No se encontró la factura.' });
    if (r === 'anulada') return res.status(409).json({ error: 'La factura está anulada: no se puede cobrar.' });
    res.json({ ok: true, estado: 'C', yaEstabaPagada: r === 'ya_estaba_pagada', metodo_pago: metodo, metodo_nombre: Catalogo.nombreDe('metodosPago', metodo) });
  } catch (err) {
    next(err);
  }
}

// Anular una factura (solo con "facturas.anular": administrador y supervisor). No borra nada:
// la base devuelve el stock, revierte el asiento y deja la constancia en la bitácora.
async function anular(req, res, next) {
  try {
    const id = Number(req.params.id);
    const motivo = V.texto((req.body || {}).motivo);
    if (motivo.length < 5) throw new V.ErrorValidacion('Escribe el motivo de la anulación (al menos 5 caracteres).');
    if (motivo.length > 300) throw new V.ErrorValidacion('El motivo no puede pasar de 300 caracteres.');
    const venta = await Ventas.obtener(id);
    if (!venta) return res.status(404).json({ error: 'No se encontró la factura.' });
    const r = await Ventas.anular(id, req.user.id, motivo, req.ip);
    res.json({
      ok: true,
      id,
      numero_factura: r.numero_factura,
      contabilidad: r.contabilidad,
      partida_anulacion_id: r.partida_anulacion_id,
      kit_con_composicion_actual: r.kit_con_composicion_actual,
    });
  } catch (err) {
    next(err);
  }
}

// PDF de una venta. Con "facturas.ver" se descargan todas; sin él (por ejemplo el vendedor, que
// imprime al cobrar), solo las que la misma persona emitió. Una ajena responde 404, no 403, para no confirmar que existe.
async function pdf(req, res, next) {
  try {
    const venta = await Ventas.obtener(Number(req.params.id));
    if (!venta || (!req.user.tiene('facturas', 'ver') && venta.usuario_id !== req.user.id)) {
      return res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
    }
    const documento = await Documentos.documentoDeVenta(venta);
    const nombre = (venta.tipo_documento === 'fiscal' ? 'factura-' : 'comprobante-')
      + numeroCorto(venta.numero_factura, venta.tipo_documento).replace(/[^A-Za-z0-9_-]/g, '');
    await Documentos.enviarPdf(res, documento, nombre, req.query.descargar === '1');
  } catch (err) {
    next(err);
  }
}

module.exports = { index, datos, marcarPagada, anular, pdf, leerFiltros };
