# Bitácora de la semana 5: estadísticas, panel de inicio y menú de perfil

**Periodo:** 9 al 15 de noviembre de 2026  ·  **Horas dedicadas:** 18

**Meta de la semana:** cerrar la Fase 6 (historia HU-27, Estadísticas) y pulir las tres pantallas que más se verán en la defensa: el panel de inicio, el encabezado con su menú de perfil y las páginas nuevas *Mi perfil* y *Mi actividad*. Cada una debía justificarse como trabajo de tesis: datos reales, un insight útil y código mantenible, sin dependencias nuevas.

## Decisiones de arquitectura de la semana

### D-04: el cálculo de las estadísticas vive en funciones SQL de solo lectura

**Decisión.** Los agregados (indicadores, series, rankings) se calculan en Postgres con funciones que devuelven JSON y están en la migración `06`. Node solo valida los filtros, arma la respuesta y redacta los insights.

**Alternativas.** (a) Consultas SQL directas en el modelo. (b) Vistas materializadas. (c) Funciones SQL con los filtros como parámetros.

**Por qué (c).** El período, el vendedor y la categoría se filtran en la base y no en Node. Una sola llamada (`estadisticas_panel`) trae todo lo de la pantalla y las mismas funciones sirven al panel de inicio. Además se pueden comprobar contra un modelo independiente escrito en JavaScript. No cambian el esquema: la migración solo agrega un índice y diez funciones.

### D-05: los gráficos del PDF se dibujan en el servidor

**Decisión.** El reporte en PDF dibuja sus gráficos con `pdfkit` (barras y anillos) a partir de los mismos datos de la pantalla. Se apartó de lo pedido, que eran imágenes de Chart.js enviadas desde el navegador.

**Por qué.** Una ruta `GET` no puede cargar imágenes (la dirección tiene un límite de longitud) y habría que pasar a `POST` con varios megabytes de base64. Dibujar en el servidor deja el reporte en una simple dirección, sin depender del navegador, y se puede revisar rasterizando el PDF. **Consecuencia:** los gráficos del PDF se parecen a los de la pantalla pero no son idénticos. Si más adelante se quiere la imagen exacta, se puede agregar un `POST` sin tocar el resto.

### D-06: la migración 06 se ejecuta antes del push

**Decisión.** Para esta fase el orden de despliegue es **primero el SQL y después el código**, al revés que en la Fase 7.

**Por qué.** La 06 solo agrega, así que el código anterior no la nota. En cambio el código nuevo la necesita. En el ensayo, con el código nuevo y sin la 06, el inicio de quien tiene el panel (administrador y supervisor) y los datos de *Estadísticas* respondían 500 (la pantalla abría, pero con un error), mientras el vendedor, el contador y el resto seguían bien. Con la 06 presente, el código anterior funcionó completo (546 respuestas comparadas). También se comprobó que si la migración falla a la mitad no queda nada creado.

## Qué hicimos

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

**Código:** 21 archivos, 9 modificados y 12 nuevos. No se tocaron `routes/auth.js`, `controllers/auth.js`, `models/negocio.js`, `routes/modulos.js` ni `db/functions.sql`. No se agregó ninguna dependencia.

## Decisiones técnicas

| Decisión | Por qué |
|---|---|
| **Ventas totales con impuesto, margen sin impuesto.** | Las ventas totales coinciden con Facturas y con el panel. El margen se calcula con el precio sin impuesto y el `costo_unitario` que cada venta guardó. |
| **El período se mide por el día local del negocio.** | Una venta de las 23:59 pertenece a su día aunque en UTC ya sea el siguiente. Se probó con ventas a las 23:59:59 y a las 00:00:00. |
| **El ranking de vendedores ignora el filtro de vendedor.** | Muestra a todo el equipo para que el porcentaje del total tenga sentido. Es la tabla que justifica la decisión D-01. |
| **El margen avisa cuánto de lo vendido tiene costo.** | Una venta sin costo registrado sale con margen del 100 % y engaña. Si la cobertura es menor al 100 %, la tarjeta y los insights lo dicen. |
| **Alertas del CAI en dos niveles.** | El pedido decía 5 números o 7 días y el panel anterior avisaba hasta 30 días. Se conservaron ambos: *urgente* con 5 números o 7 días, y *aviso* hasta 30 días. |
| **"Último acceso" es el inicio de la sesión actual.** | El inicio de sesión lo registra al entrar. En *Mi perfil* se agrega el *acceso anterior*, tomado de la auditoría. |
| **El menú del encabezado se cierra con un velo y no con `@click.outside`.** | Funciona igual en el celular y se puede probar sin un navegador real. |
| **Íconos propios, sin librería.** | Un solo archivo (`public/js/iconos.js`) sirve al servidor (EJS) y al navegador (Alpine). |
| **Chart.js desde el mismo CDN y versión que Finanzas (4.4.7).** | El panel anterior no usaba Chart.js (era un recuadro vacío), así que se reutilizó el cargador de Finanzas. |
| **Filtro de vendedores: usuarios activos con `pos.crear`.** | Es lo pedido. Un vendedor ya desactivado no aparece en el filtro, pero sí en el ranking. |

