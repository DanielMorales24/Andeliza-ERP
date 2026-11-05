# Permisos y roles

Este documento describe quién puede hacer qué en Andeliza ERP. **La matriz de abajo se generó leyendo la tabla `roles_permisos` de una base real** (creada con `db/migrations/01` a `05`), así que coincide con lo que hace el sistema.

## Cómo funciona

- Cada **usuario** tiene un **rol**. Cada **rol** tiene un conjunto de **permisos**. Un permiso es un módulo y una acción, por ejemplo `pos.crear` (punto de venta, cobrar).
- **El servidor decide.** Cada ruta pasa por `requirePermiso(modulo, accion)` y responde **403 (Acceso denegado)** si falta el permiso. Ocultar un botón o un menú es comodidad, no seguridad: escribir la dirección a mano no sirve.
- **Los permisos se leen en cada petición**, no al iniciar sesión. Si el administrador cambia un permiso, desactiva a alguien o cambia su rol, el efecto es inmediato aunque la persona tenga la sesión abierta.
- **El rol `admin` es especial**: tiene todos los permisos (también los que se agreguen en el futuro) y no se puede editar, renombrar, desactivar ni eliminar. Así nunca se pierde el acceso al sistema. Además, el sistema no deja desactivar ni quitarle el rol al último administrador activo.
- **Configuración es solo del administrador.** Sus permisos no se pueden dar a otro rol: lo impide la interfaz, la función SQL `guardar_permisos_rol` y un trigger en la tabla `roles_permisos`.
- **Crear, editar y eliminar exigen también "ver"** en ese módulo. La matriz lo aplica sola al activar o quitar interruptores y la base de datos lo vuelve a comprobar.
- **"Eliminar" significa desactivar o reactivar**: en Andeliza nada se borra, se desactiva (así se conserva el historial).

## Matriz de acciones por rol

| Módulo | Acción | Qué permite | `admin` | `supervisor` | `vendedor` | `contador` |
|---|---|---|:---:|:---:|:---:|:---:|
| Inicio (panel) | Ver (`dashboard.ver`) | Ver el panel de inicio | ✔ | ✔ | — | — |
| Punto de venta | Ver (`pos.ver`) | Abrir el punto de venta y buscar productos | ✔ | ✔ | ✔ | — |
| Punto de venta | Crear (`pos.crear`) | Cobrar ventas y hacer cotizaciones | ✔ | ✔ | ✔ | — |
| Inventario y categorías | Ver (`inventario.ver`) | Ver productos y categorías | ✔ | ✔ | — | — |
| Inventario y categorías | Crear (`inventario.crear`) | Crear productos y categorías | ✔ | ✔ | — | — |
| Inventario y categorías | Editar (`inventario.editar`) | Editar productos y categorías | ✔ | ✔ | — | — |
| Inventario y categorías | Eliminar (`inventario.eliminar`) | Desactivar y reactivar productos y categorías | ✔ | ✔ | — | — |
| Clientes | Ver (`clientes.ver`) | Ver la lista de clientes | ✔ | ✔ | ✔ | — |
| Clientes | Crear (`clientes.crear`) | Crear clientes (también el alta rápida del punto de venta) | ✔ | ✔ | ✔ | — |
| Clientes | Editar (`clientes.editar`) | Editar clientes | ✔ | ✔ | ✔ | — |
| Clientes | Eliminar (`clientes.eliminar`) | Desactivar y reactivar clientes | ✔ | ✔ | — | — |
| Proveedores | Ver (`proveedores.ver`) | Ver la lista de proveedores | ✔ | ✔ | — | — |
| Proveedores | Crear (`proveedores.crear`) | Crear proveedores | ✔ | ✔ | — | — |
| Proveedores | Editar (`proveedores.editar`) | Editar proveedores | ✔ | ✔ | — | — |
| Proveedores | Eliminar (`proveedores.eliminar`) | Desactivar y reactivar proveedores | ✔ | ✔ | — | — |
| Facturas | Ver (`facturas.ver`) | Ver y descargar TODAS las facturas | ✔ | ✔ | — | ✔ |
| Facturas | Solo propias (`facturas.ver_propias`) | Ver y descargar solo las facturas que el usuario emitió | ✔ | — | ✔ | — |
| Facturas | Editar (`facturas.editar`) | Marcar facturas como pagadas | ✔ | ✔ | — | — |
| Finanzas y reportes | Ver (`finanzas.ver`) | Ver finanzas, cartera, libro diario y reportes | ✔ | ✔ | — | ✔ |
| Finanzas y reportes | Crear (`finanzas.crear`) | Registrar ingresos, gastos, compras, abonos, pagos y asientos | ✔ | ✔ | — | ✔ |
| Finanzas y reportes | Editar (`finanzas.editar`) | Conciliar el inventario con las existencias | ✔ | ✔ | — | ✔ |
| Finanzas y reportes | Eliminar (`finanzas.eliminar`) | Anular ingresos, gastos, abonos, pagos y asientos | ✔ | ✔ | — | ✔ |
| Estadísticas | Ver (`estadisticas.ver`) | Ver las estadísticas de ventas | ✔ | ✔ | — | — |
| Configuración | Ver (`configuracion.ver`) | Ver la configuración, los usuarios, los roles y la auditoría | ✔ | — | — | — |
| Configuración | Crear (`configuracion.crear`) | Crear usuarios y roles | ✔ | — | — | — |
| Configuración | Editar (`configuracion.editar`) | Editar el negocio, los usuarios, los roles y sus permisos | ✔ | — | — | — |
| Configuración | Eliminar (`configuracion.eliminar`) | Eliminar roles | ✔ | — | — | — |
| | | **Total de permisos** | **27** | **22** | **6** | **5** |

