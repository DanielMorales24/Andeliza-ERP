# Bitácora de la semana 5: estadísticas y MVP listo para producción

**Periodo:** 9 al 15 de noviembre de 2026  ·  **Horas dedicadas:** 22  **Fases:** 6 (estadísticas) y 6.5 (preparación para producción)

**Meta de la semana:** cerrar la Fase 6 (historia HU-27, Estadísticas) y dejar el MVP listo para producción con su primer cliente real, JCL Sport: con su instancia propia, su base propia y un asistente de configuración inicial que guíe al dueño del negocio en su primer ingreso. Todo debía justificarse como trabajo de tesis: datos reales, código mantenible, sin dependencias nuevas y verificado antes de entregarse.

**Cómo se pasó de una fase a la otra.** La primera parte de la semana cerró la parte analítica del MVP: estadísticas, el panel de inicio y el menú de perfil. Con eso el sistema quedó funcionalmente completo para probarse con usuarios reales. Pero al cerrar la Fase 6 quedó anotado que `db/functions.sql` del repositorio estaba desactualizado. Esa deuda abrió la segunda parte: llevar el sistema a producción exigía poder instalarlo desde cero, separar por primera vez desarrollo y producción, y sacar del código todo lo que era propio de un negocio. Eso es la Fase 6.5.

## Decisiones de arquitectura de la semana

### Fase 6: estadísticas

#### D-04: el cálculo de las estadísticas vive en funciones SQL de solo lectura

**Decisión.** Los agregados (indicadores, series, rankings) se calculan en Postgres con funciones que devuelven JSON y están en la migración `06`. Node solo valida los filtros, arma la respuesta y redacta los insights.

**Alternativas.** (a) Consultas SQL directas en el modelo. (b) Vistas materializadas. (c) Funciones SQL con los filtros como parámetros.

**Por qué (c).** El período, el vendedor y la categoría se filtran en la base y no en Node. Una sola llamada (`estadisticas_panel`) trae todo lo de la pantalla y las mismas funciones sirven al panel de inicio. Además se pueden comprobar contra un modelo independiente escrito en JavaScript. No cambian el esquema: la migración solo agrega un índice y diez funciones.

#### D-05: los gráficos del PDF se dibujan en el servidor

**Decisión.** El reporte en PDF dibuja sus gráficos con `pdfkit` (barras y anillos) a partir de los mismos datos de la pantalla. Se apartó de lo pedido, que eran imágenes de Chart.js enviadas desde el navegador.

**Por qué.** Una ruta `GET` no puede cargar imágenes (la dirección tiene un límite de longitud) y habría que pasar a `POST` con varios megabytes de base64. Dibujar en el servidor deja el reporte en una simple dirección, sin depender del navegador, y se puede revisar rasterizando el PDF. **Consecuencia:** los gráficos del PDF se parecen a los de la pantalla pero no son idénticos. Si más adelante se quiere la imagen exacta, se puede agregar un `POST` sin tocar el resto.

#### D-06: la migración 06 se ejecuta antes del push

**Decisión.** Para esta fase el orden de despliegue es **primero el SQL y después el código**, al revés que en la Fase 7.

**Por qué.** La 06 solo agrega, así que el código anterior no la nota. En cambio el código nuevo la necesita. En el ensayo, con el código nuevo y sin la 06, el inicio de quien tiene el panel (administrador y supervisor) y los datos de *Estadísticas* respondían 500 (la pantalla abría, pero con un error), mientras el vendedor, el contador y el resto seguían bien. Con la 06 presente, el código anterior funcionó completo (546 respuestas comparadas). También se comprobó que si la migración falla a la mitad no queda nada creado.

### Fase 6.5: preparación para producción

Las cinco están desarrolladas en `docs/plan.md` con sus alternativas y consecuencias.