## Resultados de las pruebas

Las pruebas se corrieron contra un Postgres 16 local. Las baterías nuevas de esta semana suman **272 comprobaciones, todas correctas**.

| Batería | Qué comprueba | Resultado |
|---|---|---|
| Estadísticas en la base de datos | Las funciones SQL contra un modelo independiente, con 482 ventas generadas (varios vendedores, categorías, créditos, costos en cero y ventas pegadas a la medianoche). Además, que la migración no cambia tablas ni funciones existentes, agrega solo un índice y se puede repetir | **78 de 78** |
| Estadísticas por HTTP | Permisos por rol, períodos contra lo que calcula Postgres, filtros, validaciones, la estructura del JSON, cada insight con cifras calculadas a mano y el PDF leído con `pdftotext` | **59 de 59** |
| Panel, perfil y menú por HTTP | Qué ve cada rol, los umbrales exactos de las alertas, la matriz del perfil contra `roles_permisos`, la regla de que *Mi actividad* solo muestra filas propias y el menú y el sidebar | **75 de 75** |
| Interfaz de Estadísticas, panel y menú | Filtros, popover de fechas, estados vacío y de error, respuestas atrasadas, los seis gráficos y el menú, simulados con un navegador (jsdom y Alpine) y con Chart.js simulado para ver qué se le pide dibujar | **60 de 60** |

**Regresión de lo que ya existía.** Las baterías de las Fases 2 a 4 no estaban dentro del repositorio y el entorno donde corrían se perdió a mitad de la semana, así que no se volvieron a ejecutar. En su lugar se hizo una **comparación diferencial**: un mismo guion (ventas fiscal, a crédito e interna, cotización, facturas y PDF, marcar pagada, contabilidad, ingresos, gastos, abonos, reportes, usuarios, cambio forzado de contraseña y bloqueo por intentos, con los cuatro roles y las pantallas antes y después de operar) se ejecutó contra el código anterior y contra el nuevo.

| Comparación | Resultado |
|---|---|
| Respuestas comparadas (estado y contenido de cada pantalla, JSON y PDF) | **546** |
| Idénticas | **538** |
| Distintas | **8**, todas `GET /` del administrador y del supervisor, que es el panel que se rediseñó a propósito |
| Huella de la base de datos tras el guion (ventas, detalle, stock, asientos, ingresos, gastos, abonos, usuarios, auditoría y saldos) | **Idéntica** |

Casos que sirven para la demostración:

| Prueba | Resultado obtenido |
|---|---|
| El vendedor escribe `/estadisticas` en la barra de direcciones | **403**, y queda en la auditoría. Lo mismo con el contador. |
| Hoy L 334.00 contra ayer L 230.00 | **▲ 45.2 %** en el panel de inicio. Con otros datos, "Ventas ↑ 15.2 %" en Estadísticas (265 contra 230, calculado a mano). |
| Una venta a las 23:59:59 y otra a las 00:00:00 | Cada una cuenta en su día local, aunque en UTC caigan en fechas distintas. |
| El CAI con 6 números restantes, con 5, con 7 días, con 8 días | Sin alerta, *urgente*, *urgente* y *aviso*, en ese orden. |
| `/perfil/actividad?usuario=1` con la sesión de un vendedor | Devuelve la actividad del propio vendedor. No se puede pedir la de otra persona. |
| Ejecutar la migración 06 con un error forzado antes del `COMMIT` | No queda ninguna función ni índice creado. |

## Problemas encontrados y cómo se resolvieron

