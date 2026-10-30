// Cuentas por cobrar y por pagar: pantallas, abonos y pagos.
const V = require('../utils/validar');
const Contab = require('../models/contabilidad');
const Cartera = require('../models/cartera');

const TEXTOS = {
  cxc: { titulo: 'Cuentas por cobrar', tercero: 'Cliente', accion: 'Abonar', movimiento: 'abono', plural: 'abonos', vacio: 'No hay nada por cobrar. Las ventas pendientes del POS aparecen aquí.' },
  cxp: { titulo: 'Cuentas por pagar', tercero: 'Proveedor', accion: 'Pagar', movimiento: 'pago', plural: 'pagos', vacio: 'No debes nada. Las compras y gastos «por pagar» aparecen aquí.' },
};

function crear(tipo) {
  return {
    async pagina(req, res, next) {
      try {
        const [filas, estado] = await Promise.all([Cartera.listar(tipo), Contab.estado()]);
        res.render('finanzas/cartera', { titulo: TEXTOS[tipo].titulo, seccion: tipo, datos: { tipo, textos: TEXTOS[tipo], filas, estado } });
      } catch (err) { next(err); }
    },

    async datos(req, res, next) {
      try { res.json({ ok: true, filas: await Cartera.listar(tipo) }); } catch (err) { next(err); }
    },

    async historial(req, res, next) {
      try {
        const { origen, id } = req.params;
        res.json({ ok: true, documento: await Cartera.documento(tipo, origen, Number(id)), movimientos: await Cartera.historial(tipo, origen, Number(id)) });
      } catch (err) { next(err); }
    },

    // body: { origen: 'venta'|'ingreso'|'compra'|'gasto', doc_id, monto, fecha, cuenta, notas }
    async registrar(req, res, next) {
      try {
        const b = req.body || {};
        const origen = V.texto(b.origen);
        const docId = V.idOpcional(b.doc_id, 'El documento');
        if (!docId) throw new V.ErrorValidacion('Falta el documento.');
        const monto = V.dinero(b.monto, `El monto del ${TEXTOS[tipo].movimiento}`);
        const est = await Contab.estado();
        const fecha = V.fechaISO(b.fecha, 'La fecha') || est.hoy;
        const cuenta = V.cuentaEfectivo(b.cuenta, `Elige si el ${TEXTOS[tipo].movimiento} entra o sale por Caja o Bancos.`);
        const r = await Cartera.registrar(tipo, origen, docId, { monto, fecha, cuenta, notas: V.opcional(b.notas, 'Las notas', 300), usuarioId: req.user.id });
        res.status(201).json({ ok: true, ...r, documento: await Cartera.documento(tipo, origen, docId) });
      } catch (err) { next(err); }
    },

    async anular(req, res, next) {
      try {
        const motivo = V.opcional(req.body.motivo, 'El motivo', 200);
        await Cartera.anular(tipo, Number(req.params.id), { motivo, usuarioId: req.user.id });
        res.json({ ok: true });
      } catch (err) { next(err); }
    },
  };
}

module.exports = { cxc: crear('cxc'), cxp: crear('cxp') };
