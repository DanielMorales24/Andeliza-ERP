// Ingresos varios, gastos y compras de inventario.
const config = require('../client.config');
const V = require('../utils/validar');
const Contab = require('../models/contabilidad');
const Mov = require('../models/movimientos');

const TIPOS_INGRESO = [['intereses', 'Intereses'], ['alquileres', 'Alquileres'], ['servicios', 'Servicios'], ['inversiones', 'Inversiones'], ['otros', 'Otros']];
const CATEGORIAS_GASTO = [['logistica', 'Logística'], ['marketing', 'Marketing'], ['operativos', 'Operativos'], ['mantenimiento', 'Mantenimiento'], ['otros', 'Otros']];

async function pagina(req, res, next) {
  try {
    const est = await Contab.estado();
    const inicioMes = est.hoy.slice(0, 8) + '01';
    const filtros = { desde: inicioMes, hasta: est.hoy };
    const [ingresos, gastos, compras, cat] = await Promise.all([
      Mov.listar('ingresos', filtros), Mov.listar('gastos', filtros),
      config.funcionalidades.compras ? Mov.listar('compras', filtros) : { filas: [], hayMas: false, resumen: { cantidad: 0, suma: 0 } },
      Mov.catalogosFormularios(),
    ]);
    res.render('finanzas/movimientos', {
      titulo: 'Movimientos', seccion: 'movimientos',
      datos: {
        estado: est, inicioMes, listas: { ingresos, gastos, compras }, catalogos: cat,
        tiposIngreso: TIPOS_INGRESO, categoriasGasto: CATEGORIAS_GASTO, compras: config.funcionalidades.compras === true,
      },
    });
  } catch (err) { next(err); }
}

async function datos(req, res, next) {
  try {
    const tipo = V.eleccion(req.query.tipo, 'El tipo', ['ingresos', 'gastos', 'compras'], 'ingresos');
    if (tipo === 'compras' && !config.funcionalidades.compras) return res.status(404).json({ error: 'Esta función no está activa.' });
    const desde = V.fechaISO(req.query.desde, 'La fecha inicial');
    const hasta = V.fechaISO(req.query.hasta, 'La fecha final');
    if (desde && hasta && desde > hasta) throw new V.ErrorValidacion('La fecha inicial no puede ser mayor que la final.');
    const estado = V.eleccion(req.query.estado, 'El estado', ['', 'P', 'C', 'anulado'], '');
    const q = V.texto(req.query.q).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().slice(0, 60);
    const offset = Number.isInteger(Number(req.query.offset)) && Number(req.query.offset) > 0 ? Math.min(Number(req.query.offset), 100000) : 0;
    res.json({ ok: true, ...(await Mov.listar(tipo, { desde, hasta, q, estado, offset })) });
  } catch (err) { next(err); }
}

// Datos comunes: monto, fecha, condición de pago y cuenta
async function comunes(b, etiquetaMonto, estadoC) {
  const est = await Contab.estado();
  const estado = V.eleccion(b.estado, 'La condición de pago', ['C', 'P'], 'C');
  const fecha = V.fechaISO(b.fecha, 'La fecha') || est.hoy;
  const vencimiento = estado === 'P' ? V.fechaISO(b.vencimiento, 'La fecha de vencimiento') : null;
  if (vencimiento && vencimiento < fecha) throw new V.ErrorValidacion('El vencimiento no puede ser anterior a la fecha.');
  const cuenta = estado === 'C' ? V.cuentaEfectivo(b.cuenta, `Elige si el dinero ${estadoC} Caja o Bancos.`) : null;
  return { estado, fecha, vencimiento, cuenta, notas: V.opcional(b.notas, 'Las notas', 500) };
}

async function crearIngreso(req, res, next) {
  try {
    const b = req.body || {};
    const c = await comunes(b, 'monto', 'entra a');
    const r = await Mov.registrarIngreso({
      tipo: V.eleccion(b.tipo, 'El tipo de ingreso', TIPOS_INGRESO.map((t) => t[0]), 'otros'),
      descripcion: V.requerido(b.descripcion, 'La descripción', 255),
      monto: V.dinero(b.monto, 'El monto'), clienteId: V.idOpcional(b.cliente_id, 'El cliente'), usuarioId: req.user.id, ...c,
    });
    res.status(201).json({ ok: true, ...r });
  } catch (err) { next(err); }
}

async function crearGasto(req, res, next) {
  try {
    const b = req.body || {};
    const c = await comunes(b, 'monto', 'sale de');
    const r = await Mov.registrarGasto({
      categoria: V.eleccion(b.categoria, 'La categoría', CATEGORIAS_GASTO.map((t) => t[0]), 'otros'),
      descripcion: V.requerido(b.descripcion, 'La descripción', 255),
      monto: V.dinero(b.monto, 'El monto'), proveedorId: V.idOpcional(b.proveedor_id, 'El proveedor'), usuarioId: req.user.id, ...c,
    });
    res.status(201).json({ ok: true, ...r });
  } catch (err) { next(err); }
}

async function crearCompra(req, res, next) {
  try {
    const b = req.body || {};
    if (!Array.isArray(b.items) || b.items.length === 0) throw new V.ErrorValidacion('Agrega al menos un producto a la compra.');
    if (b.items.length > 100) throw new V.ErrorValidacion('Una compra no puede tener más de 100 líneas.');
    const items = b.items.map((it, i) => {
      const productoId = V.idOpcional(it.producto_id, `El producto de la línea ${i + 1}`);
      if (!productoId) throw new V.ErrorValidacion(`La línea ${i + 1} no tiene producto.`);
      return {
        producto_id: productoId,
        variante_id: V.idOpcional(it.variante_id, `La variante de la línea ${i + 1}`),
        cantidad: V.dinero(it.cantidad, `La cantidad de la línea ${i + 1}`, { max: 1000000 }),
        precio_unitario: V.dinero(it.precio_unitario, `El precio de la línea ${i + 1}`, { min: 0 }),
      };
    });
    const c = await comunes(b, 'total', 'sale de');
    const r = await Mov.registrarCompra({ proveedorId: V.idOpcional(b.proveedor_id, 'El proveedor'), items, usuarioId: req.user.id, ...c });
    res.status(201).json({ ok: true, ...r });
  } catch (err) { next(err); }
}

async function anularIngreso(req, res, next) {
  try { await Mov.anularIngreso(Number(req.params.id), req.user.id, V.opcional(req.body.motivo, 'El motivo', 200)); res.json({ ok: true }); } catch (err) { next(err); }
}
async function anularGasto(req, res, next) {
  try { await Mov.anularGasto(Number(req.params.id), req.user.id, V.opcional(req.body.motivo, 'El motivo', 200)); res.json({ ok: true }); } catch (err) { next(err); }
}

module.exports = { pagina, datos, crearIngreso, crearGasto, crearCompra, anularIngreso, anularGasto };
