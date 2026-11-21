# Base de datos

Scripts de PostgreSQL (Supabase) de Andeliza ERP. Todo está en español, en `snake_case` sin ñ ni acentos.

## Dos tipos de base: desarrollo y producción

Andeliza se instala **una vez por cliente** (decisión D-07): el mismo código, y una base de Supabase propia para cada instancia. Las dos bases se crean con **la misma cadena** de migraciones y funciones; lo único que cambia es el seed del final.

| Base | Para qué | Seed |
|---|---|---|
| Desarrollo (`andeliza-dev`) | Programar y probar | `seed.sql`: tienda deportiva de ejemplo con productos, clientes, proveedores, ventas, compras y contabilidad, y cuentas `admin`, `vendedor`, `contador` y `supervisor` |
| Producción de un cliente (`andeliza-jcl-sport`) | El negocio real | `seed-produccion.sql`: el nombre del negocio, el logo genérico, dos administradores con contraseña temporal y nueve categorías. Nada más |

**Nunca se cargan los dos seeds en la misma base.** `seed-produccion.sql` no hace nada si la base ya tiene usuarios, así que no puede pisar una base de desarrollo ni una instancia en uso.

## Orden de ejecución

| Orden | Archivo | Qué hace | ¿Se puede repetir? |
|---|---|---|---|
| 1 | `migrations/01_schema_inicial.sql` | Esquema de la Fase 1: 17 tablas de acceso, catálogo, ventas, compras, finanzas simples y configuración | No: es la creación inicial |
| 2 | `migrations/02_migracion_fase2.sql` | Facturación interna (`tipo_documento`, prefijo y contador de comprobantes internos) | Sí |
| 3 | `migrations/03_migracion_fase3.sql` | POS: `clave_cliente` para que un cobro repetido no duplique la venta, e índices | Sí |
| 4 | `migrations/04_migracion_fase4.sql` | Contabilidad por partida doble, abonos, pagos y las vistas `v_cxc` y `v_cxp` | Sí |
| 5 | `migrations/05_migracion_fase7.sql` | Roles y permisos, `usuarios.rol_id`, contraseñas con bcrypt, bloqueo por intentos, versión de sesión, cambio obligatorio y recuperación | Sí |
| 6 | `migrations/06_migracion_fase6.sql` | Estadísticas: el índice `idx_ventas_usuario` y 10 funciones de solo lectura | Sí |
| 7 | `migrations/07_migracion_fase6.5.sql` | Preparación para producción: formato regional, paleta, elecciones del catálogo maestro y asistente inicial (14 columnas en `configuracion_negocio`, 1 en `usuarios`, 4 `CHECK` y la función `completar_onboarding`) | Sí |
| 8 | `migrations/08_migracion_fase6.5_categorias.sql` | Categorías nuevas: las cuentas 6106 (servicios), 6107 (impuestos) y 4206 (comisiones), y `registrar_gasto` y `registrar_ingreso` validando contra el plan de cuentas | Sí |
| 9 | `migrations/09_migracion_semana6.sql` | Semana 6: método de pago de cada venta (Caja o Bancos), anulación de facturas sin borrar nada (`anular_venta`), consumo de los kits en `detalle_venta`, métodos activos del negocio y el permiso `facturas.anular` | Sí |
| 10 | `functions.sql` | Las 41 funciones y triggers: venta, numeración, partida doble, cobros, pagos, anulación de facturas, login, usuarios, roles y permisos | Sí: todo es `CREATE OR REPLACE` |
| 11 | `seed.sql` **o** `seed-produccion.sql` | Datos de desarrollo o datos mínimos de un cliente (ver arriba) | `seed.sql` solo una vez; `seed-produccion.sql` sí (no repite nada) |

Después de la cadena la base tiene **26 tablas y 2 vistas**.

> **Importante para el repositorio.** Hasta la Fase 6.5 (semana 5) la carpeta `migrations/` solo tenía 01 a 04 y `functions.sql` era el de la Fase 4. Con eso una instalación desde cero **no funcionaba**: `seed.sql` fallaba (`column "rol_id" of relation "usuarios" does not exist`) y la base quedaba sin usuarios, sin roles y sin función de inicio de sesión. Desde esta entrega están todas las migraciones y el `functions.sql` de la Fase 7, que es el mismo que ya corre en la base de desarrollo.

## Instalación de una instancia nueva (producción)

