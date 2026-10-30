// Reportes contables en PDF (pdfkit, en memoria). Cada función recibe los datos ya calculados
// por models/contabilidad.js y models/cartera.js y devuelve un Buffer.
const PDFDocument = require('pdfkit');
const { dinero, fecha, fechaHora } = require('../utils/formato');

const TINTA = '#1f2430';
const GRIS = '#6b7280';
const BORDE = '#dfe2e8';
const FONDO = '#f4f5f7';
const VERDE = '#15803d';
const ROJO = '#b91c1c';
const AMBAR = '#b45309';

const M = 40;

// Montos negativos entre paréntesis, como en los estados financieros
const monto = (n) => (Number(n) < 0 ? `(${dinero(-Number(n))})` : dinero(n));
const pct = (n, total) => (total ? `${((Number(n) / Number(total)) * 100).toFixed(1)}%` : '');

function crear(datos, titulo, apaisado) {
  const doc = new PDFDocument({
    size: 'LETTER', layout: apaisado ? 'landscape' : 'portrait', margin: M, bufferPages: true,
    info: { Title: titulo, Author: datos.negocio.nombre, Creator: datos.negocio.nombre },
  });
  const trozos = [];
  doc.on('data', (c) => trozos.push(c));
  const listo = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(trozos)));
    doc.on('error', reject);
  });
  const ancho = doc.page.width; const alto = doc.page.height;
  return { doc, listo, ancho, alto, W: ancho - 2 * M, limite: alto - M - 26, y: 0 };
}

// Encabezado: barra de color, logo y negocio a la izquierda; título y período a la derecha
function encabezado(c, datos, titulo, subtitulo) {
  const { doc } = c;
  doc.rect(0, 0, c.ancho, 8).fill(datos.color);
  let x = M;
  if (datos.logo) {
    try { doc.image(datos.logo, M, 26, { fit: [52, 52] }); x = M + 64; } catch (err) { console.error('[pdf] logo no válido:', err.message); }
  }
  doc.fillColor(TINTA).font('Helvetica-Bold').fontSize(15).text(datos.negocio.nombre, x, 28, { width: c.W / 2 - 20 });
  doc.font('Helvetica').fontSize(8.5).fillColor(GRIS);
  if (datos.negocio.rtn) doc.text(`RTN: ${datos.negocio.rtn}`, x, doc.y + 1, { width: c.W / 2 - 20 });
  const fin = doc.y;

  const bx = M + c.W / 2; const bw = c.W / 2;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(datos.color).text(titulo, bx, 28, { width: bw, align: 'right' });
  doc.font('Helvetica').fontSize(9.5).fillColor(TINTA).text(subtitulo, bx, doc.y + 2, { width: bw, align: 'right' });
  doc.fontSize(8).fillColor(GRIS).text(`Generado el ${fechaHora(new Date())}`, bx, doc.y + 2, { width: bw, align: 'right' });
  c.y = Math.max(fin, doc.y, 80) + 16;
  doc.moveTo(M, c.y - 6).lineTo(M + c.W, c.y - 6).lineWidth(0.8).stroke(BORDE);
}

function asegurar(c, altura, alRepetir) {
  if (c.y + altura > c.limite) {
    c.doc.addPage();
    c.y = M;
    if (alRepetir) alRepetir();
  }
}

