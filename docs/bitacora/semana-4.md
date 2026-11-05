<!-- COMPLETAR antes de entregar: horas dedicadas y enlaces de evidencia (commits o capturas). -->

# Bitácora de la semana 4: login, roles y permisos

**Periodo:** 2 al 8 de noviembre de 2026  ·  **Horas dedicadas:** `[COMPLETAR]`

**Meta de la semana:** entregar "Login y Roles" a la universidad con una arquitectura de seguridad real: roles con permisos por módulo y acción, que el servidor haga cumplir y que quede registro de todo. Para lograrlo se tomaron tres decisiones de orden y alcance, todas conscientes y documentadas.

## Decisiones de arquitectura de la semana

Las tres quedan escritas aquí, en `docs/plan.md` (D-01, D-02 y D-03) y, la primera, también en los comentarios de los archivos clave del código.

### D-01: la Fase 7 se construye antes que la Fase 6

| | |
|---|---|
| **Decisión** | Posponer las Estadísticas (Fase 6) y construir primero Configuración, Usuarios y Roles con permisos granulares (Fase 7). |
| **Por qué** | Las estadísticas que importan, como "¿cuánto vendió el Vendedor A este mes?", dependen de saber **quién** hizo cada venta y **con qué rol**. Con la seguridad y los roles listos primero, las estadísticas por empleado nacen ya sabiendo medir por usuario y por rol. Además, la universidad pide esta semana el entregable "Login y Roles". |
| **Alternativas** | (a) Hacer las estadísticas primero, solo con administrador y vendedor, y rehacerlas cuando existieran los roles. (b) Hacer primero los roles y luego las estadísticas. |
| **Se eligió** | (b). Las ventas ya guardaban `usuario_id` y ahora cada usuario tiene `rol_id`, así que las estadísticas podrán agrupar por vendedor y por rol sin migraciones nuevas. |
| **Costo** | Las estadísticas llegan después. A cambio se adelantó el hash de contraseñas, que era la deuda de seguridad más importante del proyecto. |

### D-02: la Fase 5 no se construye como fase aparte

La Fase 5 (inventario visual y alertas de stock) se da por absorbida, porque **la Fase 2 ya lo había resuelto**. Se comprobó en el código: el listado de inventario muestra la foto de cada producto (con sus iniciales si no tiene imagen), su estado de stock (En stock, Stock bajo o Agotado), filtros con conteo y una vista de tarjetas, y el panel de inicio indica cuántos artículos están por reponer. Construir una fase aparte habría repetido lo que ya existe.

Lo único que no existía es la **lista de reposición agrupada por proveedor**. Esa pieza se une a los avisos automáticos de la Fase 8. Las pruebas de aceptación contra los criterios Gherkin pasan a la semana 9. La semana 5 queda libre y se propone para las Estadísticas.

### D-03: se descarta el acceso móvil por QR y se replantea la Fase 8

Andeliza es una aplicación web y ya se abre desde el navegador de cualquier celular, así que el código QR no aportaba valor real. La Fase 8 se reemplaza por dos ideas que sí cambian el día a día del dueño. Quedan documentadas como historias, todavía por validar con las pymes:

- **Avisos automáticos** por WhatsApp o correo cuando un producto llega a su stock mínimo o una factura se vence (HU-30).
- **Asistente virtual con IA** para preguntarle al sistema "¿cuánto vendí hoy?" o "¿qué producto me falta?" (HU-32). Actuará con los permisos de quien pregunta, apoyándose en los roles de esta semana.

El método de pago en el punto de venta (HU-31) se mantiene en la Fase 8.

## Qué hicimos

**Base de datos (`db/migrations/05_migracion_fase7.sql` y `db/functions.sql`)**

