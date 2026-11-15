# Pruebas con usuarios reales — Semana 5

**Fecha:** 13 de noviembre de 2026 · **Sesiones:** 2, individuales, en el negocio de cada participante · **Entorno:** la instancia de producción de cada negocio, en sus propios equipos · **Evidencia:** notas de campo escaneadas en [`docs/evidencias/sesiones-semana-5.pdf`](evidencias/sesiones-semana-5.pdf)

El objetivo fue comprobar, con las dos primeras usuarias reales, las tres hipótesis de [`docs/vision.md`](vision.md): que una venta con comprobante se registra sin ayuda en menos de dos minutos (H1), que la conexión del negocio alcanza para trabajar (H2) y que la contabilidad que genera el sistema le sirve a una contadora para cuadrar los libros (H3).

## 1. Participantes

| | P1 | P2 |
|---|---|---|
| Rol en el negocio | Contadora | Representante del negocio |
| Negocio | Tienda deportiva | Floristería |
| Rol en la aplicación | Administradora | Administradora |
| Facturación | Comprobante interno (el negocio no está inscrito en el SAR) | Inscrita en el SAR; en la sesión usó el comprobante interno (ver tarea 1) |
| Uso previo | Configuró su negocio con el asistente inicial y usó la app por su cuenta. Sin capacitación formal | Configuró su negocio con el asistente y cargó su inventario por su cuenta. Sin capacitación formal |
| Equipo y conexión | PC de escritorio y teléfono, por cable | Laptop e iPad, por wifi |
| Duración de la sesión | 25 minutos | 35 minutos |

Las dos aceptaron participar y que se tomaran notas. En este documento aparecen como P1 y P2.

## 2. Guion de tareas

Cada sesión siguió una hoja de campo con cuatro tareas en lenguaje de usuario y unas preguntas de cierre; las hojas usadas están en la evidencia. El día anterior se preparó cada instancia con la cuenta de soporte: la contabilidad iniciada en P1, los productos de prueba y un cliente con saldo pendiente en P2. También se pidió a cada participante dejar anotada una venta real del día. Como la app no permite anular ventas, la venta cronometrada fue siempre una venta real. Durante la sesión el observador no ayudó: si la participante se trababa, solo preguntaba «¿Qué esperabas que pasara?».

| Tarea | P1 · tienda deportiva | P2 · floristería | Qué mide |
|---|---|---|---|
| 1 | Registrar una venta real del día y mostrar el comprobante, cronometrada | Lo mismo, con su factura | H1 |
| 2 | Revisar, como contadora, cómo quedó esa venta en la contabilidad y si le sirve para cuadrar los libros | Averiguar cuánto le deben los clientes en total y cuánto le debe un cliente con un encargo pendiente | H3 (P1) y descubrimiento de las cuentas por cobrar (P2) |
| 3 | Buscar un producto que no venden y pedir más unidades de las que hay, sin cobrar | Lo mismo | Reacción ante un error |
| 4 (si sobra tiempo) | Cotizar 11 uniformes completos (producto compuesto) | Crear un ramo de 12 rosas con follaje (producto compuesto) | Productos compuestos |
| Cierre | Lo más confuso, en qué dudó, qué esperaba y no vio, y como contadora: ¿podría cuadrar los libros y qué le faltaría para un auditor? | Las tres primeras y cuántas veces se le va el internet | H3 (P1) y H2 (P2) |

## 3. Resultados por tarea

Las notas de campo las escribió el observador en tercera persona. Lo que aparece entre comillas son expresiones de las participantes tal como quedaron en esas notas, no transcripciones de una grabación.

### Tarea 1 · Venta real cronometrada

| | P1 | P2 |
|---|---|---|
| ¿La completó? | **Sí, sin ayuda** | **Sí, sin ayuda** |
| Tiempo | **1:05** | **1:13** |
| Documento emitido | Comprobante interno | Comprobante interno. Decidió no facturar con CAI porque no ha hecho ventas declaradas recientemente |
| Observaciones | No le costó nada en particular. Le gustó poder cobrar o dejar la venta pendiente, y que la pendiente pase sola a cuentas por cobrar. Pidió elegir la forma de pago (efectivo, tarjeta, transferencia) y que la partida se cree según esa forma de pago | Al principio no entendió que bastaba tocar el producto para agregarlo; después le gustó que funcione «tipo carrito web». Comentó que pudo crear su inventario fácilmente |

### Tarea 2

