// Foco: DINERO. Cada venta genera su partida doble y el Debe va a la cuenta que corresponde al medio
// de pago: efectivo → Caja; tarjeta y transferencia → Bancos; al crédito → Cuentas por cobrar.
// Se cobra por HTTP como lo hace el punto de venta y se revisan las líneas de la partida en la base.
const B = require('../soporte/base');
const H = require('../soporte/http');

let vendedor;
let admin;

beforeAll(async () => {
  await B.prepararBase();
  vendedor = await H.entrar('vendedor');
  admin = await H.entrar('admin');
});
afterAll(async () => { await B.cerrar(); await H.cerrarApp(); });

// Cobra en el POS y devuelve la venta creada
async function cobrar(agente, items, extra = {}) {
  const r = await H.json.post(agente, '/pos/cobrar', { items, pendiente: false, clave: H.claveCobro(), ...extra });
  return r;
}
const lineasDeVenta = (id) => B.lineasDePartida("p.origen_tipo = 'venta' AND p.origen_id = $1", [id]);
const debeEn = (lineas, clave) => lineas.filter((l) => l.clave === clave).reduce((s, l) => s + l.debe, 0);

describe('contabilizar_venta: a qué cuenta va el dinero', () => {
  test('una venta en efectivo carga Caja por el total y no toca Bancos ni Cuentas por cobrar', async () => {
    // Preparar
    const camiseta = await B.idProducto('PRU-CAM');
    // Actuar
    const r = await cobrar(vendedor, [{ producto_id: camiseta, cantidad: 2 }], { metodo_pago: 'efectivo' });
    // Comprobar
    expect(r.status).toBe(201);
    const venta = r.body.venta;
    const lineas = await lineasDeVenta(venta.id);
    expect(debeEn(lineas, 'caja')).toBe(venta.total);
    expect(lineas.some((l) => l.clave === 'bancos' || l.clave === 'cxc')).toBe(false);
    expect(await B.valor('SELECT metodo_pago FROM ventas WHERE id = $1', [venta.id])).toBe('efectivo');
  });

  test('una venta con tarjeta carga Bancos por el total y no toca Caja', async () => {
    const camiseta = await B.idProducto('PRU-CAM');
    const r = await cobrar(vendedor, [{ producto_id: camiseta, cantidad: 1 }], { metodo_pago: 'tarjeta' });
    expect(r.status).toBe(201);
    const lineas = await lineasDeVenta(r.body.venta.id);
    expect(debeEn(lineas, 'bancos')).toBe(r.body.venta.total);
    expect(lineas.some((l) => l.clave === 'caja')).toBe(false);
    expect(r.body.venta.metodo_nombre).toBe('Tarjeta');
  });

  test('una venta por transferencia también va a Bancos', async () => {
    const gorra = await B.idProducto('PRU-GOR');
    const r = await cobrar(vendedor, [{ producto_id: gorra, cantidad: 3 }], { metodo_pago: 'transferencia' });
    const lineas = await lineasDeVenta(r.body.venta.id);
    expect(debeEn(lineas, 'bancos')).toBe(r.body.venta.total);
  });

  test('una venta al crédito carga Cuentas por cobrar y no guarda método aunque el navegador mande uno', async () => {
    const [gorra, cliente] = [await B.idProducto('PRU-GOR'), await B.valor("SELECT id FROM clientes WHERE nombre = 'Cliente de Pruebas'")];
    const r = await cobrar(admin, [{ producto_id: gorra, cantidad: 1 }], { pendiente: true, cliente_id: cliente, metodo_pago: 'tarjeta' });
    expect(r.status).toBe(201);
    const lineas = await lineasDeVenta(r.body.venta.id);
    expect(debeEn(lineas, 'cxc')).toBe(r.body.venta.total);
    expect(lineas.some((l) => l.clave === 'caja' || l.clave === 'bancos')).toBe(false);
    expect(await B.valor('SELECT metodo_pago FROM ventas WHERE id = $1', [r.body.venta.id])).toBeNull();
  });

  test('la partida completa: Ventas por el subtotal, Impuesto por pagar por el ISV y el costo contra Inventario', async () => {
    const medias = await B.idProducto('PRU-MED');
    const r = await cobrar(vendedor, [{ producto_id: medias, cantidad: 4 }], { metodo_pago: 'efectivo' });
    const v = r.body.venta;
    const lineas = await lineasDeVenta(v.id);
    const haber = (clave) => lineas.filter((l) => l.clave === clave).reduce((s, l) => s + l.haber, 0);
    expect(haber('ventas')).toBe(v.subtotal);
    expect(haber('isv_por_pagar')).toBe(v.impuesto);
    expect(debeEn(lineas, 'costo_ventas')).toBeGreaterThan(0);
    expect(debeEn(lineas, 'costo_ventas')).toBe(haber('inventario'));
    const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
    expect(Math.round(totalDebe * 100)).toBe(Math.round(totalHaber * 100));
  });

  test('un cobro sin método (pantalla de la versión anterior) se toma como efectivo', async () => {
    const medias = await B.idProducto('PRU-MED');
    const r = await cobrar(vendedor, [{ producto_id: medias, cantidad: 1 }]);
    expect(r.status).toBe(201);
    expect(debeEn(await lineasDeVenta(r.body.venta.id), 'caja')).toBe(r.body.venta.total);
  });

  test('un método que no existe o que el negocio no activó se rechaza y no crea la venta', async () => {
    const antes = await B.valor('SELECT COUNT(*)::int FROM ventas');
    const medias = await B.idProducto('PRU-MED');
    const r1 = await cobrar(vendedor, [{ producto_id: medias, cantidad: 1 }], { metodo_pago: 'bitcoin' });
    const r2 = await cobrar(vendedor, [{ producto_id: medias, cantidad: 1 }], { metodo_pago: 'cheque' });   // existe, pero viene apagado
    expect(r1.status).toBe(422);
    expect(r2.status).toBe(422);
    expect(r1.body.error).toMatch(/método de pago/i);
    expect(await B.valor('SELECT COUNT(*)::int FROM ventas')).toBe(antes);
  });

  test('la base rechaza un método desconocido aunque alguien llame a la función sin pasar por la aplicación', async () => {
    await expect(B.consulta("SELECT cuenta_metodo_pago('bitcoin')")).rejects.toThrow(/no es válido/);
    const filas = await B.consulta(
      "SELECT cuenta_metodo_pago('efectivo') AS e, cuenta_metodo_pago('tarjeta') AS t, cuenta_metodo_pago('transferencia') AS tr, cuenta_metodo_pago('cheque') AS ch"
    );
    expect(filas[0]).toEqual({ e: 'caja', t: 'bancos', tr: 'bancos', ch: 'bancos' });
  });

  test('después de todas las ventas, cada partida y la balanza cuadran', async () => {
    expect(await B.balanzaCuadra()).toBe(true);
  });
});