- **D-07: una instancia por cliente, con el mismo código.** Dos despliegues de Vercel y dos bases de Supabase: `andeliza-dev` para desarrollo y pruebas y `andeliza-jcl-sport` para la producción de JCL Sport. Lo que diferencia a una instancia son sus variables de entorno, su fila de `configuracion_negocio` y su seed. Sigue siendo *single-tenant*: son instancias independientes, no una base compartida.
- **D-08: `client.config.js` pasa a ser el catálogo maestro.** El archivo dice qué existe (unidades, variantes, monedas, paletas…) y la base dice qué eligió cada negocio. Se cambia desde *Configuración* sin `git push`.
- **D-09: un asistente de configuración inicial obligatorio.** Seis pasos, tres esenciales. Se detecta con dos marcas: una en el negocio (ya se configuró) y otra en el usuario (a quién le toca). Cerrarlo lo valida la base.
- **D-10: contraseñas con retroalimentación en vivo**, con exactamente las reglas que valida el servidor, en las cuatro pantallas donde se elige una.
- **D-11: paletas predefinidas** en lugar de un selector libre de colores, cada una comprobada con las fórmulas de contraste de WCAG.

## Qué hicimos

### Fase 6: estadísticas, panel de inicio y menú de perfil

**Base de datos (`db/migrations/06_migracion_fase6.sql`)**

- Un índice nuevo, `idx_ventas_usuario`. Los otros tres que pedía la fase (`creado_en`, `venta_id` del detalle y `estado`) ya existían desde la Fase 1, y se repiten con `IF NOT EXISTS`.
- Diez funciones de solo lectura: `zona_negocio`, `estadisticas_lineas`, `estadisticas_kpis`, `estadisticas_serie`, `estadisticas_top_productos`, `estadisticas_top_categorias`, `estadisticas_vendedores`, `estadisticas_dia_semana`, `estadisticas_mejor_dia` y `estadisticas_panel`.
- Trae `BEGIN` y `COMMIT`, se puede repetir y no modifica ninguna función existente (`crear_venta`, `contabilizar_venta` y las demás quedan igual).

**Estadísticas (`/estadisticas`)**

- Ocho períodos rápidos, rango personalizado, filtro por vendedor y por categoría, todo sin recargar la página.
- Seis indicadores comparados con el período anterior de igual longitud, seis gráficos de Chart.js, insights redactados con los valores reales y la tabla de ranking de vendedores con su rol.
- Reporte en PDF con las mismas cifras. Cada exportación queda en la auditoría.
- Estado vacío con un mensaje amable y, si hay un error, un botón para reintentar.

**Panel de inicio (`/`)**

- Bienvenida con la fecha y lo de hoy, cuatro tarjetas con insights, gráfico de 30 días, accesos rápidos con contexto, los cinco productos del mes y las últimas cinco ventas.
- Alertas solo cuando aplican: CAI vencido, agotado o por vencer, contabilidad sin iniciar y conciliación de inventario pendiente.
- Cada bloque respeta los permisos de la persona. El vendedor sigue entrando directo al punto de venta.

**Encabezado, sidebar y perfil**

- El encabezado ya no tiene los botones sueltos. Ahora hay un círculo con la inicial y un ícono según el rol, con un menú (hoja inferior en el celular) con *Mi Perfil*, *Cambiar contraseña*, *Mi actividad*, *Ir a Configuración* (solo administrador) y *Cerrar sesión*.
- El sidebar tiene fijos, abajo, *Cambiar contraseña* y *Salir*.
- *Mi perfil* muestra los datos de la persona, la matriz de permisos de su rol (leída de `roles_permisos`) y los módulos disponibles. *Mi actividad* muestra sus últimos 20 movimientos y solo los suyos.

**Código de la Fase 6:** 21 archivos, 9 modificados y 12 nuevos. No se tocaron `routes/auth.js`, `controllers/auth.js`, `models/negocio.js`, `routes/modulos.js` ni `db/functions.sql`. No se agregó ninguna dependencia.

### Fase 6.5: preparación para producción

**Deuda técnica que impedía instalar desde cero.** Al ensayar una instalación limpia con el repositorio tal como estaba, apareció que el problema era doble. `db/functions.sql` era el de la Fase 4 (le faltaban las 15 funciones de seguridad) y, además, la carpeta `db/migrations` solo tenía 01 a 04: las migraciones 05 y 06 nunca se habían copiado al repositorio, aunque la documentación las nombraba. El resultado era que `seed.sql` fallaba y la base quedaba sin usuarios, sin roles y sin función de inicio de sesión: nadie podía entrar. Se reemplazó `functions.sql` por el de la Fase 7 (el mismo que ya corre en desarrollo: solo cambia su línea de título) y se agregaron la 05 y la 06 sin modificar ni un byte.

