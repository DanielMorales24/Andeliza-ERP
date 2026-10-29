const config = require('../client.config');
const V = require('../utils/validar');
const { numeroCorto } = require('../utils/documentos');
const { unidadesDecimales } = require('../utils/unidades');
const Pos = require('../models/pos');
const Ventas = require('../models/ventas');
const Negocio = require('../models/negocio');
const Clientes = require('../models/clientes');
const { normalizar: normalizarCliente } = require('./clientes');
const Documentos = require('./documentos');

async function index(req, res, next) {
  try {
    const [productos, clientes, facturacion, tasa] = await Promise.all([
      Pos.catalogo(), Pos.clientes(), Negocio.modoFacturacion(), Negocio.tasaImpuesto(),
    ]);
    const datos = {
      productos,
      clientes,
      facturacion,
      tasa,
      impuestoIncluido: config.valoresPorDefecto.impuestoIncluidoEnPrecio === true,
      tiposVariante: config.valoresPorDefecto.tiposVariante,
      unidadesDecimales: unidadesDecimales(),
      usuarioId: req.user.id,
      permisos: { facturas: req.user.rol === 'admin' && config.funcionalidades.facturas === true },
    };
    res.render('pos/index', { titulo: 'Punto de venta', datos });
  } catch (err) {
    next(err);
  }
}

// Para refrescar el stock sin recargar la pantalla
async function catalogo(req, res, next) {
  try {
    res.json({ productos: await Pos.catalogo() });
  } catch (err) {
    next(err);
  }
}

// Alta rápida de cliente desde el POS (también la puede usar el vendedor)
async function crearCliente(req, res, next) {
  try {
    const datos = normalizarCliente(req.body);
    datos.activo = true;
    const id = await Clientes.crear(datos);
    const c = await Clientes.obtener(id);
    res.status(201).json({ ok: true, cliente: { id: c.id, nombre: c.nombre, telefono: c.telefono, rtn: c.rtn } });
  } catch (err) {
    next(err);
  }
}

// Valida las líneas que manda el navegador y junta las repetidas (mismo producto y variante)
function normalizarItems(crudo) {
  if (!Array.isArray(crudo) || crudo.length === 0) throw new V.ErrorValidacion('El carrito está vacío.');
  if (crudo.length > 200) throw new V.ErrorValidacion('Una venta no puede tener más de 200 líneas.');

  const juntos = new Map();
  crudo.forEach((c, i) => {
    if (!c || typeof c !== 'object') throw new V.ErrorValidacion(`La línea ${i + 1} del carrito no es válida.`);
    const productoId = V.idOpcional(c.producto_id, `El producto de la línea ${i + 1}`);
    if (!productoId) throw new V.ErrorValidacion(`La línea ${i + 1} no tiene producto.`);
    const varianteId = V.idOpcional(c.variante_id, `La variante de la línea ${i + 1}`);

    const texto = V.texto(c.cantidad);
    const cantidad = V.numero(texto, `La cantidad de la línea ${i + 1}`, { min: 0, max: 100000, defecto: 0 });
    if (!(cantidad > 0)) throw new V.ErrorValidacion(`La cantidad de la línea ${i + 1} debe ser mayor que cero.`);

    const clave = `${productoId}:${varianteId || 0}`;
    const previo = juntos.get(clave);
    if (previo) previo.cantidad = Math.round((previo.cantidad + cantidad) * 100) / 100;
    else juntos.set(clave, { producto_id: productoId, variante_id: varianteId, cantidad });
  });
  return [...juntos.values()];
}

function resumenVenta(v) {
  return {
    id: v.id,
    numero_factura: v.numero_factura,
    numero_corto: numeroCorto(v.numero_factura, v.tipo_documento),
    tipo_documento: v.tipo_documento,
    estado: v.estado,
    subtotal: v.subtotal,
    impuesto: v.impuesto,
    total: v.total,
    cliente: v.cliente_nombre || 'Consumidor Final',
    creado_en: v.creado_en,
    items: v.items.map((i) => ({
      nombre: i.nombre, detalle: i.nombre_variante || '', cantidad: i.cantidad, precio: i.precio_unitario, importe: i.subtotal,
    })),
  };
}

async function cobrar(req, res, next) {
  try {
    const b = req.body || {};
    const clienteId = V.idOpcional(b.cliente_id, 'El cliente');
    const items = normalizarItems(b.items);

    let clave = null;
    if (b.clave !== undefined && b.clave !== null && b.clave !== '') {
      clave = V.texto(b.clave);
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(clave)) throw new V.ErrorValidacion('La clave del cobro no es válida.');
    }

    const r = await Ventas.crear({
      clienteId, usuarioId: req.user.id, items, pendiente: V.booleano(b.pendiente), clave,
    });
    res.status(r.repetida ? 200 : 201).json({ ok: true, repetida: r.repetida, venta: resumenVenta(r.venta) });
  } catch (err) {
    next(err);
  }
}

// Se abre en otra pestaña desde un formulario: llega un campo "datos" con el JSON del carrito
async function cotizacion(req, res, next) {
  try {
    const datos = V.json(req.body.datos, 'Los datos de la cotización');
    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) throw new V.ErrorValidacion('Los datos de la cotización no son válidos.');
    const items = normalizarItems(datos.items);
    const cot = await Ventas.cotizar({ clienteId: V.idOpcional(datos.cliente_id, 'El cliente'), items });
    const documento = await Documentos.documentoDeCotizacion(cot, req.user.nombre);
    await Documentos.enviarPdf(res, documento, 'cotizacion', false);
  } catch (err) {
    next(err);
  }
}

module.exports = { index, catalogo, crearCliente, cobrar, cotizacion, normalizarItems };
