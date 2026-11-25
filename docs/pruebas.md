# Estrategia de pruebas de Andeliza ERP

Andeliza maneja dinero, impuestos e inventario de negocios reales (JCL Sport y Las Flores). Un error no se ve como una pantalla rota: se ve como un asiento descuadrado, una factura anulada que dejó el stock mal o un vendedor que entró donde no debía. Por eso las pruebas no buscan cubrir líneas de código: buscan cubrir **los cuatro focos donde un error cuesta más**, cada uno con el nivel de prueba que lo detecta mejor.

| Qué | Dónde |
|---|---|
| Pruebas unitarias | [`tests/unit/`](../tests/unit/) (Jest) |
| Pruebas de integración | [`tests/integration/`](../tests/integration/) (Jest + Supertest + PostgreSQL) |
| Prueba de extremo a extremo | [`tests/e2e/`](../tests/e2e/) (Playwright) |
| Base y datos de prueba | [`tests/soporte/`](../tests/soporte/), [`tests/fixtures/datos-prueba.sql`](../tests/fixtures/datos-prueba.sql) |
| Pipeline | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |

## 1. Los cuatro focos de riesgo

| Foco | Qué puede salir mal | Nivel que lo cubre | Dónde |
|---|---|---|---|
| **Dinero** | Una venta con tarjeta que entra a Caja; un ISV redondeado distinto al de la base; una contrapartida que no invierte el Debe y el Haber; el pago de un gasto que no baja Cuentas por pagar | Integración con la base (cada línea de la partida) y unitarias (cálculo en centavos) | `integration/dinero-ventas.test.js`, `integration/anulacion.test.js`, `integration/gastos.test.js`, `unit/totales.test.js` |
| **Reglas de negocio** | Anular una factura con abonos; devolver mal el stock de un kit; anular dos veces; aceptar un monto con 3 decimales o un método de pago que el negocio no tiene | Integración (por HTTP y llamando a la función de la base directamente) y unitarias (validación de entrada) | `integration/anulacion.test.js`, `integration/gastos.test.js`, `unit/validar.test.js`, `unit/errores.test.js` |
| **Permisos** | Un vendedor que abre Finanzas o anula una factura escribiendo la dirección a mano | Integración HTTP con sesión real de cada rol | `integration/permisos.test.js` |
| **Flujo central** | La pantalla de cobro no agrega el producto, no cobra o no muestra el comprobante, aunque todo lo de abajo funcione | Extremo a extremo con un navegador real | `e2e/flujo-venta.spec.js` |

Además, `unit/guardas.test.js` cubre lo que protege a todo lo anterior: que las pruebas nunca puedan correr contra una base real (sección 4).

| Archivo | Nivel | Foco principal | Pruebas |
|---|---|---|---|
| `tests/unit/totales.test.js` | Unitaria | Dinero | 6 |
| `tests/unit/validar.test.js` | Unitaria | Reglas | 12 |
| `tests/unit/errores.test.js` | Unitaria | Reglas | 5 |
| `tests/unit/guardas.test.js` | Unitaria | Aislamiento | 8 |
| `tests/integration/dinero-ventas.test.js` | Integración | Dinero | 10 |
| `tests/integration/anulacion.test.js` | Integración | Dinero y reglas | 14 |
| `tests/integration/permisos.test.js` | Integración | Permisos | 8 |
| `tests/integration/gastos.test.js` | Integración | Dinero y reglas (tercer flujo) | 21 |
| `tests/e2e/flujo-venta.spec.js` | Extremo a extremo | Flujo central | 1 |

**En total: 31 unitarias, 53 de integración y 1 de extremo a extremo.** Las 84 de Jest corren en unos 5 segundos (cada archivo de integración, alrededor de 1 segundo con la base reconstruida) y la E2E en unos 5.

### Por qué cada foco tiene ese nivel

