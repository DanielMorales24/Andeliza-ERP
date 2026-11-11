// El catálogo maestro (client.config.js) y lo que cada negocio eligió de él (configuracion_negocio).
// Regla: el archivo dice qué EXISTE; la base dice qué ELIGIÓ este negocio (decisión D-08).
const config = require('../client.config');
const { ErrorValidacion } = require('./validar');
const Colores = require('./colores');

const M = config.catalogo;
const claves = (lista) => lista.map((x) => x.clave);
const predeterminadas = (lista) => { const p = lista.filter((x) => x.predeterminada).map((x) => x.clave); return p.length ? p : claves(lista); };

const tiposTodos = () => claves(M.tiposVariante);
const opcionesMaestras = (tipo) => (M.opcionesVariante[tipo] ? M.opcionesVariante[tipo].grupos.flatMap((g) => g.valores) : []);
const opcionesPredeterminadas = (tipo) => {
  const o = M.opcionesVariante[tipo];
  return o && Array.isArray(o.predeterminadas) ? o.predeterminadas.slice() : opcionesMaestras(tipo);
};

// Deja solo lo que existe en el maestro, en el orden del maestro. Si no queda nada, las predeterminadas.
function filtrar(elegidas, maestro, defecto) {
  if (!Array.isArray(elegidas)) return defecto.slice();
  const pedidas = new Set(elegidas.map(String));
  const validas = maestro.filter((x) => pedidas.has(x));
  return validas.length ? validas : defecto.slice();
}

// De una fila de configuracion_negocio a las elecciones vigentes (NULL o basura = predeterminadas)
function resolver(fila) {
  const f = fila || {};
  const crudas = f.opciones_variante_activas && typeof f.opciones_variante_activas === 'object' && !Array.isArray(f.opciones_variante_activas)
    ? f.opciones_variante_activas : {};
  const opcionesVariante = {};
  tiposTodos().forEach((tipo) => {
    // Una lista vacía es una elección válida: ese tipo no sugiere nada y se escribe a mano
    opcionesVariante[tipo] = Array.isArray(crudas[tipo])
      ? opcionesMaestras(tipo).filter((v) => crudas[tipo].map(String).includes(v))
      : opcionesPredeterminadas(tipo);
  });
  return {
    unidades: filtrar(f.unidades_activas, claves(M.unidades), predeterminadas(M.unidades)),
    tiposVariante: filtrar(f.tipos_variante_activos, tiposTodos(), predeterminadas(M.tiposVariante)),
    opcionesVariante,
    categoriasGasto: filtrar(f.categorias_gasto_activas, claves(M.categoriasGasto), predeterminadas(M.categoriasGasto)),
    tiposIngreso: filtrar(f.tipos_ingreso_activos, claves(M.tiposIngreso), predeterminadas(M.tiposIngreso)),
  };
}

// ---------- Consultas sobre el maestro ----------
const unidad = (clave) => M.unidades.find((u) => u.clave === clave) || null;
const nombreUnidad = (clave) => { const u = unidad(clave); return u ? u.nombre : String(clave || ''); };
const unidadesDecimales = () => M.unidades.filter((u) => u.decimal).map((u) => u.clave);
const paleta = (id) => M.paletas.find((p) => p.id === id) || null;
const nombreDe = (catalogo, clave) => { const x = (M[catalogo] || []).find((e) => e.clave === clave); return x ? x.nombre : String(clave); };

// [[clave, nombre], ...] como lo esperan los formularios de ingresos y gastos
const pares = (catalogo, activas) => activas.map((c) => [c, nombreDe(catalogo, c)]);

// Las unidades que ofrece el formulario de producto: las activas y, si el producto ya tenía
// una que hoy está desactivada (o que ya no existe), esa también, marcada como inactiva.
function unidadesParaFormulario(activas, actual) {
  const lista = activas.map((c) => ({ clave: c, nombre: nombreUnidad(c), inactiva: false }));
  if (actual && !activas.includes(actual)) lista.push({ clave: actual, nombre: nombreUnidad(actual), inactiva: true });
  return lista;
}

// Las paletas con sus medidas de contraste, para mostrarlas y para comprobarlas en las pruebas
function paletasEvaluadas() {
  return M.paletas.map((p) => { const e = Colores.evaluar(p.primario, p.acento); return { ...p, valida: e.valida, medidas: e.medidas, acentoFuerte: e.colores ? e.colores.acentoFuerte : null }; });
}

