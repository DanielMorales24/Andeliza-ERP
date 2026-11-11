# Plan de trabajo

Plan de diez semanas para Andeliza ERP. Incluye la definición del "piso de app completa", la meta de cada semana, la metodología de trabajo y los riesgos.

> Última actualización: 30 de octubre de 2026

## 1. El piso de app completa

El piso de app completa es el conjunto mínimo de capacidades que hace que la aplicación se pueda usar de punta a punta, y no solo ver. Todo lo que se construye después se apoya en este piso. Para Andeliza ERP se cumple cuando existen estas nueve condiciones:

| # | Condición | Cómo se cumple en Andeliza | Evidencia | Estado |
|---|---|---|---|:---:|
| 1 | Acceso con identidad y roles | Inicio de sesión con administrador y vendedor. El menú y las rutas cambian según el rol | HU-01, HU-03 | ✔ |
| 2 | Datos persistentes en la nube con esquema versionado | PostgreSQL en Supabase y scripts numerados en `db/migrations` | `db/` | ✔ |
| 3 | Un flujo principal completo de punta a punta | Catálogo, venta, factura con CAI o interna, cobro o crédito, partida contable y reporte | HU-10 a HU-23 | ✔ |
| 4 | Las reglas críticas están protegidas | Stock, numeración fiscal y partida doble se aplican en la base, dentro de transacciones | `db/functions.sql` | ✔ |
| 5 | Publicada en una URL pública con HTTPS | Despliegue en Vercel con cada `git push` | README | ✔ |
| 6 | Errores y validaciones manejados | Mensajes claros, páginas 403, 404 y 500, y validación en servidor y navegador | `utils/validar.js` | ✔ |
| 7 | Usable en computadora y en celular | Tablas en escritorio y tarjetas en móvil | Vistas EJS | ✔ |
| 8 | Se puede instalar desde cero con la documentación | README, `db/README.md` y `docs/` | Este repositorio | ✔ |
| 9 | Tiene datos de ejemplo para demostrar | `db/seed.sql` con catálogo, contabilidad y ventas | `db/seed.sql` | ✔ |

**El piso se alcanza con las Fases 1 a 4.** En el plan original esto ocurría al cierre de la semana 4, pero se adelantó al cierre de la semana 3. Sobre ese piso se construyen las funciones de las semanas 5 a 8 y, después, se pasa a validar con usuarios reales y a cerrar el proyecto.

## 2. Plan por semana