- **Dinero va contra la base, no contra un simulacro.** La partida doble, el stock y la numeración viven en funciones de PostgreSQL ([ADR 001](decisiones/001-stack-vercel-supabase.md)). Simular la base probaría el simulacro. Las pruebas cobran por HTTP como lo hace el punto de venta y después leen **cada línea de la partida** en la base.
- **Las reglas se prueban por los dos caminos.** Por HTTP (lo que ve la persona: un 422 con un mensaje claro) y llamando a la función de la base directamente, para comprobar que la regla vive en la base y se cumple aunque alguien se salte la aplicación.
- **Los permisos se prueban con sesiones reales** de los cuatro roles, porque el riesgo no es que el botón se vea, sino que la ruta responda.
- **El flujo central tiene una sola prueba E2E**, la más valiosa: es la que más se repite en el día y la única que ejerce juntos el navegador, Alpine.js, el servidor y la base. Las E2E son las más lentas y frágiles; por eso hay una, bien hecha, y no muchas.

## 2. Ejemplos de cada foco

Todas siguen el patrón **Preparar → Actuar → Comprobar**. Los fragmentos están tomados de las pruebas, con los comentarios agregados aquí y algunas comprobaciones omitidas para que se lean mejor.

**Dinero** — `tests/integration/dinero-ventas.test.js`

```js
test('una venta con tarjeta carga Bancos por el total y no toca Caja', async () => {
  // Preparar
  const camiseta = await B.idProducto('PRU-CAM');
  // Actuar: se cobra por HTTP, igual que el punto de venta
  const r = await cobrar(vendedor, [{ producto_id: camiseta, cantidad: 1 }], { metodo_pago: 'tarjeta' });
  expect(r.status).toBe(201);
  // Comprobar: en la base, línea por línea
  const lineas = await lineasDeVenta(r.body.venta.id);
  expect(debeEn(lineas, 'bancos')).toBe(r.body.venta.total);
  expect(lineas.some((l) => l.clave === 'caja')).toBe(false);
});
```

**Dinero** — la contrapartida exacta, `tests/integration/anulacion.test.js`

```js
test('la contrapartida es la partida original con el Debe y el Haber invertidos, línea por línea', async () => {
  const original = await B.lineasDePartida('p.id = $1', [await partidaDeVenta(venta.id)]);
  const contra = await B.lineasDePartida('p.id = $1', [respuesta.body.partida_anulacion_id]);
  expect(contra).toEqual(invertir(original));
});
```

**Reglas de negocio** — anular con abonos vigentes se rechaza de forma explícita

```js
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
```

Y otra prueba comprueba que ese rechazo **no cambió nada**: ni la venta, ni el stock, ni la contabilidad.

**Reglas de negocio** — el stock exacto: una venta con un producto simple, una talla y tres kits (cada kit lleva 1 gorra y 2 medias) se anula, y el stock de los cuatro artículos vuelve exactamente al valor anterior.

**Permisos** — `tests/integration/permisos.test.js`

```js
test('el vendedor recibe 403, aunque sea su propia venta, y la factura sigue vigente', async () => {
  const r = await H.json.post(vendedor, `/facturas/${ventaId}/anular`, { motivo: 'Intento del vendedor' });
  expect(r.status).toBe(403);
  expect(await B.valor('SELECT anulada FROM ventas WHERE id = $1', [ventaId])).toBe(false);
});
```

Cada grupo de permisos tiene un **control positivo** (el supervisor sí puede): sin él, una ruta rota para todos pasaría la prueba del 403.

**Flujo central** — `tests/e2e/flujo-venta.spec.js`, con selectores por rol y por texto, como los ve la persona:

```js
await page.getByLabel('Usuario').fill('admin');
await page.getByLabel('Contraseña', { exact: true }).fill('Pruebas.2026');
await page.getByRole('button', { name: 'Acceder' }).click();
await page.getByRole('link', { name: 'Punto de venta' }).first().click();
await page.getByRole('button', { name: /^Agregar Producto para la prueba/ }).click();
await page.getByRole('radio', { name: 'Efectivo' }).click();
await page.getByRole('button', { name: /^Cobrar L/ }).click();
const comprobante = page.getByRole('status').filter({ hasText: 'Venta registrada' });
await expect(comprobante.getByText('Pagó con Efectivo')).toBeVisible();
await expect.poll(() => B.stockProducto('E2E-001')).toBe(stockAntes - 1);
```

No usa ninguna clase CSS: si mañana cambia el diseño, la prueba sigue valiendo mientras la persona siga viendo «Acceder», «Efectivo» y «Venta registrada».

## 3. El tercer flujo: registro y pago de gastos

