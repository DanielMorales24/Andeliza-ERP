# Arquitectura de Andeliza ERP

Este documento describe cómo está construido Andeliza ERP a la semana 6: con quién se relaciona (contexto), en qué piezas se despliega (contenedores), cómo se reparten las responsabilidades entre sus tres capas y por qué el código está organizado en estas carpetas. Las decisiones que dan forma a todo esto están registradas como ADR en [`docs/decisiones/`](decisiones/).

| Documento | Para qué sirve |
|---|---|
| Este documento | La forma del sistema: piezas, capas y carpetas |
| [`docs/decisiones/`](decisiones/) | Por qué se eligió cada pieza importante (ADR) |
| [`docs/modelo-datos.md`](modelo-datos.md) | Tablas, funciones y reglas de la base |
| [`docs/permisos.md`](permisos.md) | Roles, permisos y qué pide cada ruta |
| [`docs/referencia-tecnica.md`](referencia-tecnica.md) | Detalle de cada módulo, endpoints y límites conocidos |
| [`db/README.md`](../db/README.md) | Instalar una base y actualizarla migración por migración |

## 1. Vista de contexto

Andeliza es un sistema de gestión (ventas, inventario, facturación y contabilidad por partida doble) para pequeñas empresas de Honduras. Cada negocio usa **su propia instancia**: hoy JCL Sport (tienda deportiva, comprobante interno) y Las Flores (floristería, factura con CAI del SAR), además de la instancia de desarrollo.

```mermaid
flowchart LR
    admin(["Administrador del negocio<br/>configura, anula facturas,<br/>gestiona usuarios"])
    vendedor(["Vendedor<br/>cobra en el punto de venta"])
    contador(["Contador<br/>revisa el libro diario<br/>y los reportes"])
    supervisor(["Supervisor<br/>inventario, finanzas<br/>y anulaciones"])
    dev(["Desarrollador y soporte<br/>instala instancias,<br/>corre migraciones"])

    andeliza["<b>Andeliza ERP</b><br/>instancia del negocio<br/>(aplicación web)"]

    sar["SAR<br/>autoriza el CAI y el rango<br/>de facturas (fuera del sistema)"]
    cdn["CDN públicos<br/>Tailwind, Alpine.js,<br/>Chart.js, Google Fonts"]
    github["GitHub<br/>repositorio único"]

    admin -->|navegador, HTTPS| andeliza
    vendedor -->|navegador, HTTPS| andeliza
    contador -->|navegador, HTTPS| andeliza
    supervisor -->|navegador, HTTPS| andeliza
    dev -->|git push| github
    dev -.->|migraciones en el<br/>SQL Editor de Supabase| andeliza
    github -->|despliegue automático| andeliza
    sar -.->|el administrador copia el CAI<br/>en Configuración| admin
    andeliza -.->|las páginas cargan estilos<br/>y scripts| cdn
```

**Qué queda fuera del sistema.** No hay integración automática con el SAR: el CAI, su rango y su fecha límite los registra el administrador a mano y el sistema los hace cumplir (bloquea la factura si el CAI venció o se agotó). Tampoco hay pasarela de pago: el método de pago (efectivo, tarjeta, transferencia) se **registra**, no se procesa; el cobro con tarjeta ocurre en el datáfono del banco.

## 2. Vista de contenedores

Una instancia son cuatro contenedores. Todas las instancias corren **el mismo código** del mismo repositorio; lo que cambia entre ellas son las variables de entorno de Vercel y los datos de su base ([ADR 002](decisiones/002-una-instancia-por-cliente.md)).

```mermaid
flowchart TB
    subgraph usuario["Equipo del negocio (computadora, tableta o celular)"]
        nav["<b>Navegador</b><br/>HTML generado con EJS<br/>Alpine.js para la interacción<br/>Tailwind (CDN) con la paleta del negocio"]
    end

    subgraph vercel["Vercel (un proyecto por cliente)"]
        app["<b>Aplicación Node.js 24 + Express</b><br/>api/index.js como función serverless<br/>rutas, permisos, validación, PDF con pdfkit<br/>sesión en cookie firmada"]
    end

    subgraph supabase["Supabase (un proyecto por cliente)"]
        pg[("<b>PostgreSQL</b><br/>26 tablas, 2 vistas<br/>funciones y triggers: venta, stock,<br/>numeración fiscal, partida doble,<br/>anulación, auditoría")]
        storage[("<b>Storage</b><br/>imágenes de productos<br/>y logo del negocio")]
    end

    repo["GitHub<br/>main = producción"]

    nav -->|"HTTPS: páginas HTML y JSON<br/>(fetch desde Alpine)"| app
    app -->|"SQL parametrizado con pg<br/>Transaction pooler, puerto 6543, SSL"| pg
    app -->|"supabase-js con la llave secreta<br/>(solo en el servidor)"| storage
    repo -->|cada git push despliega| app
```

