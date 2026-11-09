// Íconos de línea (24x24). Un solo archivo para el servidor (EJS: icono('key', 'h-4 w-4')) y el navegador (Iconos.icono(...)).
// Sin librerías: cada ícono es un trozo de SVG que hereda el color del texto (currentColor).
(function (raiz) {
  const ICONOS = {
    shield: '<path d="M12 3 4.5 6v5.5c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    badge: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.8 2.9-6 6.5-6s6.5 2.2 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.5c2.1.7 3.5 2.4 3.5 5.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3M14 9l2 2"/>',
    logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m16 8 4 4-4 4M20 12H9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    'trend-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    'trend-down': '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a1 1 0 0 0 1 .8h8.8a1 1 0 0 0 1-.8L20 7H6"/>',
    box: '<path d="M3 8 12 3l9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v.01M18 15v.01"/>',
    'chart-bar': '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    credit: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    equal: '<path d="M5 9h14M5 15h14"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 3 3 5-6"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.6 1.8-2.3 3-2.3s2.4.7 3 2.3M15 10h3M15 13h3"/>',
  };
  function icono(nombre, clase) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="'
      + (clase || 'h-5 w-5') + '" aria-hidden="true">' + (ICONOS[nombre] || ICONOS.chart) + '</svg>';
  }
  const api = { ICONOS: ICONOS, icono: icono };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.Iconos = api;
})(typeof self !== 'undefined' ? self : this);
