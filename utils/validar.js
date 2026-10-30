// Validaciones sencillas. Todas lanzan ErrorValidacion con un mensaje listo para mostrar.
class ErrorValidacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.status = 422;
  }
}

const texto = (v) => (v === null || v === undefined ? '' : String(v).trim());

function limitar(t, etiqueta, max) {
  if (t.length > max) throw new ErrorValidacion(`${etiqueta} no puede pasar de ${max} caracteres.`);
  return t;
}

function requerido(v, etiqueta, max = 255) {
  const t = texto(v);
  if (!t) throw new ErrorValidacion(`${etiqueta} es obligatorio.`);
  return limitar(t, etiqueta, max);
}

// Vacío -> null (así la columna queda NULL y no un texto vacío)
function opcional(v, etiqueta, max = 255) {
  const t = texto(v);
  return t ? limitar(t, etiqueta, max) : null;
}

function correo(v, etiqueta = 'El correo') {
  const t = opcional(v, etiqueta, 150);
  if (t && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) throw new ErrorValidacion(`${etiqueta} no tiene un formato válido.`);
  return t;
}

// El RTN es opcional: no todas las pymes están registradas en el SAR.
// Si viene, se guardan solo los dígitos (acepta guiones y espacios).
function rtn(v) {
  const t = texto(v);
  if (!t) return null;
  if (/[^\d\s-]/.test(t)) throw new ErrorValidacion('El RTN solo puede llevar números (o déjalo vacío si no tiene).');
  const digitos = t.replace(/\D/g, '');
  if (!digitos) return null;
  if (digitos.length > 20) throw new ErrorValidacion('El RTN es demasiado largo.');
  return digitos;
}

function numero(v, etiqueta, { min = 0, max = 999999999, defecto = 0 } = {}) {
  const t = texto(v);
  if (t === '') return defecto;
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) throw new ErrorValidacion(`${etiqueta} debe ser un número.`);
  if (n < min) throw new ErrorValidacion(`${etiqueta} no puede ser menor que ${min}.`);
  if (n > max) throw new ErrorValidacion(`${etiqueta} es demasiado grande.`);
  return Math.round(n * 100) / 100;
}

// id opcional (selects de categoría, proveedor...)
function idOpcional(v, etiqueta = 'El valor') {
  const t = texto(v);
  if (!t) return null;
  const n = Number(t);
  if (!Number.isInteger(n) || n <= 0) throw new ErrorValidacion(`${etiqueta} no es válido.`);
  return n;
}

function eleccion(v, etiqueta, validos, defecto) {
  const t = texto(v) || defecto;
  if (!validos.includes(t)) throw new ErrorValidacion(`${etiqueta} no es válido.`);
  return t;
}

function booleano(v, defecto = false) {
  if (v === undefined || v === null || v === '') return defecto;
  return v === true || v === 'true' || v === '1' || v === 'on';
}

// JSON que llega dentro de un campo de formulario (variantes, componentes)
function json(v, etiqueta) {
  if (v === undefined || v === null || v === '') return [];
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch (_) {
    throw new ErrorValidacion(`${etiqueta} no tienen un formato válido.`);
  }
}

// Fecha 'YYYY-MM-DD' real (rechaza 2026-13-45). Vacía = null.
function fechaISO(v, etiqueta) {
  const t = texto(v);
  if (!t) return null;
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const f = d && new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  if (!d || f.getUTCFullYear() !== +d[1] || f.getUTCMonth() !== +d[2] - 1 || f.getUTCDate() !== +d[3]) {
    throw new ErrorValidacion(`${etiqueta} no es una fecha válida.`);
  }
  return t;
}

// Monto en dinero: mayor que cero y con 2 decimales como máximo (no se redondea en silencio)
function dinero(v, etiqueta, { min = 0.01, max = 999999999.99 } = {}) {
  const t = texto(v).replace(',', '.');
  if (t === '') throw new ErrorValidacion(`${etiqueta} es obligatorio.`);
  const n = Number(t);
  if (!Number.isFinite(n)) throw new ErrorValidacion(`${etiqueta} debe ser un número.`);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) throw new ErrorValidacion(`${etiqueta} no puede tener más de 2 decimales.`);
  if (n < min) throw new ErrorValidacion(min === 0.01 ? `${etiqueta} debe ser mayor que cero.` : `${etiqueta} no puede ser menor que ${min}.`);
  if (n > max) throw new ErrorValidacion(`${etiqueta} es demasiado grande.`);
  return Math.round(n * 100) / 100;
}

// Cuenta donde entra o sale el dinero: Caja o Bancos
function cuentaEfectivo(v, mensaje) {
  const t = texto(v);
  if (t !== 'caja' && t !== 'bancos') throw new ErrorValidacion(mensaje || 'Elige si es Caja o Bancos.');
  return t;
}

module.exports = {
  fechaISO, dinero, cuentaEfectivo,
  ErrorValidacion, texto, limitar, requerido, opcional, correo, rtn,
  numero, idOpcional, eleccion, booleano, json,
};
