// Arma los datos de un documento (factura, comprobante interno o cotización) y genera su PDF.
const config = require('../client.config');
const Negocio = require('../models/negocio');
const Pdf = require('../services/pdfService');
const { partirNumero } = require('../utils/documentos');
const { fecha, sumarDias, hoyISO } = require('../utils/formato');

const tasaPorcentaje = (impuesto, subtotal) => (subtotal > 0 ? +((impuesto * 100) / subtotal).toFixed(2) : 0);

async function base() {
  const negocio = await Negocio.obtener();
  return {
    negocio,
    logo: await Negocio.logo(negocio.logoUrl),
    color: config.negocio.colores.primario,
    impuestoIncluido: config.valoresPorDefecto.impuestoIncluidoEnPrecio === true,
  };
}

// Una venta guardada (venta = resultado de Ventas.obtener)
async function documentoDeVenta(venta) {
  const esFiscal = venta.tipo_documento === 'fiscal';
  const partes = partirNumero(venta.numero_factura);

  let fiscal = null;
  if (esFiscal) {
    const f = await Negocio.fiscalPorCai(partes.prefijo); // el CAI con el que se emitió, aunque después cambie
    fiscal = { cai: partes.prefijo };
    if (f) {
      Object.assign(fiscal, { rangoInicio: f.rango_inicio, rangoFin: f.rango_fin, fechaLimite: f.fecha_limite, pieLegal: f.pie_legal });
    }
  }

  return {
    ...(await base()),
    tipo: esFiscal ? 'fiscal' : 'interno',
    numero: esFiscal ? partes.correlativo : venta.numero_factura,
    numeroCompleto: venta.numero_factura,
    fecha: venta.creado_en,
    estado: venta.estado,
    cliente: venta.cliente_id
      ? { nombre: venta.cliente_nombre, rtn: venta.cliente_rtn, telefono: venta.cliente_telefono, direccion: venta.cliente_direccion, correo: venta.cliente_correo }
      : null,
    vendedor: venta.vendedor,
    items: venta.items.map((i) => ({
      nombre: i.nombre,
      detalle: i.nombre_variante || '',
      sku: i.sku_variante || i.sku || '',
      esKit: i.es_compuesto,
      cantidad: i.cantidad,
      precio: i.precio_unitario,
      importe: i.subtotal,
    })),
    subtotal: venta.subtotal,
    impuesto: venta.impuesto,
    total: venta.total,
    tasaPct: tasaPorcentaje(venta.impuesto, venta.subtotal),
    fiscal,
  };
}

// Una cotización (cot = resultado de Ventas.cotizar)
async function documentoDeCotizacion(cot, vendedor) {
  const dias = config.valoresPorDefecto.diasValidezCotizacion || 15;
  return {
    ...(await base()),
    tipo: 'cotizacion',
    numero: null,
    fecha: new Date(),
    estado: null,
    validez: fecha(sumarDias(hoyISO(), dias)),
    cliente: cot.cliente,
    vendedor,
    items: cot.items,
    subtotal: cot.subtotal,
    impuesto: cot.impuesto,
    total: cot.total,
    tasaPct: +(cot.tasa * 100).toFixed(2),
  };
}

// Responde el PDF directo desde memoria (nada se guarda en disco)
async function enviarPdf(res, documento, nombreArchivo, descargar) {
  const buffer = await Pdf.generar(documento);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Length': buffer.length,
    'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombreArchivo}.pdf"`,
    'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
}

module.exports = { documentoDeVenta, documentoDeCotizacion, enviarPdf };
