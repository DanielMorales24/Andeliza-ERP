// PDF de facturas, comprobantes internos y cotizaciones con pdfkit.
// Se genera siempre EN MEMORIA y devuelve un Buffer: en Vercel no se puede escribir al disco.
const PDFDocument = require('pdfkit');
const { dinero, fecha, fechaHora, cantidad } = require('../utils/formato');

const ANCHO_PAGINA = 612; // carta
const ALTO_PAGINA = 792;
const M = 40;
const W = ANCHO_PAGINA - 2 * M;
const PIE = 24;
const LIMITE_Y = ALTO_PAGINA - M - PIE;

const TINTA = '#1f2430';
const GRIS = '#6b7280';
const BORDE = '#dfe2e8';
const FONDO = '#f4f5f7';
const VERDE = '#15803d';
const AMBAR = '#b45309';

const TITULOS = { fiscal: 'FACTURA', interno: 'COMPROBANTE INTERNO', cotizacion: 'COTIZACIÓN' };

function encabezado(doc, d) {
  doc.rect(0, 0, ANCHO_PAGINA, 8).fill(d.color);

  // Logo y datos del negocio (izquierda)
  let xTexto = M;
  let yLogo = 0;
  if (d.logo) {
    try {
      doc.image(d.logo, M, 28, { fit: [70, 70] });
      xTexto = M + 84;
      yLogo = 28 + 70;
    } catch (err) {
      console.error('[pdf] no se pudo dibujar el logo:', err.message);
    }
  }
  const anchoTexto = 360 - xTexto;
  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(17).text(d.negocio.nombre, xTexto, 30, { width: anchoTexto });
  doc.font('Helvetica').fontSize(9).fillColor(GRIS);
  const lineas = [
    d.negocio.rtn ? `RTN: ${d.negocio.rtn}` : '',
    d.negocio.direccion,
    [d.negocio.telefono ? `Tel. ${d.negocio.telefono}` : '', d.negocio.correo].filter(Boolean).join('   |   '),
  ].filter(Boolean);
  lineas.forEach((l) => doc.text(l, xTexto, doc.y + 2, { width: anchoTexto }));
  const finTexto = doc.y;

  // Caja con el tipo de documento, número y fecha (derecha)
  const bx = 376;
  const bw = ANCHO_PAGINA - M - bx;
  const by = 26;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(d.color).text(TITULOS[d.tipo], bx + 12, by + 10, { width: bw - 24 });
  let ty = doc.y + 4;
  if (d.numero) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(TINTA).text(`No. ${d.numero}`, bx + 12, ty, { width: bw - 24 });
    ty = doc.y + 3;
  }
  doc.font('Helvetica').fontSize(9).fillColor(GRIS).text(`Fecha: ${fechaHora(d.fecha)}`, bx + 12, ty, { width: bw - 24 });
  ty = doc.y + 10;
  doc.roundedRect(bx, by, bw, ty - by, 5).lineWidth(1).stroke(BORDE);

  return Math.max(finTexto, yLogo, ty) + 18;
}

// Franja con una leyenda importante (comprobante interno, cotización)
function franja(doc, y, texto, colorTexto, colorFondo, colorBorde) {
  doc.font('Helvetica-Bold').fontSize(10);
  const alto = doc.heightOfString(texto, { width: W - 24, align: 'center' }) + 14;
  doc.roundedRect(M, y, W, alto, 4).fillAndStroke(colorFondo, colorBorde);
  doc.fillColor(colorTexto).text(texto, M + 12, y + 7, { width: W - 24, align: 'center' });
  return y + alto + 14;
}