- Tablas `roles`, `permisos` y `roles_permisos`, con cuatro roles de fábrica: `admin`, `supervisor`, `vendedor` y `contador`. El catálogo tiene 27 permisos (módulo + acción).
- `usuarios.rol` (texto) pasó a `usuarios.rol_id` (llave foránea a `roles`). Se agregaron `debe_cambiar_contrasena`, intentos fallidos, bloqueo temporal, versión de sesión y último acceso.
- Las contraseñas pasaron de texto plano a **bcrypt**, y una restricción de la base rechaza guardar texto plano.
- Tabla `recuperacion_contrasena` con códigos temporales de un solo uso.
- `auditoria` ampliada con quién, qué (en español) y desde qué IP, y convertida en una bitácora de **solo agregar**: un trigger impide modificarla o borrarla.
- La lógica delicada vive en funciones SQL (`autenticar_usuario`, `crear_usuario`, `generar_codigo_recuperacion`, `guardar_permisos_rol` y otras), para que sea atómica y no se pueda saltar desde la aplicación.
- La migración **no borra a ningún usuario**. Se ensayó sobre una base de la Fase 4 con ventas, contabilidad y usuarios extra: conservan id, nombre, usuario y estado, y entran con la misma contraseña de antes. También se comprobó que, si el script falla a mitad, se revierte por completo.

**Seguridad en el servidor (Node)**

- `cargarPermisos` lee en **cada petición** al usuario y los permisos exactos de su rol. Por eso un cambio del administrador vale al instante, aunque la persona tenga la sesión abierta.
- `requirePermiso(modulo, accion)` protege todas las rutas y responde **403** si falta el permiso. No basta con ocultar el botón: el servidor es quien bloquea.
- Regla de propiedad del dato: el vendedor solo ve e imprime las facturas que él mismo emitió (el filtro está en la consulta SQL). El contador, el supervisor y el administrador ven todas.
- Desactivar a un usuario o cambiar su contraseña cierra todas sus sesiones. Cada acceso denegado queda en la auditoría.
- Recuperación de contraseña: el administrador genera un código de 8 caracteres que dura 30 minutos y sirve una vez. En la base solo queda su hash.

**Interfaz `/configuracion` (solo administrador)**

- **Negocio:** nombre, logo, RTN, dirección y un interruptor del SAR. Encendido pide el CAI con su rango y su fecha límite. Apagado, se factura con comprobantes internos.
- **Usuarios:** lista con buscador, rol y estado. Nuevo usuario, editar, resetear contraseña (muestra el código para compartirlo) y activar o desactivar.
- **Roles y permisos:** lista de roles y una matriz de interruptores grandes (módulos en las filas, acciones en las columnas). Activar "Crear" activa también "Ver", y quitar "Ver" quita lo demás. Los cambios se guardan juntos y se aplican de inmediato.
- **Auditoría:** los últimos 50 movimientos con buscador.
- Pantallas de cuenta: iniciar sesión con enlace a recuperar, recuperar con código y cambiar contraseña (obligatorio en el primer inicio).

**Documentación**

