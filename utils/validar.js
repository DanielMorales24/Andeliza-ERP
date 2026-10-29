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

module.exports = {
  ErrorValidacion, texto, limitar, requerido, opcional, correo, rtn,
  numero, idOpcional, eleccion, booleano, json,
};