### Resumen por módulo

V = ver · C = crear · E = editar · X = eliminar (desactivar) · P = solo las propias

| Módulo | `admin` | `supervisor` | `vendedor` | `contador` |
|---|:---:|:---:|:---:|:---:|
| Inicio (panel) | V | V | — | — |
| Punto de venta | VC | VC | VC | — |
| Inventario y categorías | VCEX | VCEX | — | — |
| Clientes | VCEX | VCEX | VCE | — |
| Proveedores | VCEX | VCEX | — | — |
| Facturas | VPE | VE | P | V |
| Finanzas y reportes | VCEX | VCEX | — | VCEX |
| Estadísticas | V | V | — | — |
| Configuración | VCEX | — | — | — |

Interpretación de cada rol:

- **admin:** control total, incluida la configuración, los usuarios y los roles.
- **supervisor:** inventario, finanzas y estadísticas, y también el punto de venta, clientes, proveedores y facturas (los necesita para trabajar con el inventario y las finanzas). **No entra a Configuración.**
- **vendedor:** punto de venta y clientes (ver, crear y editar). Ve y descarga **solo las facturas que él mismo emitió**.
- **contador:** finanzas y reportes completos, y **todas las facturas** (solo lectura). No vende ni toca el inventario.

> Estos permisos son los "de fábrica". El administrador puede ajustar los de `supervisor`, `vendedor` y `contador`, y crear roles nuevos, desde **Configuración → Roles y permisos**.

## Qué permiso pide cada ruta