`tests/integration/gastos.test.js` recorre el flujo completo por HTTP y revisa la partida doble de cada paso:

| Paso | Partida esperada | Comprobado |
|---|---|---|
| Gasto pagado en efectivo | Debe Gasto de su categoría / Haber Caja | ✔ |
| Gasto pagado desde el banco | Debe Gasto / Haber Bancos | ✔ |
| Gasto por pagar | Debe Gasto / Haber Cuentas por pagar, y aparece en Cuentas por pagar | ✔ |
| Pago parcial y pago del resto | Debe Cuentas por pagar / Haber Caja o Bancos; el saldo baja y al final el gasto queda pagado | ✔ |
| Pagar más que el saldo, o un gasto ya pagado | Se rechaza (422) | ✔ |
| Anular un gasto | La contrapartida exacta; la auditoría guarda el motivo | ✔ |
| Anular un gasto con pagos vigentes | Se rechaza; anulado el pago, sí se anula y cada cuenta suma cero | ✔ |
| Validaciones | Categoría inexistente, monto cero, 3 decimales, sin descripción, sin cuenta, vencimiento anterior | ✔ |
| Lo que ve la persona | Saldo y cuenta en la lista, «Ver asiento contable» del gasto, botón Pagar según el permiso | ✔ |

## 4. Aislamiento de datos: por qué nunca se prueba contra producción

Las pruebas **borran y vuelven a crear** su base en cada corrida. Correrlas contra una base real sería destruir los datos de un cliente. Hay también otras razones:

- **Privacidad.** Las bases de JCL Sport y Las Flores tienen clientes, ventas y contabilidad reales. Una prueba no tiene por qué leerlos.
- **Consecuencias fiscales.** Una venta de prueba en Las Flores consumiría un número del rango CAI autorizado por el SAR, que no se puede devolver.
- **Repetibilidad.** Una prueba solo sirve si da el mismo resultado hoy y mañana. Con datos que cambian solos (las ventas del día), un fallo podría ser del código o de los datos.

**Cómo se garantiza**, en capas:

1. **Una base propia.** Se llama `andeliza_test`, vive en la máquina (o en el contenedor del pipeline) y se arma desde cero con las mismas migraciones 01 → 09 y `functions.sql` que producción, más los datos inventados de `tests/fixtures/datos-prueba.sql`.
2. **Guardas antes de tocar nada** (`tests/soporte/guardas.js`). Las pruebas se detienen si `DATABASE_URL` menciona Supabase, si el servidor no es `localhost` o si el nombre de la base no termina en `_test`. Antes de borrar, la propia base confirma con `current_database()` que es de pruebas. Las guardas tienen sus propias pruebas unitarias.
3. **El `.env` nunca se lee en pruebas.** Con `NODE_ENV=test`, `app.js` no carga `.env` (donde puede estar la URL de producción). Las variables salen del pipeline, de `.env.test` (que está en `.gitignore`) o de `.env.test.example`. Las credenciales de Supabase Storage se fuerzan a vacío.
4. **En el pipeline la base es un contenedor desechable** (`postgres:15`) que se crea y se destruye en cada ejecución. El workflow no tiene secretos ni URL de Supabase.

**Cómo se comprobó** (semana 7):

- Con la URL del pooler de Supabase en `DATABASE_URL`, las pruebas se detuvieron con «la URL apunta a Supabase».
- Con una base local sin `_test`, Playwright no arrancó el servidor.
- Con un `.env` que apuntaba a otra base local con una tabla marcadora, las 53 pruebas de integración corrieron contra `andeliza_test` y la tabla marcadora quedó intacta.

## 5. Cómo se sabe que las pruebas detectan errores

Una prueba que sigue en verde cuando el código está mal no protege nada. En la semana 7 se rompió a propósito cada regla importante, una por una, y se corrieron las pruebas (prueba de mutaciones manual):

| Falla introducida a propósito | ¿La detectaron? | Pruebas que fallaron |
|---|---|---|
| La tarjeta va a Caja en vez de Bancos | Sí | 4 |
| La contrapartida no invierte el Debe y el Haber | Sí | 2 |
| Se permite anular una factura con abonos | Sí | 4 |
| La anulación no devuelve el stock de las variantes | Sí | 1 |
| La ruta de anular no exige el permiso `facturas.anular` | Sí | 2 |
| El pago de un gasto no debita Cuentas por pagar | Sí | 3 |
| Se permite anular un gasto con pagos | Sí | 1 |
| El ISV se redondea hacia abajo | Sí | 1 |