- `docs/permisos.md`: matriz completa de acciones por rol (generada leyendo la base), reglas de propiedad, cuentas de demostración, qué permiso pide cada ruta y límites conocidos.
- Se actualizaron README, plan (con D-01, D-02 y D-03), mapa de historias, historias de GitHub (HU-30 y HU-32 nuevas, HU-26 y HU-28 construidas), modelo de datos (ahora 26 tablas) y referencia técnica.
- La sección "Puesta en producción de la Fase 7" de `db/README.md`, con el orden de despliegue ensayado: primero el código y al final los dos scripts SQL, la migración 05 y después `functions.sql`.

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Los permisos se leen de la base en cada petición | Guardarlos en la cookie al iniciar sesión | Con la cookie, quitar un permiso o desactivar a alguien tardaría hasta 12 horas en notarse. Costó una consulta por petición y se acepta a cambio de control inmediato. |
| bcrypt dentro de Postgres con `pgcrypto` | Una librería de bcrypt en Node | No agrega dependencias nativas que compilar en Vercel, y la migración puede convertir las contraseñas existentes con una sola instrucción SQL. |
| El rol `admin` es intocable y Configuración es solo de él | Permitir editar todo desde la interfaz | Evita que alguien se quite el acceso o se escale a sí mismo. Se aplica en tres capas: la interfaz, la función SQL y un trigger. |
| Un código de recuperación guardado como hash | Guardar el código para poder mostrarlo después | Quien lea la base de datos no puede usar los códigos. Se muestra una sola vez al administrador. |
| Una versión de sesión en el usuario | Lista de sesiones activas en la base | Subir un número cierra todas las sesiones de esa persona. Es simple y funciona con cookies firmadas en serverless. |
| Las fallas de inicio de sesión devuelven un resultado, no lanzan error | Lanzar una excepción | Una excepción revierte la transacción y perdería el conteo de intentos fallidos. |
| Sin caché de los datos del negocio | Caché de 15 segundos | En Vercel cada instancia tendría la suya y otra instancia mostraría el nombre viejo tras guardar. Era una consulta por llave primaria. |
| El vendedor tiene `facturas.ver_propias` | Dejarlo sin acceso a Facturas | La regla de propiedad pedida ("solo las que él generó") solo tiene sentido si puede consultarlas. El administrador puede quitárselo desde la matriz. |
| El SQL de la Fase 7 se ejecuta al final, después del código | Ejecutarlo antes del `git push` | Es el único paso sin retorno. Si va al final, una construcción fallida no rompe nada, y si el SQL falla se revierte solo y basta un rollback de Vercel. |

## Resultados de las pruebas de permisos

Las pruebas se corrieron contra un Postgres 16 local con un Supabase simulado. Las baterías nuevas de esta semana suman **282 comprobaciones, todas correctas**.

| Batería | Qué comprueba | Resultado |
|---|---|---|
| Seguridad en la base de datos | Hash bcrypt, política de contraseñas, bloqueo por intentos, códigos de recuperación, último administrador, roles, permisos, auditoría inmutable y migración desde la Fase 4 | **94 de 94** |
| Permisos por HTTP | La matriz de rutas por rol, propiedad de facturas, expulsión al desactivar, contraseña provisional, recuperación, gestión de roles, negocio y SAR, y auditoría | **114 de 114** |
| Interfaz de Configuración | Las cuatro pestañas, la matriz de interruptores, los formularios y los mensajes de error, simulados con un navegador real (jsdom y Alpine) | **74 de 74** |

Casos que sirven para la demostración:

| Prueba | Resultado obtenido |
|---|---|
| El vendedor escribe `/finanzas` en la barra de direcciones | **403**, con la página "No tienes permiso para ver esta página". Lo mismo con `/inventario` y `/configuracion`. |
| Matriz de rutas: 50 rutas por 4 roles (200 comprobaciones) | Todas con el resultado esperado. Ninguna ruta de administración responde a un rol que no la tiene. |
| El intento bloqueado queda en la auditoría | Se ve quién, la ruta y la IP. |
| El vendedor consulta `/facturas/datos` con 2 ventas suyas y 2 de otros | Ve solo las 2 suyas. El contador ve las 4. |
| El vendedor descarga el PDF de una venta ajena | **404**. El de la suya responde 200. |
| El administrador le quita "cobrar" al vendedor con su sesión abierta | Su siguiente cobro responde 403, sin cerrar sesión. Al devolverle el permiso, vuelve a poder. |
| El administrador desactiva a un usuario con la sesión abierta | En su siguiente clic vuelve al inicio de sesión. Al reactivarlo, la cookie vieja sigue sin servir. |
| Cinco intentos fallidos de inicio de sesión | La cuenta se bloquea 15 minutos, incluso con la contraseña correcta. |
| Usuario con contraseña provisional | Solo puede abrir la pantalla de cambio. El resto responde con redirección (o 403 en JSON). |
| Código de recuperación | Sirve una vez, vence a los 30 minutos y un código nuevo invalida el anterior. Una contraseña débil no gasta el código. |
| Quitar el rol o desactivar al único administrador | Rechazado. Tampoco se puede dar permisos de Configuración a otro rol. |
| Correr la migración sobre una base de la Fase 4 con usuarios | Ningún usuario se pierde y entran con su contraseña de antes. Correrla otra vez no cambia nada. Si el script falla a mitad, la base queda como estaba. |