describe('cobrar desde Facturas una venta al crédito', () => {
  test('"Marcar pagada" con transferencia registra el abono en Bancos y baja Cuentas por cobrar', async () => {
    // Preparar: una venta al crédito
    const [camiseta, cliente] = [await B.idProducto('PRU-CAM'), await B.valor("SELECT id FROM clientes WHERE nombre = 'Cliente de Pruebas'")];
    const venta = (await cobrar(admin, [{ producto_id: camiseta, cantidad: 1 }], { pendiente: true, cliente_id: cliente })).body.venta;
    // Actuar
    const r = await H.json.patch(admin, `/facturas/${venta.id}/pagada`, { metodo_pago: 'transferencia' });
    // Comprobar
    expect(r.status).toBe(200);
    const abono = await B.valor('SELECT id FROM abonos_clientes WHERE venta_id = $1', [venta.id]);
    const lineas = await B.lineasDePartida("p.origen_tipo = 'abono_cliente' AND p.origen_id = $1", [abono]);
    expect(lineas).toEqual([
      { clave: 'bancos', debe: venta.total, haber: 0 },
      { clave: 'cxc', debe: 0, haber: venta.total },
    ]);
    expect(await B.valor('SELECT estado || metodo_pago FROM ventas WHERE id = $1', [venta.id])).toBe('Ctransferencia');
  });
});