// El maestro tal como lo necesita la pantalla de Configuración
function paraVista() {
  return {
    unidades: M.unidades.map((u) => ({ clave: u.clave, nombre: u.nombre, decimal: u.decimal === true })),
    tiposVariante: M.tiposVariante.map((t) => ({ clave: t.clave, nombre: t.nombre, grupos: M.opcionesVariante[t.clave] ? M.opcionesVariante[t.clave].grupos : [] })),
    categoriasGasto: M.categoriasGasto.map((x) => ({ clave: x.clave, nombre: x.nombre })),
    tiposIngreso: M.tiposIngreso.map((x) => ({ clave: x.clave, nombre: x.nombre })),
    monedas: M.monedas, formatosFecha: M.formatosFecha, zonasHorarias: M.zonasHorarias, tasasImpuesto: M.tasasImpuesto,
    paletas: paletasEvaluadas(),
  };
}

// ---------- Validación de lo que llega para guardar ----------
function lista(valor, maestro, etiqueta, minimo) {
  if (!Array.isArray(valor)) throw new ErrorValidacion(`${etiqueta}: el formato no es válido.`);
  const pedidas = [...new Set(valor.map((v) => String(v)))];
  const ajenas = pedidas.filter((v) => !maestro.includes(v));
  if (ajenas.length) throw new ErrorValidacion(`${etiqueta}: "${ajenas[0].slice(0, 40)}" no existe en el catálogo.`);
  if (pedidas.length < minimo) throw new ErrorValidacion(`${etiqueta}: deja activa al menos una opción.`);
  return maestro.filter((v) => pedidas.includes(v));   // siempre en el orden del catálogo
}

const validarUnidades = (valor) => lista(valor, claves(M.unidades), 'Unidades de venta', 1);
const validarCategoriasGasto = (valor) => lista(valor, claves(M.categoriasGasto), 'Categorías de gasto', 1);
const validarTiposIngreso = (valor) => lista(valor, claves(M.tiposIngreso), 'Tipos de ingreso', 1);

function validarEleccion(cuerpo) {
  const b = cuerpo || {};
  const tipos = lista(b.tiposVariante, tiposTodos(), 'Tipos de variante', 0);
  const crudas = b.opcionesVariante && typeof b.opcionesVariante === 'object' && !Array.isArray(b.opcionesVariante) ? b.opcionesVariante : {};
  const opciones = {};
  tiposTodos().forEach((tipo) => {
    if (crudas[tipo] !== undefined) opciones[tipo] = lista(crudas[tipo], opcionesMaestras(tipo), `Opciones de ${nombreDe('tiposVariante', tipo).toLowerCase()}`, 0);
  });
  return {
    unidades: validarUnidades(b.unidades),
    tiposVariante: tipos,
    opcionesVariante: opciones,
    categoriasGasto: validarCategoriasGasto(b.categoriasGasto),
    tiposIngreso: validarTiposIngreso(b.tiposIngreso),
  };
}

function validarRegional(cuerpo) {
  const b = cuerpo || {};
  const uno = (valor, maestro, etiqueta) => { const v = String(valor === undefined || valor === null ? '' : valor); if (!maestro.includes(v)) throw new ErrorValidacion(`${etiqueta} no es ${etiqueta.startsWith('El ') ? 'válido' : 'válida'}: elige ${etiqueta.startsWith('El ') ? 'uno' : 'una'} del catálogo.`); return v; };
  // Se valida en el orden en que aparecen los campos, para que el mensaje hable del primero que está mal
  const moneda = uno(b.moneda, claves(M.monedas), 'La moneda');
  const formatoFecha = uno(b.formatoFecha, claves(M.formatosFecha), 'El formato de fecha');
  const zonaHoraria = uno(b.zonaHoraria, claves(M.zonasHorarias), 'La zona horaria');
  const tasa = Number(b.tasaImpuesto);
  if (!M.tasasImpuesto.some((t) => t.valor === tasa)) throw new ErrorValidacion('La tasa de impuesto no es válida: elige una del catálogo.');
  return { moneda, formatoFecha, zonaHoraria, tasaImpuesto: Math.round(tasa * 100) / 10000 };   // 15 -> 0.15
}

// Solo se aceptan paletas del catálogo: así nunca llega un color escrito desde el navegador
function validarPaleta(id) {
  const p = paleta(String(id || ''));
  if (!p) throw new ErrorValidacion('Elige una de las paletas de la lista.');
  const e = Colores.evaluar(p.primario, p.acento);
  if (!e.valida) throw new ErrorValidacion(e.problemas[0].mensaje);
  return { id: p.id, nombre: p.nombre, primario: e.colores.primario, acento: e.colores.acento };
}

module.exports = {
  resolver, tiposTodos, opcionesMaestras, opcionesPredeterminadas, unidad, nombreUnidad, unidadesDecimales, paleta, nombreDe, pares,
  unidadesParaFormulario, paletasEvaluadas, paraVista, validarUnidades, validarCategoriasGasto, validarTiposIngreso, validarEleccion, validarRegional, validarPaleta,
};
