const config = require('../client.config');

// Formato regional del negocio de esta instancia. Arranca con los valores de fábrica y cada petición
// lo pone al día con lo que el negocio eligió (middlewares/negocio.js). Como cada instancia atiende a un
// solo negocio, todas las peticiones comparten el mismo formato.
const regional = {
  moneda: config.valoresPorDefecto.moneda,
  formatoFecha: config.valoresPorDefecto.formatoFecha,
  zonaHoraria: config.valoresPorDefecto.zonaHoraria,
};

function aplicarRegional(n) {
  if (!n) return;
  if (n.moneda) regional.moneda = n.moneda;
  if (n.formatoFecha) regional.formatoFecha = n.formatoFecha;
  if (n.zonaHoraria) regional.zonaHoraria = n.zonaHoraria;
}
const zonaHoraria = () => regional.zonaHoraria;

// 1234.5 -> "L 1,234.50"
function dinero(valor) {
  const n = Number(valor) || 0;
  return `${regional.moneda} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Acepta 'YYYY-MM-DD' (columnas DATE) o un Date (columnas TIMESTAMPTZ).
// Devuelve 'YYYY-MM-DD' en la zona horaria del negocio.
function aISO(valor) {
  if (!valor) return '';
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor;
  const d = new Date(valor);
  if (isNaN(d)) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: regional.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// Aplica config.valoresPorDefecto.formatoFecha (ej. DD/MM/YYYY)
function fecha(valor) {
  const iso = aISO(valor);
  if (!iso) return '';
  const [anio, mes, dia] = iso.split('-');
  return regional.formatoFecha.replace('DD', dia).replace('MM', mes).replace('YYYY', anio);
}

// Fecha y hora en la zona del negocio: 29/10/2026 14:35
function fechaHora(valor) {
  const d = new Date(valor);
  if (!valor || isNaN(d)) return '';
  const p = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: regional.zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).forEach((x) => { p[x.type] = x.value; });
  const hora = (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
  return regional.formatoFecha.replace('DD', p.day).replace('MM', p.month).replace('YYYY', p.year) + ' ' + hora;
}

// Suma (o resta) días a una fecha 'YYYY-MM-DD' sin depender de la zona horaria del servidor
function sumarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + dias));
  return f.toISOString().slice(0, 10);
}

const hoyISO = () => aISO(new Date());

// Cantidades sin ceros de más: 2 -> "2", 1.5 -> "1.5"
const cantidad = (n) => String(+(Number(n) || 0).toFixed(2));

module.exports = { dinero, fecha, aISO, fechaHora, sumarDias, hoyISO, cantidad, aplicarRegional, zonaHoraria };
