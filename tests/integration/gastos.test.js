// Tercer flujo completo: registro y pago de gastos, con partida doble en cada paso.
//   Gasto pagado:         Debe Gasto (de su categoría)  /  Haber Caja o Bancos
//   Gasto por pagar:      Debe Gasto                    /  Haber Cuentas por pagar
//   Pago del gasto:       Debe Cuentas por pagar        /  Haber Caja o Bancos
//   Anulación:            la contrapartida exacta (y no se anula si tiene pagos vigentes)
// Todo por HTTP, como lo hace la pantalla Finanzas → Movimientos, y comprobado en la base.
const B = require('../soporte/base');
const H = require('../soporte/http');

let admin;
let contador;
let hoy;

beforeAll(async () => {
  await B.prepararBase();
  [admin, contador] = [await H.entrar('admin'), await H.entrar('contador')];
  hoy = await B.valor('SELECT hoy_negocio()::text');
});
afterAll(async () => { await B.cerrar(); await H.cerrarApp(); });

const registrar = (agente, datos) => H.json.post(agente, '/finanzas/gastos', { fecha: hoy, ...datos });
const pagar = (agente, gastoId, datos) => H.json.post(agente, '/finanzas/cxp/pagos', { origen: 'gasto', doc_id: gastoId, fecha: hoy, ...datos });
const lineasDelGasto = (id) => B.lineasDePartida("p.origen_tipo = 'gasto' AND p.origen_id = $1 AND p.reversa_de IS NULL", [id]);
const lineasDelPago = (id) => B.lineasDePartida("p.origen_tipo = 'pago_proveedor' AND p.origen_id = $1 AND p.reversa_de IS NULL", [id]);
const saldoCxp = (id) => B.valor("SELECT saldo::numeric FROM v_cxp WHERE origen = 'gasto' AND doc_id = $1", [id]).then((v) => (v === undefined ? undefined : Number(v)));
const gasto = (id) => B.consulta('SELECT estado_pago, anulado, monto::numeric AS monto FROM gastos WHERE id = $1', [id]).then((f) => f[0]);

describe('registrar un gasto', () => {
  test('pagado en efectivo: Debe Gasto operativo / Haber Caja por el monto', async () => {
    // Actuar
    const r = await registrar(contador, { categoria: 'operativos', descripcion: 'Papelería de oficina', monto: 850, estado: 'C', cuenta: 'caja' });
    // Comprobar
    expect(r.status).toBe(201);
    expect(await lineasDelGasto(r.body.gasto_id)).toEqual([
      { clave: 'caja', debe: 0, haber: 850 },
      { clave: 'gasto_operativos', debe: 850, haber: 0 },
    ]);
    expect((await gasto(r.body.gasto_id)).estado_pago).toBe('C');
  });

  test('pagado desde Bancos: el Haber va a Bancos', async () => {
    const r = await registrar(contador, { categoria: 'marketing', descripcion: 'Publicidad en redes', monto: 1200.5, estado: 'C', cuenta: 'bancos' });
    expect(await lineasDelGasto(r.body.gasto_id)).toEqual([
      { clave: 'bancos', debe: 0, haber: 1200.5 },
      { clave: 'gasto_marketing', debe: 1200.5, haber: 0 },
    ]);
  });

  test('por pagar: Debe Gasto / Haber Cuentas por pagar, y aparece en Cuentas por pagar con su saldo', async () => {
    const r = await registrar(contador, { categoria: 'servicios', descripcion: 'Energía eléctrica de noviembre', monto: 1800, estado: 'P', vencimiento: hoy });
    expect(r.status).toBe(201);
    expect(await lineasDelGasto(r.body.gasto_id)).toEqual([
      { clave: 'cxp', debe: 0, haber: 1800 },
      { clave: 'gasto_servicios', debe: 1800, haber: 0 },
    ]);
    expect(await saldoCxp(r.body.gasto_id)).toBe(1800);
    const cxp = await H.json.get(contador, '/finanzas/cxp/datos');
    expect(cxp.body.filas.some((f) => f.origen === 'gasto' && f.doc_id === r.body.gasto_id)).toBe(true);
  });

  test.each([
    ['una categoría que no existe', { categoria: 'viajes', descripcion: 'X', monto: 10, estado: 'C', cuenta: 'caja' }, /categoría/i],
    ['monto cero', { categoria: 'otros', descripcion: 'X', monto: 0, estado: 'C', cuenta: 'caja' }, /mayor que cero/],
    ['más de 2 decimales', { categoria: 'otros', descripcion: 'X', monto: 10.005, estado: 'C', cuenta: 'caja' }, /2 decimales/],
    ['sin descripción', { categoria: 'otros', descripcion: '  ', monto: 10, estado: 'C', cuenta: 'caja' }, /descripción/i],
    ['pagado sin decir de qué cuenta sale', { categoria: 'otros', descripcion: 'X', monto: 10, estado: 'C' }, /Caja o Bancos/],
  ])('rechaza %s (422) y no registra nada', async (_caso, datos, mensaje) => {
    const antes = await B.valor('SELECT COUNT(*)::int FROM gastos');
    const r = await registrar(contador, datos);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(mensaje);
    expect(await B.valor('SELECT COUNT(*)::int FROM gastos')).toBe(antes);
  });

  test('un vencimiento anterior a la fecha del gasto se rechaza', async () => {
    const r = await registrar(contador, { categoria: 'otros', descripcion: 'Con vencimiento', monto: 10, estado: 'P', fecha: hoy, vencimiento: '2020-01-01' });
    expect(r.status).toBe(422);
  });
});