| Semana | Meta | Entregables | Historias | Estado |
|:---:|---|---|---|:---:|
| **1** | **Visión y fundamentos.** Dejar claro qué se construye, para quién y con qué tecnología. | README, `vision.md`, bitácora 1. Stack decidido. Base de datos en español (esquema, funciones y datos de ejemplo) probada en Supabase. Esqueleto de la aplicación: login, menú y panel. | HU-01, HU-02, HU-03 | ✔ |
| **2** | **Planeación y datos maestros.** Planear el trabajo y poder cargar el catálogo desde la nube. | `mapa-historias.md`, `plan.md`, `issues_mvp.md`, bitácora 2. Categorías, clientes, proveedores y productos con imagen, variantes y kits. Facturación interna. Primer despliegue en Vercel. | HU-04 a HU-09, HU-12 | ✔ |
| **3** | **Modelo de datos y punto de venta.** Ordenar el modelo y poder cobrar con factura. | `modelo-datos.md`, migraciones numeradas, `seed.sql`, bitácora 3. Punto de venta, facturación con CAI e interna, PDF, cotización e historial. | HU-10, HU-11, HU-13, HU-14, HU-15 | ✔ |
| **4** | **Finanzas y contabilidad. Se alcanza el piso de app completa.** El dueño ve su situación real. | Partida doble, cuentas por cobrar y por pagar, ingresos, gastos y compras, libro diario, panel financiero y cuatro reportes en PDF. | HU-16 a HU-25 | ✔ |
| **5** | **Inventario visual y alertas.** Saber qué reponer. | *Absorbida por la Fase 2 (decisión D-02).* El listado ya muestra la foto de cada producto, su estado de stock y filtros con conteo, y el panel muestra los artículos por reponer. La lista de reposición pasa a la Fase 8 y las pruebas de aceptación contra los criterios Gherkin, a la semana 9. **En la semana 5 se construyeron la Fase 6 (fila 6) y la Fase 6.5, preparación para producción** (decisiones D-07 a D-11): una instancia por cliente, catálogo del negocio configurable, asistente de configuración inicial, paletas de colores validadas, contraseñas con retroalimentación en vivo y categorías contables nuevas. | HU-26 · HU-33 a HU-36 (Fase 6.5) | ◐ *(resuelta en la Fase 2)* · ✔ *(Fase 6.5)* |
| **6** | **Estadísticas.** Entender qué se vende más y cuándo. | *Construida en la semana 5.* Indicadores comparados con el período anterior, seis gráficos, insights automáticos, ranking de vendedores y reporte en PDF. En la misma semana se rediseñó el panel de inicio y se agregó el menú de perfil. | HU-27 | ✔ |
| **7** | **Configuración y seguridad.** Que el negocio se administre solo y que las cuentas estén protegidas. | Fase 7: datos del negocio, CAI y usuarios desde la interfaz. Contraseñas con hash, protección CSRF y límite de intentos. Revisión del formato de factura con un contador. | HU-28, HU-29 | ◐ *(construida en la semana 4)* |
| **8** | **Avisos automáticos y asistente con IA.** Que el sistema avise solo y responda preguntas. *(Ideas por validar con las pymes.)* | Fase 8: notificaciones automáticas por WhatsApp o correo (stock bajo con su lista de reposición y facturas vencidas), asistente virtual con IA para consultar ventas e inventario con preguntas en lenguaje natural, y método de pago en el punto de venta. | HU-30, HU-31, HU-32 | ⬜ |
| **9** | **Piloto y calidad.** Probar con personas reales. | Uso real con el cliente 1 y con dos o tres pymes más. Medición de las hipótesis H1 y H2. Pruebas automatizadas dentro del repositorio. CSS de Tailwind compilado. Defectos críticos cerrados. | Todas | ⬜ |
| **10** | **Cierre y entrega.** Dejar el proyecto listo para evaluarse. | Manual de usuario, guion de demostración, presentación, documentación final, bitácoras completas y versión estable etiquetada (v1.0). | — | ⬜ |

◐ = hecha en gran parte. De la Fase 7 quedan la protección CSRF, un límite de intentos por IP y la revisión del formato de factura con un contador. Todo lo demás (datos del negocio y CAI desde la interfaz, usuarios, roles y permisos, contraseñas con bcrypt, bloqueo por intentos, recuperación y auditoría) está hecho y probado. De la Fase 5 solo queda la lista de reposición por proveedor, que se pasó a la Fase 8.

### Decisión de arquitectura D-01: la Fase 7 se construye antes que la Fase 6

**Decisión.** Se pospone el módulo de Estadísticas (Fase 6) y se construye primero el de Configuración, Usuarios y Roles con permisos granulares (Fase 7).

**Contexto.** En la semana 4 la universidad exige el entregable "Login y Roles". Además, las estadísticas que el dueño necesita ("¿cuánto vendió el vendedor A este mes?", "¿cómo le fue a cada rol?") dependen de saber **quién** hizo cada venta y **con qué rol**.

**Alternativas.** (a) Hacer Estadísticas primero con solo el administrador y el vendedor de antes y rehacer los reportes cuando existieran los roles. (b) Hacer los roles primero y que las estadísticas nazcan ya sabiendo medir por usuario y por rol.

**Consecuencias.** Se eligió (b). Las ventas ya guardan `usuario_id`, y `usuarios.rol_id` y `roles` permiten agrupar por vendedor y por rol sin migraciones nuevas. A cambio, las estadísticas llegan más tarde: ya no es un tema de "pendiente por olvido" sino un orden elegido. También se adelantó el hash de contraseñas, que era la deuda de seguridad más importante.