- **El panel anterior no usaba Chart.js.** El pedido pedía reutilizar su cargador, pero el panel solo tenía un recuadro vacío. El único Chart.js del proyecto estaba en Finanzas, y de ahí se tomó el cargador y la versión.
- **Íconos que no cargaban en Estadísticas.** La prueba de interfaz detectó el error `Iconos is not defined`: la pantalla usaba `Iconos.icono(...)` en el navegador pero no cargaba `iconos.js`. Se agregó el script.
- **Cinco defectos de maquetación del PDF que solo se vieron al mirarlo.** Al rasterizar el reporte aparecieron: la tarjeta de margen se desbordaba y pisaba su texto, todas las tarjetas decían "Sin dato para comparar" cuando el período es *Todo*, el título de una sección quedaba solo al pie de una hoja, la leyenda de categorías se salía de su bloque y "Sin vendedor" aparecía como "(inactivo)". Se corrigieron y se volvió a revisar el PDF.
- **Una etiqueta del panel rompía el HTML.** La etiqueta dinámica (`<a>` o `<article>`) se emitía con `<%=`, que escapa las comillas. Se cambió a `<%-`.
- **Ventas de prueba que no cuadraban.** El generador redondeaba el subtotal de cada línea pero no el de la venta, algo que `crear_venta` no permite. Se corrigió y las funciones SQL pasaron.
- **Se perdió el entorno de pruebas.** A mitad de la semana el entorno se reinició y se perdieron el código en curso, las pruebas y la base. Todo se reconstruyó desde cero a partir de lo ya escrito, se volvieron a correr las baterías y se respaldó el trabajo fuera del entorno. De ahí también la regresión diferencial.
- **Sin la 06, el panel del administrador da error.** Lo detectó el ensayo de despliegue y de ahí sale la decisión D-06.

## Qué aprendimos

- **Mirar el resultado encuentra lo que las pruebas de texto no ven.** Las pruebas leían el PDF con `pdftotext` y pasaban, pero cinco defectos de maquetación solo aparecieron al rasterizarlo.
- **Una prueba de interfaz puede encontrar un script que falta.** Ninguna otra batería habría visto que `iconos.js` no se cargaba en el navegador.
- **Ensayar el despliegue cambia el orden.** La regla de la Fase 7 (primero el código) habría dejado sin panel al administrador durante unos minutos. El ensayo mostró que aquí conviene lo contrario.
- **Comparar contra el código anterior vale cuando no queda la batería vieja.** Un guion corrido contra las dos versiones prueba que lo existente sigue igual sin depender de pruebas que ya no están.
- **Hay que respaldar fuera del entorno de trabajo.** Lo que no está en el repositorio o en la carpeta de entregas puede perderse.

## Lo que falta y deuda declarada

- **No hay protección CSRF** (la cookie es `HttpOnly` y `SameSite=Lax`, pero falta el token en cada formulario).
- **El bloqueo es por cuenta, no por IP.** Falta un límite por IP.
- **Falta verificar en el despliegue real** de Vercel y Supabase. Todo se probó en local con un Supabase simulado y la interfaz solo con jsdom, no con un navegador real. La migración 06 todavía no se ha ejecutado en el Supabase real.
- **`db/functions.sql` del repositorio está desactualizado.** Es la versión de la Fase 4: no trae las 15 funciones de seguridad de la Fase 7 y su título dice "01 a 04". Esas funciones sí están en Supabase porque se ejecutó el archivo entregado en la semana 4, pero una base nueva creada desde el repositorio fallaría. Hay que reemplazarlo por el `functions.sql` de la Fase 7.
- **Estadísticas no distingue "solo mis ventas".** Quien tiene `estadisticas.ver` ve las cifras de todo el equipo.
- **Los gráficos del PDF se dibujan en el servidor** y no son idénticos a los de la pantalla (ver D-05).
- **Los días restantes del CAI** se calculan con `CURRENT_DATE` del servidor de la base (UTC) y no con el día local del negocio, así que durante unas horas al día pueden diferir en uno.
- **Las pruebas siguen fuera del repositorio.** Pasarlas al repositorio está previsto para la semana 9.
- **Fase 8:** los avisos automáticos y el asistente con IA son ideas por validar con las pymes antes de construirse.
- **Tabla `codigos_temporales`:** quedó de la Fase 1 sin uso y puede eliminarse en una migración futura.

## Evidencia

- Estadísticas, panel de inicio y menú de perfil: descritos en `docs/referencia-tecnica.md` (secciones *Panel de inicio*, *Estadísticas (Fase 6)* y *Perfil y menú de usuario*) y reproducibles a mano entrando como administrador. Release semana-5.
- Reporte en PDF: `/estadisticas/reporte.pdf` (se descarga con el botón *Exportar PDF*) y su exportación queda en *Configuración → Auditoría*.
- Pruebas: 272 comprobaciones nuevas y la comparación diferencial de 546 respuestas, resumidas arriba.
