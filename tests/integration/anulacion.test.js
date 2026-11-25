// Focos: DINERO y REGLAS DE NEGOCIO de anular_venta.
//   - La contrapartida es la partida original con el Debe y el Haber invertidos, línea por línea.
//   - El stock vuelve exacto: producto simple, variante y cada componente del kit.
//   - Una factura con abonos vigentes NO se anula (ni por HTTP ni llamando a la base directamente).
const B = require('../soporte/base');
const H = require('../soporte/http');

let vendedor;
let supervisor;
let admin;

beforeAll(async () => {
  await B.prepararBase();
  [vendedor, supervisor, admin] = [await H.entrar('vendedor'), await H.entrar('supervisor'), await H.entrar('admin')];
});
afterAll(async () => { await B.cerrar(); await H.cerrarApp(); });

const cobrar = (agente, items, extra = {}) =>
  H.json.post(agente, '/pos/cobrar', { items, pendiente: false, metodo_pago: 'efectivo', clave: H.claveCobro(), ...extra });
const anular = (agente, id, motivo = 'Prueba automatizada de anulación') => H.json.post(agente, `/facturas/${id}/anular`, { motivo });
const partidaDeVenta = (id) => B.valor("SELECT id FROM partidas WHERE origen_tipo = 'venta' AND origen_id = $1 AND reversa_de IS NULL", [id]);
const invertir = (lineas) => lineas
  .map((l) => ({ clave: l.clave, debe: l.haber, haber: l.debe }))
  .sort((a, b) => a.clave.localeCompare(b.clave) || a.debe - b.debe || a.haber - b.haber);

async function stockDeTodo() {
  return {
    camiseta: await B.stockProducto('PRU-CAM'),
    gorra: await B.stockProducto('PRU-GOR'),
    medias: await B.stockProducto('PRU-MED'),
    tallaM: await B.stockVariante('PRU-TAL-M'),
  };
}

describe('anular_venta: la contrapartida y el stock', () => {
  let venta;
  let antes;
  let despues;
  let respuesta;

  beforeAll(async () => {
    // Preparar: una venta con un producto simple, una variante y un kit (1 gorra + 2 medias por kit)
    antes = await stockDeTodo();
    const r = await cobrar(vendedor, [
      { producto_id: await B.idProducto('PRU-CAM'), cantidad: 2 },
      { producto_id: await B.idProducto('PRU-TAL'), variante_id: await B.idVariante('PRU-TAL-M'), cantidad: 1 },
      { producto_id: await B.idProducto('PRU-KIT'), cantidad: 3 },
    ]);
    expect(r.status).toBe(201);
    venta = r.body.venta;
    despues = await stockDeTodo();
    // Actuar
    respuesta = await anular(supervisor, venta.id, 'El cliente devolvió todo');
  });

  test('la venta descontó lo vendido (control de la preparación)', () => {
    expect(despues).toEqual({ camiseta: antes.camiseta - 2, gorra: antes.gorra - 3, medias: antes.medias - 6, tallaM: antes.tallaM - 1 });
  });

  test('el supervisor la anula y la respuesta dice que se revirtió la contabilidad', () => {
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.contabilidad).toBe('revertida');
    expect(respuesta.body.partida_anulacion_id).toBeGreaterThan(0);
  });

  test('el stock vuelve exactamente a como estaba: producto, variante y cada componente del kit', async () => {
    expect(await stockDeTodo()).toEqual(antes);
  });

  test('la contrapartida es la partida original con el Debe y el Haber invertidos, línea por línea', async () => {
    const original = await B.lineasDePartida('p.id = $1', [await partidaDeVenta(venta.id)]);
    const contra = await B.lineasDePartida('p.id = $1', [respuesta.body.partida_anulacion_id]);
    expect(original.length).toBeGreaterThan(0);
    expect(contra).toEqual(invertir(original));
  });

  test('la contrapartida queda ligada a la original y entre las dos cada cuenta suma cero', async () => {
    const original = await partidaDeVenta(venta.id);
    const contra = await B.consulta('SELECT origen_tipo, reversa_de FROM partidas WHERE id = $1', [respuesta.body.partida_anulacion_id]);
    expect(contra[0]).toEqual({ origen_tipo: 'anulacion', reversa_de: original });
    const descuadradas = await B.valor(
      `SELECT COUNT(*)::int FROM (SELECT cuenta_id FROM partida_lineas WHERE partida_id IN ($1, $2)
        GROUP BY cuenta_id HAVING SUM(debe) <> SUM(haber)) x`, [original, respuesta.body.partida_anulacion_id]
    );
    expect(descuadradas).toBe(0);
    expect(await B.balanzaCuadra()).toBe(true);
  });

  test('no se borra nada: la venta, su detalle y su partida siguen, marcadas y con el motivo', async () => {
    const v = await B.consulta(
      `SELECT anulada, motivo_anulacion, anulada_por, total::numeric AS total,
              (SELECT COUNT(*)::int FROM detalle_venta WHERE venta_id = v.id) AS lineas
         FROM ventas v WHERE id = $1`, [venta.id]
    );
    expect(v[0]).toMatchObject({ anulada: true, motivo_anulacion: 'El cliente devolvió todo', anulada_por: await B.idUsuario('supervisor'), lineas: 3 });
    expect(Number(v[0].total)).toBe(venta.total);
  });

  test('queda la constancia en la auditoría con el stock devuelto', async () => {
    const a = await B.consulta("SELECT usuario_id, detalles FROM auditoria WHERE accion = 'anular_venta' AND entidad_id = $1", [venta.id]);
    expect(a).toHaveLength(1);
    expect(a[0].usuario_id).toBe(await B.idUsuario('supervisor'));
    expect(a[0].detalles.contabilidad).toBe('revertida');
    expect(a[0].detalles.stock_devuelto.length).toBeGreaterThanOrEqual(4);   // camiseta, talla M, gorra y medias
  });

  test('no se puede anular dos veces ni se crea una segunda contrapartida', async () => {
    const r = await anular(supervisor, venta.id, 'Segundo intento');
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/ya está anulada/);
    expect(await B.valor("SELECT COUNT(*)::int FROM partidas WHERE origen_tipo = 'anulacion' AND reversa_de = $1", [await partidaDeVenta(venta.id)])).toBe(1);
  });
});