**Migración 07.** Una sola migración, aditiva y atómica: 14 columnas en `configuracion_negocio` (moneda, formato de fecha, tasa de impuesto, paleta y sus dos colores, cinco elecciones del catálogo en JSONB y tres del asistente), `usuarios.onboarding_pendiente`, cuatro restricciones `CHECK` y la función `completar_onboarding`. Todos los valores por defecto reproducen lo que el sistema ya hacía, así que la base de desarrollo no cambió de aspecto ni de comportamiento.

**Seed de producción.** `db/seed-produccion.sql` deja una base recién creada con JCL Sport, el logo genérico, dos administradores (`admin`, que ve el asistente, y `soporte`, que no) con contraseña temporal y cambio obligatorio, y nueve categorías. Nada de productos, clientes, proveedores, CAI ni contabilidad. Comprueba sus requisitos y no hace nada si la base ya tiene usuarios. En el repositorio no trae una contraseña sino el marcador `CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR`, que se reemplaza en una copia local al instalar.

**Catálogo maestro.** `client.config.js` ya no tiene datos de ningún negocio: trae 21 unidades (nueve se venden en fracciones), 7 tipos de variante con sus opciones, 5 monedas, 3 formatos de fecha, 8 zonas horarias, 6 tasas de impuesto, las categorías de gasto y los tipos de ingreso, métodos de pago, documentos de identidad y 10 paletas. Una capa nueva (`utils/catalogo.js`) resuelve lo vigente, y un middleware carga el negocio en cada petición para que la moneda, el formato de fecha, la zona horaria y los colores salgan de la base en todas las pantallas y en los PDF. En *Configuración → Negocio* hay tres tarjetas nuevas: colores, formato regional y catálogo del negocio.

**Paletas de colores.** Diez paletas, todas con texto blanco legible sobre el color primario (al menos 4.5:1, WCAG AA), un acento que se distingue sobre el primario (al menos 3:1) y una distancia de color de al menos 25. La paleta elegida se aplica a todas las pantallas (también la de acceso y las de error) y a los PDF.

**Asistente de configuración inicial.** Seis pasos en un layout propio, con barra de avance, vista previa en vivo del logo (con su medida) y de la paleta, validación en vivo de los datos y la opción de saltar los dos pasos opcionales. Cada paso se guarda: si la persona sale, retoma donde se quedó.

**Componente de contraseñas.** Requisitos con ✓ y ✗ que se marcan y desmarcan mientras se escribe, barra de fortaleza, botón para ver lo escrito, confirmación y botón de guardar deshabilitado hasta que todo está en regla.

**Categorías nuevas de gasto e ingreso (migración 08).** Se completó el catálogo con *servicios* (agua, luz, internet y teléfono), *impuestos* (municipales, tasas y contribuciones) y *comisiones* (cobradas y por referidos). La migración 08 agrega sus cuentas (6106, 6107 y 4206) y cambia la forma de validar: `registrar_gasto` y `registrar_ingreso` dejaron de tener una lista fija y ahora aceptan cualquier categoría cuya cuenta exista y esté activa en el plan de cuentas. Así, una categoría futura solo necesita su cuenta. El asistente ofrece las tres en el paso 5 (servicios e impuestos ya marcados, comisiones opcional), y Movimientos, el libro diario, la balanza y el estado de resultados las muestran sin cambios porque agrupan por tipo de cuenta.

**Código de la Fase 6.5:** 48 archivos (35 modificados y 13 nuevos), más las migraciones 05 a 08, `db/functions.sql` y `db/seed-produccion.sql`. No se agregó ninguna dependencia.

## Decisiones técnicas

