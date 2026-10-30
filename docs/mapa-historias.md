# Mapa de historias

El mapa ordena el producto de izquierda a derecha según lo que hace una persona con el sistema, de la entrada al reporte final. Hacia abajo se detallan las tareas y, dentro de cada una, las historias que la hacen posible. Cada fila de historias se asigna a un corte, que es una entrega que ya deja el producto en un estado útil.

Las historias se identifican como `HU-01`, `HU-02`, etc. y están escritas con criterios de aceptación en [github-issues/issues_mvp.md](../github-issues/issues_mvp.md).

## Roles

| Rol | Descripción | Lo que puede hacer |
|---|---|---|
| **Administrador** | Dueña o dueño del negocio | Todo: catálogo, inventario, clientes, proveedores, ventas, facturas, finanzas y configuración. Al iniciar sesión llega al panel de inicio. |
| **Vendedor** | Persona que atiende el mostrador | Usar el punto de venta: buscar productos, registrar un cliente nuevo, cobrar, emitir la factura y hacer cotizaciones. Solo ve los PDF de sus propias ventas. Al iniciar sesión llega directo al punto de venta. |

### Acceso por módulo

| Módulo | Administrador | Vendedor |
|---|:---:|:---:|
| Inicio (panel) | ✔ | — |
| Punto de venta | ✔ | ✔ |
| Inventario y categorías | ✔ | — |
| Clientes | ✔ | Solo el alta rápida desde el punto de venta |
| Proveedores | ✔ | — |
| Facturas | ✔ | Solo el PDF de sus ventas |
| Finanzas | ✔ | — |
| Estadísticas *(Fase 6)* | ✔ | — |
| Configuración *(Fase 7)* | ✔ | — |

## Vista general del mapa

| | **1. Entrar y administrar el acceso** | **2. Armar el catálogo y controlar el inventario** | **3. Administrar clientes y proveedores** | **4. Vender y facturar** | **5. Cobrar, pagar y registrar movimientos** | **6. Llevar la contabilidad** | **7. Entender el negocio** |
|---|---|---|---|---|---|---|---|
| **Corte 1: Ventas e inventario** | HU-01 HU-02 HU-03 | HU-04 HU-05 HU-06 HU-07 | HU-08 HU-09 | HU-10 HU-11 HU-12 HU-13 HU-14 HU-15 | | | |
| **Corte 2: Finanzas y contabilidad** | | | | | HU-16 HU-17 HU-18 HU-19 HU-20 | HU-21 HU-24 HU-25 | HU-22 HU-23 |
| **Corte 3: Análisis, seguridad y móvil** | HU-28 HU-29 HU-30 | HU-26 | | HU-31 | | | HU-27 |

## Detalle por actividad

Estado: ✔ construida · ⬜ pendiente.

### 1. Entrar y administrar el acceso

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Iniciar sesión | **HU-01** Entrar con usuario y contraseña y llegar a la pantalla que corresponde al rol | ✔ | ✔ | 1 | ✔ |
| Ver cómo va el negocio | **HU-02** Panel con ventas, productos con stock bajo y modo de facturación vigente | ✔ | — | 1 | ✔ |
| Limitar el acceso según el rol | **HU-03** Cada rol ve y usa solo sus módulos | ✔ | ✔ | 1 | ✔ |
| Mantener los datos del negocio y los usuarios | **HU-28** Editar nombre, logo, RTN, CAI y usuarios desde la interfaz | ✔ | — | 3 | ⬜ |
| Proteger las cuentas | **HU-29** Contraseñas con hash, protección CSRF y límite de intentos | ✔ | ✔ | 3 | ⬜ |
| Entrar desde el celular | **HU-30** Acceso móvil con un código QR | ✔ | ✔ | 3 | ⬜ |

### 2. Armar el catálogo y controlar el inventario

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Organizar los productos | **HU-04** Crear, editar y desactivar categorías | ✔ | — | 1 | ✔ |
| Registrar un producto | **HU-05** Producto con SKU, precios, unidad, stock mínimo e imagen | ✔ | — | 1 | ✔ |
| Vender el mismo producto en varias tallas o ediciones | **HU-06** Variantes con stock propio | ✔ | — | 1 | ✔ |
| Vender combos | **HU-07** Kits que descuentan el stock de sus componentes | ✔ | — | 1 | ✔ |
| Saber qué reponer | **HU-26** Inventario visual y alertas de stock bajo | ✔ | — | 3 | ⬜ |

### 3. Administrar clientes y proveedores

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Llevar la lista de clientes | **HU-08** Clientes con RTN opcional, búsqueda en vivo y vista en tarjetas | ✔ | Alta rápida | 1 | ✔ |
| Llevar la lista de proveedores | **HU-09** Proveedores con contacto y búsqueda | ✔ | — | 1 | ✔ |

