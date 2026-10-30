// Resumen, inicio de la contabilidad, libro diario, balanza y reportes en PDF.
const config = require('../client.config');
const db = require('../db');
const V = require('../utils/validar');
const { sumarDias } = require('../utils/formato');
const Contab = require('../models/contabilidad');
const Cartera = require('../models/cartera');
const Negocio = require('../models/negocio');
const Pdf = require('../services/reportesPdfService');

const ORIGENES = {
  venta: 'Ventas', abono_cliente: 'Abonos de clientes', ingreso: 'Ingresos', gasto: 'Gastos', compra: 'Compras',
  pago_proveedor: 'Pagos a proveedores', manual: 'Asientos manuales', saldo_inicial: 'Saldos iniciales',
  ajuste_inventario: 'Ajustes de inventario', apertura: 'Apertura', anulacion: 'Anulaciones',
};

async function resumen(req, res, next) {
  try {
    res.render('finanzas/resumen', { titulo: 'Finanzas', seccion: 'resumen', datos: { ...(await Contab.resumen()), compras: config.funcionalidades.compras === true } });
  } catch (err) { next(err); }
}

async function iniciar(req, res, next) {
  try { res.json({ ok: true, resultado: await Contab.iniciar() }); } catch (err) { next(err); }
}

async function conciliarInventario(req, res, next) {
  try {
    const contra = V.eleccion(req.body.contra, 'El destino del ajuste', ['capital', 'ajuste'], 'ajuste');
    const { rows } = await db.query('SELECT conciliar_inventario($1, $2) AS r', [req.user.id, contra]);
    res.json({ ok: true, resultado: rows[0].r });
  } catch (err) { next(err); }
}

async function saldoInicial(req, res, next) {
  try {
    const cuenta = V.cuentaEfectivo(req.body.cuenta, 'Elige si el saldo inicial es de Caja o de Bancos.');
    const monto = V.dinero(req.body.monto, 'El saldo inicial');
    const est = await Contab.estado();
    const fecha = V.fechaISO(req.body.fecha, 'La fecha') || est.hoy;
    const { rows } = await db.query('SELECT registrar_saldo_inicial($1, $2, $3::date, $4) AS id', [cuenta, monto, fecha, req.user.id]);
    res.status(201).json({ ok: true, partida_id: rows[0].id });
  } catch (err) { next(err); }
}

// ---------- Libro diario ----------
function leerFiltrosLibro(q) {
  const f = {
    desde: V.fechaISO(q.desde, 'La fecha inicial'),
    hasta: V.fechaISO(q.hasta, 'La fecha final'),
    cuenta: V.idOpcional(q.cuenta, 'La cuenta'),
    origen: V.texto(q.origen),
    q: V.texto(q.q).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 60),
    orden: q.orden === 'asc' ? 'asc' : 'desc',
    offset: Number.isInteger(Number(q.offset)) && Number(q.offset) > 0 ? Math.min(Number(q.offset), 100000) : 0,
  };
  if (f.desde && f.hasta && f.desde > f.hasta) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
  if (f.origen && !ORIGENES[f.origen]) throw new V.ErrorValidacion('El origen no es válido.');
  return f;
}

async function partidas(req, res, next) {
  try {
    const [libro, cuentas, balanza] = await Promise.all([Contab.libro(leerFiltrosLibro({})), Contab.cuentas(), Contab.balanza(null, null)]);
    res.render('finanzas/partidas', { titulo: 'Libro diario', seccion: 'partidas', datos: { libro, cuentas, balanza, origenes: ORIGENES, estado: await Contab.estado() } });
  } catch (err) { next(err); }
}

async function partidasDatos(req, res, next) {
  try { res.json({ ok: true, ...(await Contab.libro(leerFiltrosLibro(req.query))) }); } catch (err) { next(err); }
}

async function balanzaDatos(req, res, next) {
  try {
    const desde = V.fechaISO(req.query.desde, 'La fecha inicial');
    const hasta = V.fechaISO(req.query.hasta, 'La fecha final');
    if (desde && hasta && desde > hasta) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
    res.json({ ok: true, ...(await Contab.balanza(desde, hasta)) });
  } catch (err) { next(err); }
}

