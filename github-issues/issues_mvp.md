# Historias de usuario para GitHub Issues

Treinta y una historias del producto con criterios de aceptación en formato **Dado / Cuando / Entonces**, listas para copiar a GitHub Issues. Cada bloque `## HU-XX` es un issue: el título es el encabezado y el cuerpo es todo lo que sigue.

**Cómo usarlas.** Crea los milestones `Corte 1: Ventas e inventario`, `Corte 2: Finanzas y contabilidad` y `Corte 3: Análisis, seguridad y móvil`. Crea las etiquetas `corte-1`, `corte-2`, `corte-3`, `rol-admin`, `rol-vendedor`, `feature`, `db` y `seguridad`. Las historias marcadas como construidas se pueden crear y cerrar de inmediato para que el tablero refleje el avance real.

El mapa completo está en [docs/mapa-historias.md](../docs/mapa-historias.md).

| Corte | Historias | Estado |
|---|---|---|
| 1. Ventas e inventario | HU-01 a HU-15 | Construido |
| 2. Finanzas y contabilidad | HU-16 a HU-25 | Construido |
| 3. Análisis, seguridad y móvil | HU-26 a HU-31 | Pendiente |

---

## HU-01 · Iniciar sesión con usuario y contraseña

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como administrador o vendedor, quiero iniciar sesión con mi usuario y mi contraseña, para entrar al sistema con los permisos de mi rol.

**Criterios de aceptación**

```gherkin
# language: es
Característica: Inicio de sesión

  Escenario: Un administrador entra al panel
    Dado que existe un usuario activo con rol administrador
    Cuando ingreso su usuario y su contraseña correctos
    Entonces llego al panel de inicio

  Escenario: Un vendedor entra al punto de venta
    Dado que existe un usuario activo con rol vendedor
    Cuando ingreso su usuario y su contraseña correctos
    Entonces llego directo al punto de venta

  Escenario: Credenciales incorrectas
    Dado que estoy en la pantalla de inicio de sesión
    Cuando ingreso una contraseña equivocada
    Entonces veo un mensaje de error y no entro al sistema

  Escenario: Un usuario desactivado no puede entrar
    Dado que mi usuario fue desactivado
    Cuando ingreso mis credenciales correctas
    Entonces no entro al sistema
```

---

## HU-02 · Ver el resumen del negocio al entrar

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero ver un resumen al entrar, para saber de un vistazo cómo va el negocio.

```gherkin
# language: es
Característica: Panel de inicio

  Escenario: Resumen del negocio
    Dado que inicié sesión como administrador
    Cuando entro al panel de inicio
    Entonces veo tarjetas con el resumen del negocio
    Y veo los productos con stock bajo

  Escenario: Modo de facturación vigente
    Dado que el negocio no tiene un CAI activo
    Cuando entro al panel de inicio
    Entonces veo que la facturación está en modo interno
```

---

## HU-03 · Limitar el acceso según el rol

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `seguridad` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como dueño del negocio, quiero que cada rol vea solo sus módulos, para que el vendedor no acceda a la información administrativa.

```gherkin
# language: es
Característica: Permisos por rol

  Escenario: El vendedor solo ve el punto de venta
    Dado que inicié sesión como vendedor
    Cuando miro el menú lateral
    Entonces solo veo el punto de venta

  Escenario: El vendedor intenta abrir una pantalla de administración
    Dado que inicié sesión como vendedor
    Cuando intento abrir la pantalla de inventario por su dirección
    Entonces veo una página de acceso denegado

  Escenario: Sin sesión
    Dado que no he iniciado sesión
    Cuando intento abrir cualquier pantalla del sistema
    Entonces me llevan a la pantalla de inicio de sesión
```

---

## HU-04 · Administrar categorías

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero crear, editar y desactivar categorías, para organizar mis productos.

```gherkin
# language: es
Característica: Categorías

  Escenario: Crear una categoría
    Dado que estoy en la pantalla de categorías
    Cuando creo la categoría "Balones"
    Entonces la categoría aparece en la lista

  Escenario: Nombre repetido
    Dado que ya existe la categoría "Balones"
    Cuando intento crear otra con el mismo nombre
    Entonces veo un mensaje que indica que ya existe y no se crea

  Escenario: Desactivar sin perder el historial
    Dado que una categoría tiene productos
    Cuando la desactivo
    Entonces deja de ofrecerse y los productos conservan su historial
```