| | P1 · la venta en la contabilidad | P2 · cuánto le deben |
|---|---|---|
| ¿La completó? | **Sí, sin ayuda** | **Sí, sin ayuda** |
| Tiempo | 0:20 | 0:36 |
| Dónde buscó primero | Facturas | Facturas |
| Observaciones | Contenta de que las partidas se creen solas. El libro diario y su resumen le dicen cuánto hay en cada cuenta de forma más sencilla, y además puede generar reportes: «le encanta» | «Cumple exactamente con sus necesidades»: le sirve para los encargos en los que el pago queda pendiente o le adelantan la mitad. Los abonos, «la cereza del pastel» |

### Tarea 3 · Un caso fuera de lo normal

| | P1 | P2 |
|---|---|---|
| Producto que no venden | Raquetas. Se dio cuenta de que no las venden. Las buscó en Inventario, aunque podía hacerlo desde el punto de venta | Bases de vidrio. Se dio cuenta. Buscó primero en Categorías y después en Inventario |
| Más unidades de las que hay | Balones. Entendió el aviso de stock y optó por hacer una cotización | Rosas. Entendió el aviso y haría una cotización mientras compra los insumos |

### Tarea 4 · Producto compuesto

| | P1 · cotizar 11 uniformes | P2 · crear un ramo |
|---|---|---|
| ¿La completó? | **Sí, sin ayuda** | **Sí, con esfuerzo** |
| Tiempo | 0:46 | 2:47 (objetivo: 3:00) |
| Observaciones | El uniforme no estaba armado de antemano: identificó que primero debía crear el producto compuesto. En el cierre dijo que dudó al crearlo, aunque luego lo entendió, y que le confundió el stock de los kits | La poca visibilidad de ciertas opciones lo hizo difícil. En el cierre aclaró que no le pareció difícil: se le complicó porque todavía estaba explorando el sistema |

### Cierre

| | P1 | P2 |
|---|---|---|
| Lo más confuso | El stock de los kits | La tarea 4, por estar explorando el sistema |
| En qué dudó | Al crear el producto compuesto, aunque luego lo entendió | Al crear el producto compuesto |
| Qué esperaba ver y no vio | Elegir la forma de pago | Nada: «cubre todas sus necesidades» |
| Pregunta propia | Como contadora: aun siendo su primera vez, el sistema le pareció «bastante autoexplicativo»; el libro le sirve porque le da resultados y movimientos. No mencionó qué le faltaría para un auditor | Internet: se le va aproximadamente una vez cada cuatro meses, por una hora |

**Notas libres del observador.** A P1 registrar le parece fácil, los reportes le resultan útiles y la gestión de usuarios le pareció «maravillosa y fácil de usar». A P2 la sección «por cobrar» de Finanzas le resultó muy útil, y en el asistente inicial tardó unos 5 minutos en configurar su negocio.

## 4. Hallazgos

Las severidades usan las mismas definiciones que se fijaron en el guion antes de las sesiones:

- **Bloqueante:** impide terminar la tarea.
- **Grave:** la termina, pero deja datos mal o tarda más del doble del objetivo.
- **Menor:** duda o rodeo, pero termina a tiempo.
- **Cosmético:** comentario visual sin efecto.

La frecuencia indica en cuántas sesiones apareció. En las tareas 2 y 4 cada participante hizo una tarea distinta, por eso ahí la frecuencia es 1/1.

| # | Hallazgo | Evidencia | Severidad | Frecuencia | Qué se hace |
|---|---|---|---|---|---|
| 1 | **La venta no registra el medio de pago.** Toda venta cobrada se contabiliza en Caja, aunque se haya pagado con tarjeta o transferencia: Caja queda inflada y Bancos no cuadra con el estado de cuenta | P1, tarea 1 y cierre: pidió elegir la forma de pago y que la partida se cree según ella. Confirmado en el código: la partida de una venta cobrada siempre carga Caja | **Grave** | 1/2 | Issue «Método de pago en el punto de venta y partida según el medio», semana 6 |
| 2 | **Armar un producto compuesto genera dudas, y el stock de un kit confunde** | P1, tarea 4 y cierre. P2, tarea 4: «con esfuerzo», 2:47, «visibilidad de ciertas opciones» | Menor | 2/2 | Issue «Hacer más claro cómo armar un producto compuesto», semana 7 |
| 3 | **Desde la factura no se llega a su partida** | P1, tarea 2: para revisar la contabilidad buscó primero en Facturas (la encontró igual en 0:20) | Menor | 1/1 | Issue «Ver la partida contable desde la factura», semana 8 |
| 4 | **En el primer uso no es obvio que basta tocar un producto para agregarlo** | P2, tarea 1 | Menor | 1/2 | Issue «Pista de primer uso en el punto de venta», semana 9 |
| 5 | **Para saber si un producto existe buscan en Inventario o Categorías, no en el punto de venta** | P1 y P2, tarea 3; las dos lo resolvieron | Menor | 2/2 | Sin issue: es un camino razonable. Se revisará si vuelve a aparecer |

