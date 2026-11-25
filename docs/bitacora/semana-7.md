# Bitácora de la semana 7: calidad comprobable

**Periodo:** 23 al 29 de noviembre de 2026  ·  **Horas dedicadas:** 20  ·  **Entregas:** pruebas automatizadas (unitarias, de integración y E2E), pipeline de GitHub Actions, tercer flujo completo (registro y pago de gastos) y [`docs/pruebas.md`](../pruebas.md)

**Meta de la semana:** que la calidad de Andeliza deje de depender de que alguien se acuerde de probar a mano. Hasta la semana 6 las pruebas existían, pero vivían fuera del repositorio y se corrían a mano antes de cada entrega. Desde esta semana viven en `tests/`, corren solas en cada `push` y cada Pull Request, y una prueba en rojo impide fusionar en `main`.

## Estrategia de pruebas

La estrategia completa está en [`docs/pruebas.md`](../pruebas.md). En resumen: no se buscó cubrir líneas de código, sino **los cuatro focos donde un error cuesta más**, cada uno con el nivel de prueba que lo detecta mejor.

| Foco | Nivel | Dónde |
|---|---|---|
| Dinero (a qué cuenta va cada peso, contrapartida exacta, ISV) | Integración contra PostgreSQL + unitarias | `dinero-ventas`, `anulacion`, `gastos`, `totales` |
| Reglas de negocio (abonos, stock exacto, validaciones) | Integración por HTTP y directo en la base + unitarias | `anulacion`, `gastos`, `validar`, `errores` |
| Permisos (vendedor y contador sin acceso) | Integración HTTP con sesión real de cada rol | `permisos` |
| Flujo central (cobrar en efectivo de punta a punta) | Extremo a extremo con Playwright | `flujo-venta` |

En total son **31 unitarias (8 de ellas, de las guardas de aislamiento), 53 de integración y 1 E2E**. Algunos archivos cubren dos focos: anular una factura con abonos es una regla y también una cuestión de dinero.

Tres decisiones dieron forma a la estrategia:

- **Las pruebas de dinero van contra la base real, no contra un simulacro.** La partida doble vive en funciones de PostgreSQL; simularla probaría el simulacro. Cada prueba cobra por HTTP como el punto de venta y después lee cada línea de la partida.
- **Las reglas se prueban por los dos caminos:** por HTTP (la persona recibe un 422 con un mensaje claro) y llamando a la función de la base directamente, para confirmar que la regla se cumple aunque alguien se salte la aplicación.
- **Una sola prueba E2E, la del flujo central.** Es la más lenta y la más frágil de mantener; se eligió la que más veces al día hace la dueña: entrar, cobrar en efectivo y ver el comprobante. Usa selectores por rol y texto, no por clases CSS.

## Qué hicimos

### 1. Infraestructura de pruebas

- **Jest** con dos proyectos (`unit` e `integracion`), **Supertest** para llamar a la aplicación Express sin abrir un puerto y **Playwright** para la E2E. Son dependencias de desarrollo: no llegan a Vercel.
- Scripts nuevos en `package.json`: `test`, `test:unit`, `test:integration`, `test:e2e` y `test:db`.
- **La base de pruebas se arma sola.** `tests/soporte/base.js` la borra y la reconstruye con las migraciones 01 → 09, `functions.sql` y `tests/fixtures/datos-prueba.sql` (usuarios de los cuatro roles, productos simples, con tallas y un kit, contabilidad iniciada). Tarda menos de medio segundo, así que cada archivo de pruebas empieza desde cero y ninguno depende de otro.
- **Dos cambios pequeños en `app.js`** para poder probarla: con `NODE_ENV=test` no lee `.env`, y solo abre el puerto cuando se ejecuta directamente (en Vercel y en Supertest la app se importa).
- `.env.test.example` versionado y `.env.test` en `.gitignore`.

### 2. Las pruebas