---

## HU-05 · Registrar un producto con imagen

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar productos con sus precios, unidad, stock mínimo e imagen, para venderlos y controlar sus existencias.

```gherkin
# language: es
Característica: Productos

  Escenario: Crear un producto con imagen
    Dado que estoy en el formulario de producto
    Cuando completo el SKU, el nombre, los precios y la unidad y subo una imagen
    Entonces el producto se guarda y su imagen se muestra en el catálogo

  Escenario: SKU repetido
    Dado que ya existe un producto con el SKU "BAL-001"
    Cuando intento crear otro con el mismo SKU
    Entonces veo un mensaje de error y no se crea

  Escenario: Producto que se vende por kilo
    Dado que el producto usa la unidad "kilo"
    Cuando registro stock con decimales
    Entonces se acepta la cantidad con decimales
```

---

## HU-06 · Manejar variantes con stock propio

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador de una tienda de ropa, quiero que un producto tenga variantes de talla y edición con su propio stock, para saber cuántas piezas quedan de cada una.

```gherkin
# language: es
Característica: Variantes

  Escenario: Producto con variantes
    Dado el producto "Camiseta Real Madrid" con las tallas S a XL y las ediciones Local y Visitante
    Cuando reviso el inventario
    Entonces cada combinación tiene su propio stock

  Escenario: Variante agotada
    Dado que la variante "M / Local" tiene stock cero
    Cuando busco esa camiseta en el punto de venta
    Entonces no puedo agregar esa variante al carrito

  Escenario: Stock bajo por variante
    Dado que una variante está por debajo de su stock mínimo
    Cuando entro al panel de inicio
    Entonces aparece entre los productos con stock bajo
```

---

## HU-07 · Armar kits con componentes

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero crear kits formados por otros productos, para vender combos y que se descuente el stock de cada componente.

```gherkin
# language: es
Característica: Kits

  Escenario: Vender un kit
    Dado el kit "Uniforme de entrenamiento completo" formado por una camiseta, una pantaloneta y unas medias
    Cuando vendo una unidad del kit
    Entonces baja una unidad del stock de cada componente

  Escenario: Falta un componente
    Dado que las medias del kit están agotadas
    Cuando intento vender el kit
    Entonces veo un mensaje que indica el componente sin stock y no se vende

  Escenario: Kit y componente suelto en la misma venta
    Dado que queda una sola camiseta de entrenamiento
    Cuando agrego al carrito el kit y la camiseta suelta
    Entonces el sistema no deja superar el stock disponible
```

---

## HU-08 · Administrar clientes

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como administrador, quiero llevar la lista de mis clientes con RTN opcional, para facturarles y conocer lo que me deben.

```gherkin
# language: es
Característica: Clientes

  Escenario: Cliente sin RTN
    Dado que estoy creando un cliente
    Cuando dejo el RTN vacío y guardo
    Entonces el cliente se crea correctamente

  Escenario: Búsqueda en vivo
    Dado que hay varios clientes registrados
    Cuando escribo parte de un nombre en el buscador
    Entonces la lista se filtra mientras escribo

  Escenario: Alta rápida desde el punto de venta
    Dado que soy vendedor y estoy cobrando una venta
    Cuando creo un cliente nuevo desde el carrito
    Entonces el cliente queda elegido y la venta sigue intacta
```

---

## HU-09 · Administrar proveedores

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar a mis proveedores con sus datos de contacto, para asociarlos a mis compras y a lo que les debo.

```gherkin
# language: es
Característica: Proveedores

  Escenario: Registrar un proveedor
    Dado que estoy en la pantalla de proveedores
    Cuando registro un proveedor con su contacto y su teléfono
    Entonces aparece en la lista y puedo elegirlo en una compra

  Escenario: Desactivar un proveedor
    Dado que un proveedor tiene compras registradas
    Cuando lo desactivo
    Entonces sus compras anteriores se conservan
```

---

## HU-10 · Armar el carrito validando el stock

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como vendedor, quiero buscar productos y armar la venta sin pasarme del stock, para no vender lo que no tengo.