describe('anular_venta: una factura con abonos vigentes se rechaza', () => {
  let venta;
  let stockAntes;

  beforeAll(async () => {
    // Preparar: venta al crédito con un abono parcial registrado en Cuentas por cobrar
    const cliente = await B.valor("SELECT id FROM clientes WHERE nombre = 'Cliente de Pruebas'");
    venta = (await cobrar(admin, [{ producto_id: await B.idProducto('PRU-GOR'), cantidad: 2 }], { pendiente: true, cliente_id: cliente })).body.venta;
    const abono = await H.json.post(admin, '/finanzas/cxc/abonos', { origen: 'venta', doc_id: venta.id, monto: 50, cuenta: 'caja' });
    expect(abono.status).toBe(201);
    stockAntes = await B.stockProducto('PRU-GOR');
  });

  test('por HTTP: responde 422 con el mensaje de anular primero los abonos', async () => {
    const r = await anular(supervisor, venta.id);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/tiene abonos registrados/);
    expect(r.body.error).toMatch(/Anula primero esos abonos/);
  });

  test('llamando a la base directamente: la función también la rechaza', async () => {
    await expect(B.consulta('SELECT anular_venta($1, $2, $3)', [venta.id, await B.idUsuario('admin'), 'Intento directo en la base']))
      .rejects.toThrow(/tiene abonos registrados/);
  });

  test('el rechazo no cambia nada: ni la venta, ni el stock, ni la contabilidad', async () => {
    expect(await B.valor('SELECT anulada FROM ventas WHERE id = $1', [venta.id])).toBe(false);
    expect(await B.stockProducto('PRU-GOR')).toBe(stockAntes);
    expect(await B.valor("SELECT COUNT(*)::int FROM partidas WHERE origen_tipo = 'anulacion' AND reversa_de = $1", [await partidaDeVenta(venta.id)])).toBe(0);
  });

  test('anulado el abono, la factura sí se anula, vuelve el stock y sale de Cuentas por cobrar', async () => {
    const abono = await B.valor('SELECT id FROM abonos_clientes WHERE venta_id = $1', [venta.id]);
    expect((await H.json.post(admin, `/finanzas/cxc/abonos/${abono}/anular`, { motivo: 'Abono de prueba' })).status).toBe(200);
    const r = await anular(supervisor, venta.id, 'Venta al crédito por error');
    expect(r.status).toBe(200);
    expect(await B.stockProducto('PRU-GOR')).toBe(stockAntes + 2);
    expect(await B.valor("SELECT COUNT(*)::int FROM v_cxc WHERE origen = 'venta' AND doc_id = $1", [venta.id])).toBe(0);
    expect(await B.balanzaCuadra()).toBe(true);
  });
});

describe('anular_venta: otras reglas', () => {
  test('sin motivo, o con menos de 5 caracteres, no se anula', async () => {
    const venta = (await cobrar(vendedor, [{ producto_id: await B.idProducto('PRU-MED'), cantidad: 1 }])).body.venta;
    expect((await H.json.post(supervisor, `/facturas/${venta.id}/anular`, {})).status).toBe(422);
    expect((await anular(supervisor, venta.id, 'ups')).status).toBe(422);
    expect(await B.valor('SELECT anulada FROM ventas WHERE id = $1', [venta.id])).toBe(false);
  });

  test('el número de una factura anulada no se reutiliza', async () => {
    const anulada = (await cobrar(vendedor, [{ producto_id: await B.idProducto('PRU-MED'), cantidad: 1 }])).body.venta;
    expect((await anular(supervisor, anulada.id)).status).toBe(200);
    const siguiente = (await cobrar(vendedor, [{ producto_id: await B.idProducto('PRU-MED'), cantidad: 1 }])).body.venta;
    expect(siguiente.numero_factura).not.toBe(anulada.numero_factura);
    expect(await B.valor('SELECT COUNT(*)::int FROM ventas WHERE numero_factura = $1', [anulada.numero_factura])).toBe(1);
  });
});
