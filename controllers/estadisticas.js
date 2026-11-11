// Estadísticas de ventas: pantalla, datos en JSON (para los filtros sin recargar) y reporte en PDF.
const config = require('../client.config');
const Est = require('../models/estadisticas');
const Negocio = require('../models/negocio');
const Auditoria = require('../models/auditoria');
const Pdf = require('../services/reportesPdfService');
const { fecha } = require('../utils/formato');

// El insight de cuentas por cobrar sale de Finanzas: solo se calcula si la persona puede ver Finanzas
const contextoCxc = async (req) => (config.funcionalidades.finanzas === true && req.user.tiene('finanzas', 'ver') ? { cxc: await Est.cuentasPorCobrar() } : {});

async function pantalla(req, res, next) {
  try {
    const [hoy, opciones] = await Promise.all([Est.hoy(), Est.opciones()]);
    res.render('estadisticas/index', {
      titulo: 'Estadísticas',
      datos: { hoy, periodos: Est.PERIODOS, vendedores: opciones.vendedores, categorias: opciones.categorias, puedeVerCartera: req.user.tiene('finanzas', 'ver') && config.funcionalidades.finanzas === true },
    });
  } catch (err) { next(err); }
}

async function datos(req, res, next) {
  try {
    const filtros = Est.leerFiltros(req.query, await Est.hoy());
    res.json(await Est.respuesta(filtros, await contextoCxc(req)));
  } catch (err) { next(err); }
}

async function reportePdf(req, res, next) {
  try {
    const filtros = Est.leerFiltros(req.query, await Est.hoy());
    const [resp, negocio, nombres] = await Promise.all([Est.respuesta(filtros, await contextoCxc(req)), Negocio.obtener(), Est.nombres(filtros.vendedor, filtros.categoria)]);
    const buffer = await Pdf.estadisticas({
      negocio, logo: await Negocio.logo(negocio.logoUrl), color: negocio.colores.primario, ...resp, filtrosNombres: nombres,
    });
    // Un reporte de gestión se exporta con rastro: queda en la auditoría
    await Auditoria.registrar({
      usuarioId: req.user.id, accion: 'exportar_estadisticas', entidad: 'estadisticas',
      descripcion: `Exportó el reporte de estadísticas del ${fecha(resp.rango.desde)} al ${fecha(resp.rango.hasta)}`, ip: req.ip,
    });
    res.set({
      'Content-Type': 'application/pdf', 'Content-Length': buffer.length, 'Cache-Control': 'private, no-store',
      'Content-Disposition': `${req.query.descargar === '1' ? 'attachment' : 'inline'}; filename="estadisticas-${resp.rango.desde}-a-${resp.rango.hasta}.pdf"`,
    });
    res.send(buffer);
  } catch (err) { next(err); }
}

module.exports = { pantalla, datos, reportePdf };