```gherkin
# language: es
Característica: Carrito del punto de venta

  Escenario: Buscar por nombre o SKU
    Dado que estoy en el punto de venta
    Cuando escribo "gorra" o el SKU "GOR-001"
    Entonces veo los productos que coinciden

  Escenario: Producto con variantes
    Dado que elijo una camiseta con variantes
    Cuando la agrego al carrito
    Entonces el sistema me pide elegir talla y edición antes de agregarla

  Escenario: Cantidad mayor al stock
    Dado que quedan 3 balones
    Cuando intento agregar 4 balones
    Entonces el sistema no me deja pasar de 3

  Escenario: Lector de códigos
    Dado que escribo un SKU exacto en el buscador
    Cuando presiono Enter
    Entonces el producto se agrega al carrito
```

---

## HU-11 · Cobrar con factura fiscal (CAI)

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `db` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como negocio inscrito en el SAR, quiero emitir facturas con el siguiente número de mi CAI, para cumplir con la numeración autorizada.

```gherkin
# language: es
Característica: Factura con CAI

  Escenario: Cobrar con un CAI vigente
    Dado que hay un CAI activo con números disponibles
    Cuando cobro una venta
    Entonces la factura usa el siguiente número del rango autorizado

  Escenario: CAI vencido
    Dado que la fecha límite del CAI ya pasó
    Cuando intento cobrar una venta
    Entonces el sistema se bloquea con un mensaje claro y no gasta ningún número

  Escenario: Rango agotado
    Dado que ya se usó el último número del rango autorizado
    Cuando intento cobrar una venta
    Entonces el sistema se bloquea con un mensaje claro

  Escenario: Dos cobros al mismo tiempo
    Dado que dos vendedores cobran a la vez
    Cuando ambos confirman
    Entonces cada factura recibe un número distinto y consecutivo
```

---

## HU-12 · Cobrar con comprobante interno

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como negocio que todavía no está inscrito en el SAR, quiero emitir comprobantes internos numerados, para llevar un orden desde el primer día.

```gherkin
# language: es
Característica: Comprobante interno

  Escenario: Cobrar sin un CAI activo
    Dado que el negocio no tiene un CAI activo
    Cuando cobro una venta
    Entonces el comprobante recibe un número interno como INT-000001

  Escenario: Números consecutivos
    Dado que ya emití el comprobante INT-000001
    Cuando cobro otra venta
    Entonces el nuevo comprobante es INT-000002

  Escenario: Leyenda en el documento
    Dado un comprobante interno
    Cuando abro su PDF
    Entonces dice que no es válido para crédito fiscal
```

---

## HU-13 · Evitar cobros duplicados

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `db` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como vendedor, quiero que un cobro que se repite por un doble toque o por mala conexión no cree otra venta, para no descontar dos veces el stock ni gastar dos números.

```gherkin
# language: es
Característica: Cobros idempotentes

  Escenario: Doble toque en Cobrar
    Dado que toco el botón Cobrar dos veces seguidas
    Cuando el sistema procesa ambos toques
    Entonces se crea una sola venta

  Escenario: Reintento tras perder la conexión
    Dado que el cobro no me confirmó por mala conexión
    Cuando reintento el cobro con el mismo carrito
    Entonces recibo la misma venta y no se descuenta el stock otra vez

  Escenario: Última unidad
    Dado que quedan una sola unidad y cinco cobros simultáneos
    Cuando todos intentan comprarla
    Entonces solo uno se concreta y el resto recibe un mensaje de stock insuficiente
```

---

## HU-14 · Emitir factura y cotización en PDF

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como vendedor, quiero entregar la factura o una cotización en PDF, para que el cliente tenga su documento.

```gherkin
# language: es
Característica: Documentos en PDF

  Escenario: Factura en PDF
    Dado que cobré una venta
    Cuando abro el PDF
    Entonces veo el logo, el RTN, el número, el detalle, los totales y el estado de pago

  Escenario: Cotización
    Dado un carrito armado
    Cuando genero la cotización
    Entonces obtengo un PDF sin descontar stock ni gastar un número de factura

  Escenario: Cada vendedor ve solo lo suyo
    Dado que soy vendedor
    Cuando intento abrir el PDF de una venta de otra persona
    Entonces no puedo verlo
```

---

## HU-15 · Consultar las facturas y marcarlas pagadas

