const config = require('../client.config');
const V = require('../utils/validar');
const { numeroCorto } = require('../utils/documentos');
const { hoyISO, fechaHora } = require('../utils/formato');
const Ventas = require('../models/ventas');
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

  const estado = V.texto(q.estado);
  if (['P', 'C'].includes(estado)) f.estado = estado;
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
  }));
}

async function consultar(filtros) {
  const r = await Ventas.listar({ ...filtros, limite: TAMANO_PAGINA });
  return {
    filas: darFormato(r.filas),
    hayMas: r.hayMas,
    resumen: { cantidad: r.resumen.cantidad, suma: r.resumen.suma, pendiente: r.resumen.pendiente },
  };
}

async function index(req, res, next) {
  try {
    const filtros = leerFiltros(req.query, false);
    const datos = {
      ...(await consultar(filtros)),
      filtros,
      hoy: hoyISO(),
      tamanoPagina: TAMANO_PAGINA,
    };
    res.render('facturas/index', { titulo: 'Facturas', datos });
  } catch (err) {
    next(err);
  }
}

async function datos(req, res, next) {
  try {
    const filtros = leerFiltros(req.query, true);
    res.json({ ok: true, ...(await consultar(filtros)) });
  } catch (err) {
    next(err);
  }
}

async function marcarPagada(req, res, next) {
  try {
    const r = await Ventas.marcarPagada(Number(req.params.id));
    if (!r) return res.status(404).json({ error: 'No se encontró la factura.' });
    res.json({ ok: true, estado: 'C', yaEstabaPagada: r === 'ya_estaba_pagada' });
  } catch (err) {
    next(err);
  }
}

// PDF de una venta. El vendedor solo puede ver las que él cobró.
async function pdf(req, res, next) {
  try {
    const venta = await Ventas.obtener(Number(req.params.id));
    if (!venta || (req.user.rol !== 'admin' && venta.usuario_id !== req.user.id)) {
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

module.exports = { index, datos, marcarPagada, pdf, leerFiltros };