1. **Crea un proyecto nuevo de Supabase** para el cliente. En *SQL Editor* ejecuta, uno por uno y en orden, los archivos 1 a 10 de la tabla y al final `seed-produccion.sql` (antes, en una copia local, reemplaza el marcador `CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR` por una contraseña temporal: si no, la política de contraseñas detiene el seed y no se crea ningún usuario). Cada migración trae su `BEGIN` y su `COMMIT`. El seed también: si algo falla no deja nada a medias.
2. **El seed comprueba sus requisitos.** Se detiene con un mensaje claro si falta la migración 07 (`Falta la migración 07…`) o `functions.sql` (`Falta functions.sql…`), y avisa sin cambiar nada si la base ya tiene usuarios.
3. **Qué queda cargado.** El negocio se llama `JCL Sport`, con el logo genérico `/img/logo.png`, zona `America/Tegucigalpa`, 30 días de crédito, la contabilidad sin iniciar, sin CAI y con "unidad" y "par" como unidades de venta. RTN, dirección, teléfono y correo quedan vacíos: los llena el administrador en el asistente. Hay dos usuarios con el rol `admin` de fábrica: `admin` (*Administrador del Sistema*, con el asistente pendiente) y `soporte` (*Administrador de Soporte*, sin él). Los dos con la contraseña temporal que pusiste en lugar del marcador y con el cambio obligatorio. Y nueve categorías: Camisetas, Pantalones, Calzado, Balones, Accesorios, Gorras, Medias, Sudaderas y Conjuntos.
4. **Seguridad: la contraseña temporal nunca se sube al repositorio.** Se pone solo en la copia local con la que se ejecuta el seed. Entra con `soporte` y con `admin` y cámbialas **antes** de dar a conocer la dirección de la instancia.
5. **Conecta el proyecto de Vercel** con las variables de esta base y despliega. Comprueba `/salud`.
6. **El administrador del cliente** entra, cambia su contraseña y completa el asistente: datos, logo, colores y, si quiere, unidades de venta y su primer vendedor.

Para otro cliente, copia `seed-produccion.sql`, cambia el nombre del negocio y, como siempre, pon su contraseña temporal solo en la copia local.

## Base de desarrollo nueva

Ejecuta los archivos 1 a 10 y después `seed.sql`. Las cuentas de ejemplo son `admin` / `admin123`, `vendedor` / `vendedor123`, `contador` / `contador123` y `supervisor` / `supervisor123`. Ninguna tiene el asistente pendiente, así que entran directo al sistema.

## Base que ya está en una fase anterior

Ejecuta solo las migraciones que falten, en orden, y luego `functions.sql` completo. **El orden entre el SQL y el código depende de la migración.** Las aditivas (02 a 04 y 06 a 08) solo agregan tablas, columnas o funciones y el código anterior sigue funcionando con ellas: el SQL va **antes** del `git push`. La 05 es la excepción: cambia las contraseñas y quita `usuarios.rol`, así que ahí va primero el código (ver su sección).

Al correr `functions.sql` en una base que ya tiene datos, la contabilidad se inicia sola con el estado de ese día: inventario y ventas pendientes contra capital. Caja y Bancos arrancan en cero.

## Categorías nuevas de gasto e ingreso: migración 08 (base que ya tiene la 07)

La `08_migracion_fase6.5_categorias.sql` agrega tres cuentas al plan de cuentas (6106 *Servicios públicos*, 6107 *Impuestos municipales, tasas y contribuciones* y 4206 *Comisiones ganadas*) y vuelve a crear `registrar_gasto` y `registrar_ingreso` sin su lista fija: ahora aceptan cualquier categoría que tenga su cuenta activa. Son las mismas definiciones que trae `functions.sql` (una prueba lo comprueba).

1. **Ejecuta solo la 08 en cada base** (primero desarrollo, después la de cada cliente). Trae `BEGIN` y `COMMIT` y se puede repetir.
2. **No vuelvas a correr `functions.sql`** en una base en uso: no hace falta, y en una base con productos y sin contabilidad iniciada (como la de un cliente que recién carga su inventario) la iniciaría por su cuenta. Se probó.
3. **Haz `git push`.** El código nuevo ofrece *servicios* e *impuestos* en los gastos (vienen activos) y *comisiones* en los ingresos (se activa en *Configuración → Negocio* o en el asistente).

- **Si el código 6106, 6107 o 4206 ya lo usa otra cuenta**, la migración se detiene con un mensaje que dice cuál, sin dejar nada a medias. No adivina otro número.
- **El código anterior sigue funcionando** con la 08 aplicada (las funciones solo aceptan más que antes): *Instant Rollback* es seguro.
- **Si se hace al revés** (código primero), los gastos de *servicios* e *impuestos* y los ingresos de *comisiones* dan "no es válida" hasta que se ejecute la migración; todo lo demás funciona.