**Milestone:** Corte 1 · **Etiquetas:** `corte-1` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero consultar mis facturas con filtros y cobrar las pendientes, para llevar el control de lo vendido.

```gherkin
# language: es
Característica: Historial de facturas

  Escenario: Filtrar
    Dado que hay facturas de varios días, tipos y estados
    Cuando filtro por fechas, por tipo y por estado de pago
    Entonces veo solo las que coinciden y el total del filtro

  Escenario: Marcar pagada
    Dado una factura pendiente con un saldo
    Cuando la marco como pagada y confirmo
    Entonces se registra el cobro del saldo en Caja y la factura queda pagada

  Escenario: Ya la había cobrado otra persona
    Dado que otra persona cobró esa factura un momento antes
    Cuando intento marcarla pagada
    Entonces no se duplica el cobro y no veo un error
```

---

## HU-16 · Vender a crédito con fecha de vencimiento

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` `rol-vendedor` · **Estado:** construida

**Historia:** Como vendedor, quiero dejar una venta pendiente de pago con su fecha de vencimiento, para que el cliente pague después y el dueño lo vea como una deuda.

```gherkin
# language: es
Característica: Ventas a crédito

  Escenario: Dejar una venta pendiente
    Dado que armé una venta para un club deportivo
    Cuando activo "Dejar pendiente de pago" y pongo el vencimiento a 15 días
    Entonces la venta aparece sola en cuentas por cobrar con su vencimiento

  Escenario: Sin fecha de vencimiento
    Dado una venta pendiente sin vencimiento
    Cuando la veo en cuentas por cobrar
    Entonces se marca como plazo estimado de 30 días

  Escenario: Vencimiento en el pasado
    Dado que estoy dejando una venta pendiente
    Cuando pongo un vencimiento anterior a hoy
    Entonces veo un mensaje de error y no se cobra

  Escenario: Una venta pagada no genera deuda
    Dado que cobro una venta pagada
    Cuando reviso cuentas por cobrar
    Entonces esa venta no aparece
```

---

## HU-17 · Registrar abonos parciales de clientes

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar abonos parciales de mis clientes, para que su deuda baje y el dinero entre a Caja o a Bancos.

```gherkin
# language: es
Característica: Abonos

  Escenario: Abono parcial
    Dado una factura pendiente con saldo de 1,725.00
    Cuando registro un abono de 500.00 por Caja
    Entonces el saldo baja a 1,225.00 y entran 500.00 a Caja

  Escenario: Abono mayor al saldo
    Dado una factura con saldo de 1,225.00
    Cuando intento abonar 1,300.00
    Entonces veo un mensaje que indica el saldo pendiente y no se registra

  Escenario: Abono final
    Dado una factura con saldo de 1,225.00
    Cuando abono 1,225.00
    Entonces la factura queda pagada y sale de cuentas por cobrar

  Escenario: Anular un abono
    Dado un abono registrado por error
    Cuando lo anulo
    Entonces la deuda vuelve a quedar pendiente y el dinero sale de Caja

  Escenario: Antigüedad
    Dado una factura vencida hace 45 días
    Cuando miro cuentas por cobrar
    Entonces figura como "Vencido 45 días" en el tramo de 31 a 60 días
```

---

## HU-18 · Controlar lo que se debe a proveedores

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero ver lo que debo a mis proveedores y registrar mis pagos totales o parciales, para pagar a tiempo.

```gherkin
# language: es
Característica: Cuentas por pagar

  Escenario: Una compra por pagar aparece como deuda
    Dado que registré una compra con la condición "Por pagar"
    Cuando miro cuentas por pagar
    Entonces la compra aparece con su saldo y su vencimiento

  Escenario: Pago parcial
    Dado un gasto por pagar de 1,250.00
    Cuando registro un pago de 400.00 por Caja
    Entonces el saldo baja a 850.00 y salen 400.00 de Caja

  Escenario: Pago mayor al saldo
    Dado una deuda con saldo de 850.00
    Cuando intento pagar 900.00
    Entonces veo un mensaje de error y no se registra