| Contenedor | Tecnología | Responsabilidad | Lo que nunca hace |
|---|---|---|---|
| Navegador | HTML de EJS, Alpine.js, Tailwind por CDN | Mostrar, filtrar en vivo, armar el carrito, confirmar acciones | Calcular totales que se guardan, decidir permisos, hablar con la base |
| Aplicación | Node.js 24, Express 4, EJS, pdfkit, `pg`, `cookie-session` | Autenticar, autorizar cada ruta, validar entradas, llamar a la base, generar PDF | Guardar estado en memoria (cada petición puede caer en otra instancia de la función) |
| PostgreSQL | Supabase | Hacer cumplir las reglas que no pueden fallar, de forma atómica | Confiar en lo que mande el navegador (recalcula precios, valida stock y saldos) |
| Storage | Supabase | Guardar imágenes con nombre aleatorio | Exponer la llave: solo el servidor sube y borra |

**Instancias en producción.** `andeliza-dev` (desarrollo y pruebas), `andeliza-jcl-sport` y la de Las Flores. Una migración se ejecuta en cada base, primero en desarrollo y siempre antes del `git push` cuando es aditiva, como la 09 de esta semana (ver [`db/README.md`](../db/README.md)).

## 3. Las tres capas

La aplicación se organiza en tres capas con una regla simple: **cada regla vive en la capa más baja donde se puede hacer cumplir**.

```mermaid
flowchart TB
    subgraph p["1. Presentación — views/ y public/"]
        ejs["Vistas EJS<br/>layouts, partials, una carpeta por módulo"]
        alp["Alpine.js<br/>public/js/*.js, un componente por pantalla"]
        css["public/css/app.css<br/>variables de la paleta (--primario, --acento)"]
    end
    subgraph a["2. Aplicación — Express"]
        rt["routes/<br/>qué funcionalidad y qué permiso pide cada ruta"]
        mw["middlewares/<br/>sesión, permisos, negocio de la instancia, auditoría"]
        ct["controllers/<br/>leen y validan la petición, eligen la respuesta"]
        md["models/<br/>todo el SQL, siempre parametrizado"]
        sv["services/ y utils/<br/>PDF, imágenes, validación, formato, catálogo"]
    end
    subgraph d["3. Datos — Supabase"]
        fn["Funciones PL/pgSQL<br/>crear_venta, anular_venta, crear_partida,<br/>registrar_abono_cliente, autenticar_usuario…"]
        tb["Tablas, vistas, CHECK y triggers<br/>la partida cuadra, la auditoría no se borra"]
    end
    ejs --- alp
    rt --> mw --> ct --> md --> fn --> tb
    ct --> sv
    alp -->|fetch JSON| rt
```

### Capa de presentación (EJS y Alpine.js)

- El servidor arma cada página con EJS y le entrega sus datos en un bloque `<script type="application/json" id="datos-pagina">`. Alpine.js lee ese bloque y se encarga de lo interactivo: filtros en vivo, carrito, ventanas de confirmación. No hay paso de compilación ni framework de página única ([ADR 001](decisiones/001-stack-vercel-supabase.md)).
- La interfaz **solo muestra lo que el servidor además permitirá hacer**: el botón *Anular* aparece si el controlador manda `permisos.anular`, pero la ruta lo vuelve a exigir.
- Los colores no están escritos en las vistas: salen de la paleta del negocio como variables CSS y como colores de Tailwind (`bg-primario`, `text-acento`). Así la pantalla de acceso rediseñada en la semana 6 se adapta sola a cada cliente.

### Capa de aplicación (Express)