## Método de pago y anulación de facturas: migración 09 (Semana 6, base que ya tiene la 08)

La `09_migracion_semana6.sql` agrega `ventas.metodo_pago`, la constancia de anulación (`anulada`, `anulada_en`, `anulada_por`, `motivo_anulacion`), `detalle_venta.componentes`, `configuracion_negocio.metodos_pago_activos`, sus cuatro `CHECK`, el permiso `facturas.anular` (para `admin` y `supervisor`) y las funciones `cuenta_metodo_pago` y `anular_venta`. También vuelve a crear `crear_venta`, `contabilizar_venta`, `registrar_abono_cliente`, `generar_apertura_contable`, la vista `v_cxc` y `estadisticas_lineas`, para que las anuladas dejen de contar. Las funciones de ventas son las mismas que trae `functions.sql`.

1. **Haz una copia de seguridad** de la base del cliente (en Supabase, *Database → Backups*, o un `pg_dump`).
2. **Ejecuta solo la 09 en cada base** (primero desarrollo, después JCL Sport y Las Flores), **antes** del `git push`. Trae `BEGIN` y `COMMIT` y se puede repetir.
3. **No vuelvas a correr `functions.sql`** en una base en uso (la regla de la 08 sigue igual): la 09 ya trae todas las funciones que cambian.
4. **Haz `git push`.** El código nuevo pregunta «¿Cómo paga?» en el punto de venta y «¿Cómo pagó?» al marcar pagada, y muestra el botón *Anular* en Facturas a administradores y supervisores.

- **El código anterior sigue funcionando con la 09 aplicada.** `crear_venta` conserva su firma vieja: el parámetro nuevo va al final y es opcional, así que el código de la semana 5 sigue cobrando (todo en efectivo, como antes, ahora guardado como `efectivo`). *Instant Rollback* es seguro.
- **Las ventas anteriores no se tocan.** Quedan con `metodo_pago` vacío (no se adivina cómo se pagaron) y sus partidas siguen como estaban. Si se anula un kit vendido antes de la 09, se devuelven sus componentes según la receta actual y la auditoría lo deja marcado (`kit_con_composicion_actual`).
- **Si alguien anula una factura con el código anterior** no puede: la ruta no existe todavía. Nada cambia hasta el `git push`.

**Verificación.**

```sql
SELECT COUNT(*) FROM pg_proc WHERE proname = 'crear_venta';                    -- 1
SELECT cuenta_metodo_pago('efectivo'), cuenta_metodo_pago('tarjeta');          -- caja | bancos
SELECT r.nombre FROM roles_permisos rp JOIN roles r ON r.id = rp.rol_id
  JOIN permisos p ON p.id = rp.permiso_id WHERE p.modulo = 'facturas' AND p.accion = 'anular';  -- admin, supervisor
SELECT SUM(debe) = SUM(haber) AS cuadra FROM partida_lineas;                   -- true
```

Después del `git push`: una venta de prueba con tarjeta debe aparecer en el libro diario cargando **Bancos**, y una en efectivo, **Caja**. Si la anulas, el stock vuelve, aparece la contrapartida en el libro diario y en *Configuración → Auditoría* queda «Anuló la factura…».

## Puesta en producción de la Fase 6.5 (base que ya está en la Fase 6)

La `07_migracion_fase6.5.sql` **solo agrega**: 14 columnas a `configuracion_negocio` y 1 a `usuarios`, todas con valor por defecto, 4 restricciones `CHECK` y la función `completar_onboarding`. No crea tablas, no cambia datos y no toca ninguna función existente. Los valores por defecto reproducen lo que el sistema ya hacía (paleta Azul Deportivo, lempiras, día/mes/año, 15 %) y ningún usuario queda con el asistente pendiente, así que la base de desarrollo no cambia de aspecto ni de comportamiento.

1. **Ejecuta la migración en cada base** (primero desarrollo, después la de cada cliente). Ya trae `BEGIN` y `COMMIT`.
2. **Reemplaza `db/functions.sql`** por el de esta entrega y agrega `db/migrations/05`, `06` y `07`. En una base que ya está en la Fase 7 **no hace falta volver a correr `functions.sql`**: es el mismo que ya se ejecutó; el cambio es para que el repositorio pueda instalar una base desde cero.
3. **Haz `git push`.** Si los dos proyectos de Vercel siguen la misma rama, la migración tiene que estar ya en las dos bases.
4. **Verifica.** `/salud` responde `ok`. Entra como administrador: todo se ve igual que antes y *Configuración → Negocio* muestra las tarjetas nuevas (*Colores del negocio*, *Moneda, fechas e impuesto* y *Catálogo del negocio*).