// Asiento manual: [{ cuenta_id, debe, haber, detalle }]
async function partidaManual(req, res, next) {
  try {
    const b = req.body || {};
    const descripcion = V.requerido(b.descripcion, 'La descripción', 300);
    const est = await Contab.estado();
    const fecha = V.fechaISO(b.fecha, 'La fecha') || est.hoy;
    if (!Array.isArray(b.lineas) || b.lineas.length < 2) throw new V.ErrorValidacion('Un asiento necesita al menos dos líneas.');
    if (b.lineas.length > 40) throw new V.ErrorValidacion('Un asiento no puede tener más de 40 líneas.');

    let debe = 0; let haber = 0;
    const lineas = b.lineas.map((l, i) => {
      const cuentaId = V.idOpcional(l.cuenta_id, `La cuenta de la línea ${i + 1}`);
      if (!cuentaId) throw new V.ErrorValidacion(`Elige la cuenta de la línea ${i + 1}.`);
      const d = V.texto(l.debe) === '' ? 0 : V.dinero(l.debe, `El Debe de la línea ${i + 1}`);
      const h = V.texto(l.haber) === '' ? 0 : V.dinero(l.haber, `El Haber de la línea ${i + 1}`);
      if ((d > 0) === (h > 0)) throw new V.ErrorValidacion(`La línea ${i + 1} debe tener un monto en el Debe o en el Haber (solo uno).`);
      debe += Math.round(d * 100); haber += Math.round(h * 100);
      return { cuenta_id: cuentaId, ...(d > 0 ? { debe: d } : { haber: h }), detalle: V.opcional(l.detalle, 'El detalle', 200) };
    });
    if (debe !== haber) throw new V.ErrorValidacion(`El asiento no cuadra: Debe ${(debe / 100).toFixed(2)} y Haber ${(haber / 100).toFixed(2)}.`);

    const { rows } = await db.query('SELECT registrar_partida_manual($1::date, $2, $3::jsonb, $4) AS id', [fecha, descripcion, JSON.stringify(lineas), req.user.id]);
    res.status(201).json({ ok: true, partida_id: rows[0].id });
  } catch (err) { next(err); }
}

async function anularPartida(req, res, next) {
  try {
    const motivo = V.opcional(req.body.motivo, 'El motivo', 200);
    const { rows } = await db.query('SELECT anular_partida_manual($1, $2, $3) AS id', [Number(req.params.id), req.user.id, motivo]);
    res.json({ ok: true, partida_id: rows[0].id });
  } catch (err) { next(err); }
}

// ---------- Reportes ----------
function periodo(q, est) {
  const hasta = V.fechaISO(q.hasta, 'La fecha final') || est.hoy;
  const desde = V.fechaISO(q.desde, 'La fecha inicial') || hasta.slice(0, 8) + '01';
  if (desde > hasta) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
  return { desde, hasta };
}

async function base() {
  const negocio = await Negocio.obtener();
  return { negocio, logo: await Negocio.logo(negocio.logoUrl), color: config.negocio.colores.primario };
}

async function enviarPdf(res, buffer, nombre, descargar) {
  res.set({
    'Content-Type': 'application/pdf', 'Content-Length': buffer.length,
    'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="${nombre}.pdf"`, 'Cache-Control': 'private, no-store',
  });
  res.send(buffer);
}

async function reportes(req, res, next) {
  try {
    const est = await Contab.estado();
    res.render('finanzas/reportes', { titulo: 'Reportes', seccion: 'reportes', datos: { estado: est, inicioMes: est.hoy.slice(0, 8) + '01' } });
  } catch (err) { next(err); }
}

async function pdfEstadoResultados(req, res, next) {
  try {
    const est = await Contab.estado(); const p = periodo(req.query, est);
    const datos = { ...(await base()), ...(await Contab.estadoResultados(p.desde, p.hasta)) };
    await enviarPdf(res, await Pdf.estadoResultados(datos), `estado-de-resultados-${p.desde}-a-${p.hasta}`, req.query.descargar === '1');
  } catch (err) { next(err); }
}

async function pdfFlujoCaja(req, res, next) {
  try {
    const est = await Contab.estado(); const p = periodo(req.query, est);
    const datos = { ...(await base()), ...(await Contab.flujoCaja(p.desde, p.hasta)) };
    await enviarPdf(res, await Pdf.flujoCaja(datos), `flujo-de-caja-${p.desde}-a-${p.hasta}`, req.query.descargar === '1');
  } catch (err) { next(err); }
}

async function pdfBalanceGeneral(req, res, next) {
  try {
    const est = await Contab.estado();
    const fecha = V.fechaISO(req.query.fecha, 'La fecha') || est.hoy;
    const datos = { ...(await base()), ...(await Contab.balanceGeneral(fecha)) };
    await enviarPdf(res, await Pdf.balanceGeneral(datos), `balance-general-${fecha}`, req.query.descargar === '1');
  } catch (err) { next(err); }
}

async function pdfAntiguedad(req, res, next) {
  try {
    const est = await Contab.estado();
    const tipo = V.eleccion(req.query.tipo, 'El tipo', ['cxc', 'cxp', 'ambos'], 'ambos');
    const secciones = [];
    if (tipo !== 'cxp') secciones.push({ tipo: 'cxc', titulo: 'Cuentas por cobrar', tercero: 'Cliente', ...(await Cartera.antiguedad('cxc')) });
    if (tipo !== 'cxc') secciones.push({ tipo: 'cxp', titulo: 'Cuentas por pagar', tercero: 'Proveedor', ...(await Cartera.antiguedad('cxp')) });
    const datos = { ...(await base()), fecha: est.hoy, secciones };
    await enviarPdf(res, await Pdf.antiguedad(datos), `antiguedad-de-saldos-${tipo}-${est.hoy}`, req.query.descargar === '1');
  } catch (err) { next(err); }
}

module.exports = {
  resumen, iniciar, conciliarInventario, saldoInicial, partidas, partidasDatos, balanzaDatos,
  partidaManual, anularPartida, reportes, pdfEstadoResultados, pdfFlujoCaja, pdfBalanceGeneral, pdfAntiguedad, ORIGENES,
};