// Una fila de estado financiero: etiqueta, monto y (opcional) porcentaje
function fila(c, tipo, etiqueta, valor, opciones) {
  const { doc } = c; const o = opciones || {};
  const alto = tipo === 'total' ? 28 : tipo === 'seccion' ? 22 : 19;
  asegurar(c, alto + 4);
  const color = o.color || TINTA;

  if (tipo === 'seccion') {
    doc.rect(M, c.y, c.W, alto).fill(FONDO);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(o.color || TINTA).text(etiqueta, M + 10, c.y + 6, { width: c.W - 20 });
  } else if (tipo === 'total') {
    doc.roundedRect(M, c.y, c.W, alto, 4).fill(o.fondo || TINTA);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#ffffff').text(etiqueta, M + 12, c.y + 8, { width: c.W - 200, lineBreak: false });
    doc.text(valor, M + c.W - 190, c.y + 8, { width: 178, align: 'right', lineBreak: false });
  } else {
    const negrita = tipo === 'subtotal';
    if (negrita) doc.moveTo(M + c.W - 260, c.y).lineTo(M + c.W, c.y).lineWidth(0.6).stroke(GRIS);
    doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(negrita ? 10 : 9.5).fillColor(color);
    doc.text(etiqueta, M + (negrita ? 10 : 24), c.y + 5, { width: c.W - 290, lineBreak: false, ellipsis: true });
    doc.text(valor, M + c.W - 250, c.y + 5, { width: o.porcentaje !== undefined ? 160 : 238, align: 'right', lineBreak: false });
    if (o.porcentaje !== undefined) doc.font('Helvetica').fontSize(8.5).fillColor(GRIS).text(o.porcentaje, M + c.W - 80, c.y + 6, { width: 68, align: 'right', lineBreak: false });
  }
  c.y += alto + (tipo === 'total' ? 6 : 1);
}

function nota(c, texto, opciones) {
  const { doc } = c; const o = opciones || {};
  doc.font('Helvetica').fontSize(8.5);
  const h = doc.heightOfString(texto, { width: c.W - 20 }) + 12;
  asegurar(c, h + 4);
  doc.roundedRect(M, c.y, c.W, h, 4).fillAndStroke(o.fondo || '#ffffff', o.borde || BORDE);
  doc.fillColor(o.color || GRIS).text(texto, M + 10, c.y + 6, { width: c.W - 20 });
  c.y += h + 6;
}

// Pie de página con número, en todas las hojas
function pies(c, datos, titulo) {
  const { doc } = c;
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    doc.moveTo(M, c.alto - M - 6).lineTo(M + c.W, c.alto - M - 6).lineWidth(0.5).stroke(BORDE);
    doc.font('Helvetica').fontSize(8).fillColor(GRIS);
    doc.text(datos.negocio.nombre, M, c.alto - M + 2, { width: c.W / 3, lineBreak: false, ellipsis: true });
    doc.text(`Página ${i - start + 1} de ${count}`, M + c.W / 3, c.alto - M + 2, { width: c.W / 3, align: 'center', lineBreak: false });
    doc.text(titulo, M + (2 * c.W) / 3, c.alto - M + 2, { width: c.W / 3, align: 'right', lineBreak: false, ellipsis: true });
  }
}

const rango = (d, h) => (d ? `Del ${fecha(d)} al ${fecha(h)}` : `Hasta el ${fecha(h)}`);

async function emitir(c, datos, titulo, dibujar) {
  try {
    dibujar();
    pies(c, datos, titulo);
    c.doc.end();
  } catch (err) {
    c.doc.end();
    throw err;
  }
  return c.listo;
}