- **Rutas** (`routes/`): una por módulo. Cada ruta declara la funcionalidad que debe estar activa en la instancia y el permiso que exige, por ejemplo `POST /facturas/:id/anular` pide `facturas.anular`.
- **Middlewares** (`middlewares/`): `auth.js` carga la sesión y los permisos, `negocio.js` carga en cada petición el negocio de esta instancia (nombre, logo, paleta, catálogo activo) y `auditar.js` anota en la bitácora las acciones que salieron bien.
- **Controladores** (`controllers/`): leen la petición, validan con `utils/validar.js`, llaman al modelo y responden HTML o JSON. No tienen SQL.
- **Modelos** (`models/`): concentran todo el SQL. Las consultas son siempre parametrizadas (`$1, $2…`) y las operaciones con reglas de negocio llaman a una función de la base en lugar de escribir varias tablas desde Node.
- **Servicios y utilidades**: `services/pdfService.js` genera las facturas en memoria (Vercel no tiene disco), `storageService.js` sube imágenes, `utils/catalogo.js` resuelve el catálogo maestro contra lo que eligió el negocio.

### Capa de datos (Supabase)

- Lo que **no puede fallar** vive en funciones de PostgreSQL que corren en una sola transacción: descontar stock, reservar el número fiscal, generar la partida doble, cobrar sin pasarse del saldo y, desde la semana 6, anular una factura devolviendo el stock y creando la contrapartida exacta.
- Las restricciones protegen los datos aunque alguien llame a la base sin pasar por la aplicación: una partida que no cuadra no se confirma (trigger diferido), las partidas y la auditoría no se modifican ni se borran, una venta anulada exige fecha y motivo (`chk_ventas_anulacion`).
- **Nada se borra para corregir**: ingresos, gastos, abonos, partidas y ahora facturas se anulan con una contrapartida ([ADR 003](decisiones/003-anulacion-por-contrapartida.md)).

### Recorrido de una petición: anular una factura

El segundo flujo completo de la semana 6 atraviesa las tres capas así:

```mermaid
sequenceDiagram
    actor S as Supervisor
    participant N as Navegador (Alpine)
    participant R as routes/facturas.js
    participant C as controllers/facturas.js
    participant M as models/ventas.js
    participant F as anular_venta() en PostgreSQL

    S->>N: Toca "Anular" y escribe el motivo
    N->>N: Habilita "Sí, anular factura" con 5 caracteres o más
    N->>R: POST /facturas/42/anular { motivo }
    R->>R: requireAuth + requirePermiso('facturas', 'anular')
    R->>C: anular(req, res)
    C->>C: Valida el motivo y que la factura exista
    C->>M: Ventas.anular(42, usuario, motivo, ip)
    M->>F: SELECT anular_venta($1, $2, $3, $4)
    Note over F: Una sola transacción:<br/>bloquea la venta (FOR UPDATE)<br/>rechaza si ya está anulada o tiene abonos<br/>devuelve stock (producto, variante, kit)<br/>anular_partida → contrapartida exacta<br/>marca anulada, quién, cuándo y por qué<br/>registrar_auditoria
    F-->>M: { contabilidad: 'revertida', partida_anulacion_id }
    M-->>C: resultado
    C-->>N: 200 JSON
    N->>N: Aviso y recarga del historial (la fila sale "Anulada")
```

Si cualquier paso dentro de la función falla, no queda nada a medias: ni stock devuelto sin contrapartida ni contrapartida sin la marca de anulada.

## 4. Estructura de carpetas

```
andeliza-erp/
├── api/index.js          Punto de entrada en Vercel (exporta la app, sin listen)
├── app.js                Arma Express: sesión, vistas, estáticos, rutas y manejo de errores
├── client.config.js      Catálogo maestro: lo que EXISTE (paletas, unidades, métodos de pago…)
├── modulos.js            Módulos del menú, su permiso y la pantalla de inicio de cada rol
├── db.js                 Pool de pg, conversión de tipos y transacciones
├── routes/               Una ruta por módulo: funcionalidad + permiso de cada endpoint
├── middlewares/          Sesión y permisos, negocio de la instancia, auditoría
├── controllers/          Leen y validan la petición; responden HTML o JSON
├── models/               Todo el SQL (parametrizado) y las llamadas a funciones de la base
├── services/             PDF de facturas y reportes, imágenes en Supabase Storage
├── utils/                Validación, formato regional, catálogo, colores, totales
├── views/                EJS: layouts, partials y una carpeta por módulo
├── public/               css/app.css, js/ (un componente de Alpine por pantalla), img/
├── db/                   migrations/ 01 a 09, functions.sql, seeds y su README
├── docs/                 Visión, plan, arquitectura, ADR, modelo de datos, bitácoras
└── vercel.json           Empaqueta views/, public/, client.config.js y las fuentes de pdfkit
```

