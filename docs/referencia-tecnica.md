# Referencia técnica de Andeliza ERP

> Detalle de pantallas, endpoints, reglas de negocio y configuración de las Fases 1 a 4. El punto de entrada del proyecto es el [README](../README.md). Los scripts SQL viven en [`db/`](../db/README.md).

Sistema de gestión web para pymes: ventas (POS), inventario, facturas, finanzas y estadísticas.
Es el **template base**: se clona una vez por cliente. Cada cliente tiene su propio proyecto de
Supabase y su propio despliegue en Vercel; lo que cambia entre clientes vive en `client.config.js`.

Stack: Node.js 20 + Express, EJS, PostgreSQL (Supabase), Tailwind y Alpine.js por CDN, Vercel.

## Estado

| Fase | Módulo | Estado |
|------|--------|--------|
| 1 | Base, login, layout, dashboard | Hecha |
| 2 | CRUDs: categorías, clientes, proveedores, productos (imagen, variantes, kits) y facturación interna | Hecha |
| 3 | POS y facturación (PDF, cotización, historial) | Hecha |
| 4 | Finanzas y contabilidad: partida doble, cuentas por cobrar y por pagar, reportes en PDF | Hecha |
| 5 | Inventario visual y alertas de stock | Absorbida por la Fase 2 |
| 6 | Estadísticas de ventas, panel de inicio rediseñado y menú de perfil | Hecha |
| 7 | Configuración, usuarios y roles con permisos (hecha antes que la 6, por decisión de arquitectura D-01) | Hecha |
| 8 | Avisos automáticos, asistente virtual con IA y método de pago | Pendiente (ideas por validar) |

## Puesta en marcha local