// ---------------------------------------------------------------------
// Estado de resultados: Ingresos - Costo de ventas - Gastos = Utilidad
// ---------------------------------------------------------------------
function estadoResultados(d) {
  const c = crear(d, 'Estado de resultados');
  return emitir(c, d, 'Estado de resultados', () => {
    encabezado(c, d, 'ESTADO DE RESULTADOS', rango(d.desde, d.hasta));
    const base = d.totalIngresos;

    fila(c, 'seccion', 'INGRESOS');
    if (!d.ingresos.length) fila(c, 'linea', 'Sin ingresos en el período', monto(0), { color: GRIS });
    d.ingresos.forEach((x) => fila(c, 'linea', `${x.codigo}  ${x.nombre}`, monto(x.monto), { porcentaje: pct(x.monto, base) }));
    fila(c, 'subtotal', 'Total de ingresos', monto(d.totalIngresos), { porcentaje: base ? '100.0%' : '' });
    c.y += 8;

    fila(c, 'seccion', 'COSTO DE VENTAS');
    fila(c, 'linea', 'Costo de la mercadería vendida', monto(d.costoVentas), { porcentaje: pct(d.costoVentas, base) });
    fila(c, 'subtotal', 'Utilidad bruta', monto(d.utilidadBruta), { color: d.utilidadBruta < 0 ? ROJO : TINTA, porcentaje: pct(d.utilidadBruta, base) });
    c.y += 8;

    fila(c, 'seccion', 'GASTOS');
    if (!d.gastos.length) fila(c, 'linea', 'Sin gastos en el período', monto(0), { color: GRIS });
    d.gastos.forEach((x) => fila(c, 'linea', `${x.codigo}  ${x.nombre}`, monto(x.monto), { porcentaje: pct(x.monto, base) }));
    fila(c, 'subtotal', 'Total de gastos', monto(d.totalGastos), { porcentaje: pct(d.totalGastos, base) });
    c.y += 10;

    const positiva = d.utilidadNeta >= 0;
    fila(c, 'total', positiva ? 'UTILIDAD NETA DEL PERÍODO' : 'PÉRDIDA NETA DEL PERÍODO', monto(d.utilidadNeta), { fondo: positiva ? VERDE : ROJO });
    c.y += 6;

    const margen = base ? ` Margen neto: ${pct(d.utilidadNeta, base)} sobre los ingresos.` : '';
    nota(c, (positiva
      ? 'El negocio ganó dinero en este período: los ingresos superaron al costo de ventas y a los gastos.'
      : 'El negocio perdió dinero en este período: el costo de ventas y los gastos superaron a los ingresos.') + margen);
    nota(c, 'Los ingresos y gastos se reconocen cuando ocurren (venta, factura o gasto), no cuando se cobran o se pagan. Por eso la utilidad puede ser distinta del dinero que entró y salió: eso lo muestra el Flujo de caja.');
  });
}

// ---------------------------------------------------------------------
// Flujo de caja: el dinero real que entró y salió de Caja y Bancos
// ---------------------------------------------------------------------
function flujoCaja(d) {
  const c = crear(d, 'Flujo de caja');
  return emitir(c, d, 'Flujo de caja', () => {
    encabezado(c, d, 'FLUJO DE CAJA', rango(d.desde, d.hasta));
    fila(c, 'subtotal', 'Saldo inicial en Caja y Bancos', monto(d.saldoInicial));
    c.y += 8;

    fila(c, 'seccion', 'ENTRADAS DE DINERO', null, { color: VERDE });
    if (!d.entradas.length) fila(c, 'linea', 'Sin entradas en el período', monto(0), { color: GRIS });
    d.entradas.forEach((x) => fila(c, 'linea', x.concepto, monto(x.monto), { color: VERDE }));
    fila(c, 'subtotal', 'Total de entradas', monto(d.totalEntradas), { color: VERDE });
    c.y += 8;

    fila(c, 'seccion', 'SALIDAS DE DINERO', null, { color: ROJO });
    if (!d.salidas.length) fila(c, 'linea', 'Sin salidas en el período', monto(0), { color: GRIS });
    d.salidas.forEach((x) => fila(c, 'linea', x.concepto, monto(x.monto), { color: ROJO }));
    fila(c, 'subtotal', 'Total de salidas', monto(d.totalSalidas), { color: ROJO });
    c.y += 8;

    fila(c, 'subtotal', 'Flujo neto del período', monto(d.flujoNeto), { color: d.flujoNeto < 0 ? ROJO : VERDE });
    c.y += 6;
    fila(c, 'total', 'SALDO FINAL EN CAJA Y BANCOS', monto(d.saldoFinal));
    c.y += 4;
    fila(c, 'linea', 'Caja general', monto(d.final.caja || 0), { color: GRIS });
    fila(c, 'linea', 'Bancos', monto(d.final.bancos || 0), { color: GRIS });
    c.y += 8;
    nota(c, 'Solo cuenta el dinero que realmente entró o salió de Caja y Bancos. Una venta a crédito no aparece aquí hasta que se cobra, y una compra o gasto por pagar no aparece hasta que se paga.');
  });
}