| Carpeta | Por qué existe y por qué así |
|---|---|
| `routes/`, `controllers/`, `models/` | Separan **quién puede** (ruta), **qué se pidió** (controlador) y **cómo se guarda** (modelo). Un cambio de permiso no toca SQL y un cambio de consulta no toca permisos. Hay un archivo por módulo en cada carpeta: el historial de facturas está en `routes/facturas.js` y `controllers/facturas.js`, y su SQL en `models/ventas.js`, porque una factura es una venta. |
| `middlewares/` | Lo que se repite en todas las peticiones (sesión, permisos, negocio de la instancia, auditoría) se escribe una sola vez y se declara en la ruta, donde se ve. |
| `services/` | Lo que habla con algo distinto de la base (pdfkit, Supabase Storage). Se puede cambiar el proveedor sin tocar los controladores. |
| `utils/` | Funciones puras y sin estado, fáciles de probar sin servidor ni base: validación, formato de dinero y fechas, cálculo de totales en centavos, contraste de colores. |
| `views/` y `public/js/` | Una carpeta de vistas y un archivo de Alpine por pantalla. Sin compilación: lo que está en el repositorio es lo que llega al navegador. |
| `client.config.js` | El **catálogo maestro** compartido por todas las instancias: dice qué opciones existen. Lo que cada negocio eligió vive en su base ([decisión D-08](plan.md)). Por eso el archivo no contiene ningún dato de un cliente. |
| `db/` | El esquema versionado: migraciones numeradas que solo se agregan, nunca se editan, y `functions.sql` con todas las funciones (`CREATE OR REPLACE`). Una base nueva se instala con la cadena completa; una en uso recibe solo las migraciones que le faltan. |
| `api/` y `vercel.json` | Lo único propio de Vercel. Si el despliegue cambiara de plataforma, `app.js` sigue igual. |
| `docs/` | Lo que un evaluador o un desarrollador nuevo necesita para entender el sistema sin leer el código. |

**Dónde se toca cada cosa en la semana 6.** El método de pago y la anulación no necesitaron archivos nuevos: entraron en los módulos que ya existían (`pos`, `facturas`, `ventas`, `documentos`, `finanzas`) y en la migración `db/migrations/09_migracion_semana6.sql`. Que un flujo nuevo quepa en la estructura sin forzarla es la señal de que la organización por módulos y capas funciona.

## 5. Atributos de calidad

| Atributo | Cómo lo atiende la arquitectura |
|---|---|
| Consistencia contable | La partida se genera dentro de la misma transacción que la venta, el cobro o la anulación. Un trigger diferido impide confirmar una partida que no cuadra. |
| Trazabilidad | Nada se borra para corregir; cada anulación queda ligada a su original (`reversa_de`) y la auditoría no se puede modificar. |
| Seguridad | Permisos por ruta en el servidor, contraseñas con bcrypt en la base, bloqueo por intentos, sesión en cookie firmada `HttpOnly`, SQL parametrizado y la llave de Storage solo en el servidor. |
| Aislamiento entre clientes | Una base por cliente: un error de consulta no puede mostrar datos de otro negocio ([ADR 002](decisiones/002-una-instancia-por-cliente.md)). |
| Despliegue sin interrupciones | Las migraciones aditivas se ejecutan antes del `git push` y el código anterior sigue funcionando con ellas; *Instant Rollback* de Vercel queda disponible. |
| Mantenibilidad | Capas con responsabilidades claras, un archivo por módulo, nombres en español y documentación de cada decisión. |

## 6. Límites conocidos de la arquitectura

- **Tailwind y Alpine se cargan desde un CDN.** Si el CDN no responde, la página carga sin estilos. Está planeado compilar el CSS en la semana 9 ([plan](plan.md)).
- **Sin protección CSRF con token.** La cookie `SameSite=Lax` cubre los casos comunes; el token sigue pendiente ([permisos](permisos.md)).
- **Una migración por cada base.** Con más clientes, aplicar la misma migración en cada Supabase a mano se vuelve lento y propenso a olvidos; haría falta un script que las aplique a todas.
- **La anulación es total.** No hay devoluciones parciales ni notas de crédito fiscales ([ADR 003](decisiones/003-anulacion-por-contrapartida.md)).
