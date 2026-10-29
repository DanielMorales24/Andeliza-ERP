const config = require('../client.config');
const V = require('../utils/validar');
const Productos = require('../models/productos');
const Categorias = require('../models/categorias');
const Proveedores = require('../models/proveedores');
const Storage = require('../services/storageService');

const { unidades, tiposVariante } = config.valoresPorDefecto;
const { variantes: usaVariantes, productosCompuestos: usaKits } = config.funcionalidades;

// Para cada tipo de variante (talla, equipo...) las opciones vienen de client.config.js:
// tipo "talla" -> valoresPorDefecto.tallas, tipo "equipo" -> valoresPorDefecto.equipos
function opcionesVariante() {
  const salida = {};
  for (const tipo of tiposVariante) {
    salida[tipo] = config.valoresPorDefecto[`${tipo}s`] || config.valoresPorDefecto[`${tipo}es`] || [];
  }
  return salida;
}

const productoVacio = () => ({
  id: null, sku: '', nombre: '', categoria_id: '', proveedor_id: '',
  precio_compra: 0, precio_venta: 0, unidad: unidades[0], stock: 0, stock_minimo: 0,
  descripcion: '', imagen_url: null, es_compuesto: false, activo: true,
});

async function index(req, res, next) {
  try {
    const filas = await Productos.listar();
    res.render('inventario/index', { titulo: 'Inventario', filas });
  } catch (err) {
    next(err);
  }
}

async function formulario(req, res, next) {
  try {
    const id = req.params.id ? Number(req.params.id) : null;
    let producto = productoVacio();
    let variantes = [];
    let componentes = [];

    if (id) {
      const existente = await Productos.obtener(id);
      if (!existente) return res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
      ({ producto, variantes, componentes } = existente);
    }

    const [categorias, proveedores, candidatosKit] = await Promise.all([
      Categorias.listar(),
      Proveedores.listar(),
      usaKits ? Productos.candidatosKit(id) : [],
    ]);

    // Las inactivas no se ofrecen, salvo la que ya tiene este producto
    const ofrecer = (lista, actual) => lista
      .filter((x) => x.activo || x.id === actual)
      .map((x) => ({ id: x.id, nombre: x.nombre }));

    const datos = {
      id,
      producto,
      variantes,
      componentes,
      candidatosKit,
      categorias: ofrecer(categorias, producto.categoria_id),
      proveedores: ofrecer(proveedores, producto.proveedor_id),
      unidades: unidades.includes(producto.unidad) ? unidades : [...unidades, producto.unidad],
      tiposVariante,
      opcionesVariante: opcionesVariante(),
      funcionalidades: { variantes: usaVariantes, kits: usaKits },
    };

    res.render('inventario/form', { titulo: id ? 'Editar producto' : 'Nuevo producto', datos });
  } catch (err) {
    next(err);
  }
}

// "ALG" para valores largos ("Local" -> "LOC"), tal cual para los cortos ("XL")
const abreviar = (valor) => (valor.length <= 3 ? valor : valor.slice(0, 3)).toUpperCase().replace(/\s+/g, '');

function normalizarVariantes(crudo, skuProducto) {
  if (!Array.isArray(crudo)) throw new V.ErrorValidacion('Las variantes no tienen un formato válido.');
  if (crudo.length > 300) throw new V.ErrorValidacion('Un producto no puede tener más de 300 variantes.');

  const vistos = new Set();
  return crudo.map((v, i) => {
    const atributos = {};
    for (const tipo of tiposVariante) {
      const valor = V.texto(v.atributos && v.atributos[tipo]);
      if (valor) atributos[tipo] = V.limitar(valor, `El valor de ${tipo}`, 40);
    }

    const nombre = tiposVariante.map((t) => atributos[t]).filter(Boolean).join(' / ');
    if (!nombre) throw new V.ErrorValidacion(`La variante ${i + 1} necesita al menos ${tiposVariante.join(' o ')}.`);

    if (vistos.has(nombre.toLowerCase())) throw new V.ErrorValidacion(`La variante "${nombre}" está repetida.`);
    vistos.add(nombre.toLowerCase());

    // Si no trae SKU y el producto sí, se arma: CAM-RMA-M-LOC
    let sku = V.opcional(v.sku, `El SKU de "${nombre}"`, 50);
    if (!sku && skuProducto) {
      sku = [skuProducto, ...tiposVariante.map((t) => atributos[t]).filter(Boolean).map(abreviar)].join('-').slice(0, 50);
    }

    return {
      id: V.idOpcional(v.id, 'La variante'),
      sku,
      nombre_variante: nombre,
      atributos,
      stock: V.numero(v.stock, `El stock de "${nombre}"`),
      stock_minimo: V.numero(v.stock_minimo, `El stock mínimo de "${nombre}"`),
    };
  });
}