describe('pagar un gasto por pagar', () => {
  let id;
  beforeAll(async () => {
    id = (await registrar(contador, { categoria: 'mantenimiento', descripcion: 'Reparación de vitrina', monto: 1000, estado: 'P' })).body.gasto_id;
  });

  test('un pago parcial desde Bancos: Debe Cuentas por pagar / Haber Bancos, y el saldo baja', async () => {
    const r = await pagar(contador, id, { monto: 400, cuenta: 'bancos' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ saldo: 600, pagada: false });
    expect(await lineasDelPago(r.body.pago_id)).toEqual([
      { clave: 'bancos', debe: 0, haber: 400 },
      { clave: 'cxp', debe: 400, haber: 0 },
    ]);
    expect(await saldoCxp(id)).toBe(600);
    expect((await gasto(id)).estado_pago).toBe('P');
  });

  test('pagar más que el saldo se rechaza', async () => {
    const r = await pagar(contador, id, { monto: 600.01, cuenta: 'caja' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/mayor que el saldo pendiente/);
  });

  test('el resto desde Caja deja el gasto pagado y fuera de Cuentas por pagar', async () => {
    const r = await pagar(contador, id, { monto: 600, cuenta: 'caja' });
    expect(r.body).toMatchObject({ saldo: 0, pagada: true });
    expect(await lineasDelPago(r.body.pago_id)).toEqual([
      { clave: 'caja', debe: 0, haber: 600 },
      { clave: 'cxp', debe: 600, haber: 0 },
    ]);
    expect((await gasto(id)).estado_pago).toBe('C');
    expect(await saldoCxp(id)).toBeUndefined();
  });

  test('un gasto ya pagado no se puede volver a pagar', async () => {
    const r = await pagar(contador, id, { monto: 1, cuenta: 'caja' });
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/ya está pagado/);
  });

  test('Cuentas por pagar queda en cero para este gasto: lo que se acreditó se debitó', async () => {
    const neto = await B.valor(
      `SELECT COALESCE(SUM(l.haber - l.debe), 0)::numeric FROM partida_lineas l
         JOIN plan_cuentas c ON c.id = l.cuenta_id AND c.clave = 'cxp'
         JOIN partidas p ON p.id = l.partida_id
        WHERE (p.origen_tipo = 'gasto' AND p.origen_id = $1)
           OR (p.origen_tipo = 'pago_proveedor' AND p.origen_id IN (SELECT id FROM pagos_proveedores WHERE gasto_id = $1))`, [id]
    );
    expect(Number(neto)).toBe(0);
  });
});

