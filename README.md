# Sistema ERP Base

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
| 5 | Inventario visual y alertas de stock | Pendiente |
| 6 | Estadísticas | Pendiente |
| 7 | Configuración | Pendiente |
| 8 | Vista móvil y QR | Pendiente |

## Puesta en marcha local

1. Tener Node 20 o superior y un proyecto de Supabase.
2. En Supabase > SQL Editor, correr en este orden:
   `sql/schema_es.sql`, `sql/functions_es.sql` y `sql/seed_deportes.sql`
   (o `sql/seed_ferreteria_ejemplo.sql`, uno solo de los dos seeds).
   Si la base todavía tiene las tablas en inglés, en `schema_es.sql` borra las líneas `/*` y `*/`
   del bloque DROP del inicio para que las elimine antes de crear las nuevas.
   Si la base ya tenía el esquema de una fase anterior y no quieres borrarla, correr en orden las migraciones
   que falten (`sql/migracion_fase2.sql`, `sql/migracion_fase3.sql`, `sql/migracion_fase4.sql`) y después
   `sql/functions_es.sql` completo (se puede volver a correr sin problema). **Desde la Fase 4 el orden importa:
   primero la migración y después `functions_es.sql`**, que además inicia la contabilidad si la base ya tiene datos.
   Las migraciones se pueden repetir: no borran datos.
   Opcional, solo para probar Finanzas con datos de ejemplo (nunca en la base de un cliente real):
   `sql/seed_finanzas_demo.sql`, después de un seed de catálogo.
3. Copiar `.env.example` a `.env` y llenar `DATABASE_URL`, `SESSION_SECRET`, `SUPABASE_URL` y
   `SUPABASE_KEY` (hacen falta para subir imágenes de productos).
4. `npm install` y luego `npm run dev`. Abrir http://localhost:3000.
5. Entrar con `admin` / `admin123` (usuarios del seed). `GET /salud` confirma la conexión a la base.

## Estructura

```
app.js                 Configuración de Express (middlewares, vistas, rutas, errores)
api/index.js           Punto de entrada para Vercel (exporta app, sin listen)
client.config.js       TODO lo específico del cliente
modulos.js             Lista de módulos: menú, roles y funcionalidades
db.js                  Pool de pg y conversión de tipos
middlewares/auth.js    requireAuth, soloRoles, requireFuncionalidad
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
routes/modulos.js      Páginas "próximamente" de los módulos que aún no existen
views/                 EJS: layouts, partials y una carpeta por módulo
sql/                   schema_es, functions_es, migracion_fase2/3/4, seed_deportes, seed_ferreteria_ejemplo y seed_finanzas_demo
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
| `GET /pos` | admin, vendedor | Pantalla del POS (catálogo, clientes, tasa y modo de facturación) |
| `GET /pos/catalogo` | admin, vendedor | Catálogo con el stock actual (JSON) |
| `POST /pos/clientes` | admin, vendedor | Alta rápida de cliente |
| `POST /pos/cobrar` | admin, vendedor | Cobra. Cuerpo: `cliente_id`, `items` (`producto_id`, `variante_id`, `cantidad`), `pendiente`, `clave` |
| `POST /pos/cotizacion` | admin, vendedor | PDF de cotización (campo de formulario `datos` con el carrito en JSON) |
| `GET /facturas` | admin | Pantalla del historial |
| `GET /facturas/datos` | admin | Historial en JSON: `desde`, `hasta`, `tipo`, `estado`, `q`, `offset` |
| `PATCH /facturas/:id/pagada` | admin | Marca una factura como pagada |
| `GET /facturas/:id/pdf[?descargar=1]` | admin (todas), vendedor (solo las suyas) | PDF de la venta |
| `GET /salud[?pdf=1]` | público | Comprueba la base de datos (y la generación de PDF) |

En `/facturas/datos`, si no se manda `desde` se usa el primer día del mes; mandarlo vacío (`desde=`) significa sin límite.
Las rutas del POS responden 404 si `funcionalidades.pos` está en `false`; `/facturas` y su JSON, si `facturas` está en `false`.
El PDF sirve con cualquiera de las dos funcionalidades activas.

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
4. **Correr los 3 SQL** en el SQL Editor: `schema_es.sql`, `functions_es.sql` y un seed.
   Para una demo sirve `seed_deportes.sql`. Para producción, un seed propio con solo los usuarios,
   los datos del negocio y la configuración fiscal real. En una base nueva el bloque DROP se queda comentado.
5. **Crear un proyecto nuevo en Vercel**.
6. **Conectarlo al repositorio** del cliente.
7. **Configurar las variables de entorno** en Vercel:
   - `DATABASE_URL`: la cadena del *Transaction pooler* de Supabase (puerto 6543).
   - `SESSION_SECRET`: un texto largo y aleatorio, distinto para cada cliente.
   - `SUPABASE_URL` y `SUPABASE_KEY`: la `service_role` key, solo en el servidor.
   
   Después del primer despliegue, abrir `/salud` y probar el login.
8. **Conectar el dominio propio** en Vercel > Settings > Domains y apuntar el DNS.

Antes de entregarlo: cambiar las contraseñas de `admin` y `vendedor`.

## Cómo funciona

- **Sesión**: cookie firmada con `SESSION_SECRET` (`cookie-session`). No hay MemoryStore porque
  en Vercel cada petición puede caer en una instancia distinta.
- **Roles**: `admin` ve todo, `vendedor` solo el POS.
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

Las contraseñas están en texto plano y no hay CSRF, límite de intentos de login ni RLS. Es una
decisión del proyecto para la primera versión. El bloque de RLS opcional está al final de `schema_es.sql`.