- **Si se hace al revés** (código primero), se probó: la pantalla de acceso abre y el inicio de sesión funciona, pero el panel y el resto de las pantallas dan error 500 (`column "moneda" does not exist`) hasta que se ejecute la migración. Ejecutarla lo resuelve sin tocar nada más.
- **Si la migración falla**, no queda nada a medias. Corrige la causa y vuelve a ejecutarla.
- **Instant Rollback** en Vercel es seguro: el código anterior ignora las columnas nuevas.

## Puesta en producción de la Fase 6 (base que ya está en la Fase 7)

La `06_migracion_fase6.sql` **solo agrega**: un índice (`idx_ventas_usuario`) y 10 funciones de lectura. No crea tablas, no cambia columnas, no toca datos y no modifica ninguna función existente. Por eso sigue la regla general de arriba: **primero el SQL y después el código** (al revés que la 05).

1. **Ejecuta la migración.** En Supabase, *SQL Editor*, pega `db/migrations/06_migracion_fase6.sql` y ejecútala. Ya trae `BEGIN` y `COMMIT`, así que se aplica completa o no se aplica. El código que está en producción hoy no la nota.
2. **Haz `git push`.** Vercel construye y publica el código nuevo, que ya encuentra las funciones.
3. **Verifica.** `/salud` responde `ok`. Entra como administrador: el inicio muestra el panel nuevo, *Estadísticas* abre con datos y *Exportar PDF* descarga el reporte. El vendedor sigue entrando directo al punto de venta.

- **Si la migración falla**, no queda nada a medias (se probó con un error forzado antes del `COMMIT`). Corrige la causa y vuelve a ejecutarla: el código anterior sigue funcionando.
- **Si el despliegue del código falla**, *Instant Rollback* en Vercel es seguro, porque la migración es aditiva.
- **Si se hizo al revés** (código primero), el inicio del administrador y del supervisor y los datos de *Estadísticas* dan error hasta que se ejecute la migración (la pantalla abre, pero muestra un mensaje de error). El vendedor, el contador y las demás pantallas no se afectan. No se pierde nada: basta ejecutarla.

## Puesta en producción de la Fase 7 (base que ya está en la Fase 4)

La migración 05 **no borra a ningún usuario**: cada uno conserva su id, nombre, usuario y estado, pasa del rol de texto al `rol_id` equivalente y su contraseña se convierte a bcrypt (la contraseña de siempre sigue funcionando). Se ensayó sobre una base de la Fase 4 con ventas y contabilidad.

**Son dos scripts y el orden es siempre el mismo: primero la migración y después las funciones.** `migrations/05_migracion_fase7.sql` crea `pgcrypto`, las tablas de roles y permisos y cambia `usuarios`. `functions.sql` usa todo eso, así que corrido antes da error (en un ensayo falló porque todavía no existía `pgcrypto`). Si pasa, no se pierde nada: se corre la 05 y se vuelve a correr `functions.sql`, que se puede repetir. De `functions.sql` solo cambia una línea (el título) y se agregan 15 funciones nuevas, las 24 anteriores quedan igual.

**Hay un punto sin retorno y por eso el orden con el código importa.** Al correr el SQL, el código anterior deja de poder iniciar sesión (las contraseñas ya son hashes y desaparece `usuarios.rol`). Y el código nuevo no funciona sin las tablas nuevas. Por eso la regla es: **primero el código, al final el SQL**.

1. **Copia de seguridad.** Una copia de la base antes de tocar nada (Supabase: *Database → Backups*, o `pg_dump`).
2. **Haz `git push`.** Vercel empieza a construir. Mientras tanto la versión anterior sigue sirviendo y el SQL **no** se ha corrido. Si la construcción falla, no se rompió nada.
3. **Prepara el SQL sin ejecutarlo.** En Supabase, *SQL Editor*, abre dos pestañas. En la primera pega `db/migrations/05_migracion_fase7.sql` y en la segunda `db/functions.sql`. En cada una escribe `BEGIN;` como primera línea y `COMMIT;` como última, así cada script se aplica completo o no se aplica. Los archivos no se modifican.
4. **Espera a que Vercel marque el despliegue como "Ready".** Desde ese momento el código nuevo está en vivo y sin las tablas nuevas la aplicación da error.
5. **Ejecuta la primera pestaña (la migración) y, apenas termine, la segunda (`functions.sql`).** Supabase puede preguntar si estás seguro porque el script modifica datos: confirma.
6. **Verifica** (ver abajo).