```

---

## HU-19 · Registrar ingresos y gastos con condición de pago

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar ingresos varios y gastos como cobrados o pagados, o como por cobrar o por pagar, para reflejar lo que realmente ocurre con el dinero.

```gherkin
# language: es
Característica: Ingresos y gastos

  Escenario: Ingreso cobrado
    Dado que recibí 1,000.00 de un alquiler
    Cuando lo registro como cobrado en Bancos
    Entonces Bancos sube 1,000.00 y el ingreso se ve en verde

  Escenario: Ingreso por cobrar
    Dado un servicio que me pagarán después
    Cuando lo registro como por cobrar con su vencimiento
    Entonces aparece en cuentas por cobrar y no mueve Caja

  Escenario: Gasto por pagar
    Dado un gasto de publicidad que pagaré después
    Cuando lo registro como por pagar
    Entonces aparece en cuentas por pagar

  Escenario: Anular un registro con cobros
    Dado un ingreso por cobrar que ya tiene un abono
    Cuando intento anularlo
    Entonces el sistema pide anular primero el abono
```

---

## HU-20 · Registrar compras de inventario

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `db` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar mis compras de mercadería, para que suba el stock y se actualice el costo de cada producto.

```gherkin
# language: es
Característica: Compras

  Escenario: Compra de productos con variantes
    Dado que compro 3 camisetas "M / Local" y 2 gorras
    Cuando registro la compra como pagada por Bancos
    Entonces sube el stock de la variante y de las gorras
    Y el costo de cada producto pasa a promedio ponderado

  Escenario: Falta elegir la variante
    Dado un producto que tiene variantes
    Cuando agrego el producto sin elegir variante
    Entonces el sistema no me deja registrar la compra

  Escenario: Una línea inválida cancela todo
    Dado una compra con una línea válida y un kit
    Cuando intento registrarla
    Entonces no cambia el stock ni se crea la compra

  Escenario: Compra por pagar
    Dado una compra con la condición "Por pagar"
    Cuando la registro
    Entonces queda en cuentas por pagar y el stock sube igualmente
```

---

## HU-21 · Generar la partida doble automáticamente

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `db` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero que cada operación de dinero genere su asiento contable y poder consultar el libro diario, para tener contabilidad sin hacerla a mano.

```gherkin
# language: es
Característica: Libro diario

  Escenario: Venta pagada con impuesto
    Dado que cobro una venta pagada con impuesto
    Cuando abro el libro diario
    Entonces veo una partida con Caja al Debe y Ventas e impuesto por pagar al Haber
    Y el costo de ventas contra el inventario

  Escenario: Cada partida cuadra
    Dado cualquier partida del libro
    Cuando sumo su Debe y su Haber
    Entonces ambos totales son iguales

  Escenario: Filtrar el libro
    Dado que hay muchas partidas
    Cuando filtro por origen, por cuenta o por texto
    Entonces veo solo las que coinciden, ordenadas por fecha

  Escenario: El libro no se edita
    Dado una partida registrada
    Cuando alguien intenta modificarla o borrarla
    Entonces la base de datos lo rechaza
```

---

## HU-22 · Ver el panel financiero

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero ver mi situación financiera de un vistazo, para tomar decisiones sin hacer cuentas.

```gherkin
# language: es
Característica: Panel financiero

  Escenario: Indicadores
    Dado que la contabilidad está iniciada
    Cuando abro Finanzas
    Entonces veo el dinero en caja y bancos, lo que me deben, lo que debo y la utilidad neta del mes

  Escenario: Gráfico de seis meses
    Dado que hay movimientos en varios meses
    Cuando miro el gráfico
    Entonces veo el flujo de caja y la utilidad de cada uno de los últimos seis meses

  Escenario: Deudas vencidas
    Dado que hay cuentas por cobrar vencidas
    Cuando abro Finanzas
    Entonces veo un aviso con la cantidad y el monto vencido