**Resultado (semana 5).** La decisión se comprobó: el ranking de vendedores de la Fase 6 se arma uniendo `ventas.usuario_id` con `usuarios` y `roles`, y no hizo falta ninguna migración de datos. Con el orden contrario habría que haber rehecho ese reporte.

### Decisión de arquitectura D-02: la Fase 5 no se construye como fase aparte

**Decisión.** Se da por absorbida la Fase 5 (Inventario visual y alertas) y la semana 5 queda disponible.

**Contexto.** Al revisar el código se comprobó que la Fase 2 ya entregó lo visual. El listado de inventario muestra la foto de cada producto (con sus iniciales si no tiene imagen), su estado de stock (En stock, Stock bajo o Agotado), filtros con conteo y una vista de tarjetas. Además, el panel de inicio indica cuántos artículos están por reponer.

**Alternativas.** (a) Construir una vista visual y alertas nuevas, que repetirían lo que ya existe. (b) Dar la Fase 5 por cubierta y usar ese tiempo en lo que falta.

**Consecuencias.** Se eligió (b). Dos de los tres escenarios de HU-26 quedan cubiertos desde la Fase 2. El tercero, la lista de reposición agrupada por proveedor, se une a los avisos automáticos de la Fase 8 (HU-30). Las pruebas de aceptación contra los criterios Gherkin pasan a la semana 9. La semana 5 se usó para las Estadísticas (Fase 6), que ya contaban con quién vendió y con qué rol.

### Decisión D-03: se descarta el acceso móvil por QR

**Decisión.** Se elimina del plan el acceso móvil con código QR.

**Contexto.** Andeliza es una aplicación web y se abre desde el navegador de cualquier celular con su dirección. Un QR solo ahorraría escribir esa dirección y no resuelve ningún problema del dueño del negocio.

**Consecuencias.** La Fase 8 se reemplaza por ideas de valor real: avisos automáticos (HU-30) y un asistente virtual con IA (HU-32). El método de pago en el punto de venta (HU-31) se mantiene. La tabla `codigos_temporales`, que la Fase 1 dejó para ese fin, hoy no la usa ninguna pantalla y puede eliminarse en una migración futura.


### Decisión D-07: una instancia por cliente, con el mismo código

**Decisión.** Andeliza se despliega una vez por cliente: cada negocio tiene su propio proyecto en Vercel y su propia base en Supabase, y todos usan el mismo repositorio y el mismo código. Desde la semana 5 hay dos instancias: `andeliza-dev.vercel.app` (el Supabase de siempre, solo para desarrollo y pruebas) y `andeliza-jcl-sport.vercel.app` (un Supabase nuevo, producción de JCL Sport). Lo que distingue a una instancia vive en tres lugares: las variables de entorno de su proyecto de Vercel, la fila de `configuracion_negocio` de su base y el seed con el que se instaló.

**Alternativas.** (a) Multi-tenant en una sola base: una columna `negocio_id` en cada tabla, filtros en cada consulta y RLS en Supabase. (b) Un repositorio clonado por cliente, con sus valores escritos en `client.config.js` (lo que proponía la guía anterior "Cómo crear un cliente nuevo"). (c) Una instancia por cliente con el mismo código.

**Por qué se eligió (c).** Aísla los datos de cada negocio por construcción: una consulta con un error no puede mostrar datos de otro cliente porque esos datos están en otra base. La copia de seguridad, la restauración y la baja de un cliente son por base. Con (a) habría que agregar el negocio a 26 tablas y a todas las funciones que protegen el stock, la numeración fiscal y la partida doble, que es justo donde un error es más caro. Con (b) cada clon termina divergiendo y un arreglo hay que copiarlo a mano en cada repositorio; con (c) se publica a todos con el mismo `git push`.

**Consecuencias.** Cada migración se ejecuta en cada base, primero en desarrollo. Cada cliente nuevo cuesta un proyecto de Supabase y uno de Vercel. Nada que sea propio de un negocio puede quedar escrito en el código: de ahí la decisión D-08. Técnicamente sigue siendo *single-tenant*: no hay tenencia compartida, hay varias instancias independientes.

