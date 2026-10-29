const config = require('../client.config');

const { moneda, formatoFecha, zonaHoraria } = config.valoresPorDefecto;

// 1234.5 -> "L 1,234.50"
function dinero(valor) {
  const n = Number(valor) || 0;
  return `${moneda} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Acepta 'YYYY-MM-DD' (columnas DATE) o un Date (columnas TIMESTAMPTZ).
// Devuelve 'YYYY-MM-DD' en la zona horaria del negocio.
function aISO(valor) {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = new Date(valor);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Aplica config.valoresPorDefecto.formatoFecha (ej. DD/MM/YYYY)
function fecha(valor) {
  const iso = aISO(valor);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return formatoFecha.replace('DD', dia).replace('MM', mes).replace('YYYY', anio);
}

module.exports = { dinero, fecha, aISO };
