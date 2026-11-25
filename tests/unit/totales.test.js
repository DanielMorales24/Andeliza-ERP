// Foco: DINERO. El servidor recalcula cada venta con utils/totales.js; un centavo de diferencia con
// lo que calcula la base o con lo que vio el cliente en pantalla es un descuadre.
const { calcularTotales, importeLinea } = require('../../utils/totales');

describe('calcularTotales: impuesto aparte (como está configurado el negocio)', () => {
  test('una línea de L 100 con ISV 15 % da subtotal 100, impuesto 15 y total 115', () => {
    // Preparar
    const lineas = [{ precio: 100, cantidad: 1 }];
    // Actuar
    const t = calcularTotales(lineas, 0.15, false);
    // Comprobar
    expect(t).toEqual({ subtotal: 100, impuesto: 15, total: 115, importes: [100] });
  });

  test('suma varias líneas y redondea el impuesto a 2 decimales (mitad hacia arriba)', () => {
    const t = calcularTotales([{ precio: 33.33, cantidad: 3 }, { precio: 0.05, cantidad: 1 }], 0.15, false);
    expect(t.importes).toEqual([99.99, 0.05]);
    expect(t.subtotal).toBe(100.04);
    expect(t.impuesto).toBe(15.01);          // 15.006 → 15.01
    expect(t.total).toBe(115.05);
  });

  test('el total siempre es subtotal + impuesto, exacto al centavo', () => {
    const casos = [[19.99, 7], [0.01, 1], [1234.56, 3], [5.55, 0.5]];
    for (const [precio, cantidad] of casos) {
      const t = calcularTotales([{ precio, cantidad }], 0.15, false);
      expect(Math.round((t.subtotal + t.impuesto) * 100)).toBe(Math.round(t.total * 100));
    }
  });
});

describe('calcularTotales: precios con el impuesto incluido', () => {
  test('L 115 con ISV incluido se separa en 100 de subtotal y 15 de impuesto', () => {
    const t = calcularTotales([{ precio: 115, cantidad: 1 }], 0.15, true);
    expect(t).toMatchObject({ subtotal: 100, impuesto: 15, total: 115 });
  });

  test('L 100 con ISV incluido: 86.96 + 13.04 (el total no cambia)', () => {
    const t = calcularTotales([{ precio: 100, cantidad: 1 }], 0.15, true);
    expect(t).toMatchObject({ subtotal: 86.96, impuesto: 13.04, total: 100 });
  });
});

describe('importeLinea', () => {
  test('cantidades con decimales se redondean al centavo, sin errores de coma flotante', () => {
    expect(importeLinea(0.1, 3)).toBe(30);       // 0.30 en centavos, no 30.000000000000004
    expect(importeLinea(2.675, 1)).toBe(268);    // 2.675 se toma como 2.68 (centavos exactos)
    expect(importeLinea(10, 0.25)).toBe(250);
  });
});