Al terminar se restauró cada archivo y todas las pruebas volvieron a pasar.

## 6. Cómo correrlas en local

**Necesitas:** Node.js 20 o superior, PostgreSQL 15 o superior corriendo en `localhost:5432` y una base vacía llamada `andeliza_test`.

```bash
# 1. Una sola vez: la base de pruebas y las variables
createdb -h localhost -U postgres andeliza_test     # o en psql: CREATE DATABASE andeliza_test;
cp .env.test.example .env.test                      # ajusta la contraseña de tu PostgreSQL si no es "postgres"
npm install
npx playwright install chromium                     # el navegador para la prueba E2E

# 2. Cada vez
npm test                    # unitarias + integración (Jest)
npm run test:unit           # solo unitarias (no necesitan base)
npm run test:integration    # solo integración
npm run test:e2e            # extremo a extremo (Playwright arranca el servidor en el puerto 3100)
npm run test:db             # solo reconstruye la base de pruebas, para revisarla a mano
```

No hace falta preparar la base a mano: cada archivo de integración y el servidor E2E la reconstruyen solos (tarda menos de medio segundo). Si una prueba E2E falla, Playwright guarda la traza en `test-results/` (`npx playwright show-trace <archivo>`).

**Convenciones para una prueba nueva:**

- Nombre en español que diga la regla, no la técnica: «una venta con tarjeta carga Bancos…», no «test contabilizar 2».
- Preparar → Actuar → Comprobar, con sus datos propios (no depende del orden ni de otra prueba).
- En dinero, comprobar en la base línea por línea, no solo el código HTTP.
- En permisos, siempre un control positivo además del 403.
- En E2E, selectores por rol, etiqueta o texto visible; nunca por clase CSS.

## 7. Integración continua

El workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) corre en cada `push` y en cada Pull Request hacia `main`:

1. Descarga el código y prepara Node.js (20, la versión pedida para el pipeline, y 24, la que usa Vercel en producción según `package.json`). Con Node 20, `@supabase/supabase-js` muestra un aviso de que dejará de ser compatible con esa versión; no hace fallar nada.
2. `npm ci` con el lockfile.
3. Revisa la sintaxis de todos los archivos `.js`.
4. Comprueba con las guardas que la base es local y de pruebas.
5. Levanta `postgres:15` como servicio y aplica con `psql` las migraciones 01 → 09 y `functions.sql`, igual que se hace en Supabase.
6. `npm test` (unitarias e integración).
7. Instala Chromium y corre `npm run test:e2e`.
8. Si algo falla, guarda el reporte de Playwright como artefacto durante 7 días.

**Proteger `main`** (se configura en GitHub, no en el código): *Settings → Branches → Add branch protection rule* (o *Rulesets*) para `main`, con «Require a pull request before merging» y «Require status checks to pass», marcando los checks **Pruebas (Node 20)** y **Pruebas (Node 24)**. Desde ahí, un PR con una prueba en rojo no se puede fusionar.

## 8. Qué no cubren todavía

- **Pantallas fuera del flujo central.** Facturas, inventario, estadísticas y configuración no tienen E2E. Están cubiertas sus rutas y sus reglas, no su interacción en el navegador.
- **El contenido de los PDF** (que diga «FORMA DE PAGO» o «ANULADA»). Se revisó a la vista en la semana 6, pero no hay una prueba automática.
- **Dependencia del CDN.** La E2E carga Tailwind y Alpine.js desde un CDN; si el CDN falla, la prueba puede fallar sin que el código esté mal. Por eso tiene un reintento en el pipeline, y compilar los estilos sigue en la deuda.
- **Versiones de PostgreSQL.** El pipeline usa la 15, en local se probó con la 15 y la 16, y Supabase administra la suya. Si Supabase cambia de versión, conviene alinear la imagen del pipeline.
- **Concurrencia.** No hay pruebas de dos cajeros cobrando el último artículo al mismo tiempo; lo protege el `FOR UPDATE` de la base, pero no está probado.