- `tests/unit/`: cálculo de totales e ISV en centavos, validación de montos, fechas y métodos de pago, el manejador de errores (un rechazo de la base llega como 422 con su mensaje) y las guardas de aislamiento.
- `tests/integration/dinero-ventas.test.js`: efectivo → Caja, tarjeta y transferencia → Bancos, crédito → Cuentas por cobrar, la partida completa (ventas, ISV, costo contra inventario), métodos inválidos y «Marcar pagada» con transferencia.
- `tests/integration/anulacion.test.js`: contrapartida exacta línea por línea, stock exacto de producto, talla y componentes del kit, nada borrado, auditoría, doble anulación, y **el rechazo explícito de una factura con abonos vigentes** por HTTP y directo en la base, comprobando que el rechazo no cambia nada.
- `tests/integration/permisos.test.js`: el vendedor recibe 403 en `/finanzas` (página y rutas de datos) y al intentar anular, el contador también, el supervisor sí puede (control positivo) y los intentos quedan en la auditoría.
- `tests/e2e/flujo-venta.spec.js`: iniciar sesión como administrador → Punto de venta → agregar un producto → Efectivo → Cobrar → «Venta registrada», «Comprobante interno», «Pagó con Efectivo»; y en la base, una venta más, el stock con una unidad menos y el dinero en Caja.

### 3. Tercer flujo completo: registro y pago de gastos

La parte contable ya existía (`registrar_gasto`, `registrar_pago_proveedor`, `anular_gasto`), pero el flujo estaba partido en dos pantallas: el gasto se registraba en *Movimientos* y se pagaba en *Cuentas por pagar*, sin forma de ver desde el gasto cuánto faltaba ni su asiento. El toque final:

- **Pagar desde el propio gasto.** En *Finanzas → Movimientos → Gastos*, un gasto por pagar tiene el botón **Pagar**: muestra total, pagado y saldo, propone el saldo como monto, permite pagar una parte y elegir Caja o Bancos, y explica la partida que se registra (Cuentas por pagar / Caja o Bancos).
- **El estado dice más.** Debajo de la condición se lee «Saldo L 900.00 de L 1,500.00» en un pago parcial, o «Salió de Caja general» en un gasto pagado al registrarlo.
- **«Ver asiento contable» del gasto**, como el de las facturas en la semana 6: abre el libro diario filtrado con el gasto, sus pagos y sus anulaciones.
- **Anular avisa antes.** Si el gasto tiene pagos, la ventana explica que hay que anularlos primero en Cuentas por pagar y no ofrece confirmar. La auditoría ahora guarda el motivo de la anulación.
- **Los botones respetan los permisos:** Nuevo y Pagar (`finanzas.crear`), Anular (`finanzas.eliminar`), Ver asiento (`finanzas.ver`). Las rutas los siguen exigiendo en el servidor.

No hizo falta migración: todo es código de la aplicación sobre funciones que ya existían. Sus 21 pruebas están en `tests/integration/gastos.test.js` (tabla completa en `docs/pruebas.md`).

### 4. Pipeline de integración continua

`.github/workflows/ci.yml` corre en cada `push` y en cada Pull Request hacia `main`. Prepara Node.js, hace `npm ci`, revisa la sintaxis de los 104 archivos `.js` y comprueba con las guardas que la base es de pruebas. Después levanta `postgres:15`, aplica con `psql` las migraciones 01 → 09 y `functions.sql`, corre `npm test`, instala Chromium y corre `npm run test:e2e`. Si algo falla, guarda el reporte de Playwright.

Corre en **Node 20 y Node 24** a la vez. El pedido decía Node 20, pero `package.json` declara `"engines": { "node": "24.x" }`, que es la versión con la que Vercel ejecuta producción. Probar solo en 20 dejaba sin cubrir la versión real; probar en las dos cumple el pedido y cubre producción. Además, con Node 20 la librería `@supabase/supabase-js` ya avisa que dejará de ser compatible con esa versión: las pruebas pasan, pero el aviso aparece en el registro del pipeline y confirma que la versión que importa es la 24.

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Probar el dinero contra PostgreSQL real | Simular la base (mocks) | Las reglas contables viven en la base; un mock no las ejecuta. |
| Reconstruir la base en cada archivo de pruebas | Una base compartida que se limpia con `TRUNCATE` | Tarda menos de medio segundo, deja cada archivo independiente y prueba de paso las migraciones. |
| Datos propios en `tests/fixtures/` | Usar `db/seed.sql` | El seed de desarrollo cambia con la demostración; las pruebas necesitan datos estables y nombrados para lo que prueban. |
| Pruebas en serie (`maxWorkers: 1`) | En paralelo | Una sola base; en serie siguen tardando unos 5 segundos. |
| Playwright 1.63.0 fijo | La última versión | Coincide con el navegador instalado en el equipo de desarrollo; en el pipeline se instala el que corresponde. |
| Revisión de sintaxis con `node --check` | ESLint | ESLint era opcional; configurarlo para Node, el navegador y Alpine en todo el código existente habría llenado la semana de avisos de estilo. Queda como deuda. |
| Sin migración 10 para los gastos | Guardar quién y cuándo anuló en la tabla `gastos` | La auditoría ya guarda quién, cuándo y ahora el motivo; una migración obligaba a otra ventana de despliegue en dos bases de producción. |