| Fase | Decisión | Por qué |
|:---:|---|---|
| 6 | **Ventas totales con impuesto, margen sin impuesto.** | Las ventas totales coinciden con Facturas y con el panel. El margen se calcula con el precio sin impuesto y el `costo_unitario` que cada venta guardó. |
| 6 | **El período se mide por el día local del negocio.** | Una venta de las 23:59 pertenece a su día aunque en UTC ya sea el siguiente. Se probó con ventas a las 23:59:59 y a las 00:00:00. |
| 6 | **El ranking de vendedores ignora el filtro de vendedor.** | Muestra a todo el equipo para que el porcentaje del total tenga sentido. Es la tabla que justifica la decisión D-01. |
| 6 | **El margen avisa cuánto de lo vendido tiene costo.** | Una venta sin costo registrado sale con margen del 100 % y engaña. Si la cobertura es menor al 100 %, la tarjeta y los insights lo dicen. |
| 6 | **Alertas del CAI en dos niveles.** | El pedido decía 5 números o 7 días y el panel anterior avisaba hasta 30 días. Se conservaron ambos: *urgente* con 5 números o 7 días, y *aviso* hasta 30 días. |
| 6 | **"Último acceso" es el inicio de la sesión actual.** | El inicio de sesión lo registra al entrar. En *Mi perfil* se agrega el *acceso anterior*, tomado de la auditoría. |
| 6 | **El menú del encabezado se cierra con un velo y no con `@click.outside`.** | Funciona igual en el celular y se puede probar sin un navegador real. |
| 6 | **Íconos propios, sin librería.** | Un solo archivo (`public/js/iconos.js`) sirve al servidor (EJS) y al navegador (Alpine). |
| 6 | **Chart.js desde el mismo CDN y versión que Finanzas (4.4.7).** | El panel anterior no usaba Chart.js (era un recuadro vacío), así que se reutilizó el cargador de Finanzas. |
| 6 | **Filtro de vendedores: usuarios activos con `pos.crear`.** | Es lo pedido. Un vendedor ya desactivado no aparece en el filtro, pero sí en el ranking. |
| 6.5 | **Una sola migración 07, aditiva y en una transacción.** | Todos los cambios eran del mismo dominio y solo agregaban: en una transacción se aplica completa o no se aplica. Partirla solo habría creado estados intermedios sin utilidad. |
| 6.5 | **La paleta de fábrica es Azul Deportivo.** | Son los colores que el sistema ya usaba: una instalación existente no cambia de aspecto al aplicar la 07. |
| 6.5 | **Del navegador solo llega el identificador de la paleta.** | El servidor copia los colores desde el catálogo y la base rechaza cualquier color que no tenga la forma `#RRGGBB`, lo que también impide inyectar CSS. |
| 6.5 | **Un "acento fuerte" derivado para fondos claros.** | Ningún acento llegaba a 3:1 sobre blanco. El sistema oscurece el mismo tono hasta alcanzarlo y lo usa en gráficos, foco y barras finas. |
| 6.5 | **El negocio se carga en cada petición, sin caché.** | En Vercel cada instancia tendría su propia caché y, tras guardar en Configuración, otra podría seguir mostrando lo viejo. Es una lectura por llave primaria. |
| 6.5 | **Elecciones del catálogo en columnas JSONB; NULL = predeterminadas.** | Cada elección se valida contra el catálogo al guardar y la base comprueba su forma con un `CHECK`. |
| 6.5 | **Lo desactivado no se pierde.** | Un producto conserva su unidad, sus tipos de variante y sus opciones aunque ya no estén activos; se muestran como "(inactiva)" y solo se bloquea elegirlos para algo nuevo. |
| 6.5 | **El logo se valida leyendo su cabecera.** | No se confía en la extensión: el servidor comprueba que sea PNG o JPEG, de al menos 200 × 200 píxeles y hasta 3 MB. |
| 6.5 | **Cuentas 6106, 6107 y 4206.** | Continúan la numeración: 6105 y 4205 ya eran *Otros* y no se renumeraron porque esos códigos están en partidas registradas y en reportes impresos. |
| 6.5 | **La migración 08 trae sus propias funciones.** | En una base en uso basta con ejecutarla a ella: re-ejecutar `functions.sql` en una base con productos y sin contabilidad la iniciaría sola. |

## Resultados de las pruebas

Las pruebas se corrieron contra un Postgres 16 local y un Supabase Storage simulado. La interfaz se probó con jsdom y Alpine y, en la Fase 6.5, también en un navegador real (Chromium con Tailwind y Alpine cargados desde su CDN). En total, **514 comprobaciones, todas correctas**: 272 de la Fase 6 y 242 de la Fase 6.5.