```

---

## HU-23 · Descargar los reportes contables en PDF

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero descargar mis reportes contables, para revisarlos con mi contador o guardarlos.

```gherkin
# language: es
Característica: Reportes

  Escenario: Estado de resultados
    Dado un período con ventas, costos y gastos
    Cuando genero el estado de resultados
    Entonces veo ingresos menos costo de ventas menos gastos igual a la utilidad

  Escenario: Flujo de caja
    Dado un período con cobros y pagos
    Cuando genero el flujo de caja
    Entonces veo el saldo inicial, las entradas, las salidas y el saldo final de Caja y Bancos

  Escenario: Balance general
    Dado cualquier fecha
    Cuando genero el balance general
    Entonces los activos son iguales a los pasivos más el patrimonio y el reporte lo confirma

  Escenario: Antigüedad de saldos
    Dado deudas con distintos días de atraso
    Cuando genero el reporte
    Entonces cada deuda aparece en su tramo: al día, 1 a 30, 31 a 60, 61 a 90 o más de 90 días

  Escenario: Período inválido
    Dado un rango donde la fecha inicial es posterior a la final
    Cuando intento generar un reporte
    Entonces veo un mensaje de error claro
```

---

## HU-24 · Corregir con asientos manuales y anulaciones

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `db` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero registrar asientos manuales y anular partidas, para corregir errores sin borrar nada.

```gherkin
# language: es
Característica: Asientos manuales

  Escenario: Asiento que no cuadra
    Dado un asiento con 100.00 al Debe y 90.00 al Haber
    Cuando intento registrarlo
    Entonces el botón de registrar queda apagado y se muestra la diferencia de 10.00

  Escenario: Asiento correcto
    Dado un asiento con 100.00 al Debe de Caja y 100.00 al Haber de Capital
    Cuando lo registro
    Entonces aparece en el libro diario

  Escenario: Anular un asiento
    Dado un asiento manual registrado
    Cuando lo anulo
    Entonces se crea una contrapartida y el original queda marcado como anulado

  Escenario: Partidas del sistema
    Dado una partida generada por una venta
    Cuando intento anularla suelta
    Entonces el sistema indica que se anula desde el documento que la originó
```

---

## HU-25 · Iniciar la contabilidad y conciliar el inventario

**Milestone:** Corte 2 · **Etiquetas:** `corte-2` `feature` `db` `rol-admin` · **Estado:** construida

**Historia:** Como administrador, quiero iniciar mi contabilidad con lo que ya tengo y mantener el inventario del libro igual al real, para que mis reportes partan de una base correcta.

```gherkin
# language: es
Característica: Inicio de la contabilidad

  Escenario: Iniciar
    Dado un negocio con productos y ventas pendientes
    Cuando inicio la contabilidad
    Entonces se crea un asiento de apertura con el inventario y las cuentas por cobrar contra el capital

  Escenario: Saldo inicial de Caja
    Dado que la contabilidad ya inició
    Cuando registro un saldo inicial de 5,000.00 en Caja
    Entonces Caja sube 5,000.00 contra capital

  Escenario: Iniciar dos veces
    Dado una contabilidad ya iniciada
    Cuando intento iniciarla otra vez
    Entonces no se duplica nada

  Escenario: Fecha anterior al inicio
    Dado una contabilidad iniciada hoy
    Cuando intento registrar un gasto con fecha de ayer
    Entonces el sistema lo rechaza

  Escenario: Conciliar inventario
    Dado que las existencias valen 1,000.00 más que el inventario del libro
    Cuando concilio el inventario como ajuste
    Entonces el inventario del libro queda igual a las existencias
```

---

## HU-26 · Ver el inventario visual y recibir alertas de stock bajo

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `rol-admin` · **Estado:** pendiente (Fase 5)

**Historia:** Como administrador, quiero ver mi inventario con imágenes y recibir alertas, para saber qué reponer antes de quedarme sin producto.

```gherkin
# language: es
Característica: Inventario visual y alertas

  Escenario: Vista con imágenes
    Dado que tengo productos con imagen
    Cuando abro el inventario en vista visual
    Entonces veo cada producto con su foto, su stock y su estado

  Escenario: Alerta de stock bajo
    Dado un producto con stock igual o menor a su mínimo
    Cuando abro el inventario
    Entonces aparece marcado como por reponer

  Escenario: Lista de reposición
    Dado varios productos por reponer
    Cuando pido la lista de reposición
    Entonces la veo agrupada por proveedor y puedo iniciar una compra