## Resultados de las pruebas

| Prueba | Resultado |
|---|---|
| Unitarias | **31 de 31** (menos de 0.1 s) |
| Integración | **53 de 53** (alrededor de 1 s por archivo, con la base reconstruida) |
| Extremo a extremo (Chromium) | **1 de 1** (unos 5 s) |
| Mismas pruebas en **Node 20**, **Node 22** y **Node 24** | Todas en verde |
| Mismas pruebas con **PostgreSQL 15** y **16** | Todas en verde |
| Simulación del pipeline en una copia limpia (`npm ci`, sintaxis, guardas, `psql` 01 → 09, `npm test`, E2E) con Node 20 y 24 sobre PostgreSQL 15 | Todos los pasos en verde |
| `ci.yml` revisado con **actionlint** y **action-validator** | Sin errores |
| Prueba de mutaciones: 8 reglas rotas a propósito | **8 de 8 detectadas** (detalle en `docs/pruebas.md`) |
| Revisión del flujo de gastos en Chromium (registrar, pagar una parte, intentar anular con pagos, ver asiento, celular) | 9 de 9, sin errores de JavaScript |

## Problemas encontrados y cómo se resolvieron

- **`app.js` abría el puerto al importarlo.** Con Supertest eso deja el proceso de Jest colgado. Ahora solo escucha cuando se ejecuta directamente; en Vercel nada cambia.
- **El `.env` del desarrollador podía colarse en las pruebas.** `dotenv` no pisa variables existentes, pero sí rellena las que falten. Si `.env.test` no definía `SUPABASE_URL`, las pruebas habrían tomado la de producción. Con `NODE_ENV=test` ya no se lee `.env`, y las credenciales de Storage se fuerzan a vacío.
- **La pantalla de acceso cambió en la semana 6** (el botón dice «Acceder» y el ojo de la contraseña tiene la etiqueta «Mostrar contraseña»). `getByLabel('Contraseña')` encontraba dos elementos; se usa `exact: true`. Es justamente el tipo de cambio que los selectores por texto y rol aguantan mejor que las clases CSS.
- **Contar «pruebas fallidas» con el símbolo equivocado.** El primer guion de mutaciones decía «detectada» con 0 pruebas fallidas, porque buscaba un símbolo que Jest no imprime en ese modo. Se revisó la salida a mano, se corrigió el conteo y se repitieron las 8 mutaciones.

## Uso de inteligencia artificial

**Herramienta.** Claude (Anthropic) como asistente de programación, en una sesión de trabajo sobre una copia del repositorio con un PostgreSQL local. No tuvo acceso a las bases de producción ni permiso para publicar en GitHub: la rama, el Pull Request, la protección de `main` y el release los hace el autor.

**Qué pedí.** Escribí el pedido de la semana a partir de la rúbrica: configurar Jest, Supertest y Playwright con `.env.test` y los scripts de prueba, sin depender de datos de producción. También pedí:

- **Las pruebas por foco de riesgo**, con sus casos concretos:
  - `contabilizar_venta` hacia Bancos o Caja;
  - la contrapartida exacta de `anular_venta`;
  - el rechazo con abonos vigentes;
  - el stock exacto;
  - el vendedor con 403 en `/finanzas` y al anular;
  - la E2E de cobro en efectivo.
- **El tercer flujo de gastos** con partida doble y sus propias pruebas.
- **El pipeline** con `postgres:15`, migraciones 01 → 09, `npm test` y `npm run test:e2e`, usando variables de entorno y nunca la URL de producción.
- **La documentación:** `docs/pruebas.md` y esta bitácora.

**Qué se ajustó respecto del pedido.**