| Ruta | Permiso |
|---|---|
| `GET /` (panel) | `dashboard.ver` (si no lo tiene, va a su módulo principal) |
| `GET /pos`, `GET /pos/catalogo` | `pos.ver` |
| `POST /pos/cobrar`, `POST /pos/cotizacion` | `pos.crear` |
| `POST /pos/clientes` (alta rápida de cliente) | `clientes.crear` |
| `GET /inventario`, `GET /categorias` | `inventario.ver` |
| `POST /inventario`, `POST /categorias`, `GET /inventario/nuevo` | `inventario.crear` |
| `POST /inventario/:id`, `PUT /categorias/:id`, `GET /inventario/:id/editar` | `inventario.editar` |
| `PATCH /inventario/:id/activo`, `PATCH /categorias/:id/activo` | `inventario.eliminar` |
| `/clientes` y `/proveedores`: listar, crear, editar, activar/desactivar | `ver`, `crear`, `editar`, `eliminar` del módulo |
| `GET /facturas`, `GET /facturas/datos` | `facturas.ver` (todas) o `facturas.ver_propias` (solo las del usuario) |
| `GET /facturas/:id/pdf` | `facturas.ver`, `facturas.ver_propias` o `pos.crear` (sin `facturas.ver`, solo la propia, y una ajena responde 404) |
| `PATCH /facturas/:id/pagada` | `facturas.editar` |
| `GET /finanzas/*` (resumen, cartera, movimientos, libro diario, reportes PDF) | `finanzas.ver` |
| `POST` de iniciar, saldo inicial, ingresos, gastos, compras, abonos, pagos, asientos manuales | `finanzas.crear` |
| `POST /finanzas/conciliar-inventario` | `finanzas.editar` |
| `POST` de anular ingresos, gastos, abonos, pagos y asientos | `finanzas.eliminar` |
| `GET /estadisticas` | `estadisticas.ver` |
| `GET /configuracion/*` | `configuracion.ver` |
| `POST /configuracion/usuarios`, `POST /configuracion/roles` | `configuracion.crear` |
| `PUT`/`PATCH` de negocio, facturación, usuarios, roles y permisos, y generar código de recuperación | `configuracion.editar` |
| `DELETE /configuracion/roles/:id` | `configuracion.eliminar` |
| `/login`, `/logout`, `/recuperar` | Públicas (la recuperación exige el código del administrador) |
| `/cambiar-contrasena` | Cualquier usuario con sesión, y es la única ruta (además de salir) que se permite con una contraseña provisional |

## Reglas de propiedad del dato

Además de "qué módulos puedo usar", hay reglas sobre **de quién son los datos**:

| Regla | Cómo se aplica |
|---|---|
| **El vendedor solo ve e imprime las facturas que él mismo emitió.** | Con `facturas.ver_propias` y sin `facturas.ver`, la consulta del listado agrega `WHERE usuario_id = <él>` (el filtro está en la consulta SQL y no en la pantalla, y los totales también salen solo de sus ventas). El PDF de una venta ajena responde **404**, para no confirmar que existe. |
| **El contador, el supervisor y el admin ven todas las facturas.** | Tienen `facturas.ver`. |
| **Quien solo cobra imprime su propia factura.** | El PDF también se permite con `pos.crear`, pero solo las propias. Sin `facturas.ver_propias` no entra al listado. |
| **Marcar una factura como pagada** | Solo con `facturas.editar` (admin y supervisor). El vendedor y el contador no. |

## Cuentas de demostración

Salen del archivo `db/seed.sql`. **Son solo para pruebas y demostración:** cámbialas antes de usar el sistema con datos reales.

| Rol | Usuario | Contraseña | Entra a |
|---|---|---|---|
| Administrador | `admin` | `admin123` | Panel de inicio |
| Vendedor | `vendedor` | `vendedor123` | Punto de venta |
| Contador | `contador` | `contador123` | Finanzas |
| Supervisor (adicional, para probar el cuarto rol) | `supervisor` | `supervisor123` | Panel de inicio |

Estas contraseñas cumplen la política (8 o más caracteres, con letras y números). En la base **no están en texto plano**: se guardan con bcrypt.

> En una base que ya existía antes de la Fase 7 (como la de producción), la migración **no crea usuarios**: solo conserva los que había. Para tener las cuentas `contador` y `supervisor` hay que crearlas desde *Configuración → Usuarios* y, si son de demostración, desmarcar "Pedir que la cambie en su primer inicio de sesión" para que quien evalúe pueda entrar de inmediato.

## Seguridad de las cuentas