### Decisión D-08: `client.config.js` pasa a ser el catálogo maestro

**Decisión.** `client.config.js` deja de guardar los valores de un cliente y pasa a decir **qué existe** en el sistema: unidades de venta (y cuáles se venden en fracciones), tipos de variante y sus opciones, monedas, formatos de fecha, zonas horarias, tasas de impuesto, categorías de gasto, tipos de ingreso, métodos de pago, documentos de identidad y paletas de colores. Lo que **eligió** cada negocio se guarda en su base (`configuracion_negocio`, migración 07) y se cambia desde *Configuración → Negocio* sin tocar el código. Una elección en `NULL` significa "las predeterminadas del catálogo".

**Alternativas.** (a) Dejar los valores en el archivo: obliga a un `git push` por cada cambio y choca con D-07, porque el archivo es el mismo para todos los clientes. (b) Una tabla por catálogo en la base (unidades, tallas, colores…) con pantallas de alta y baja: cada negocio podría inventar sus propias opciones. (c) Catálogo fijo en el código y la elección en columnas JSONB de la base.

**Por qué se eligió (c).** Varias opciones tienen comportamiento atado, no son solo texto: una unidad decide si el punto de venta acepta fracciones, una paleta está validada para que el texto se lea, y cada categoría de gasto corresponde a una cuenta contable. Con (b) un negocio podría crear la unidad "metros" sin que el punto de venta supiera que admite decimales. Con (c) el negocio solo enciende o apaga lo que ya funciona. Las elecciones se validan contra el catálogo al guardar (en el servidor) y la base comprueba su forma con un `CHECK`.

**Consecuencias.** Agregar una opción nueva es un cambio de código que llega a todas las instancias, a propósito. Desactivar algo nunca borra datos: un producto conserva su unidad o sus variantes aunque ya no estén activas, y se muestran marcadas como "(inactiva)". Las categorías de gasto y los tipos de ingreso tienen, además, su cuenta contable: desde la migración 08 las funciones de registro validan contra el plan de cuentas y no contra una lista fija, así que una categoría nueva solo necesita su cuenta y su entrada en el catálogo. Con eso se agregaron *servicios* (6106), *impuestos* (6107) y *comisiones* (4206).

### Decisión D-09: un asistente de configuración inicial obligatorio para el administrador del cliente

**Decisión.** Cuando el administrador del cliente entra por primera vez a una instancia nueva, después de cambiar su contraseña temporal, solo puede usar un asistente de seis pasos: bienvenida, datos del negocio, logo y paleta de colores (esenciales), unidades de venta y primer vendedor (opcionales, con "Saltar"). El asistente se detecta con **dos marcas**: `configuracion_negocio.onboarding_completado` (el negocio ya fue configurado) y `usuarios.onboarding_pendiente` (a quién le toca hacerlo). Se bloquea la navegación solo cuando la persona lo tiene pendiente **y** el negocio todavía no lo completó.

**Alternativas.** (a) Las dos marcas. (b) Solo la marca del usuario: no dice nada del negocio, no hay dónde recordar el paso en que se quedó, y crear otro administrador o restablecer una contraseña podría reabrirlo. (c) Deducirlo de los datos (por ejemplo, "si el RTN está vacío"): una instancia de desarrollo con datos incompletos quedaría bloqueada sin razón. (d) Un recorrido guiado que no bloquea: no garantiza que la primera factura salga con RTN, dirección y logo.

**Por qué se eligió (a).** Cada marca responde una pregunta distinta. El usuario `soporte` nace sin la marca y nunca lo ve. Las instalaciones que ya existían no lo ven porque ningún usuario tiene la marca (la migración la crea en `FALSE`). Restablecer una contraseña no toca ninguna de las dos, así que el asistente no reaparece. Cerrarlo lo hace la función `completar_onboarding`, que comprueba en la base que estén los datos esenciales, así que no se puede saltar con una petición armada a mano.

