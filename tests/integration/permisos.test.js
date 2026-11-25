// Foco: PERMISOS. El servidor bloquea cada ruta según el rol, aunque alguien escriba la dirección a mano
// o llame a la ruta sin pasar por la pantalla. Cada intento bloqueado queda en la auditoría.
const B = require('../soporte/base');
const H = require('../soporte/http');

let vendedor;
let contador;
let supervisor;
let ventaId;

beforeAll(async () => {
  await B.prepararBase();
  [vendedor, contador, supervisor] = [await H.entrar('vendedor'), await H.entrar('contador'), await H.entrar('supervisor')];
  // Una venta del propio vendedor, para que el intento de anular sea sobre algo que él sí ve
  const r = await H.json.post(vendedor, '/pos/cobrar', {
    items: [{ producto_id: await B.idProducto('PRU-CAM'), cantidad: 1 }], pendiente: false, metodo_pago: 'efectivo', clave: H.claveCobro(),
  });
  ventaId = r.body.venta.id;
});
afterAll(async () => { await B.cerrar(); await H.cerrarApp(); });

const denegados = () => B.valor("SELECT COUNT(*)::int FROM auditoria WHERE accion = 'acceso_denegado'");

describe('el vendedor no entra a Finanzas', () => {
  test('GET /finanzas responde 403 (la página de "Sin permiso")', async () => {
    const r = await vendedor.get('/finanzas');
    expect(r.status).toBe(403);
    expect(r.text).toMatch(/permiso/i);
  });

  test('tampoco por las rutas de datos que usan las pantallas (JSON)', async () => {
    for (const ruta of ['/finanzas/partidas/datos', '/finanzas/movimientos/datos?tipo=gastos', '/finanzas/cxp/datos']) {
      const r = await H.json.get(vendedor, ruta);
      expect([ruta, r.status]).toEqual([ruta, 403]);
      expect(r.body.error).toBe('No tienes permiso para hacer esto.');
    }
  });

  test('ni puede registrar un gasto', async () => {
    const r = await H.json.post(vendedor, '/finanzas/gastos', { categoria: 'operativos', descripcion: 'Intento', monto: 10, estado: 'C', cuenta: 'caja' });
    expect(r.status).toBe(403);
    expect(await B.valor("SELECT COUNT(*)::int FROM gastos WHERE descripcion = 'Intento'")).toBe(0);
  });
});

describe('anular una factura es solo para administrador y supervisor', () => {
  test('el vendedor recibe 403, aunque sea su propia venta, y la factura sigue vigente', async () => {
    const antes = await denegados();
    const r = await H.json.post(vendedor, `/facturas/${ventaId}/anular`, { motivo: 'Intento del vendedor' });
    expect(r.status).toBe(403);
    expect(await B.valor('SELECT anulada FROM ventas WHERE id = $1', [ventaId])).toBe(false);
    expect(await denegados()).toBe(antes + 1);
  });

  test('el contador también recibe 403', async () => {
    const r = await H.json.post(contador, `/facturas/${ventaId}/anular`, { motivo: 'Intento del contador' });
    expect(r.status).toBe(403);
  });

  test('el supervisor sí puede (control: la ruta funciona para quien tiene el permiso)', async () => {
    const r = await H.json.post(supervisor, `/facturas/${ventaId}/anular`, { motivo: 'Anulación del supervisor' });
    expect(r.status).toBe(200);
    expect(await B.valor('SELECT anulada FROM ventas WHERE id = $1', [ventaId])).toBe(true);
  });
});

describe('sin sesión', () => {
  test('una página protegida manda al inicio de sesión', async () => {
    const r = await H.request(H.app).get('/finanzas');
    expect(r.status).toBe(302);
    expect(r.headers.location).toMatch(/\/login/);
  });

  test('una acción protegida no se ejecuta', async () => {
    const r = await H.request(H.app).post(`/facturas/${ventaId}/anular`).set('Accept', 'application/json').send({ motivo: 'Sin sesión' });
    expect([401, 302, 403]).toContain(r.status);
  });
});