| Fase | Batería | Qué comprueba | Resultado |
|:---:|---|---|---|
| 6 | Estadísticas en la base de datos | Las funciones SQL contra un modelo independiente, con 482 ventas generadas (varios vendedores, categorías, créditos, costos en cero y ventas pegadas a la medianoche). Además, que la migración no cambia tablas ni funciones existentes, agrega solo un índice y se puede repetir | **78 de 78** |
| 6 | Estadísticas por HTTP | Permisos por rol, períodos contra lo que calcula Postgres, filtros, validaciones, la estructura del JSON, cada insight con cifras calculadas a mano y el PDF leído con `pdftotext` | **59 de 59** |
| 6 | Panel, perfil y menú por HTTP | Qué ve cada rol, los umbrales exactos de las alertas, la matriz del perfil contra `roles_permisos`, la regla de que *Mi actividad* solo muestra filas propias y el menú y el sidebar | **75 de 75** |
| 6 | Interfaz de Estadísticas, panel y menú | Filtros, popover de fechas, estados vacío y de error, respuestas atrasadas, los seis gráficos y el menú, simulados con jsdom y Alpine y con Chart.js simulado para ver qué se le pide dibujar | **60 de 60** |
| 6.5 | Instalación limpia y recorrido por HTTP | `01 → 07 → functions.sql → seed-produccion.sql` sobre una base vacía: primer acceso, asistente completo, bloqueo, catálogo, paleta en pantallas y PDF | **97 de 97** |
| 6.5 | Interfaz con jsdom y Alpine | Componente de contraseñas en sus cuatro pantallas, asistente, Configuración y formulario de producto | **41 de 41** |
| 6.5 | Unitarias | Contraste, paletas, resolutor del catálogo, formato regional, lector de imágenes y coherencia entre el catálogo y la migración | **32 de 32** |
| 6.5 | Navegador real | Chromium midiendo los colores que de verdad se pintan: encabezado, menú, botones, foco y la barra de fortaleza | **29 de 29** |
| 6.5 | Categorías nuevas | Instalación limpia con la 08, el marcador del seed, idempotencia, base en uso que recibe solo la 08, choque de códigos, partidas, anulaciones con su contrapartida, libro diario, balanza, estado de resultados en PDF y el asistente | **36 de 36** |
| 6.5 | Interfaz de las categorías | El selector de Movimientos y el paso 5 del asistente | **7 de 7** |

Las 272 comprobaciones de la Fase 6 se volvieron a correr contra el código de la Fase 6.5 y pasaron. Dos de ellas (el estado "sin ventas" de la interfaz de estadísticas) dependen del orden y de la hora del día: pasan en el estado para el que se escribieron y, en la secuencia en que fallaron, fallaron igual con el código anterior. Tras agregar las categorías se repitieron las suites de la Fase 6.5 que ejercitan el asistente y el catálogo (97, 41, 32 y 29): todas bien.

**Regresión de lo que ya existía.** Las baterías de las Fases 2 a 4 no estaban dentro del repositorio y el entorno donde corrían se perdió a mitad de la semana, así que no se volvieron a ejecutar. En su lugar se hizo una **comparación diferencial**: un mismo guion (ventas fiscal, a crédito e interna, cotización, facturas y PDF, marcar pagada, contabilidad, ingresos, gastos, abonos, reportes, usuarios, cambio forzado de contraseña y bloqueo por intentos, con los cuatro roles y las pantallas antes y después de operar) se ejecutó contra el código anterior y contra el nuevo, al cerrar cada fase.

| Comparación | Al cerrar la Fase 6 | Al cerrar la Fase 6.5 |
|---|---|---|
| Respuestas comparadas (estado y contenido de cada pantalla, JSON y PDF) | **546** | **546** |
| Idénticas | **538** | **505** |
| Distintas | **8**: todas `GET /` del administrador y del supervisor, el panel que se rediseñó a propósito | **41**: todas con el mismo código de respuesta y el mismo destino; son las pantallas cuyo HTML cambió a propósito (cambiar contraseña, recuperar, formulario de producto, Configuración y Usuarios) |
| Huella de la base de datos tras el guion (ventas, detalle, stock, asientos, ingresos, gastos, abonos, usuarios, auditoría y saldos) | **Idéntica** | **Idéntica** |

Casos que sirven para la demostración:

| Prueba | Resultado obtenido |
|---|---|
| El vendedor escribe `/estadisticas` en la barra de direcciones | **403**, y queda en la auditoría. Lo mismo con el contador. |
| Hoy L 334.00 contra ayer L 230.00 | **▲ 45.2 %** en el panel de inicio. Con otros datos, "Ventas ↑ 15.2 %" en Estadísticas (265 contra 230, calculado a mano). |
| Una venta a las 23:59:59 y otra a las 00:00:00 | Cada una cuenta en su día local, aunque en UTC caigan en fechas distintas. |
| El CAI con 6 números restantes, con 5, con 7 días, con 8 días | Sin alerta, *urgente*, *urgente* y *aviso*, en ese orden. |
| `/perfil/actividad?usuario=1` con la sesión de un vendedor | Devuelve la actividad del propio vendedor. No se puede pedir la de otra persona. |
| Ejecutar la migración 06 con un error forzado antes del `COMMIT` | No queda ninguna función ni índice creado. |
| Instalar desde el repositorio tal como estaba antes de la Fase 6.5 | `seed.sql` falla y la base queda sin usuarios: nadie puede entrar. Con las migraciones 05 a 08 y el `functions.sql` nuevo, instala. |
| El administrador entra por primera vez con la contraseña temporal | Primero se le obliga a cambiarla y después ve el asistente; 13 pantallas probadas lo devuelven al asistente mientras está pendiente. `soporte` entra directo al panel. |
| En el asistente, un RTN de 13 dígitos o un logo de 100 × 100 | El botón Continuar no se habilita, y el servidor también lo rechaza explicando por qué. |
| 1.5 metros y 1.5 unidades en el punto de venta | El primero se acepta y el segundo se rechaza. |
| Un gasto de servicios pagado de caja y su anulación | Debe 6106 / Haber Caja; la anulación genera la contrapartida exacta y los saldos vuelven a cero. |
| Ejecutar el seed de producción sin reemplazar el marcador | La política de contraseñas lo detiene y no se crea ningún usuario. |

## Problemas encontrados y cómo se resolvieron

### Durante la Fase 6

- **El panel anterior no usaba Chart.js.** El pedido pedía reutilizar su cargador, pero el panel solo tenía un recuadro vacío. El único Chart.js del proyecto estaba en Finanzas, y de ahí se tomó el cargador y la versión.
- **Íconos que no cargaban en Estadísticas.** La prueba de interfaz detectó el error `Iconos is not defined`: la pantalla usaba `Iconos.icono(...)` en el navegador pero no cargaba `iconos.js`. Se agregó el script.
- **Cinco defectos de maquetación del PDF que solo se vieron al mirarlo.** Al rasterizar el reporte aparecieron: la tarjeta de margen se desbordaba y pisaba su texto, todas las tarjetas decían "Sin dato para comparar" cuando el período es *Todo*, el título de una sección quedaba solo al pie de una hoja, la leyenda de categorías se salía de su bloque y "Sin vendedor" aparecía como "(inactivo)". Se corrigieron y se volvió a revisar el PDF.
- **Una etiqueta del panel rompía el HTML.** La etiqueta dinámica (`<a>` o `<article>`) se emitía con `<%=`, que escapa las comillas. Se cambió a `<%-`.
- **Ventas de prueba que no cuadraban.** El generador redondeaba el subtotal de cada línea pero no el de la venta, algo que `crear_venta` no permite. Se corrigió y las funciones SQL pasaron.
- **Se perdió el entorno de pruebas.** A mitad de la semana el entorno se reinició y se perdieron el código en curso, las pruebas y la base. Todo se reconstruyó desde cero a partir de lo ya escrito, se volvieron a correr las baterías y se respaldó el trabajo fuera del entorno. De ahí también la regresión diferencial.
- **Sin la 06, el panel del administrador da error.** Lo detectó el ensayo de despliegue y de ahí sale la decisión D-06.

### Durante la Fase 6.5