function normalizarComponentes(crudo) {
  if (!Array.isArray(crudo)) throw new V.ErrorValidacion('Los componentes no tienen un formato válido.');
  if (crudo.length === 0) throw new V.ErrorValidacion('Un kit necesita al menos un componente.');

  const vistos = new Set();
  return crudo.map((c) => {
    const productoId = V.idOpcional(c.producto_id, 'El componente');
    if (!productoId) throw new V.ErrorValidacion('Hay un componente sin producto.');
    if (vistos.has(productoId)) throw new V.ErrorValidacion('Un producto está repetido en los componentes del kit.');
    vistos.add(productoId);
    return { producto_id: productoId, cantidad: V.numero(c.cantidad, 'La cantidad del componente', { min: 0.01, defecto: 1 }) };
  });
}

async function guardar(req, res, next) {
  let urlNueva = null;
  try {
    const id = req.params.id ? Number(req.params.id) : null;
    const b = req.body;

    let actual = null;
    if (id) {
      actual = await Productos.obtenerBasico(id);
      if (!actual) return res.status(404).json({ error: 'El producto ya no existe.' });
    }

    const unidad = V.texto(b.unidad) || unidades[0];
    if (!unidades.includes(unidad) && !(actual && actual.unidad === unidad)) {
      throw new V.ErrorValidacion('La unidad no es válida.');
    }

    const datos = {
      sku: V.opcional(b.sku, 'El SKU', 50),
      nombre: V.requerido(b.nombre, 'El nombre', 200),
      categoria_id: V.idOpcional(b.categoria_id, 'La categoría'),
      proveedor_id: V.idOpcional(b.proveedor_id, 'El proveedor'),
      precio_compra: V.numero(b.precio_compra, 'El precio de compra'),
      precio_venta: V.numero(b.precio_venta, 'El precio de venta'),
      unidad,
      stock: V.numero(b.stock, 'El stock'),
      stock_minimo: V.numero(b.stock_minimo, 'El stock mínimo'),
      descripcion: V.opcional(b.descripcion, 'La descripción', 2000),
      es_compuesto: usaKits && V.booleano(b.es_compuesto),
      activo: V.booleano(b.activo, true),
    };

    let variantes = usaVariantes ? normalizarVariantes(V.json(b.variantes, 'Las variantes'), datos.sku) : [];
    if (datos.es_compuesto && variantes.length) {
      throw new V.ErrorValidacion('Un producto no puede tener variantes y ser un kit a la vez.');
    }
    if (datos.es_compuesto) variantes = [];
    const componentes = datos.es_compuesto ? normalizarComponentes(V.json(b.componentes, 'Los componentes')) : [];

    // Imagen: se sube al final de las validaciones para no dejar archivos huérfanos
    const quitar = V.booleano(b.quitar_imagen);
    if (req.file) urlNueva = await Storage.subirImagen(req.file.buffer, req.file.mimetype);
    const imagen = { cambiar: Boolean(req.file) || quitar, url: urlNueva };

    const resultado = await Productos.guardar(id, datos, variantes, componentes, imagen);

    // Con await: en serverless una tarea suelta puede quedar cortada al responder
    if (imagen.cambiar && resultado.imagenAnterior) await Storage.eliminarImagen(resultado.imagenAnterior);

    res.status(id ? 200 : 201).json({ ok: true, id: resultado.id });
  } catch (err) {
    if (urlNueva) await Storage.eliminarImagen(urlNueva); // la base falló: se borra lo subido
    next(err);
  }
}

async function cambiarActivo(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!(await Productos.cambiarActivo(id, V.booleano(req.body.activo)))) {
      return res.status(404).json({ error: 'No se encontró el producto.' });
    }
    res.json({ ok: true, fila: await Productos.obtenerLista(id) });
  } catch (err) {
    next(err);
  }
}

module.exports = { index, formulario, guardar, cambiarActivo };