- **Node 20 y 24 en el pipeline**, en lugar de solo 20, porque producción corre en 24 (`package.json`).
- **ESLint quedó fuera** (era opcional); en su lugar, el pipeline revisa la sintaxis de todos los `.js` sin agregar otra dependencia.
- **El flujo de gastos no necesitó migración:** la contabilidad ya estaba completa, y el toque final fue de pantalla (pagar desde el gasto, saldo, ver asiento, aviso al anular).
- **Se agregaron guardas que el pedido no detallaba:** la URL tiene que ser local, la base tiene que terminar en `_test` y `.env` no se lee.
- **Se agregó una prueba de mutaciones** para comprobar que las pruebas detectan errores, no solo que pasan.

**Cómo se verificó que las pruebas no usan datos de producción.**

1. **Con la URL del pooler de Supabase** en `DATABASE_URL`, las pruebas se detuvieron antes de conectarse («la URL apunta a Supabase»).
2. **Con una base local sin `_test`**, Playwright ni siquiera arrancó el servidor.
3. **Con un `.env` que apuntaba a otra base local**, que tenía una tabla marcadora, las 53 pruebas de integración corrieron contra `andeliza_test` y la tabla marcadora siguió intacta.
4. **En el pipeline**, la única base es el contenedor `postgres:15` del propio job; el workflow no tiene secretos.
5. **Los datos de prueba son inventados** (`tests/fixtures/datos-prueba.sql`) y no hay ningún dato de JCL Sport ni de Las Flores en `tests/`.

**Lo que reviso yo antes de fusionar:**

1. Leer el diff del PR.
2. Correr `npm test` y `npm run test:e2e` en mi equipo con mi `.env.test`.
3. Ver el pipeline en verde en GitHub.
4. Activar la protección de `main` con los dos checks.
5. Probar en la vista previa de Vercel un gasto por pagar, un pago parcial y «Ver asiento contable».

## Qué aprendimos

- **Una prueba que nunca falló no demuestra nada.** Romper las reglas a propósito fue lo que dio confianza: las 8 mutaciones se detectaron, y el primer intento de contarlas mostró que hasta el guion de verificación necesitaba verificación.
- **Probar el dinero en la base es más simple de lo que parecía.** Reconstruir la base tarda menos de medio segundo; no hizo falta ningún simulacro.
- **Los selectores por texto obligan a escribir bien la interfaz.** Si un botón no tiene un nombre claro, la prueba no lo encuentra, y la persona tampoco.
- **El aislamiento no es una sola regla, son capas:** el nombre de la base, el servidor, el `.env` que no se lee y el contenedor desechable. Cada capa cubre un error distinto.

## Lo que falta y deuda declarada

- **Fusionar el PR, activar la protección de `main`** (los checks «Pruebas (Node 20)» y «Pruebas (Node 24)») y crear el release `semana-7`.
- **Probar en producción** el pago de un gasto desde Movimientos y «Ver asiento contable» del gasto, en las dos instancias.
- **Más E2E:** anulación de una factura y pago de un gasto, ahora que la base de pruebas lo hace fácil.
- **ESLint** con una configuración para Node, el navegador y Alpine.js.
- **Pruebas del contenido de los PDF** y de concurrencia (dos cajeros con el último artículo).
- **Sigue la deuda anterior:** CSS compilado en lugar del CDN (también le quitaría fragilidad a la E2E), token CSRF, comisión de las tarjetas, nota de crédito y revalidar H3 con P1.

## Evidencia

- Pipeline: la pestaña *Actions* del repositorio, con los checks «Pruebas (Node 20)» y «Pruebas (Node 24)» en el PR de esta semana.
- Pruebas: `tests/` y `docs/pruebas.md` (incluye la tabla de mutaciones).
- [`evidencias/semana-7/resultado-pruebas.txt`](../evidencias/semana-7/resultado-pruebas.txt): la salida completa de `npm test -- --verbose` y `npm run test:e2e`, con el nombre de cada una de las 85 pruebas.
- Capturas del flujo de gastos, tomadas con los datos inventados de la base de pruebas, en [`evidencias/semana-7/`](../evidencias/semana-7/):
  - `gasto-pagar-una-parte.png`: pagar una parte de un gasto desde Movimientos.
  - `gastos-saldo-y-acciones.png`: la lista con el saldo y las acciones.
  - `gasto-anular-con-pagos.png`: el aviso al intentar anular un gasto con pagos.
  - `libro-diario-de-un-gasto.png`: el libro diario filtrado con el gasto y su pago.
  - `gastos-celular.png`: la vista en celular.