### 4. Vender y facturar

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Armar la venta | **HU-10** Buscar por nombre o SKU, elegir variante y validar el stock | ✔ | ✔ | 1 | ✔ |
| Cobrar con factura fiscal | **HU-11** Factura con el siguiente número del CAI. Bloqueo si el CAI venció o se agotó | ✔ | ✔ | 1 | ✔ |
| Cobrar sin estar inscrito en el SAR | **HU-12** Comprobante interno numerado (INT-000001) | ✔ | ✔ | 1 | ✔ |
| Cobrar sin duplicar | **HU-13** Un cobro repetido por doble toque o mala conexión no crea otra venta | ✔ | ✔ | 1 | ✔ |
| Entregar el documento | **HU-14** Factura y cotización en PDF | ✔ | ✔ | 1 | ✔ |
| Consultar lo vendido | **HU-15** Historial de facturas con filtros y marcar pagada | ✔ | — | 1 | ✔ |
| Registrar cómo pagó el cliente | **HU-31** Método de pago: efectivo, tarjeta o transferencia | ✔ | ✔ | 3 | ⬜ |

### 5. Cobrar, pagar y registrar movimientos

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Vender a crédito | **HU-16** Venta pendiente con fecha de vencimiento que entra sola a cuentas por cobrar | ✔ | ✔ | 2 | ✔ |
| Cobrar lo que deben los clientes | **HU-17** Abonos parciales o totales con antigüedad de saldos | ✔ | — | 2 | ✔ |
| Pagar lo que se debe a proveedores | **HU-18** Cuentas por pagar con pagos parciales o totales | ✔ | — | 2 | ✔ |
| Registrar ingresos y gastos | **HU-19** Ingresos varios y gastos, cobrados o pagados, o por cobrar y por pagar | ✔ | — | 2 | ✔ |
| Comprar mercadería | **HU-20** Compra que sube el stock y recalcula el costo | ✔ | — | 2 | ✔ |

### 6. Llevar la contabilidad

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Tener los asientos sin hacerlos a mano | **HU-21** Partida doble automática y libro diario consultable | ✔ | — | 2 | ✔ |
| Corregir un error | **HU-24** Asientos manuales y anulaciones con contrapartida | ✔ | — | 2 | ✔ |
| Empezar a llevar la contabilidad | **HU-25** Iniciar con inventario y cuentas por cobrar, cargar el saldo inicial y conciliar el inventario | ✔ | — | 2 | ✔ |

### 7. Entender el negocio

| Tarea | Detalles (historias) | Administrador | Vendedor | Corte | Estado |
|---|---|:---:|:---:|:---:|:---:|
| Ver la situación del dinero | **HU-22** Panel con caja y bancos, por cobrar, por pagar, utilidad del mes y gráfico de seis meses | ✔ | — | 2 | ✔ |
| Sacar los reportes | **HU-23** Estado de resultados, flujo de caja, balance general y antigüedad de saldos en PDF | ✔ | — | 2 | ✔ |
| Ver qué se vende más | **HU-27** Estadísticas de ventas | ✔ | — | 3 | ⬜ |

## Cortes

### Corte 1: Ventas e inventario

**Meta:** un negocio puede cargar su catálogo, vender y entregar una factura válida desde el navegador.

**Historias:** HU-01 a HU-15.

**Al terminar, la persona puede:** entrar con su rol, administrar categorías, productos con variantes y kits, clientes y proveedores, cobrar una venta con factura con CAI o con comprobante interno, imprimir el PDF y consultar el historial.

**Criterio de salida:** una venta completa, desde la búsqueda del producto hasta el PDF, sin errores y con el stock descontado.

### Corte 2: Finanzas y contabilidad

**Meta:** el dueño sabe cuánto tiene, cuánto le deben, cuánto debe y cuánto ganó, sin llevar libros a mano.

**Historias:** HU-16 a HU-25.

**Al terminar, la persona puede:** vender a crédito, cobrar en partes, registrar ingresos, gastos y compras con su condición de pago, ver el libro diario y descargar los cuatro reportes en PDF.

**Criterio de salida:** los reportes cuadran, Activo = Pasivo + Patrimonio y las cuentas por cobrar y por pagar coinciden con el detalle de documentos.

Con el Corte 2 se alcanza el **piso de app completa** descrito en [plan.md](plan.md).

### Corte 3: Análisis, seguridad y móvil

**Meta:** reforzar el producto para uso real con usuarios no técnicos.

**Historias:** HU-26 a HU-31.

**Al terminar, la persona puede:** ver alertas de stock y estadísticas, administrar su negocio y sus usuarios desde la interfaz con contraseñas protegidas, entrar desde el celular con un QR y registrar el método de pago de cada venta.

**Criterio de salida:** ninguna contraseña en texto plano y una venta completa hecha desde un celular real.