La instalación paso a paso está en el [README](../README.md#instalación). Resumen del orden de la base de datos: `db/migrations/01` a `04`, luego `db/functions.sql` y, si quieres datos de ejemplo, `db/seed.sql`.

## Estructura

```
app.js                 Configuración de Express (middlewares, vistas, rutas, errores)
api/index.js           Punto de entrada para Vercel (exporta app, sin listen)
client.config.js       TODO lo específico del cliente
modulos.js             Lista de módulos: menú por permisos, pantalla de inicio y funcionalidades
db.js                  Pool de pg y conversión de tipos
middlewares/auth.js    cargarPermisos (requireAuth), requirePermiso, requireAlgunPermiso, requireFuncionalidad
middlewares/auditar.js Anota en la auditoría una acción que salió bien
routes/ controllers/ models/   Un archivo por módulo
controllers/entidad.js Fábrica de CRUD para listados con modal (categorías, clientes, proveedores)
controllers/finanzas.js, cartera.js, movimientos.js   Resumen, libro diario, CxC y CxP, ingresos/gastos/compras, reportes
controllers/pos.js     POS: catálogo, alta rápida de cliente, cobro y cotización
controllers/facturas.js, controllers/documentos.js   Historial, marcar pagada y armado de los PDF
models/ventas.js       Cobro (crear_venta + clave anti-duplicado), cotización, historial con filtros
models/pos.js, models/negocio.js   Catálogo del POS; datos del negocio y modo de facturación
services/pdfService.js PDF en memoria con pdfkit (factura, comprobante interno, cotización)
services/reportesPdfService.js  Reportes contables en PDF (resultados, flujo de caja, balance, antigüedad)
models/contabilidad.js, cartera.js, movimientos.js   Libro, reportes, CxC/CxP e ingresos/gastos/compras
utils/totales.js       Cálculo de subtotal, impuesto y total en centavos (igual que Postgres)
services/storageService.js  Subida y borrado de imágenes en Supabase Storage (solo servidor)
public/js/             ui.js (utilidades), entidades.js, inventario.js, producto-form.js, pos.js, facturas.js, finanzas-*.js (Alpine)
routes/modulos.js      Páginas "próximamente" de los módulos que aún no existen (hoy todos existen: queda como red de seguridad)
models/estadisticas.js  Filtros, períodos, respuesta JSON e insights de /estadisticas (llama a las funciones SQL de la migración 06)
models/perfil.js, controllers/perfil.js   /perfil y /perfil/actividad
models/dashboard.js     Panel de inicio: ventas del día, cobranza, stock, facturación, alertas, top de productos y últimas ventas
public/js/iconos.js     Íconos de línea compartidos por el servidor (EJS) y el navegador (Alpine)
public/js/estadisticas.js, dashboard.js   Filtros y gráficos de Chart.js
views/                 EJS: layouts, partials y una carpeta por módulo
db/                    migrations/ (01 a 06), functions.sql, seed.sql y README.md
```

## Facturación: modo SAR o modo interno

`crear_venta` decide solo el tipo de número:

- **Hay una `configuracion_fiscal` activa**: usa el CAI (`CAI-00000001`) y la venta queda con `tipo_documento = 'fiscal'`.
  Si esa configuración está vencida o sin números, **bloquea** con un mensaje claro (no cae a interno por error).
- **No hay ninguna activa**: usa numeración propia (`INT-000001`, `INT-000002`...) con `tipo_documento = 'interno'`,
  sin bloquear la venta. El prefijo y el contador viven en `configuracion_negocio`.

Para un cliente sin SAR basta con no cargar la configuración fiscal (o dejarla inactiva:
`UPDATE configuracion_fiscal SET activo = FALSE;`). El dashboard y el pie del carrito del POS muestran en qué modo está, y el POS
avisa cuando quedan 5 números fiscales o menos.

## Imágenes de productos

Se guardan en Supabase Storage, en un bucket público llamado `productos` (se crea solo la primera vez que se
sube una imagen). La subida pasa por el servidor con `SUPABASE_KEY`: la llave nunca llega al navegador.
El navegador reduce la foto a 1200 px (JPG) antes de enviarla, porque Vercel limita el cuerpo de una petición
a unos 4.5 MB y el servidor rechaza imágenes de más de 4 MB.

## Punto de venta (`/pos`)

- **Escritorio**: catálogo a la izquierda (60 %) y carrito fijo a la derecha (40 %). **Celular y tablet**: catálogo a todo el
  ancho, barra flotante «Ver carrito» con el total y el carrito sube como hoja desde abajo.
- **Catálogo**: búsqueda en vivo por nombre o SKU (sin acentos ni mayúsculas), filtro por categoría, vista tarjetas o lista.
  `/` enfoca el buscador. Con un lector de códigos, escribir un SKU exacto (de producto o de variante) y Enter lo agrega.
- **Stock**: se valida en la pantalla contra lo que ya hay en el carrito. Un kit reserva el stock de sus componentes, así que
  vender el kit y el componente suelto no puede pasarse del stock real. El servidor vuelve a validar al cobrar.
- **Variantes**: el producto abre un modal para elegir talla/equipo (según `tiposVariante`) y cantidad. Las opciones sin stock
  para lo ya elegido se ven atenuadas; al tocarlas se suelta la opción que no combina.
- **Cliente**: buscador con autocompletado (nombre, teléfono o RTN). Sin cliente la venta sale a «Consumidor Final».
  «Nuevo» abre un alta rápida sin perder la venta. El RTN es opcional.
- **Cobrar**: el servidor recalcula precios y totales con lo que hay en la base (lo que mande el navegador se ignora) y llama a
  `crear_venta`. La venta queda **pagada** salvo que se active «Dejar pendiente de pago».
- **Cobros que no se duplican**: cada cobro lleva una clave. Si el mismo cobro se reintenta (doble toque, red lenta) se devuelve
  la misma venta y el stock y el número de factura se usan una sola vez.
- **Carrito guardado**: sobrevive a recargar la página (12 horas, por usuario). Al recuperarlo se ajusta a precios y stock actuales.
- **Éxito**: indica si es factura fiscal (con CAI) o comprobante interno, con botones Imprimir PDF, Descargar y Nueva venta.

## Facturas (`/facturas`, solo administrador)

Historial con filtros en vivo: rango de fechas (en la hora del negocio), fiscal/interna, pagada/pendiente y búsqueda por cliente o
número. Carga de 50 en 50. Cada factura se puede ver o descargar en PDF; las pendientes se pueden **marcar como pagadas**
(no se puede deshacer desde la pantalla).

## PDF

`services/pdfService.js` genera el PDF en memoria (Buffer) y lo responde directo: nada se escribe en el disco, como pide Vercel.

- **Fiscal**: muestra el CAI, el rango autorizado, la fecha límite de emisión y el pie legal. El CAI se toma del propio número
  de factura, así que reimprimir una factura vieja conserva su CAI aunque después se cambie la configuración fiscal.
- **Interno**: lleva la franja y el pie «COMPROBANTE INTERNO - No válido para crédito fiscal» y una marca de agua «NO FISCAL».
- **Cotización**: no es documento fiscal, no consume stock ni números; vale 15 días (configurable).
- El logo sale de `configuracion_negocio.logo_url` o, si está vacío, de `client.config.js`. Solo se admiten PNG y JPEG; si el
  logo falla, el PDF se genera igual sin logo.
- En Vercel, `vercel.json` incluye `node_modules/pdfkit/**` (pdfkit carga sus fuentes de una forma que el empaquetado no detecta).
  Para comprobar el despliegue: `GET /salud?pdf=1`.

## Endpoints de la Fase 3

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /pos` | `pos.ver` | Pantalla del POS (catálogo, clientes, tasa y modo de facturación) |
| `GET /pos/catalogo` | `pos.ver` | Catálogo con el stock actual (JSON) |
| `POST /pos/clientes` | `clientes.crear` | Alta rápida de cliente |
| `POST /pos/cobrar` | `pos.crear` | Cobra. Cuerpo: `cliente_id`, `items` (`producto_id`, `variante_id`, `cantidad`), `pendiente`, `clave` |
| `POST /pos/cotizacion` | `pos.crear` | PDF de cotización (campo de formulario `datos` con el carrito en JSON) |
| `GET /facturas` | admin | Pantalla del historial |
| `GET /facturas/datos` | admin | Historial en JSON: `desde`, `hasta`, `tipo`, `estado`, `q`, `offset` |
| `PATCH /facturas/:id/pagada` | admin | Marca una factura como pagada |
| `GET /facturas/:id/pdf[?descargar=1]` | `facturas.ver` (todas); sin él, solo las propias | PDF de la venta |
| `GET /salud[?pdf=1]` | público | Comprueba la base de datos (y la generación de PDF) |

En `/facturas/datos`, si no se manda `desde` se usa el primer día del mes; mandarlo vacío (`desde=`) significa sin límite.
Las rutas del POS responden 404 si `funcionalidades.pos` está en `false`; `/facturas` y su JSON, si `facturas` está en `false`.
El PDF sirve con cualquiera de las dos funcionalidades activas.

## Configuración, usuarios y cuenta (Fase 7)

Todo `/configuracion` exige permisos de `configuracion`, que son solo del rol `admin`. El detalle de qué permiso pide cada ruta del sistema está en [permisos.md](permisos.md).

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /configuracion` | `configuracion.ver` | Pestaña Negocio (datos, logo, interruptor del SAR) |
| `PUT /configuracion/negocio` | `configuracion.editar` | Guarda nombre, RTN, dirección, teléfono, correo y logo (multipart; PNG o JPG hasta 3 MB) |
| `PUT /configuracion/facturacion` | `configuracion.editar` | `sar`: true/false. Con true: `cai`, `rango_inicio`, `rango_fin`, `fecha_limite`, `tasa` (%), `pie_legal` |
| `GET /configuracion/usuarios`, `.../datos` | `configuracion.ver` | Lista de usuarios con rol, estado y último acceso |
| `POST /configuracion/usuarios` | `configuracion.crear` | Cuerpo: `nombre`, `usuario`, `contrasena`, `rol_id`, `debe_cambiar` |
| `PUT /configuracion/usuarios/:id` | `configuracion.editar` | Cambia nombre y rol |
| `PATCH /configuracion/usuarios/:id/activo` | `configuracion.editar` | Activa o desactiva (al desactivar se cierran sus sesiones) |
| `POST /configuracion/usuarios/:id/codigo` | `configuracion.editar` | Genera el código de recuperación (se devuelve una sola vez) |
| `GET /configuracion/roles`, `.../datos` | `configuracion.ver` | Roles y catálogo de permisos |
| `POST /configuracion/roles` | `configuracion.crear` | Cuerpo: `nombre`, `descripcion`, `copiar_de` (opcional) |
| `PUT /configuracion/roles/:id` | `configuracion.editar` | Nombre, descripción y estado |
| `DELETE /configuracion/roles/:id` | `configuracion.eliminar` | Elimina un rol propio sin usuarios |
| `GET`/`PUT /configuracion/roles/:id/permisos` | `ver` / `editar` | Lee o reemplaza los permisos (`permisos`: lista de ids) |
| `GET /configuracion/auditoria`, `.../datos` | `configuracion.ver` | Últimos 50 movimientos |
| `GET`/`POST /cambiar-contrasena` | Con sesión | Cambio de la propia contraseña (obligatorio si es provisional) |
| `GET`/`POST /recuperar` | Pública | Usar el código de recuperación para elegir una contraseña nueva |

## Panel de inicio (`/`)

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /` | `dashboard.ver` | Panel de inicio. Quien no lo tiene (vendedor, contador) es enviado a su módulo principal: el vendedor al POS y el contador a Finanzas |

Cada bloque aparece solo si la persona puede verlo (permiso y funcionalidad activa en `client.config.js`) y solo si hay algo que mostrar:

1. **Bienvenida:** saludo según la hora del negocio, la fecha en español y una línea con lo de hoy ("L X en N ventas · M facturas pendientes de cobro").
2. **Alertas del sistema** (la sección se oculta si no hay ninguna):
   - **CAI:** *urgente* si está vencido, agotado, quedan 5 números o menos, o vence en 7 días o menos. *Aviso* si vence en 30 días o menos. El enlace a Configuración solo aparece para quien puede abrirla.
   - **Contabilidad sin iniciar** (solo con `finanzas.ver`).
   - **Conciliación de inventario pendiente**: el inventario físico difiere del libro contable en L 1.00 o más (solo con la contabilidad iniciada y `finanzas.ver`).
3. **Cuatro tarjetas del día:** ventas de hoy contra ayer (▲/▼ con %), cuentas por cobrar con lo vencido (solo `finanzas.ver`), stock bajo y el estado de la facturación (con CAI: cuántos números quedan y cuándo vence. Interna: el siguiente comprobante).
4. **Gráfico de las ventas de los últimos 30 días** (línea con área; Chart.js).
5. **Accesos rápidos con contexto:** Cobrar venta (con el stock bajo), Ver inventario (con el conteo de productos), Gestionar cartera (con lo que hay por cobrar) y Ver estadísticas (con las ventas del mes).
6. **Los 5 productos del mes** con su imagen (o sus iniciales) y las unidades vendidas.
7. **Últimas 5 ventas**, solo con `facturas.ver` (todas) o `facturas.ver_propias` (únicamente las de la persona, y lo dice).

El panel reutiliza las funciones de estadísticas (`estadisticas_kpis`, `estadisticas_serie`, `estadisticas_top_productos`) y la vista `v_cxc`, y usa la zona horaria del negocio guardada en la base (`hoy_negocio()`).

## Estadísticas (Fase 6)

Pantalla gerencial para entender qué se vendió, cuándo, quién y con qué margen, sin exportar nada a Excel. Exige `estadisticas.ver` (administrador y supervisor de fábrica) y responde 404 si `funcionalidades.estadisticas` está en `false`.

| Método y ruta | Qué hace |
|---|---|
| `GET /estadisticas` | La pantalla. Los filtros consultan el JSON sin recargar la página |
| `GET /estadisticas/datos` | JSON con todo lo que se dibuja. Parámetros: `periodo`, `desde`, `hasta`, `vendedor`, `categoria` |
| `GET /estadisticas/reporte.pdf` | PDF del período con los mismos parámetros. `descargar=1` lo baja como adjunto. Cada exportación queda en la auditoría |

**Filtros.** `periodo` es un atajo y vale uno de: `hoy`, `ayer`, `semana` (desde el lunes), `mes`, `mes_pasado`, `30d`, `anio` y `todo` (por defecto `mes`). Si llegan `desde` o `hasta`, mandan ellas (rango personalizado). `vendedor` y `categoria` son ids. Una fecha final futura se recorta al día de hoy, y las fechas inválidas, invertidas o anteriores al año 2000 responden 422 con un mensaje en español.

**Indicadores** (cada uno se compara con el *período anterior de igual longitud*, pegado al actual. "Todo" no compara):

| Indicador | Cómo se calcula |
|---|---|
| Ventas totales | Suma de las ventas del período, cobradas o a crédito, **con impuesto** (igual que Facturas) |
| Facturas emitidas | Ventas distintas en el período |
| Ticket promedio | Ventas totales entre facturas |
| Margen bruto (L y %) | (precio − `costo_unitario` guardado en la venta) × cantidad, **sin impuesto**. El % es sobre las ventas sin impuesto. Si hay ventas sin costo registrado, la tarjeta lo avisa |
| Productos distintos vendidos | Productos diferentes con al menos una venta |
| Fiscales vs internas | Porcentaje de facturas de cada tipo |

**Gráficos** (Chart.js, con etiquetas y tooltips con "L" y separador de miles):

| Gráfico | Contenido |
|---|---|
| Ventas en el tiempo | Línea por día. Barras por semana o por mes. La agrupación es automática: hasta 62 días por día, hasta 270 por semana y más por mes. Los períodos sin ventas salen en cero |
| Productos más vendidos | Barras horizontales de los 10 principales, con un interruptor *Por monto* / *Por cantidad* |
| Categorías | Anillo con las 5 principales por monto y "Otras" con el resto |
| Fiscal vs interno | Anillo de dos partes (facturas, porcentaje y monto en el tooltip) |
| Ventas por vendedor | Barras horizontales con el monto, y en el tooltip # de facturas y % del total |
| Ventas por día de la semana | Barras de lunes a domingo, con el promedio por día en el tooltip |

**Insights automáticos.** Frases redactadas con los valores reales del período. Solo aparecen cuando hay datos para sostenerlas: variación contra el período anterior, mejor día, producto más vendido, vendedor líder, producto con mejor margen, cuentas por cobrar vencidas (solo con `finanzas.ver`), cambio del ticket promedio, porcentaje vendido a crédito, día de la semana más fuerte (con 14 días o más) y un aviso cuando el costo no está completo.

**Ranking de vendedores.** Tabla con vendedor, rol (leído de `roles`), # de facturas, monto, ticket promedio, % del total y última venta, ordenada por monto. **No aplica el filtro de vendedor**: muestra a todo el equipo para que el porcentaje tenga sentido. Es la tabla que solo es posible porque `ventas.usuario_id` existe y cada usuario tiene `rol_id` (decisión D-01).

**Reporte en PDF.** Logo y datos del negocio, período, filtros y comparación, indicadores, lo más importante, los gráficos y el ranking. Los gráficos se **dibujan en el servidor con pdfkit** a partir de los mismos datos de la pantalla: así el reporte sale de una simple dirección (un `GET` no puede cargar imágenes) y no depende del navegador. Sin ventas en el período, el PDF lo dice con un mensaje.

**Respuesta de `/estadisticas/datos`.** `{ ok, vacio, rango, filtros, kpis, serie, topProductos, topCategorias, rankingVendedores, fiscalVsInterno, porDiaSemana, insights }`. Cuando `vacio` es `true` la pantalla muestra un mensaje amable en lugar de los gráficos.

**Funciones SQL** (`db/migrations/06_migracion_fase6.sql`, todas de solo lectura y `STABLE`):

| Función | Para qué |
|---|---|
| `zona_negocio()` | Zona horaria del negocio |
| `estadisticas_lineas(desde, hasta, vendedor, categoria)` | Una fila por línea de venta del período con su neto, bruto (con impuesto repartido), costo y si tiene costo |
| `estadisticas_kpis(...)` | Los indicadores del período |
| `estadisticas_serie(..., agrupar)` | Ventas por día, semana o mes, con ceros |
| `estadisticas_top_productos(..., limite)` | Principales por cantidad y por monto, y el de mejor margen |
| `estadisticas_top_categorias(..., limite)` | Principales categorías y "otras" |
| `estadisticas_vendedores(desde, hasta, categoria)` | Ranking de vendedores (une `usuarios` y `roles`) |
| `estadisticas_dia_semana(...)`, `estadisticas_mejor_dia(...)` | Ventas por día de la semana y el mejor día |
| `estadisticas_panel(...)` | Todo lo anterior, más el período anterior, en una sola llamada |

El período se mide por el **día local del negocio**: una venta de las 23:59 pertenece a su día aunque en UTC ya sea el siguiente. La migración agrega el índice `idx_ventas_usuario` (los otros tres que pedía la fase ya existían desde la Fase 1) y no cambia ninguna tabla ni función existente.

**Límites.** El permiso `estadisticas.ver` muestra a todo el equipo (no hay un "solo mis ventas" para esta pantalla). Las ventas anteriores a que se registrara el costo de cada producto tienen `costo_unitario` en cero: por eso el margen avisa cuánto de lo vendido tiene costo.

## Perfil y menú de usuario

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /perfil` | Cualquier usuario con sesión | Datos de la persona (nombre, usuario, rol, último acceso, acceso anterior, cuenta creada y contraseña cambiada), su matriz de permisos y los módulos que puede abrir |
| `GET /perfil/actividad` | Cualquier usuario con sesión | Sus últimos 20 movimientos (`auditoria` con `usuario_id` = el de la sesión): fecha y hora, acción, entidad, descripción e IP |

- **Matriz "Tus permisos".** Se lee de `roles_permisos` en cada visita (no está escrita en el código), agrupada por módulo, con ✔ para lo que el rol tiene y — para lo que no. Las acciones que un módulo no ofrece salen en blanco. El administrador tiene todo por definición.
- **Regla de propiedad.** Estas rutas nunca reciben un id de usuario: usan el de la sesión. Los intentos fallidos de inicio de sesión sobre la cuenta aparecen resaltados, para que la persona note si alguien probó su contraseña.
- **Último acceso.** Es el inicio de la sesión actual (el inicio de sesión lo registra al entrar). En *Mi perfil* también se muestra el **acceso anterior**, tomado de la auditoría.
- **Menú del encabezado.** Un círculo con la inicial del nombre y un ícono según el rol (administrador: escudo. Supervisor: insignia. Vendedor: bolsa. Contador: calculadora. Los roles creados por el administrador: persona). Al abrirlo muestra nombre, usuario, rol y último acceso, y las opciones *Mi Perfil*, *Cambiar contraseña*, *Mi actividad*, *Ir a Configuración* (solo administrador) y *Cerrar sesión* (en rojo, un `POST /logout`). Se cierra con la tecla ESC o con un clic fuera. En el celular (menos de 640 px) se muestra como una hoja inferior.
- **Sidebar.** En la parte de abajo, fijos y con un separador, *Cambiar contraseña* y *Salir*. Llevan el atributo `title` como ayuda al pasar el cursor (el menú lateral no tiene un modo contraído).

## Configuración opcional (`client.config.js` > `valoresPorDefecto`)

Todas son opcionales: si no existen se usa el valor de la derecha.

| Clave | Valor por defecto | Para qué sirve |
|---|---|---|
| `impuestoIncluidoEnPrecio` | `false` | `true` si los precios de venta ya incluyen el impuesto (se desglosa en lugar de sumarlo) |
| `diasValidezCotizacion` | `15` | Días de vigencia que muestra la cotización |
| `unidadesDecimales` | `kilo, libra, metro, yarda, litro, galon, onza` | Unidades que se pueden vender en fracciones; las demás van en enteros |

## Finanzas y contabilidad (`/finanzas`, solo administrador)

Seis pestañas: **Resumen**, **Por cobrar**, **Por pagar**, **Movimientos**, **Libro diario** y **Reportes**.
Todo el dinero se registra con **partida doble**: cada operación genera una partida (asiento) cuyo Debe y Haber suman
exactamente lo mismo. La base de datos lo impone con dos candados: una partida descuadrada no se confirma, y lo ya
registrado no se modifica ni se borra (un error se corrige con una **contrapartida**, que queda a la vista en el libro).

### Cómo se inicia
Desde el Resumen, botón **Iniciar contabilidad hoy** (o `SELECT generar_apertura_contable();`). Eso toma el estado de hoy como
punto de partida: **Inventario** (existencias a costo) **+ Cuentas por cobrar** (ventas pendientes) **= Capital**. Caja y Bancos
arrancan en cero: con *Saldo inicial* se registra con cuánto dinero empezó el negocio. Lo anterior a ese día no entra al libro
(sigue visible en Facturas) y no se puede registrar nada con fecha anterior. Mientras no se inicie, el POS vende igual y no genera partidas.

### Plan de cuentas
| Código | Cuenta | Tipo |
|---|---|---|
| 1101 / 1102 | Caja general / Bancos | Activo |
| 1201 | Cuentas por cobrar | Activo |
| 1301 | Inventario de mercadería | Activo |
| 2101 | Cuentas por pagar | Pasivo |
| 2201 | Impuesto sobre ventas por pagar | Pasivo |
| 3101 | Capital y aportes | Patrimonio |
| 4101 | Ventas | Ingreso |
| 4201 a 4205 | Intereses, alquileres, servicios, inversiones y otros ingresos | Ingreso |
| 5101 | Costo de ventas | Gasto |
| 5201 | Ajustes de inventario (mermas y sobrantes) | Gasto |
| 6101 a 6105 | Logística, marketing, operativos, mantenimiento y otros gastos | Gasto |

El sistema ubica cada cuenta por su `clave` (no por el código), así que se puede renumerar sin romper nada.

### Qué partida genera cada operación
| Operación | Debe | Haber |
|---|---|---|
| Venta pagada en el POS | Caja (total) · Costo de ventas | Ventas (subtotal) · Impuesto por pagar · Inventario |
| Venta pendiente en el POS | Cuentas por cobrar (total) · Costo de ventas | Ventas · Impuesto por pagar · Inventario |
| Abono de un cliente | Caja o Bancos | Cuentas por cobrar |
| Ingreso cobrado / por cobrar | Caja o Bancos / Cuentas por cobrar | Cuenta del ingreso |
| Gasto pagado / por pagar | Cuenta del gasto | Caja o Bancos / Cuentas por pagar |
| Compra pagada / por pagar | Inventario | Caja o Bancos / Cuentas por pagar |
| Pago a proveedor | Cuentas por pagar | Caja o Bancos |
| Anulación de cualquiera | (invierte la partida original) | |

### Cuentas por cobrar y por pagar
- **Por cobrar**: ventas del POS dejadas como «Pendiente de pago» e ingresos «Por cobrar». **Por pagar**: compras y gastos «Por pagar».
- Cada deuda trae su saldo, su fecha de vencimiento y su antigüedad: *Al día*, *Vencido 1 a 30*, *31 a 60*, *61 a 90* y *Más de 90 días*.
  Si el documento no trae vencimiento se supone `configuracion_negocio.dias_credito` (30 por defecto) y se marca «(est.)».
- **Abonos y pagos parciales**: la deuda baja, el dinero entra o sale de Caja o Bancos, y cuando el saldo llega a cero el documento pasa a cobrado o pagado.
  No se puede abonar más que el saldo, ni con fecha futura ni anterior al documento. Un abono o pago se puede **anular** y la deuda vuelve a quedar pendiente.
- En el POS, al dejar una venta pendiente se puede poner el vencimiento (atajos de 15, 30 y 60 días). En **Facturas**, «Marcar pagada» cobra el saldo que falte en Caja.

### Movimientos
Ingresos varios, gastos y compras de inventario, cada uno con su condición (*Cobrado/Pagado* o *Por cobrar/Por pagar*).
Una **compra** sube el stock (por variante si el producto las tiene) y recalcula el costo del producto con **promedio ponderado**.
Se pueden anular ingresos y gastos que no tengan cobros o pagos; las compras no se anulan en esta fase (se corrige con un asiento manual).

### Inventario del libro y existencias
El stock puede cambiar por fuera del libro (por ejemplo, editando un producto). Cuando la diferencia con el libro llega a L 1.00 o más,
el Resumen ofrece **Conciliar inventario**: la diferencia va a *capital* (mercadería inicial) o a *ajuste de inventario* (mermas y sobrantes, que pasa por resultados).

### Reportes (PDF)
| Reporte | Qué muestra |
|---|---|
| Estado de resultados | Ingresos − costo de ventas − gastos = utilidad, con el porcentaje de cada línea sobre los ingresos |
| Flujo de caja | Saldo inicial + entradas − salidas = saldo final de Caja y Bancos, por tipo de operación |
| Balance general | Activos = Pasivos + Patrimonio, con la verificación de que cuadra |
| Antigüedad de saldos | Por cobrar y por pagar repartidos por días de atraso |

Los ingresos y gastos se reconocen cuando ocurren, no cuando se cobran o pagan: por eso la utilidad puede ser distinta del flujo de caja.

### Endpoints de la Fase 4
| Método y ruta | Qué hace |
|---|---|
| `GET /finanzas` | Resumen: tarjetas y gráfico de 6 meses |
| `POST /finanzas/iniciar` · `/saldo-inicial` · `/conciliar-inventario` | Inicio, saldo inicial de Caja o Bancos y conciliación |
| `GET /finanzas/cxc` · `/cxp` (y `/datos`) | Pantalla y lista JSON de cuentas por cobrar o por pagar |
| `GET /finanzas/cxc/:origen/:id` · `/cxp/:origen/:id` | Historial de abonos o pagos de un documento |
| `POST /finanzas/cxc/abonos` · `/cxp/pagos` | Registra un abono o pago (`origen`, `doc_id`, `monto`, `fecha`, `cuenta`, `notas`) |
| `POST /finanzas/cxc/abonos/:id/anular` · `/cxp/pagos/:id/anular` | Anula un abono o pago |
| `GET /finanzas/movimientos` (y `/datos?tipo=`) | Ingresos, gastos y compras |
| `POST /finanzas/ingresos` · `/gastos` · `/compras` | Registra con su condición de pago |
| `POST /finanzas/ingresos/:id/anular` · `/gastos/:id/anular` | Anula |
| `GET /finanzas/partidas` (y `/datos`, `/balanza`) | Libro diario y balanza de comprobación |
| `POST /finanzas/partidas` · `/partidas/:id/anular` | Asiento manual y su anulación |
| `GET /finanzas/reportes/{estado-resultados,flujo-caja,balance-general,antiguedad-saldos}.pdf` | Reportes (`?descargar=1` para bajarlos) |

Las rutas responden 404 si `funcionalidades.finanzas` está en `false`; las compras, si `compras` está en `false`.
Ajustes en la base (`configuracion_negocio`): `zona_horaria` (para saber qué día es «hoy») y `dias_credito`.

## Cómo crear un cliente nuevo

1. **Clonar el repo** en una carpeta nueva con el nombre del cliente y crear un repositorio propio para él.
2. **Editar `client.config.js`**: datos del negocio, colores, funcionalidades activas y valores por
   defecto. Reemplazar `public/img/logo.png` por el logo del cliente.
3. **Crear un proyecto nuevo en Supabase** y guardar la contraseña de la base de datos.
4. **Correr los scripts de `db/`** en el SQL Editor: `migrations/01` a `04`, `functions.sql` y, si quieres datos de ejemplo, `seed.sql`.
   Para una demo sirve `db/seed.sql`. Para producción, un seed propio con solo los usuarios,
   los datos del negocio y la configuración fiscal real. En una base nueva el bloque DROP se queda comentado.
5. **Crear un proyecto nuevo en Vercel**.
6. **Conectarlo al repositorio** del cliente.
7. **Configurar las variables de entorno** en Vercel:
   - `DATABASE_URL`: la cadena del *Transaction pooler* de Supabase (puerto 6543).
   - `SESSION_SECRET`: un texto largo y aleatorio, distinto para cada cliente.
   - `SUPABASE_URL` y `SUPABASE_KEY`: la `service_role` key, solo en el servidor.
   
   Después del primer despliegue, abrir `/salud` y probar el login.
8. **Conectar el dominio propio** en Vercel > Settings > Domains y apuntar el DNS.

Antes de entregarlo: cambiar las contraseñas de las cuentas de demostración (`admin`, `vendedor`, `contador` y `supervisor`) o desactivarlas desde *Configuración → Usuarios*.

## Cómo funciona

- **Sesión**: cookie firmada con `SESSION_SECRET` (`cookie-session`). No hay MemoryStore porque
  en Vercel cada petición puede caer en una instancia distinta.
- **Roles y permisos**: cada usuario tiene un rol y cada rol un conjunto de permisos (`modulo.accion`). El servidor los lee en cada petición y `requirePermiso` responde 403 si falta alguno. El menú solo muestra lo permitido. Ver [permisos.md](permisos.md).
- **Contraseñas**: se guardan con bcrypt (`pgcrypto`); 5 intentos fallidos bloquean la cuenta 15 minutos.
- **Funcionalidades**: si una bandera de `client.config.js` está en `false`, el módulo no sale en el
  menú y su ruta responde 404.
- **Tipos de pg**: `db.js` convierte BIGINT y NUMERIC a número y deja DATE como `'YYYY-MM-DD'`.
- **Fechas y zona horaria**: la base usa la zona de `valoresPorDefecto.zonaHoraria`. Los cortes de
  "hoy" y "este mes" se calculan con esa zona, no con UTC.
- **Vercel**: `vercel.json` incluye `views/**` y `public/**` en el despliegue (sin eso las vistas
  no se encuentran en producción).
- **Variantes y kits**: si un producto tiene variantes, el stock está en `variantes_producto` y
  `crear_venta` exige `variante_id`. Los componentes de un kit no pueden tener variantes, y un producto
  no puede ser variantes y kit a la vez. Al quitar una variante en el formulario se desactiva (no se borra,
  porque puede tener ventas); si se vuelve a agregar con el mismo nombre se reactiva.
- **Unidades y opciones de variante**: salen de `client.config.js` (`unidades`, `tiposVariante`, `tallas`, `equipos`).
  Un producto que ya tiene una unidad que no está en la lista (ej. `kilo`) la conserva al editarlo.
- **Búsqueda en vivo**: los listados cargan los datos una vez y filtran en el navegador (sin acentos ni
  mayúsculas), así responden al instante. Se dibujan de 60 en 60.
- **RTN**: es opcional. Si se escribe se guarda solo con dígitos (acepta guiones y espacios).
- **Agregar un módulo**: crear su router, controlador y modelo, y registrarlo en `app.js` antes
  de `routes/modulos.js`.

## Límites conocidos de la contabilidad

- El POS manda siempre el dinero a Caja: todavía no registra el método de pago (efectivo, tarjeta, transferencia).
- No hay devoluciones ni ventas anuladas, ni crédito fiscal sobre las compras (las compras entran por su costo total).
- No hay cierre de períodos: las partidas anteriores a hoy se pueden registrar mientras no sean anteriores al inicio de la contabilidad.

## Pendiente antes de producción real

No hay protección CSRF, ni límite de intentos por IP, ni RLS. Las contraseñas ya se guardan con bcrypt desde la Fase 7. Es una
decisión del proyecto para la primera versión. El bloque de RLS opcional está al final de `db/migrations/01_schema_inicial.sql`.

## Recuperación de emergencia del administrador

**Por qué el flujo normal no cubre este caso.** Cuando una persona olvida su contraseña, un administrador genera un código temporal desde *Configuración → Usuarios → Resetear contraseña* y la persona lo usa en `/recuperar`. Generar ese código exige permisos de configuración, que solo tiene el rol `admin`. Si quien olvidó la contraseña es el **único administrador**, nadie puede generar el código y la pantalla `/recuperar` no tiene cómo ayudarle. Mientras haya dos o más administradores activos el problema no aparece, porque uno puede generar el código del otro.

**Procedimiento.** Se ejecuta en el SQL Editor de Supabase, con la cuenta que administra el proyecto. Tiene dos pasos y un tercero de comprobación.

Paso 1. Restablecer la contraseña:

```sql
UPDATE usuarios
   SET contrasena = hash_contrasena('ClaveNueva123'),
       debe_cambiar_contrasena = TRUE,
       intentos_fallidos = 0,
       bloqueado_hasta = NULL,
       sesion_version = sesion_version + 1,
       contrasena_cambiada_en = NOW()
 WHERE usuario = 'admin';
```

Paso 2. Dejar constancia en la auditoría. El `UPDATE` por sí solo no deja ningún registro, por eso este paso forma parte del procedimiento:

```sql
SELECT registrar_auditoria(NULL, 'reset_emergencia', 'usuarios', id,
       'Restablecimiento de emergencia de la contraseña de la cuenta ' || usuario || ' desde el SQL Editor de Supabase')
  FROM usuarios
 WHERE usuario = 'admin';
```

Paso 3 (opcional). Comprobar el resultado:

```sql
SELECT usuario, debe_cambiar_contrasena, sesion_version FROM usuarios WHERE usuario = 'admin';
```

Debe devolver una fila con `debe_cambiar_contrasena` en `true` y `sesion_version` aumentada en uno. Si no devuelve ninguna fila, el nombre de usuario escrito no coincide con el de la cuenta.

**Advertencias.**

- Elija una contraseña fuerte y distinta de la anterior, y escríbala en lugar de `ClaveNueva123` en el paso 1. Debe cumplir la política: 8 o más caracteres, con letras y números, y distinta del nombre de usuario. La función `hash_contrasena` no valida esa política, de modo que la comprobación es manual. Si la contraseña lleva comillas simples, deben duplicarse.
- Por `debe_cambiar_contrasena = TRUE`, el administrador deberá cambiar esa contraseña en su siguiente inicio de sesión. Hasta que lo haga, el sistema no le permite usar ninguna otra pantalla. Conviene entregarla solo por un canal seguro.
- Si el único administrador tiene otro nombre de usuario, hay que cambiar `'admin'` en los tres pasos.
- No ejecute el paso 1 sin la cláusula `WHERE`: cambiaría la contraseña de todas las cuentas.

**Qué ocurre al ejecutarlo.** El cambio sube `sesion_version`, así que cualquier sesión abierta del administrador con la contraseña vieja queda cerrada en su siguiente petición. También se borran los intentos fallidos y el bloqueo temporal, por lo que una cuenta bloqueada por intentos queda habilitada. El procedimiento se probó contra una base local con la aplicación en ejecución.

**Solución definitiva.** Una fase futura podría añadir recuperación por correo electrónico con SMTP, para que cada persona inicie su propia recuperación sin depender de un administrador.