**Regresión de lo anterior.** Como esta semana cambió la autenticación y la protección de todas las rutas, se repitieron las baterías de las Fases 2, 3 y 4 sobre el proyecto integrado, con la contabilidad sin iniciar y ya iniciada: **1296 comprobaciones correctas** (Fase 2: 86 de API y 69 de interfaz. POS: 95 de API y 110 de interfaz. Facturas: 65. Móvil: 28. Modos de facturación: 33. Motor contable con 1500 operaciones aleatorias: 230. Finanzas: 129 de API y 120 de interfaz).

## Problemas encontrados y cómo se resolvieron

- **Caché del negocio.** La regresión mostró que un cambio en el nombre del negocio tardaba hasta 15 segundos en verse. Se quitó el caché por la razón que aparece arriba.
- **Bloqueo en la recuperación.** Al quinto intento fallido con un código, la cuenta se bloqueaba pero la respuesta decía "código inválido" y no "bloqueada", distinto del inicio de sesión. Se unificó.
- **Pruebas que asumían el comportamiento anterior.** Tres comprobaciones viejas daban por hecho que el vendedor no podía crear clientes ni ver Facturas. Eso contradice lo pedido en esta fase, así que se actualizaron a lo nuevo y se agregaron comprobaciones de que sí sigue sin poder crear categorías ni marcar facturas como pagadas.
- **Dos pruebas con datos fijos.** La de Facturas tenía fechas de octubre y empezó a fallar el 1 de noviembre. La del POS tenía escrito el nombre "SportCenter Demo", que ya no coincide con el `client.config.js` real. No eran defectos del sistema. Ahora la primera no depende del mes y la segunda lee el nombre de la configuración.

## Qué aprendimos

- **Lo delicado va en la base de datos.** El bloqueo por intentos, el "último administrador" y la regla de que Configuración es solo del admin viven en SQL. Así no dependen de que cada pantalla se acuerde de comprobarlos.
- **Una prueba que falla tras un cambio puede estar diciendo la verdad.** Las comprobaciones viejas que daban por hecho que el vendedor no veía Facturas fallaron porque el comportamiento cambió a propósito. Hubo que leer cada una antes de decidir si arreglar el código o la prueba.
- **Lo irreversible va al final del despliegue.** Ensayar la migración sobre una base de la Fase 4 permitió comprobar que un fallo no deja nada a medias, y de ahí sale el orden: primero el código y al final el SQL.
- **Los datos fijos envejecen.** Las pruebas con fechas y nombres escritos a mano se rompieron solas con el cambio de mes y con el nombre real del negocio.
- **Revisar el código antes de afirmar.** La Fase 5 se dio por absorbida después de comprobar qué muestra el inventario hoy. Eso permitió decir también qué sí falta, la lista de reposición.

## Lo que falta y deuda declarada

- **No hay protección CSRF** (la cookie es `HttpOnly` y `SameSite=Lax`, pero falta el token en cada formulario).
- **El bloqueo es por cuenta, no por IP.** Falta un límite por IP.
- **Falta verificar en el despliegue real** de Vercel y Supabase. Todo se probó en local con un Supabase simulado.
- **Las Estadísticas (Fase 6)** son lo siguiente y ya cuentan con quién vendió y con qué rol.
- **Fase 8:** los avisos automáticos y el asistente con IA son ideas por validar con las pymes antes de construirse.
- **Tabla `codigos_temporales`:** quedó de la Fase 1 sin uso y puede eliminarse en una migración futura.
- Completar las horas y los enlaces de evidencia de esta bitácora.

## Evidencia

- Commits de la semana: `[COMPLETAR]`
- Captura de la matriz de permisos: `[COMPLETAR]`
- Captura del 403 al entrar a `/finanzas` como vendedor: `[COMPLETAR]`
- Captura de la auditoría con el acceso denegado: `[COMPLETAR]`