// ---------------------------------------------------------------------
// Balance general: Activos = Pasivos + Patrimonio
// ---------------------------------------------------------------------
function balanceGeneral(d) {
  const c = crear(d, 'Balance general');
  return emitir(c, d, 'Balance general', () => {
    encabezado(c, d, 'BALANCE GENERAL', `Al ${fecha(d.fecha)}`);

    fila(c, 'seccion', 'ACTIVOS');
    if (!d.activos.length) fila(c, 'linea', 'Sin activos registrados', monto(0), { color: GRIS });
    d.activos.forEach((x) => fila(c, 'linea', `${x.codigo}  ${x.nombre}`, monto(x.monto)));
    fila(c, 'subtotal', 'Total de activos', monto(d.totalActivos));
    c.y += 8;

    fila(c, 'seccion', 'PASIVOS');
    if (!d.pasivos.length) fila(c, 'linea', 'Sin deudas registradas', monto(0), { color: GRIS });
    d.pasivos.forEach((x) => fila(c, 'linea', `${x.codigo}  ${x.nombre}`, monto(x.monto)));
    fila(c, 'subtotal', 'Total de pasivos', monto(d.totalPasivos));
    c.y += 8;

    fila(c, 'seccion', 'PATRIMONIO');
    d.patrimonio.forEach((x) => fila(c, 'linea', `${x.codigo}  ${x.nombre}`, monto(x.monto)));
    fila(c, 'linea', 'Resultado acumulado (ingresos menos gastos)', monto(d.resultado), { color: d.resultado < 0 ? ROJO : TINTA });
    fila(c, 'subtotal', 'Total de patrimonio', monto(d.totalPatrimonio));
    c.y += 10;

    const suma = Math.round((d.totalPasivos + d.totalPatrimonio) * 100) / 100;
    fila(c, 'total', 'PASIVOS + PATRIMONIO', monto(suma), { fondo: d.diferencia === 0 ? VERDE : ROJO });
    c.y += 4;
    nota(c, d.diferencia === 0
      ? `El balance cuadra: Activos (${dinero(d.totalActivos)}) = Pasivos (${dinero(d.totalPasivos)}) + Patrimonio (${dinero(d.totalPatrimonio)}).`
      : `El balance NO cuadra: la diferencia es ${dinero(d.diferencia)}. Revisa los asientos manuales.`, d.diferencia === 0 ? { fondo: '#f0fdf4', borde: '#bbf7d0', color: VERDE } : { fondo: '#fef2f2', borde: '#fecaca', color: ROJO });
    if (Math.abs(d.diferenciaInventario) >= 1) {   // menos de L 1.00 es redondeo del costo promedio
      nota(c, `Las existencias del inventario valen ${dinero(d.inventarioExistencias)} según el stock y el costo de cada producto, pero el libro registra ${dinero(d.inventarioExistencias - d.diferenciaInventario)}. Concilia el inventario desde Finanzas para que coincidan.`, { fondo: '#fffbeb', borde: '#fde68a', color: AMBAR });
    }
  });
}