- **El ZIP del proyecto no llegó en el primer envío.** Se reconstruyó el estado "después de la Fase 6" y, cuando llegó el ZIP, se comparó archivo por archivo: el código era idéntico. Sí reveló que faltaban las migraciones 05 y 06 en el repositorio.
- **Los acentos de las paletas no se veían sobre blanco.** Al medir las paletas propuestas, ninguno de los diez acentos llegaba a 3:1 sobre fondo blanco: en los gráficos y en el anillo de foco prácticamente desaparecían. En lugar de cambiar las paletas, el sistema deriva un "acento fuerte" (el mismo tono, más oscuro) para esos usos. En el navegador se midió que el anillo de foco de Verde Bosque sale en `rgb(52, 168, 69)` y no en el verde pastel.
- **Un bucle de redirecciones en el primer ingreso.** El bloqueo del asistente redirigía a `/onboarding` y el cambio de contraseña obligatorio devolvía a `/cambiar-contrasena`, sin fin. Se ordenaron las dos reglas: primero la contraseña, después el asistente. Lo encontró la prueba de instalación limpia.
- **La tasa por defecto vivía en el código.** Sin CAI, el impuesto salía de `client.config.js`. Pasó a la base (`tasa_impuesto`) con el mismo 15 % de siempre, y se probó que una venta interna sigue dando el mismo subtotal, impuesto y total.
- **Categorías de gasto que la base rechazaría.** Se había previsto agregar "servicios", "impuestos" y "comisiones", pero las funciones contables validaban una lista fija y cada categoría necesita su cuenta. En la primera entrega se dejaron fuera para no tocar las funciones contables. **Se resolvió en la segunda entrega** con la migración 08: las tres cuentas nuevas y las dos funciones validando contra el plan de cuentas. Al diseñarla apareció otro riesgo: re-ejecutar `functions.sql` en una base con productos y sin contabilidad la inicia sola. Por eso la 08 trae las funciones y en una base en uso basta con ejecutarla a ella; una prueba comprueba que deja exactamente las mismas definiciones que `functions.sql`.
- **Dos pruebas de la Fase 6 que dependen de la hora.** Al repetir las suites, dos comprobaciones de la interfaz de estadísticas (el estado "sin ventas") fallaron según el orden y la hora del día. Se corrió la misma secuencia con el código anterior y falló igual: no es una regresión, es una fragilidad de esas pruebas. Pasan cuando se corren en el estado para el que se escribieron.

## Qué aprendimos

- **Mirar el resultado encuentra lo que las pruebas de texto no ven.** Las pruebas leían el PDF con `pdftotext` y pasaban, pero cinco defectos de maquetación solo aparecieron al rasterizarlo. Lo mismo con las paletas: cumplían con el texto blanco, pero sus acentos fallaban en otros usos, y calcular el contraste con las fórmulas de WCAG encontró el problema antes que cualquier persona.
- **Una prueba de interfaz puede encontrar un script que falta.** Ninguna otra batería habría visto que `iconos.js` no se cargaba en el navegador.
- **Ensayar el despliegue cambia el orden.** La regla de la Fase 7 (primero el código) habría dejado sin panel al administrador durante unos minutos. El ensayo mostró que con migraciones aditivas, como la 06, la 07 y la 08, conviene lo contrario.
- **Una instalación limpia es una prueba, no un trámite.** El repositorio llevaba dos fases sin poder instalarse desde cero y nadie lo había notado porque la base de desarrollo ya tenía todo. Sin el ensayo, el primer cliente real habría sido el que lo descubriera.
- **Comparar contra el código anterior vale cuando no queda la batería vieja.** Un guion corrido contra las dos versiones prueba que lo existente sigue igual sin depender de pruebas que ya no están.
- **El catálogo tiene comportamiento, no solo palabras.** Una unidad decide si se aceptan fracciones y una categoría de gasto es una cuenta contable. Por eso el negocio elige del catálogo, pero no lo inventa.
- **Validar contra los datos y no contra una lista.** Cuando la regla vivía en una lista fija dentro de las funciones contables, agregar una categoría era tocar el motor contable. Validar contra el plan de cuentas hace que la base siga mandando y que crecer sea solo agregar una fila.
- **Probar en un navegador real cambia la confianza.** Además de las pruebas con jsdom, se recorrió todo en Chromium con Tailwind y Alpine reales, midiendo los colores que de verdad se pintan.
- **Hay que respaldar fuera del entorno de trabajo.** Lo que no está en el repositorio o en la carpeta de entregas puede perderse.