**No se encontraron bloqueantes.** Las dos participantes completaron las cuatro tareas, ninguna pidió ayuda y ninguna tarea cronometrada superó su tiempo objetivo.

**Lo que funcionó**, según las notas, sin que se preguntara por ello:

- La venta se registró en poco más de un minuto, sin ayuda (2/2).
- Cobrar o dejar pendiente, que la pendiente pase a cuentas por cobrar, y los abonos parciales (2/2).
- Ante el aviso de stock insuficiente, las dos propusieron por su cuenta una alternativa: la cotización (2/2).
- Las partidas automáticas, el libro diario y los reportes (P1).
- La gestión de usuarios (P1) y el asistente de configuración inicial, de unos 5 minutos (P2).
- El comprobante interno resolvió la situación real de P2, que no está emitiendo ventas declaradas.

## 5. Decisión sobre las hipótesis

Las decisiones aplican las reglas que se fijaron en el guion antes de las sesiones.

### H1 · «Un dueño o vendedor sin capacitación puede registrar una venta con factura en menos de dos minutos» — **Se sostiene**

Criterio: completar la venta sin ayuda y en menos de 2:00. Las dos lo lograron sin pedir ayuda: P1 en 1:05 y P2 en 1:13, el 54 % y el 61 % del tiempo objetivo.

Tres matices acotan el alcance, aunque no cambian la decisión:

- Las dos ventas fueron con comprobante interno, así que **la venta con factura fiscal (CAI) no se observó**.
- Las dos participantes ya habían usado la app por su cuenta: no tuvieron capacitación formal, pero sí uso previo.
- Son dos personas, ambas administradoras.

### H2 · «El negocio tiene conexión a internet suficiente durante toda la jornada» — **Se sostiene, con evidencia limitada**

Criterio: interrupciones de menos de 5 min/semana y tiempos de respuesta aceptables en el punto de venta. P2 reporta un corte cada cuatro meses, de una hora: en promedio unos 3.5 min/semana, por debajo del umbral. Las notas no registran demoras ni errores de conexión en ninguna de las dos sesiones.

La evidencia es débil: es un solo testimonio (a P1, que trabaja por cable, no se le preguntó) y no hay mediciones. Además, cuando el corte ocurre deja al negocio una hora sin punto de venta. Un procedimiento de respaldo sin conexión queda fuera del MVP.

### H3 · «La factura y los reportes son aceptables para el negocio y su contador» — **Se ajusta**

Criterio: la contadora confirma que la partida doble y los datos de la factura le sirven para cuadrar los libros. P1 lo confirmó para el libro diario y los reportes: le pareció autoexplicativo, valoró que las partidas se creen solas y dijo que el libro le sirve porque le da resultados y movimientos.

Pero también pidió que la partida de la venta dependa de la forma de pago. Hoy toda venta cobrada se carga a Caja, así que las ventas con tarjeta o transferencia no cuadran con Bancos (hallazgo 1). La regla del guion para este caso era «le sirven, pero falta algo: se ajusta». La hipótesis queda así:

> La factura y los reportes son aceptables para el negocio y su contador **siempre que la partida de la venta refleje el medio de pago** (efectivo, tarjeta o transferencia).

Se vuelve a validar con P1 cuando esté resuelto el issue del método de pago, en la semana 6.

## 6. Limitaciones

- Dos participantes, ambas administradoras y con uso previo de la app. No participó ningún vendedor que la usara por primera vez.
- Las sesiones duraron 25 y 35 minutos, frente a los 15 planeados.
- La venta con factura fiscal (CAI) no se probó con una usuaria real.
- H2 se apoya en un testimonio, sin medición.
- En la tarea 4, P1 tuvo que crear el uniforme compuesto porque no estaba preparado de antemano. Su tiempo (0:46) no es comparable con el de una tarea que solo cotiza.
- El observador es el autor del sistema, así que puede haber sesgo de cortesía en las participantes. Las notas son del observador, no grabaciones.

## 7. Próximos pasos

| Semana | Qué |
|---|---|
| 6 | Método de pago en el punto de venta y contabilización según el medio (hallazgo 1, HU-31). Volver a validar H3 con P1. Observar la primera venta con CAI de P2 |
| 7 | Productos compuestos más claros, empezando por una conversación breve con P2 para saber qué opciones no vio (hallazgo 2) |
| 8 | Ver la partida desde la factura (hallazgo 3) |
| 9 | Pista de primer uso en el punto de venta (hallazgo 4) |