**Consecuencias.** Cada paso se guarda al continuar y se recuerda el paso más avanzado (`onboarding_paso`): se puede salir y retomar otro día. Solo se puede volver un paso atrás y no se pueden saltar pasos. Mientras está pendiente, las rutas de datos responden 403 con un mensaje claro y las pantallas redirigen al asistente.

### Decisión D-10: un estándar de contraseñas con retroalimentación en vivo

**Decisión.** Un solo componente de contraseña se usa en las cuatro pantallas donde se elige una: *Cambiar contraseña*, *Recuperar acceso*, *Configuración → Usuarios* y el último paso del asistente. Muestra los requisitos con ✓ o ✗ mientras se escribe, una barra de fortaleza, un botón para ver lo escrito, una confirmación que avisa si no coincide, y deja el botón de guardar deshabilitado hasta que todo esté en regla.

**Alternativas.** (a) Endurecer la política (mayúscula y símbolo obligatorios): las contraseñas actuales dejarían de cumplir al cambiarlas y el navegador pediría algo distinto de lo que exige el servidor. (b) Una librería de fortaleza como zxcvbn: es una dependencia nueva de unos 800 KB. (c) El mismo componente con exactamente las reglas del servidor.

**Por qué se eligió (c).** Los requisitos que se marcan son los mismos que valida `validar_contrasena` en la base (8 caracteres, una letra, un número, distinta del usuario, máximo 72 bytes), así que la pantalla nunca promete algo que el servidor rechace ni rechaza algo que el servidor acepte. El servidor sigue siendo quien decide: no se tocó el `CHECK` ni la función.

**Consecuencias.** La barra de fortaleza orienta pero no bloquea: una contraseña de 8 caracteres que cumple los requisitos se acepta aunque la barra diga "Débil". Si algún día se endurece la política, se cambia en la base y en `public/js/contrasena.js` a la vez.

### Decisión D-11: paletas de colores predefinidas en lugar de un selector libre

**Decisión.** El negocio elige su identidad visual entre diez paletas del catálogo (un color primario y un acento). El servidor copia los colores **desde el catálogo**: del navegador solo llega el identificador de la paleta, y la base rechaza cualquier color que no tenga la forma `#RRGGBB`. Cada paleta cumple tres reglas, comprobadas por pruebas: texto blanco sobre el primario con contraste de al menos 4.5:1 (WCAG AA), acento sobre el primario de al menos 3:1 y una distancia de color ΔE de al menos 25 entre los dos.

**Alternativas.** (a) Un selector libre sin validar: permite combinaciones ilegibles. (b) Un selector libre con validación. (c) Paletas predefinidas.

**Por qué se eligió (c).** Garantiza que el texto se lea por construcción y no por advertencia. La validación de (b) ya existe en `utils/colores.js`, pero ofrecer el selector libre queda como deuda: pide diseñar bien los mensajes y la vista previa. Al medir las paletas propuestas se encontró un problema: **ninguno de los diez acentos llega a 3:1 sobre fondo blanco** (son tonos claros pensados para ir sobre el primario). En lugar de descartarlas, el sistema deriva un "acento fuerte" (el mismo tono oscurecido hasta alcanzar 3:1) que se usa en gráficos, en el anillo de foco y en barras finas sobre blanco.

**Consecuencias.** La paleta de fábrica es Azul Deportivo (`#1E40AF` y `#F59E0B`), que son los colores que el sistema ya usaba: una instalación existente no cambia de aspecto al aplicar la migración 07. Una paleta nueva solo se puede agregar si pasa las pruebas de contraste.

### Avance frente al plan

Al momento de esta versión del plan, las Fases 1 a 4 están construidas (y desde entonces también la Fase 7, en la semana 4, la Fase 6, en la semana 5, y la preparación para producción (Fase 6.5, decisiones D-07 a D-11), también en la semana 5, con la Fase 5 absorbida por la Fase 2): el piso de app completa ya existe y se alcanzó al cierre de la semana 3. El tiempo que eso deja libre se reasigna a lo que más riesgo tiene para la calidad: la seguridad de las cuentas, las pruebas con usuarios reales y el pulido.