**Si algo falla.**

- Si la migración 05 da error, no queda nada a medias. No corras `functions.sql` y en Vercel (*Deployments*) usa *Instant Rollback* sobre el despliegue anterior: la aplicación vuelve a funcionar tal como estaba.
- Si la 05 salió bien y `functions.sql` falla, no hace falta ningún rollback. Corrige la causa y vuelve a correr `functions.sql`.
- **Después de que los dos salieron bien, ya no se vuelve atrás con un rollback de Vercel** (el código viejo no entiende la base nueva): se corrige hacia adelante o se restaura la copia de seguridad.

**Qué esperar.** Hay unos segundos entre los pasos 4 y 5 en que la aplicación da error. Elige una hora tranquila y avisa. Todas las personas tendrán que **iniciar sesión otra vez** (es normal), con la misma contraseña de siempre.

**Verificación.**

- `https://TU-APP.vercel.app/salud` responde `ok`.
- Entra como `admin` con su contraseña de siempre. Abre *Configuración → Usuarios*: deben estar todas las personas de antes, cada una con su rol.
- Entra como `vendedor`. Escribe `/finanzas` en la barra de direcciones: debe dar 403.
- Haz una venta de prueba y descarga su factura.
- *Configuración → Auditoría* muestra los inicios de sesión y el acceso denegado.
- La migración **no crea usuarios**. Si quieres las cuentas `contador` y `supervisor` de demostración, créalas en *Configuración → Usuarios* y desmarca "Pedir que la cambie en su primer inicio de sesión".

## Cómo se verificó

**Migración 09 (Semana 6).** La cadena `01 → 09 → functions.sql` se instaló desde cero con `seed.sql` y con los tres seeds de producción (con una contraseña temporal solo en una copia local), y el administrador entra al cambio de contraseña. Se simuló la actualización de un cliente: base con 01 a 08, el `functions.sql` anterior y ventas hechas con el código anterior (contado, kit y crédito); luego la 09 con el código anterior todavía en línea (siguió vendiendo), la 09 otra vez y el código nuevo: las ventas viejas quedaron sin método, la venta nueva con tarjeta cargó Bancos, el kit viejo se anuló con la receta actual, la venta al crédito vieja se cobró por transferencia y la balanza cuadró. La regresión diferencial (546 respuestas del código anterior contra el nuevo) solo cambió lo esperado: campos nuevos en las respuestas, la forma de pago en el PDF, el permiso nuevo en la matriz y las pantallas rediseñadas; ventas, detalle, stock, partidas, abonos y saldos quedaron idénticos.

**Migración 08.** La cadena `01 → 08 → functions.sql → seed-produccion.sql` se instaló desde cero y se recorrió por HTTP: un gasto de servicios pagado, uno de impuestos por pagar y un ingreso de comisiones, con sus partidas, el libro diario, la balanza y el estado de resultados en PDF, y sus tres anulaciones con la contrapartida exacta. La 08 se repitió dos veces sin cambios, se aplicó sola sobre una base en uso con datos, se probó el choque de códigos y se comprobó que en una base con productos y sin contabilidad no la inicia.

**Fase 6.5.** La cadena completa `01 → 07 → functions.sql → seed-produccion.sql` se ejecutó sobre una base vacía y se recorrió entera por HTTP (97 comprobaciones) y en un navegador real (29): primer acceso con la contraseña temporal, cambio obligatorio, asistente completo, bloqueo de las 13 pantallas mientras está pendiente, panel vacío pero funcional y la paleta aplicada en pantallas y PDF. La migración 07 y `functions.sql` se repitieron sobre la misma base sin errores, el seed de producción se repitió sin cambiar ni un hash, y sobre una base de desarrollo no hizo nada. La cadena con `seed.sql` dejó la base de desarrollo con sus datos y sin nadie con el asistente pendiente.

**Fases anteriores.** La cadena `01 → 05 + functions.sql` se comparó contra el esquema completo vigente: columnas, restricciones, índices, funciones, triggers y vistas son idénticos. Con `seed.sql` cargado, la base cumple que cada partida cuadra, que Activo = Pasivo + Patrimonio + Resultado y que cuentas por cobrar y por pagar coinciden con el detalle de documentos pendientes.

## Carpeta `sql/` anterior

La carpeta `sql/` del repositorio contiene la versión previa de estos scripts, antes de ordenarlos en `db/`. Ya no se usa y puede eliminarse con `git rm -r sql/` cuando confirmes que todo funciona desde `db/`.