```

---

## HU-27 · Ver estadísticas de ventas

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `rol-admin` · **Estado:** pendiente (Fase 6)

**Historia:** Como administrador, quiero ver qué y cuándo se vende más, para decidir mejor mis compras y mis promociones.

```gherkin
# language: es
Característica: Estadísticas

  Escenario: Ventas por período
    Dado que hay ventas en varios días
    Cuando elijo un período
    Entonces veo el total vendido por día, semana o mes

  Escenario: Productos más vendidos
    Dado un período con ventas
    Cuando abro el ranking
    Entonces veo los productos y las categorías más vendidos

  Escenario: Acceso restringido
    Dado que soy vendedor
    Cuando intento abrir las estadísticas
    Entonces veo una página de acceso denegado
```

---

## HU-28 · Editar los datos del negocio y administrar usuarios

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `rol-admin` · **Estado:** pendiente (Fase 7)

**Historia:** Como administrador, quiero cambiar los datos de mi negocio, cargar mi CAI y administrar mis usuarios desde la interfaz, para no depender de nadie técnico.

```gherkin
# language: es
Característica: Configuración

  Escenario: Datos del negocio
    Dado que estoy en configuración
    Cuando cambio el nombre, el logo y el RTN
    Entonces las facturas y los reportes nuevos usan esos datos

  Escenario: Cargar un CAI
    Dado un negocio en modo interno
    Cuando cargo un CAI con su rango y su fecha límite
    Entonces las facturas nuevas pasan a usar la numeración del SAR

  Escenario: Crear un usuario
    Dado que soy administrador
    Cuando creo un usuario vendedor
    Entonces puede iniciar sesión y solo ve el punto de venta
```

---

## HU-29 · Proteger las contraseñas y el acceso

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `seguridad` `rol-admin` `rol-vendedor` · **Estado:** pendiente (Fase 7)

**Historia:** Como dueño del negocio, quiero que las contraseñas estén protegidas y que no se pueda adivinar una cuenta a fuerza de intentos, para resguardar mi información.

```gherkin
# language: es
Característica: Seguridad de las cuentas

  Escenario: Contraseñas con hash
    Dado cualquier usuario del sistema
    Cuando reviso la base de datos
    Entonces ninguna contraseña está guardada en texto plano

  Escenario: Intentos fallidos
    Dado que fallé varias veces seguidas al iniciar sesión
    Cuando intento otra vez
    Entonces el acceso se bloquea por un tiempo

  Escenario: Formularios protegidos
    Dado un formulario que cambia datos
    Cuando se envía sin el token de seguridad de la sesión
    Entonces el servidor lo rechaza

  Escenario: Migración de los usuarios existentes
    Dado usuarios con contraseña en texto plano
    Cuando se aplica la migración de seguridad
    Entonces todos pasan a tener hash y pueden entrar con la misma contraseña
```

---

## HU-30 · Entrar desde el celular con un QR

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `rol-admin` `rol-vendedor` · **Estado:** pendiente (Fase 8)

**Historia:** Como administrador, quiero generar un código QR, para que mi equipo abra el sistema en su celular sin escribir la dirección.

```gherkin
# language: es
Característica: Acceso móvil con QR

  Escenario: Generar el QR
    Dado que soy administrador
    Cuando pido el código QR de acceso
    Entonces veo un QR que abre la aplicación en el navegador del celular

  Escenario: Código temporal
    Dado un código de acceso con vencimiento
    Cuando se usa después de su vencimiento
    Entonces el sistema lo rechaza

  Escenario: Código de un solo uso
    Dado un código ya utilizado
    Cuando alguien intenta usarlo otra vez
    Entonces el sistema lo rechaza
```

---

## HU-31 · Registrar el método de pago de cada venta

**Milestone:** Corte 3 · **Etiquetas:** `corte-3` `feature` `db` `rol-admin` `rol-vendedor` · **Estado:** pendiente (Fase 8)

**Historia:** Como vendedor, quiero indicar si el cliente pagó en efectivo, con tarjeta o por transferencia, para que el dinero entre a la cuenta correcta.

```gherkin
# language: es
Característica: Método de pago

  Escenario: Pago en efectivo
    Dado que cobro una venta
    Cuando elijo efectivo
    Entonces el dinero entra a Caja

  Escenario: Pago con tarjeta o transferencia
    Dado que cobro una venta
    Cuando elijo tarjeta o transferencia
    Entonces el dinero entra a Bancos

  Escenario: Reporte por método
    Dado ventas cobradas con distintos métodos
    Cuando abro el flujo de caja
    Entonces veo cuánto entró por Caja y cuánto por Bancos
```