| Tema | Qué hace el sistema |
|---|---|
| **Contraseñas** | Se guardan con **bcrypt** (extensión `pgcrypto`). Una restricción de la base rechaza guardar texto plano. Política: 8 a 72 caracteres, con letras y números, distinta del usuario. |
| **Contraseña provisional** | Un usuario nuevo puede crearse con "debe cambiar la contraseña": en su primer inicio de sesión solo puede cambiarla (o salir). Hasta entonces cualquier otra ruta lo devuelve a esa pantalla (o responde 403 en JSON). |
| **Bloqueo por intentos** | 5 intentos fallidos seguidos bloquean la cuenta **15 minutos**, incluso con la contraseña correcta. El mensaje de error no revela si el usuario existe. |
| **Recuperación de contraseña** | El administrador genera un **código de 8 caracteres** (`XXXX-XXXX`, sin 0/O/1/I) que dura **30 minutos** y sirve **una sola vez**. Se muestra una vez en pantalla y en la base solo queda su hash (SHA-256). La persona lo escribe en *Iniciar sesión → ¿Olvidaste tu contraseña?* y elige una nueva. Adivinar códigos también bloquea la cuenta. Un código nuevo invalida el anterior. |
| **Cerrar sesiones** | Al desactivar a un usuario, al cambiar o recuperar su contraseña, se cierran **todas** sus sesiones abiertas (columna `sesion_version`). Si el administrador cambia el rol o los permisos, el efecto es inmediato. |
| **Quién no puede qué** | Nadie puede desactivarse a sí mismo ni cambiarse su propio rol. No se puede dejar al sistema sin administrador activo. Un rol con usuarios activos no se desactiva y uno con usuarios no se elimina. |
| **Auditoría** | Tabla `auditoria` de **solo agregar** (un trigger impide modificarla o borrarla). Registra inicios de sesión, intentos fallidos, bloqueos, **accesos denegados (403)**, usuarios, roles y permisos, cambios al negocio y al SAR, finanzas, facturas pagadas y ventas. Se ve en *Configuración → Auditoría* (últimos 50 movimientos). Nunca guarda contraseñas ni códigos. |

## Cómo comprobarlo a mano (para la demostración)

1. Entra como `vendedor` / `vendedor123`. Verás solo *Punto de venta*, *Clientes* y *Facturas* en el menú.
2. Escribe en la barra de direcciones `/finanzas`. Resultado esperado: **403, "No tienes permiso para ver esta página"**. Lo mismo con `/inventario` y `/configuracion`.
3. En *Facturas* solo aparecen las ventas hechas por ese vendedor. Cobra una venta y descarga su PDF. El PDF de una venta de otro usuario responde 404.
4. Entra como `admin` / `admin123`, abre *Configuración → Auditoría* y verás el acceso denegado del vendedor con su nombre, la ruta y la IP.
5. En *Configuración → Roles y permisos* quítale `Crear` en *Punto de venta* al rol `vendedor` y guarda. Sin cerrar su sesión, el vendedor ya no puede cobrar.
6. En *Configuración → Usuarios* desactiva al vendedor: en su siguiente clic vuelve al inicio de sesión.

## Límites conocidos (deuda declarada)

- **No hay protección CSRF.** La cookie de sesión usa `SameSite=Lax` y `HttpOnly`, lo que cubre los casos más comunes, pero un token CSRF en cada formulario sigue pendiente.
- **El bloqueo por intentos es por cuenta, no por IP.** Un atacante que pruebe muchos usuarios distintos no se frena con esto, y haría falta un límite por IP (por ejemplo en Vercel o con Upstash).
- **No hay verificación en dos pasos** ni vencimiento periódico de contraseñas.
- **La cookie de sesión dura 12 horas** y se firma con `SESSION_SECRET`. Si esa variable se filtra, hay que cambiarla (cierra todas las sesiones).
- **Las pruebas se hicieron contra Postgres local con un Supabase simulado.** Falta repetir la comprobación en el despliegue real de Vercel y Supabase.