// ---------------------------------------------------------------------
// Antigüedad de saldos: cuentas por cobrar y por pagar según su atraso
// ---------------------------------------------------------------------
function antiguedad(d) {
  const c = crear(d, 'Antigüedad de saldos', true);
  return emitir(c, d, 'Antigüedad de saldos', () => {
    const { doc } = c;
    encabezado(c, d, 'ANTIGÜEDAD DE SALDOS', `Al ${fecha(d.fecha)}`);

    const COL = { tercero: 140, ref: 140, vence: 62, dias: 40 };
    const tramo = 66;
    const xs = [M, M + COL.tercero, M + COL.tercero + COL.ref, M + COL.tercero + COL.ref + COL.vence, M + COL.tercero + COL.ref + COL.vence + COL.dias];
    const x0 = xs[4];

    d.secciones.forEach((sec) => {
      const cabecera = () => {
        doc.rect(M, c.y, c.W, 20).fill(d.color);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff');
        doc.text(sec.tercero.toUpperCase(), xs[0] + 6, c.y + 6, { width: COL.tercero - 8, lineBreak: false });
        doc.text('DOCUMENTO', xs[1], c.y + 6, { width: COL.ref - 6, lineBreak: false });
        doc.text('VENCE', xs[2], c.y + 6, { width: COL.vence, lineBreak: false });
        doc.text('DÍAS', xs[3], c.y + 6, { width: COL.dias - 6, align: 'right', lineBreak: false });
        sec.tramos.forEach((t, i) => doc.text(t.etiqueta.toUpperCase(), x0 + i * tramo, c.y + 6, { width: tramo - 6, align: 'right', lineBreak: false }));
        c.y += 20;
      };

      asegurar(c, 90);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(TINTA).text(`${sec.titulo}: ${monto(sec.total)}`, M, c.y);
      c.y = doc.y + 6;
      cabecera();

      if (!sec.filas.length) {
        doc.font('Helvetica').fontSize(9.5).fillColor(GRIS).text('Sin saldos pendientes.', M + 6, c.y + 6);
        c.y += 28;
      }

      sec.filas.forEach((f, i) => {
        asegurar(c, 22, cabecera);
        if (i % 2 === 1) doc.rect(M, c.y, c.W, 18).fill('#f8f9fb');
        const vencido = f.dias_vencido > 0;
        doc.font('Helvetica').fontSize(8.5).fillColor(TINTA);
        doc.text(f.tercero, xs[0] + 6, c.y + 5, { width: COL.tercero - 10, lineBreak: false, ellipsis: true });
        doc.fillColor(GRIS).text(f.referencia, xs[1], c.y + 5, { width: COL.ref - 8, lineBreak: false, ellipsis: true });
        doc.fillColor(TINTA).text(fecha(f.vence) + (f.plazo_estimado ? '*' : ''), xs[2], c.y + 5, { width: COL.vence, lineBreak: false });
        doc.fillColor(vencido ? ROJO : GRIS).text(vencido ? String(f.dias_vencido) : '-', xs[3], c.y + 5, { width: COL.dias - 6, align: 'right', lineBreak: false });
        sec.tramos.forEach((t, k) => {
          if (f.tramo === t.clave) doc.fillColor(k === 0 ? VERDE : k === 1 ? AMBAR : ROJO).font('Helvetica-Bold').text(monto(f.saldo), x0 + k * tramo, c.y + 5, { width: tramo - 6, align: 'right', lineBreak: false });
        });
        c.y += 18;
      });

      asegurar(c, 26, cabecera);
      doc.moveTo(M, c.y).lineTo(M + c.W, c.y).lineWidth(0.8).stroke(TINTA);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(TINTA).text('TOTALES', xs[0] + 6, c.y + 7, { width: 120, lineBreak: false });
      sec.tramos.forEach((t, k) => doc.fillColor(k === 0 ? VERDE : k === 1 ? AMBAR : ROJO).text(monto(sec.totales[t.clave]), x0 + k * tramo, c.y + 7, { width: tramo - 6, align: 'right', lineBreak: false }));
      c.y += 34;
    });

    nota(c, '«Al día» incluye lo que aún no vence. Los días son los que lleva vencida cada deuda. * Plazo estimado: el documento no tiene fecha de vencimiento y se asume el plazo de crédito normal del negocio.');
  });
}

module.exports = { estadoResultados, flujoCaja, balanceGeneral, antiguedad };
