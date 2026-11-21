# Bitácora de la semana 6: arquitectura y oficio diario

**Periodo:** 16 al 22 de noviembre de 2026  ·  **Horas dedicadas:** 24  ·  **Entregas:** método de pago (issue #17), issues #16, #18 y #19, anulación de facturas, nueva pantalla de acceso, arquitectura y ADR

**Meta de la semana:** resolver el hallazgo grave de las pruebas con usuarias (toda venta cobrada se contabilizaba en Caja), poner en producción un **segundo flujo completo** de punta a punta (anular una factura sin borrar nada) y dejar escrita la arquitectura del sistema con sus decisiones como ADR. Todo con la misma regla de las semanas anteriores: cambios aditivos, sin dependencias nuevas, verificados antes de entregarse y sin romper a los dos clientes en producción.

**De dónde salió el trabajo.** La semana 5 cerró con cinco hallazgos de las sesiones con P1 (contadora de JCL Sport) y P2 (Las Flores). El grave, el método de pago, estaba planeado para esta semana. Los tres menores (#16, #18 y #19) estaban repartidos entre las semanas 7 y 9, pero tocan las mismas pantallas (punto de venta, facturas e inventario) y se adelantaron para cerrarlos con una sola migración y un solo ciclo de pruebas. La anulación respondía a otra limitación que dejaron ver las sesiones: la venta cronometrada tuvo que ser real porque el sistema no permitía deshacer una venta.

## Decisiones de arquitectura de la semana

Por primera vez las decisiones que dan forma al sistema quedan registradas como **ADR** en [`docs/decisiones/`](../decisiones/), con contexto, decisión, alternativas y consecuencias:

- [ADR 001](../decisiones/001-stack-vercel-supabase.md): Vercel y Supabase como plataforma, con Node.js, Express y EJS. Se tomó en la semana 1 y se documenta ahora con sus alternativas.
- [ADR 002](../decisiones/002-una-instancia-por-cliente.md): una instancia por cliente con el mismo código. Formaliza la decisión D-07 de la semana 5.
- [ADR 003](../decisiones/003-anulacion-por-contrapartida.md): una factura se anula con una contrapartida contable, nunca se borra. Es la decisión nueva de la semana.

La forma del sistema (contexto, contenedores, tres capas y carpetas) está en [`docs/arquitectura.md`](../arquitectura.md).

## Qué hicimos

### 1. Método de pago en el punto de venta (issue #17, grave)

- El punto de venta pregunta **«¿Cómo paga?»** con tres botones grandes: Efectivo, Tarjeta y Transferencia. Arranca en Efectivo para no agregar un toque a la venta más común, y desaparece si la venta se deja pendiente.
- La partida de la venta depende del método: **efectivo → Debe Caja; tarjeta y transferencia → Debe Bancos; al crédito → Debe Cuentas por cobrar.** La regla está en una sola función de la base, `cuenta_metodo_pago`, que usan la venta y el cobro.
- Los métodos salen del **catálogo maestro** (`client.config.js`, decisión D-08) y cada negocio elige cuáles ofrece en *Configuración → Negocio*. Cheque existe en el catálogo pero viene apagado.
- **«Marcar pagada» en Facturas también pregunta «¿Cómo pagó?».** No estaba en el pedido, pero sin esto el hallazgo seguía abierto: una venta al crédito que el cliente paga después por transferencia habría entrado a Caja.
- La factura en PDF muestra **«FORMA DE PAGO»** y el historial muestra el método debajo del estado. Las ventas anteriores no tienen el dato guardado y no se inventa: la línea no aparece.

### 2. Issues menores

- **#16 · Pista de primer uso.** El texto «Toca un producto para agregarlo» ya existía, pero dentro del carrito, que en celular y tableta no está a la vista. Ahora aparece encima de los productos mientras el carrito está vacío y se va con el primer producto.
- **#18 · Kits más claros.** En el inventario un kit ya no muestra un número de stock como si fueran unidades físicas: dice **«Puedes armar N»** y cuál componente lo limita. En el formulario, una pista arriba («¿Es un combo o paquete…? Conviértelo en kit») lleva a la sección Kit, que ahora explica los tres pasos y agrega la columna «Alcanza para» por componente, con el que limita resaltado.
- **#19 · Ver la partida desde la factura.** Cada factura con asiento tiene el enlace **«Ver asiento contable»** (solo para quien tiene `finanzas.ver`), que abre el libro diario filtrado con la venta, sus cobros y, si se anuló, su contrapartida, con un aviso y el botón «Ver todos los asientos».

### 3. Anulación de facturas (segundo flujo completo)

- Botón **Anular** en Facturas, solo para administrador y supervisor (permiso nuevo `facturas.anular`). La ventana de confirmación explica lo que va a pasar, pide un motivo y, en una factura fiscal, advierte que el número no se reutiliza y que el contador decide si corresponde una nota de crédito.
- La función `anular_venta` hace todo en una transacción: devuelve el stock (producto, variante o cada componente del kit), crea la **contrapartida exacta** de la partida, marca la venta como anulada con quién, cuándo y por qué, y deja la constancia en la auditoría. **No borra nada.**
- Una anulada sigue en el historial con su insignia y su total tachado, tiene su filtro («Solo anuladas») y deja de contar en los totales, en cuentas por cobrar, en el panel y en las estadísticas. Su PDF lleva la franja «DOCUMENTO ANULADO», el sello y la marca de agua.

### 4. Nueva pantalla de acceso

El logo del negocio pasa a ser el protagonista: va en un «rótulo» blanco con una sombra sólida del color de acento, como el letrero de la tienda, sobre un degradado del color primario. El formulario va en una tarjeta con sombra teñida del mismo primario. **No tiene ningún color fijo**: todo sale de la paleta del negocio, así que la pantalla de JCL Sport y la de Las Flores se ven distintas sin tocar código. Además: «Mostrar/Ocultar» la contraseña, aviso de mayúsculas activadas, botón que pasa a «Entrando…» para evitar el doble envío, foco en la contraseña cuando la anterior fue incorrecta y la inicial del negocio si el logo no carga.

### 5. Arquitectura y ADR

[`docs/arquitectura.md`](../arquitectura.md) (diagramas de contexto, de contenedores, de capas y de la secuencia de una anulación, y la estructura de carpetas justificada) y los tres ADR. Se actualizaron también el [modelo de datos](../modelo-datos.md), los [permisos](../permisos.md), la [referencia técnica](../referencia-tecnica.md), el [README de la base](../../db/README.md) y una nota en el [plan](../plan.md).

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| La anulación se marca con un booleano `anulada` | Un tercer estado `A` en `ventas.estado` | `estado` es el estado de pago: una anulada conserva si estaba pagada o pendiente, y no hubo que revisar cada consulta que filtra por `P`. Es el mismo patrón de `ingresos.anulado` y `gastos.anulado` (ADR 003). |
| `detalle_venta.componentes` guarda lo que consumió cada kit | Devolver según la receta actual del kit | Si la receta cambia después de la venta, la anulación devolvería otra cosa. Las ventas anteriores a la 09 se devuelven con la receta actual y la auditoría lo marca. |
| Una factura con abonos no se anula hasta anular los abonos | Anular la factura y sus abonos en cascada | Cada abono tiene su partida y su rastro; anularlos en silencio escondería movimientos de dinero. Es la misma regla de ingresos y gastos. |
| Tarjeta y transferencia van directo a Bancos | Una cuenta puente «Tarjetas por liquidar» y la comisión del banco | Es lo que pidió la contadora y cierra el hallazgo. La comisión queda como deuda declarada para revisarla con ella. |
| La migración 09 se ejecuta antes del `git push` | Publicar el código primero | Es aditiva: `crear_venta` conserva su firma vieja (el parámetro nuevo va al final y es opcional), así que el código de la semana 5 sigue cobrando con la 09 aplicada. Se probó. |
| En una base en uso se corre solo la 09, no `functions.sql` | Volver a correr `functions.sql` | La 09 trae todas las funciones que cambian. `functions.sql` en una base con productos y sin contabilidad la iniciaría sola (regla de la 08). |

## Cómo se probó la contabilidad

Una suite nueva recorre por HTTP, contra una base instalada desde cero con la cadena `01 → 09 → functions.sql → seed.sql`, cada caso y revisa las líneas de cada partida en la base.

| Caso | Qué se comprobó | Resultado |
|---|---|---|
| Venta en efectivo | Debe **Caja** por el total; Bancos y Cuentas por cobrar no se tocan | ✔ |
| Venta con tarjeta / por transferencia | Debe **Bancos** por el total; Caja no se toca | ✔ |
| Venta al crédito | Debe **Cuentas por cobrar** y sin método, aunque el navegador mande uno | ✔ |
| Cobro sin método (pantalla de la versión anterior) | Se toma como efectivo y va a Caja | ✔ |
| Método que no existe o que el negocio no activó | Se rechaza (422) y no se crea la venta | ✔ |
| «Marcar pagada» con transferencia | El abono carga Bancos y acredita Cuentas por cobrar; la venta recuerda el método | ✔ |
| Anular una venta con producto, variante y kit | El stock vuelve **exactamente** a como estaba (5 movimientos); la contrapartida es la partida original con Debe y Haber invertidos **línea por línea**; cada cuenta suma cero entre las dos; la balanza cuadra | ✔ |
| Nada se borra | La venta, sus 3 líneas y su partida original siguen en la base con el total intacto | ✔ |
| Auditoría | Una línea `anular_venta` con quién, el motivo, el stock devuelto y las dos partidas | ✔ |
| Permisos | Vendedor y contador reciben 403; supervisor y administrador anulan | ✔ |
| Doble anulación | Se rechaza y no se crea una segunda contrapartida | ✔ |
| Factura con abonos | Se rechaza con el mensaje de anular primero los abonos; anulado el abono, se anula y sale de Cuentas por cobrar | ✔ |
| Venta de antes de iniciar la contabilidad | Vuelve el stock y responde `sin_partida` | ✔ |
| Kit vendido antes de la 09 | Se devuelve con la receta actual y la auditoría lo marca | ✔ |
| Numeración | El número de la anulada no se reutiliza | ✔ |
| Totales | Historial, cuentas por cobrar, panel y estadísticas no cuentan las anuladas | ✔ |

La balanza (Debe = Haber en cada partida y en total) se comprobó después de cada bloque. También se revisó a la vista el PDF de una factura anulada y el libro diario filtrado.

## Resultados de las pruebas

| Prueba | Resultado |
|---|---|
| Suite nueva de la semana 6 por HTTP y SQL (método de pago, cobro, anulación, permisos, libro filtrado, PDF, kits, configuración) | **73 de 73** |
| Suite nueva de interfaz (jsdom con Alpine real): «¿Cómo paga?», pista #16, «¿Cómo pagó?», ventana de anulación, filtro de anuladas, libro filtrado, kit | **28 de 28** |
| Pantalla de acceso en Chromium real: mostrar contraseña, mayúsculas, «Entrando…», error, teclado, logo que no carga, anchos de 390 a 1920 px | **13 de 13** |
| Pantalla de acceso con seis paletas (cinco del catálogo y una propia), en escritorio y celular | Sin errores de JavaScript ni desplazamiento horizontal; el botón, el rótulo y el degradado toman los colores de cada paleta |
| Regresión diferencial: el mismo guion de 546 peticiones contra el código anterior y el nuevo | **431 idénticas.** Las 115 distintas son todas esperadas: 75 pantallas rediseñadas, 30 respuestas JSON que solo agregan campos, 4 matrices de roles con la columna «Anular», la descripción de «marcar pagada» con el método y 4 PDF con la forma de pago. **Ventas, detalle, stock, partidas, abonos, usuarios y saldos contables quedaron idénticos** |
| Suites de semanas anteriores | Estadísticas HTTP 59 de 59; estadísticas SQL 72 de 72 (secciones 1 a 9: la 10 lee archivos de una entrega anterior que ya no están en el equipo de pruebas); panel y perfil 75 de 75; interfaz de la Fase 6.5, 41 de 41; categorías, 7 de 7 |
| Actualización simulada de un cliente | Base con 01 a 08 y ventas hechas con el código anterior → 09 con ese código en línea (siguió vendiendo) → 09 otra vez → código nuevo. Las ventas viejas quedaron sin método, la nueva con tarjeta cargó Bancos, el kit viejo se anuló y la balanza cuadró |
| Instalación de producción desde cero | La cadena 01 a 09 con los tres seeds de producción (contraseña temporal solo en una copia local): el administrador entra al cambio de contraseña y el permiso nuevo queda en administrador y supervisor |

Dos notas honestas sobre las suites anteriores. La de panel y perfil esperaba 27 permisos; con `facturas.anular` son 28 (administrador 28, supervisor 23), así que se actualizó ese número. La suite de interfaz de la Fase 6 falla en dos comprobaciones de los gráficos **igual con el código anterior que con el nuevo**: es un problema del doble de Chart.js en el arnés de pruebas, no de esta entrega, y queda anotado.

## Problemas encontrados y cómo se resolvieron

- **El hallazgo grave tenía una segunda puerta.** «Marcar pagada» en Facturas registraba el cobro siempre en Caja. Se encontró al revisar el código antes de programar y se resolvió con la misma pregunta «¿Cómo pagó?».
- **La pista del #16 ya existía, pero escondida.** Estaba dentro del carrito, que en celular y tableta se abre desde una barra. Se movió junto a los productos.
- **El stock de un kit parecía stock físico.** El listado mostraba «3 unidad» para un kit que no tiene existencias propias. Se cambió por «Puedes armar 3» con el componente que lo limita.
- **El foco no llegaba al motivo de la anulación.** El campo vive dentro de un bloque que Alpine crea al abrir la ventana y la orden de enfocar llegaba antes de que la ventana terminara de mostrarse. Se enfoca un instante después; lo detectó la prueba de interfaz.
- **La tabla de facturas se desbordaba** con cinco acciones por fila («Ver PDF», «Descargar», «Marcar pagada», «Ver asiento contable», «Anular»). Se vio en la captura de pantalla de revisión; ahora las acciones se acomodan en dos líneas.
- **Kits cuya receta cambia después de vender.** Devolver según la receta actual podía devolver otra cosa. Se guarda lo consumido en `detalle_venta.componentes`.

## Uso de inteligencia artificial

**Herramientas.** Usé Claude (Anthropic) como copiloto principal para la lógica de backend, base de datos (migración 09, funciones de anulación y contabilidad) y la documentación técnica (ADRs y arquitectura). Para el rediseño visual de la pantalla de login utilicé GitHub Copilot integrado en VS Code, guiándolo con un prompt específico para Tailwind CSS y Alpine.js.

**El proceso y la autoría.** El trabajo se dividió en dos grandes ramas (PR1 y PR2). Para cada una, le di a la IA el contexto exacto de los hallazgos, las restricciones del proyecto (sin dependencias nuevas, mantener compatibilidad con código anterior, usar variables CSS dinámicas para los colores) y le pedí que actuara como arquitecto de la solución. 

A lo largo de la semana, revisé y ajusté decisiones clave:
- **Base de datos:** Aprobé el uso de un booleano `anulada` en lugar de un estado `A` para no romper las consultas existentes.
- **Seguridad:** Validé la lógica de bloquear la anulación si la factura tenía abonos vigentes, para no esconder movimientos de dinero.
- **UI/UX:** El prompt para el login exigió explícitamente no usar colores hardcodeados, forzando a que todo saliera de `var(--primario)`, y añadí las micro-interacciones (el ojito del password, la animación al escribir, el spinner de carga).

**Qué se verificó.** No me limité a aceptar el código generado. Ejecuté las migraciones en producción (primero en Las Flores, luego en JCL Sport), revisé los Pull Requests, verifiqué en el navegador que el login se adaptara a las paletas de ambos clientes, y realicé pruebas manuales en producción de ventas con tarjeta/efectivo (para confirmar que fueran a Bancos/Caja) y de la anulación de facturas (para verificar que el stock volviera y la contrapartida cuadrara). Las pruebas automatizadas (73 HTTP/SQL, 28 de interfaz y 13 en Chromium) las corrí localmente para validar que la IA no había roto la lógica existente.

## Qué aprendimos

- **Un hallazgo se cierra por todas sus puertas.** El método de pago no estaba solo en el punto de venta: el cobro desde Facturas tenía el mismo problema. Revisar el código antes de programar lo encontró.
- **Las capturas de pantalla son una prueba.** La tabla desbordada pasaba todas las pruebas automáticas; solo se vio al mirar la pantalla.
- **Diseñar con la paleta y no con colores** obliga a pensar en contraste y en cómo se ve con el peor caso (un primario muy oscuro o un acento muy claro), pero el resultado sirve para todos los clientes a la vez.
- **Escribir los ADR después de vivir con las decisiones** dejó ver mejor sus consecuencias negativas, por ejemplo el costo de correr cada migración en cada base.

## Lo que falta y deuda declarada

- **Aplicar la 09** en desarrollo, JCL Sport y Las Flores, fusionar los dos Pull Request y crear el release `semana-6`.
- **Revalidar H3 con P1** ahora que la partida refleja el medio de pago (lo dejó pendiente el informe de pruebas).
- **Observar la primera venta con CAI** en Las Flores: en las sesiones las dos ventas fueron con comprobante interno.
- **Comisión de las tarjetas:** la venta con tarjeta entra a Bancos por el total, sin la comisión del procesador ni el tiempo de acreditación. Revisarlo con la contadora.
- **Nota de crédito y devoluciones parciales:** la anulación es total y no emite un documento fiscal. Para una factura con CAI ya entregada, decide el contador.
- **Arnés de la suite de interfaz de la Fase 6:** dos comprobaciones de gráficos fallan igual con el código anterior; hay que revisar el doble de Chart.js.
- **Sigue la deuda anterior:** CSS compilado en lugar del CDN, token CSRF y un script para aplicar migraciones a todas las instancias.

## Evidencia

Capturas de la instancia de desarrollo en [`docs/evidencias/semana-6/`](../evidencias/semana-6/):

| Archivo | Qué muestra |
|---|---|
| `acceso-escritorio.png` | La nueva pantalla de acceso con la paleta de fábrica |
| `acceso-celular-otra-paleta.png` | La misma pantalla en celular con la paleta Naranja Cálido |
| `pos-metodo-de-pago.png` | «¿Cómo paga?» en el punto de venta con Tarjeta elegida |
| `facturas-anular.png` | La ventana de anulación con su explicación y el motivo |
| `libro-diario-de-una-factura.png` | «Ver asiento contable»: la venta anulada y su contrapartida |
| `factura-anulada-pdf.png` | El PDF de una factura anulada |
| `kit-puedes-armar.png` | La sección Kit con los pasos y «Alcanza para» |
