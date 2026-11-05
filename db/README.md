# Base de datos

Scripts de PostgreSQL (Supabase) de Andeliza ERP. Todo está en español, en `snake_case` sin ñ ni acentos.

## Orden de ejecución

| Orden | Archivo | Qué hace | ¿Se puede repetir? |
|---|---|---|---|
| 1 | `migrations/01_schema_inicial.sql` | Esquema de la Fase 1: 17 tablas de acceso, catálogo, ventas, compras, finanzas simples y configuración | No: es la creación inicial |
| 2 | `migrations/02_migracion_fase2.sql` | Facturación interna (`tipo_documento`, prefijo y contador de comprobantes internos) | Sí |
| 3 | `migrations/03_migracion_fase3.sql` | POS: `clave_cliente` para que un cobro repetido no duplique la venta, e índices | Sí |
| 4 | `migrations/04_migracion_fase4.sql` | Contabilidad por partida doble, abonos, pagos y las vistas `v_cxc` y `v_cxp` | Sí |
| 5 | `migrations/05_migracion_fase7.sql` | Roles, permisos y roles_permisos, `usuarios.rol_id`, contraseñas con bcrypt, bloqueo por intentos, versión de sesión y cambio obligatorio, recuperación de contraseña y auditoría ampliada y de solo agregar | Sí (no borra usuarios ni pisa permisos ajustados) |
| 6 | `functions.sql` | Funciones y triggers (venta, numeración, partida doble, cobros, pagos, login, usuarios, roles y permisos) | Sí: todo es `CREATE OR REPLACE` |
| 7 | `seed.sql` | Datos de ejemplo de una tienda deportiva, con contabilidad y ventas | Solo una vez, y solo en desarrollo |

Después de la cadena la base tiene **26 tablas y 2 vistas**.

## Base nueva

Ejecuta los siete archivos en ese orden (el último es opcional). Las migraciones 02 a 05 son seguras sobre una base nueva porque solo agregan lo que falta.

## Base que ya está en una fase anterior

Ejecuta solo las migraciones que falten y luego `functions.sql` completo. Ejemplo: una base de la Fase 3 corre `04_migracion_fase4.sql`, la `05_migracion_fase7.sql` y después `functions.sql`.

**El orden entre el SQL y el código depende de la migración.** Las de las Fases 2 a 4 solo agregan tablas y columnas, y el código anterior sigue funcionando con ellas: ahí va primero el SQL y después el código. **La 05 (Fase 7) es la excepción**, porque cambia las contraseñas a bcrypt y quita `usuarios.rol`, y el código anterior deja de funcionar. Para esa sigue la sección *Puesta en producción de la Fase 7*, más abajo: primero el código y al final el SQL.

Al correr `functions.sql` en una base que ya tiene datos, la contabilidad se inicia sola con el estado de ese día: inventario y ventas pendientes contra capital. Caja y Bancos arrancan en cero y se cargan desde *Finanzas > Saldo inicial*.

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

La cadena `01 → 05 + functions.sql` se comparó contra el esquema completo vigente: columnas, restricciones, índices, funciones, triggers y vistas son idénticos. Con `seed.sql` cargado, la base cumple que cada partida cuadra, que Activo = Pasivo + Patrimonio + Resultado y que cuentas por cobrar y por pagar coinciden con el detalle de documentos pendientes.

## Carpeta `sql/` anterior

La carpeta `sql/` del repositorio contiene la versión previa de estos scripts, antes de ordenarlos en `db/`. Ya no se usa y puede eliminarse con `git rm -r sql/` cuando confirmes que todo funciona desde `db/`.