describe('anular un gasto', () => {
  test('un gasto pagado se anula con la contrapartida exacta y sale de los totales', async () => {
    const id = (await registrar(contador, { categoria: 'logistica', descripcion: 'Flete equivocado', monto: 320, estado: 'C', cuenta: 'caja' })).body.gasto_id;
    const original = await lineasDelGasto(id);
    const r = await H.json.post(contador, `/finanzas/gastos/${id}/anular`, { motivo: 'Se registró dos veces' });
    expect(r.status).toBe(200);
    const contra = await B.lineasDePartida(
      "p.reversa_de = (SELECT id FROM partidas WHERE origen_tipo = 'gasto' AND origen_id = $1 AND reversa_de IS NULL)", [id]
    );
    expect(contra).toEqual(original.map((l) => ({ clave: l.clave, debe: l.haber, haber: l.debe })).sort((a, b) => a.clave.localeCompare(b.clave)));
    expect((await gasto(id)).anulado).toBe(true);
    // La auditoría guarda quién y por qué
    const a = await B.valor("SELECT descripcion FROM auditoria WHERE accion = 'anular_gasto' AND entidad_id = $1", [id]);
    expect(a).toBe(`Anuló el gasto #${id}: Se registró dos veces`);
  });

  test('un gasto con pagos vigentes NO se anula; anulado el pago, sí, y Cuentas por pagar se compensa', async () => {
    // Preparar: gasto por pagar con un pago parcial
    const id = (await registrar(contador, { categoria: 'operativos', descripcion: 'Servicio de limpieza', monto: 500, estado: 'P' })).body.gasto_id;
    const pago = (await pagar(contador, id, { monto: 200, cuenta: 'caja' })).body;
    // Actuar y comprobar: el rechazo
    const rechazo = await H.json.post(contador, `/finanzas/gastos/${id}/anular`, {});
    expect(rechazo.status).toBe(422);
    expect(rechazo.body.error).toMatch(/tiene pagos registrados/);
    expect((await gasto(id)).anulado).toBe(false);
    // Anular el pago: su propia contrapartida y el saldo vuelve
    expect((await H.json.post(contador, `/finanzas/cxp/pagos/${pago.pago_id}/anular`, { motivo: 'Pago duplicado' })).status).toBe(200);
    expect(await saldoCxp(id)).toBe(500);
    // Ahora sí: se anula el gasto y sale de Cuentas por pagar
    expect((await H.json.post(contador, `/finanzas/gastos/${id}/anular`, { motivo: 'Ya no se contrató' })).status).toBe(200);
    expect(await saldoCxp(id)).toBeUndefined();
    const cuentas = await B.consulta(
      `SELECT c.clave, SUM(l.debe - l.haber)::numeric AS neto FROM partida_lineas l
         JOIN plan_cuentas c ON c.id = l.cuenta_id JOIN partidas p ON p.id = l.partida_id
        WHERE p.id IN (SELECT x.id FROM partidas x WHERE (x.origen_tipo = 'gasto' AND x.origen_id = $1)
                          OR (x.origen_tipo = 'pago_proveedor' AND x.origen_id = $2))
           OR p.reversa_de IN (SELECT x.id FROM partidas x WHERE (x.origen_tipo = 'gasto' AND x.origen_id = $1)
                          OR (x.origen_tipo = 'pago_proveedor' AND x.origen_id = $2))
        GROUP BY c.clave`, [id, pago.pago_id]
    );
    // Entre el gasto, el pago y sus dos anulaciones, cada cuenta suma cero
    expect(cuentas.map((c) => [c.clave, Number(c.neto)])).toEqual(expect.arrayContaining([['caja', 0], ['cxp', 0], ['gasto_operativos', 0]]));
    expect(cuentas.every((c) => Number(c.neto) === 0)).toBe(true);
  });

  test('un gasto anulado no se puede pagar ni anular otra vez', async () => {
    const id = (await registrar(contador, { categoria: 'otros', descripcion: 'Para anular', monto: 75, estado: 'P' })).body.gasto_id;
    await H.json.post(contador, `/finanzas/gastos/${id}/anular`, {});
    expect((await pagar(contador, id, { monto: 75, cuenta: 'caja' })).status).toBe(422);
    const r = await H.json.post(contador, `/finanzas/gastos/${id}/anular`, {});
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/ya está anulado/);
  });
});

describe('lo que ve la persona', () => {
  test('la lista de gastos dice cuánto se ha pagado, el saldo y de qué cuenta salió', async () => {
    const pagadoCaja = (await registrar(admin, { categoria: 'otros', descripcion: 'Agua purificada', monto: 90, estado: 'C', cuenta: 'caja' })).body.gasto_id;
    const parcial = (await registrar(admin, { categoria: 'otros', descripcion: 'Alquiler de toldo', monto: 300, estado: 'P' })).body.gasto_id;
    await pagar(admin, parcial, { monto: 100, cuenta: 'bancos' });
    const r = await H.json.get(admin, '/finanzas/movimientos/datos?tipo=gastos');
    const fila = (id) => r.body.filas.find((f) => f.id === id);
    expect(fila(pagadoCaja)).toMatchObject({ estado: 'C', cuenta: 'Caja general', movido: 0 });
    expect(fila(parcial)).toMatchObject({ estado: 'P', movido: 100, pagos: 1 });
  });

  test('"Ver asiento contable" de un gasto muestra el gasto, sus pagos y sus anulaciones, y nada más', async () => {
    const id = (await registrar(admin, { categoria: 'otros', descripcion: 'Rótulo nuevo', monto: 2000, estado: 'P' })).body.gasto_id;
    const pago = (await pagar(admin, id, { monto: 500, cuenta: 'caja' })).body;
    await H.json.post(admin, `/finanzas/cxp/pagos/${pago.pago_id}/anular`, { motivo: 'Error de monto' });
    const r = await H.json.get(contador, `/finanzas/partidas/datos?gasto=${id}`);
    expect(r.status).toBe(200);
    expect(r.body.partidas.map((p) => p.origen_tipo).sort()).toEqual(['anulacion', 'gasto', 'pago_proveedor']);
    const pagina = await contador.get(`/finanzas/partidas?gasto=${id}`);
    expect(pagina.status).toBe(200);
    expect(pagina.text).toMatch(/data-filtro-gasto/);
    expect(pagina.text).toContain('"filtroGasto":{"id":' + id);
  });

  test('la pantalla de movimientos ofrece Pagar y Ver asiento a quien tiene permiso', async () => {
    const r = await admin.get('/finanzas/movimientos');
    expect(r.status).toBe(200);
    expect(r.text).toMatch(/data-pagar-gasto/);
    expect(r.text).toMatch(/id="modal-pagar-gasto"/);
    expect(r.text).toContain('"permisos":{"crear":true,"anular":true,"verAsiento":true}');
  });

  test('al final de todo el flujo, cada partida y la balanza cuadran', async () => {
    expect(await B.balanzaCuadra()).toBe(true);
  });
});