## 3. Metodología de trabajo

El proyecto es individual y usa un método sencillo: **Kanban con iteraciones semanales**. Cada semana tiene una meta, un conjunto pequeño de historias y un cierre con bitácora.

### Cadencia semanal

| Momento | Qué se hace |
|---|---|
| Inicio de semana | Se elige la meta y se pasan al tablero las historias que la cumplen. |
| Durante la semana | Se trabaja una historia a la vez, como máximo dos en curso. Cada fase entrega scripts SQL, el parche con los archivos nuevos y modificados y un resumen de los casos borde probados. |
| Cierre de semana | Demostración propia de lo construido, bitácora y una revisión corta: qué funcionó, qué no y qué se cambia. |

### Tablero y trabajo

- **Tablero:** GitHub Projects con las columnas Backlog, Por hacer, En curso, En revisión y Hecho.
- **Historias:** cada historia de `github-issues/issues_mvp.md` es un Issue, con las etiquetas `corte-1`, `corte-2` o `corte-3`, el rol y el tipo (`feature`, `fix`, `db`, `docs`).
- **Ramas:** `main` es lo que está en producción en Vercel. El trabajo se hace en ramas `feature/hu-XX-descripcion`, `fix/descripcion` o `docs/descripcion` y entra por Pull Request. Vercel genera una vista previa por cada rama.
- **Commits:** mensajes cortos con prefijo: `feat:`, `fix:`, `db:`, `docs:` o `chore:`.

### Definición de listo y de terminado

**Una historia está lista para empezar cuando** tiene rol, objetivo, criterios Gherkin y su corte, y se sabe qué tablas toca.

**Una historia está terminada cuando:**

1. Cumple todos sus criterios de aceptación.
2. Se probaron los casos borde: datos vacíos, montos con demasiados decimales, stock insuficiente, doble clic y acceso de un rol sin permiso.
3. Si cambia la base, hay una migración numerada y `db/functions.sql` sigue pudiendo repetirse.
4. Se ve bien en escritorio y en celular.
5. Está desplegada y el README y los documentos reflejan el cambio.

### Pruebas

Durante el desarrollo se corren baterías automáticas de la API, de la interfaz y de la base de datos, incluida una simulación de miles de operaciones aleatorias para la contabilidad. En la semana 9 esas pruebas pasan al repositorio con una ejecución automática.

### Herramientas de apoyo

Se usa un asistente de inteligencia artificial para generar y revisar código, armar pruebas y redactar documentación. Las decisiones de diseño, la revisión y la entrega son del autor.

## 4. Riesgos

| Riesgo | Probabilidad | Impacto | Qué se hace |
|---|:---:|:---:|---|
| El negocio no tiene internet estable y no puede vender (H2) | Media | Alto | Preguntarlo en las conversaciones, medir la latencia en el negocio del cliente 1 y evaluar un modo de contingencia si el dato lo justifica. |
| Falta protección CSRF y un límite de intentos por IP | Media | Medio | Las contraseñas ya van con bcrypt, hay bloqueo por cuenta y auditoría. El token CSRF y el límite por IP quedan para antes del piloto (semana 9). |
| El formato de factura no satisface al contador (H3) | Media | Alto | Revisión con un contador en la semana 7 y ajustes antes del piloto. |
| El alcance crece más rápido que el tiempo | Alta | Medio | Todo lo nuevo entra al tablero como historia con su corte. Lo que no cabe se mueve a "Fuera del alcance". |
| Dependencia de servicios gratuitos de la nube (límites de uso) | Media | Medio | Vigilar el consumo en Supabase y Vercel y presupuestar los planes de pago en la estructura de costos. |
| Una sola persona desarrolla todo | Alta | Medio | Documentar al día: bitácoras, `docs/` y scripts versionados. Cada fase se entrega con su resumen de casos borde. |
| Estilos con Tailwind por CDN en producción | Baja | Bajo | Compilar el CSS en la semana 9. |