## Lo que falta y deuda declarada

**Pendiente:**

- **Seguridad:** no hay protección CSRF (la cookie es `HttpOnly` y `SameSite=Lax`, pero falta el token en cada formulario), y el bloqueo por intentos es por cuenta, no por IP.
- **Verificar en las instancias reales.** Las pruebas de esta semana se hicieron en local, con Postgres 16 y un Supabase Storage simulado. Queda confirmar el comportamiento en las instancias reales de Vercel y Supabase. Las migraciones 06, 07 y 08 se ejecutan en cada base (desarrollo y JCL Sport) antes de usar el código.
- **Contraseña temporal de cada instalación.** El repositorio solo trae el marcador. Queda en manos de quien instala cambiar la temporal de `admin` y `soporte` antes de publicar la dirección, aunque el sistema obliga a cambiarla al entrar.
- **Dos proyectos de Vercel en la misma rama** despliegan a la vez: se recomienda que producción siga una rama propia.
- **Estadísticas no distingue "solo mis ventas".** Quien tiene `estadisticas.ver` ve las cifras de todo el equipo.
- **Los gráficos del PDF se dibujan en el servidor** y no son idénticos a los de la pantalla (ver D-05).
- **Los días restantes del CAI** se calculan con `CURRENT_DATE` del servidor de la base (UTC) y no con el día local del negocio, así que durante unas horas al día pueden diferir en uno.
- **Selector libre de colores.** La validación ya existe (`utils/colores.js`), falta la interfaz.
- **Métodos de pago y documentos de identidad:** están en el catálogo pero todavía no tienen pantalla (HU-31).
- **Pruebas fuera del repositorio**, incluidas las dos de estadísticas que dependen de la hora. Pasarlas al repositorio está previsto para la semana 9.
- **Tailwind por CDN:** compilar el CSS está previsto para la semana 9.
- **Tabla `codigos_temporales`:** quedó de la Fase 1 sin uso y puede eliminarse en una migración futura.
- **Fase 8:** los avisos automáticos y el asistente con IA son ideas por validar con las pymes antes de construirse.

**Resuelto dentro de la misma semana:**

- **`db/functions.sql` desactualizado** (anotado al cerrar la Fase 6): se reemplazó por el de la Fase 7 en la Fase 6.5, y se agregaron al repositorio las migraciones 05 y 06, que faltaban.
- **La interfaz solo se había probado con jsdom** (anotado al cerrar la Fase 6): en la Fase 6.5 se recorrió también en Chromium real.
- **Las categorías de gasto *servicios* e *impuestos* y el tipo de ingreso *comisiones*:** agregados con la migración 08.
- **La contraseña temporal escrita en el seed de producción:** el repositorio solo trae el marcador `CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR`. Si se ejecuta sin reemplazarlo, la política de contraseñas lo detiene (el marcador no tiene números) y no se crea ningún usuario.

## Evidencia

- **Release:** `semana-5`. Reúne el código de las dos fases (el de la Fase 6.5 está en el commit `c702391` de `main`) y la documentación de la semana, en el commit de documentación posterior a `c702391`.
- **Documentación:** `docs/referencia-tecnica.md` (secciones *Panel de inicio*, *Estadísticas (Fase 6)*, *Perfil y menú de usuario*, *Instalación por cliente (multi-instancia)*, *client.config.js como catálogo maestro*, *Asistente de configuración inicial*, *Política de contraseñas* y *Paletas de colores y contraste*). Las decisiones D-07 a D-11 están en `docs/plan.md`.
- **Reproducible a mano:** entrando como administrador en desarrollo (estadísticas, panel y perfil) y, en una instancia nueva con el seed de producción, el asistente completo.
- **PDF:** el reporte de estadísticas (`/estadisticas/reporte.pdf`, cuya exportación queda en *Configuración → Auditoría*) se rasterizó para corregir cinco defectos de maquetación. La factura y el reporte de estadísticas se rasterizaron con la paleta Rojo Fuego: sin rastro del azul de fábrica y con el logo subido en el asistente.
- **Pruebas:** 514 comprobaciones (272 de la Fase 6 y 242 de la Fase 6.5) y las dos comparaciones diferenciales de 546 respuestas, resumidas arriba.