function bloqueCliente(doc, y, d) {
  const c = d.cliente;
  const izquierda = [];
  izquierda.push({ t: c ? c.nombre : 'Consumidor Final', negrita: true, size: 11 });
  if (c && c.rtn) izquierda.push({ t: `RTN: ${c.rtn}` });
  if (c && c.telefono) izquierda.push({ t: `Tel. ${c.telefono}` });
  if (c && c.direccion) izquierda.push({ t: c.direccion });
  if (c && c.correo) izquierda.push({ t: c.correo });

  const anchoIzq = 330;
  let altoIzq = 0;
  izquierda.forEach((l) => {
    doc.font(l.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(l.size || 9);
    altoIzq += doc.heightOfString(l.t, { width: anchoIzq }) + 2;
  });
  // La columna derecha también necesita su espacio (cada dato ocupa unos 27 puntos)
  const datosDerecha = (d.tipo === 'cotizacion' ? (d.validez ? 1 : 0) : (d.estado ? 1 : 0)) + (d.vendedor ? 1 : 0) + (d.vencimiento ? 1 : 0);
  const alto = Math.max(altoIzq + 28, 24 + datosDerecha * 27);

  doc.roundedRect(M, y, W, alto, 5).fill(FONDO);

  doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text('CLIENTE', M + 12, y + 9);
  let cy = y + 22;
  izquierda.forEach((l) => {
    doc.font(l.negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(l.size || 9).fillColor(l.negrita ? TINTA : GRIS);
    doc.text(l.t, M + 12, cy, { width: anchoIzq });
    cy = doc.y + 2;
  });

  // Columna derecha: quién atendió y el estado de pago (o la vigencia de la cotización)
  const xd = M + 372;
  const anchoDer = W - 372 - 12;
  let dy = y + 9;
  const dato = (etiqueta, valor, color) => {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(GRIS).text(etiqueta, xd, dy, { width: anchoDer });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(color || TINTA).text(valor, xd, doc.y + 1, { width: anchoDer });
    dy = doc.y + 5;
  };
  if (d.tipo === 'cotizacion') {
    if (d.validez) dato('VÁLIDA HASTA', d.validez);
  } else if (d.estado) {
    dato('ESTADO DE PAGO', d.estado === 'C' ? 'Pagada' : 'Pendiente de pago', d.estado === 'C' ? VERDE : AMBAR);
  }
  if (d.vencimiento) dato('VENCE', fecha(d.vencimiento), AMBAR);
  if (d.vendedor) dato('ATENDIDO POR', d.vendedor);

  return y + alto + 16;
}

const COLUMNAS = {
  cant: { x: M, w: 54 },
  desc: { x: M + 54, w: 290 },
  precio: { x: M + 344, w: 88 },
  importe: { x: M + 432, w: W - 432 },
};

function cabeceraTabla(doc, y, d) {
  doc.rect(M, y, W, 22).fill(d.color);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
  doc.text('CANT.', COLUMNAS.cant.x + 10, y + 7, { width: COLUMNAS.cant.w - 10 });
  doc.text('DESCRIPCIÓN', COLUMNAS.desc.x, y + 7, { width: COLUMNAS.desc.w });
  doc.text('PRECIO', COLUMNAS.precio.x, y + 7, { width: COLUMNAS.precio.w - 10, align: 'right' });
  doc.text('IMPORTE', COLUMNAS.importe.x, y + 7, { width: COLUMNAS.importe.w - 10, align: 'right' });
  return y + 22;
}

function tabla(doc, y, d) {
  y = cabeceraTabla(doc, y, d);

  d.items.forEach((it, i) => {
    const sub = [it.detalle, it.sku ? `SKU ${it.sku}` : '', it.esKit ? 'Kit' : ''].filter(Boolean).join('   |   ');
    doc.font('Helvetica').fontSize(9.5);
    const hNombre = doc.heightOfString(it.nombre, { width: COLUMNAS.desc.w - 8 });
    doc.fontSize(8);
    const hSub = sub ? doc.heightOfString(sub, { width: COLUMNAS.desc.w - 8 }) + 1 : 0;
    const alto = hNombre + hSub + 12;

    if (y + alto > LIMITE_Y) {
      doc.addPage();
      y = cabeceraTabla(doc, M, d);
    }

    if (i % 2 === 1) doc.rect(M, y, W, alto).fill('#f8f9fb');
    doc.fillColor(TINTA).font('Helvetica').fontSize(9.5);
    doc.text(cantidad(it.cantidad), COLUMNAS.cant.x + 10, y + 6, { width: COLUMNAS.cant.w - 10, lineBreak: false });
    doc.text(it.nombre, COLUMNAS.desc.x, y + 6, { width: COLUMNAS.desc.w - 8 });
    if (sub) doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(sub, COLUMNAS.desc.x, y + 6 + hNombre + 1, { width: COLUMNAS.desc.w - 8 });
    doc.font('Helvetica').fontSize(9.5).fillColor(TINTA);
    doc.text(dinero(it.precio), COLUMNAS.precio.x, y + 6, { width: COLUMNAS.precio.w - 10, align: 'right', lineBreak: false });
    doc.text(dinero(it.importe), COLUMNAS.importe.x, y + 6, { width: COLUMNAS.importe.w - 10, align: 'right', lineBreak: false });
    doc.moveTo(M, y + alto).lineTo(M + W, y + alto).lineWidth(0.5).stroke(BORDE);
    y += alto;
  });

  return y + 14;
}

function sello(doc, texto, color, cx, cy) {
  doc.save();
  doc.rotate(-8, { origin: [cx, cy] });
  doc.opacity(0.85);
  doc.roundedRect(cx - 70, cy - 20, 140, 40, 5).lineWidth(2.2).stroke(color);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(color).text(texto, cx - 70, cy - 11, { width: 140, align: 'center', lineBreak: false });
  doc.restore();
}

function totales(doc, y, d) {
  const alto = 112;
  if (y + alto > LIMITE_Y) {
    doc.addPage();
    y = M;
  }
  const x = M + W - 232;
  const w = 232;

  doc.font('Helvetica').fontSize(10).fillColor(GRIS);
  doc.text('Subtotal', x, y + 2, { width: 100 });
  doc.fillColor(TINTA).text(dinero(d.subtotal), x + 100, y + 2, { width: w - 100, align: 'right' });
  doc.fillColor(GRIS).text(`Impuesto (${d.tasaPct}%)`, x, y + 20, { width: 110 });
  doc.fillColor(TINTA).text(dinero(d.impuesto), x + 100, y + 20, { width: w - 100, align: 'right' });

  doc.roundedRect(x, y + 42, w, 34, 5).fill(d.color);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#ffffff').text('TOTAL', x + 12, y + 54, { width: 60 });
  doc.fontSize(15).text(dinero(d.total), x + 60, y + 51, { width: w - 72, align: 'right' });

  if (d.impuestoIncluido) {
    doc.font('Helvetica').fontSize(8).fillColor(GRIS).text('Los precios de los productos incluyen el impuesto.', x, y + 82, { width: w, align: 'right' });
  }

  if (d.tipo !== 'cotizacion' && d.estado) {
    sello(doc, d.estado === 'C' ? 'PAGADA' : 'PENDIENTE', d.estado === 'C' ? VERDE : AMBAR, M + 105, y + 40);
  }
  return y + alto;
}

function pieLegal(doc, y, d) {
  const rellenar = (n) => String(n).padStart(8, '0');
  let lineas = [];
  let estilo = { texto: TINTA, fondo: '#ffffff', borde: BORDE };

  if (d.tipo === 'fiscal') {
    lineas.push({ t: `CAI: ${d.fiscal && d.fiscal.cai ? d.fiscal.cai : d.cai || ''}`, b: true });
    if (d.fiscal && d.fiscal.rangoInicio !== undefined) {
      lineas.push({ t: `Rango autorizado: ${rellenar(d.fiscal.rangoInicio)} al ${rellenar(d.fiscal.rangoFin)}` });
      lineas.push({ t: `Fecha límite de emisión: ${fecha(d.fiscal.fechaLimite)}` });
    }
    if (d.fiscal && d.fiscal.pieLegal) lineas.push({ t: d.fiscal.pieLegal, i: true, centrado: true });
  } else if (d.tipo === 'interno') {
    estilo = { texto: '#92400e', fondo: '#fffbeb', borde: '#f59e0b' };
    lineas.push({ t: 'COMPROBANTE INTERNO - No válido para crédito fiscal', b: true });
    lineas.push({ t: 'Este documento respalda la venta para el control interno del negocio y no sustituye una factura fiscal.' });
  } else {
    lineas.push({ t: 'Precios y existencias sujetos a cambio sin previo aviso. Esta cotización no es un documento fiscal y no reserva productos.' });
  }

  doc.fontSize(8.5);
  let alto = 16;
  lineas.forEach((l) => {
    doc.font(l.b ? 'Helvetica-Bold' : l.i ? 'Helvetica-Oblique' : 'Helvetica');
    alto += doc.heightOfString(l.t, { width: W - 28 }) + 3;
  });

  if (y + alto > LIMITE_Y) {
    doc.addPage();
    y = M;
  }
  doc.roundedRect(M, y, W, alto, 5).fillAndStroke(estilo.fondo, estilo.borde);
  let ly = y + 9;
  lineas.forEach((l) => {
    doc.font(l.b ? 'Helvetica-Bold' : l.i ? 'Helvetica-Oblique' : 'Helvetica').fontSize(8.5).fillColor(estilo.texto);
    doc.text(l.t, M + 14, ly, { width: W - 28, align: l.centrado ? 'center' : 'left' });
    ly = doc.y + 3;
  });
  return y + alto;
}

// Marca de agua y pie de página en todas las hojas (usa las hojas guardadas en memoria)
function decorarPaginas(doc, d) {
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // sin esto, escribir en el pie crearía una hoja nueva

    if (d.tipo === 'interno') {
      doc.save();
      doc.rotate(-35, { origin: [ANCHO_PAGINA / 2, ALTO_PAGINA / 2] });
      doc.fillOpacity(0.06).fillColor('#000000').font('Helvetica-Bold').fontSize(82);
      doc.text('NO FISCAL', 0, ALTO_PAGINA / 2 - 40, { width: ANCHO_PAGINA, align: 'center', lineBreak: false });
      doc.restore();
    }

    doc.moveTo(M, ALTO_PAGINA - M - 6).lineTo(M + W, ALTO_PAGINA - M - 6).lineWidth(0.5).stroke(BORDE);
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text(d.negocio.nombre, M, ALTO_PAGINA - M + 2, { width: 220, lineBreak: false, ellipsis: true });
    doc.text(`Página ${i - start + 1} de ${count}`, M + 220, ALTO_PAGINA - M + 2, { width: W - 440, align: 'center', lineBreak: false });
    doc.text(d.numero ? `${TITULOS[d.tipo]} ${d.numero}` : TITULOS[d.tipo], M + W - 220, ALTO_PAGINA - M + 2, { width: 220, align: 'right', lineBreak: false, ellipsis: true });
  }
}

// datos: ver controllers/facturas.js (armarDocumento)
function generar(datos) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: M,
      bufferPages: true,
      info: {
        Title: `${TITULOS[datos.tipo]}${datos.numero ? ' ' + datos.numero : ''}`,
        Author: datos.negocio.nombre,
        Creator: datos.negocio.nombre,
      },
    });
    const trozos = [];
    doc.on('data', (c) => trozos.push(c));
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);

    try {
      let y = encabezado(doc, datos);
      if (datos.tipo === 'interno') {
        y = franja(doc, y, 'COMPROBANTE INTERNO - No válido para crédito fiscal', '#92400e', '#fffbeb', '#f59e0b');
      } else if (datos.tipo === 'cotizacion') {
        y = franja(doc, y, 'COTIZACIÓN - Documento informativo, no es una factura', '#1f2430', FONDO, BORDE);
      }
      y = bloqueCliente(doc, y, datos);
      y = tabla(doc, y, datos);
      y = totales(doc, y, datos);
      pieLegal(doc, y + 18, datos);
      decorarPaginas(doc, datos);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generar };
