// Totales de una venta, calculados con enteros (centavos) para que coincidan
// exactamente con ROUND() de Postgres. public/js/pos.js tiene la misma fórmula
// para mostrarlos en vivo; el servidor siempre recalcula y manda lo que vale.
function centavos(n) {
  return Math.round(Number(n) * 100 + 1e-9);
}

// Importe de una línea en centavos: precio x cantidad, redondeado a 2 decimales (mitad hacia arriba)
function importeLinea(precio, cantidad) {
  return Math.floor((centavos(precio) * centavos(cantidad) + 50) / 100);
}

const aMonto = (c) => Number((c / 100).toFixed(2));

// lineas: [{ precio, cantidad }]   tasa: 0.15   incluido: true si los precios ya traen el impuesto
function calcularTotales(lineas, tasa, incluido) {
  const bps = Math.round(Number(tasa) * 10000); // 0.15 -> 1500
  const importes = lineas.map((l) => importeLinea(l.precio, l.cantidad));
  const suma = importes.reduce((s, c) => s + c, 0);

  let subtotal;
  let impuesto;
  let total;
  if (incluido) {
    total = suma;
    const d = 10000 + bps;
    subtotal = Math.floor((2 * total * 10000 + d) / (2 * d)); // total / (1 + tasa), redondeado
    impuesto = total - subtotal;
  } else {
    subtotal = suma;
    impuesto = Math.floor((subtotal * bps + 5000) / 10000);
    total = subtotal + impuesto;
  }

  return {
    subtotal: aMonto(subtotal),
    impuesto: aMonto(impuesto),
    total: aMonto(total),
    importes: importes.map(aMonto),
  };
}

module.exports = { calcularTotales, importeLinea };
