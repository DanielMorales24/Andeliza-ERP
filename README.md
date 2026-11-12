# Andeliza ERP

Sistema de gestión administrativo para pymes hondureñas. Ventas, inventario, clientes, proveedores, finanzas y facturación con CAI del SAR o facturación interna para negocios que todavía no están registrados. Todo desde el navegador.

**URL de la aplicación:** https://andeliza-erp.vercel.app/

**Token de acceso:** `LEARN-CAP-0F81B0C6`

---

## El problema

Muchas pymes hondureñas llevan sus ventas, su inventario, sus deudas y sus facturas en cuadernos, hojas sueltas o herramientas que no se hablan entre sí. El resultado es conocido, no saben con certeza cuánto ganaron en el mes, cuánto les deben ni cuánto deben ellos, el stock del sistema no coincide con el de la bodega y emitir una factura con CAI exige cuidar el rango autorizado y la fecha límite a mano.

Tener un sistema formal suele pedir comprar equipos, montar una red o un servidor, instalar programas y contar con alguien que dé soporte técnico. Para un negocio pequeño esa barrera es más grande que el problema.

## Segmento objetivo

Pymes hondureñas de comercio y servicios con uno a diez usuarios, con o sin inscripción en el SAR. Por ejemplo tiendas deportivas, ferreterías, papelerías, abarroterías y floristerías. El primer cliente es una tienda de ropa deportiva y camisetas de fútbol.

## Propuesta de valor

Una pyme hondureña puede tener un sistema contable y de ventas profesional sin comprar infraestructura de red ni servidores físicos. Todo el procesamiento y los datos viven en la nube y el usuario solo entra a la URL y empieza a trabajar.

- **Cero instalación y cero servidores.** Se abre en el navegador de cualquier computadora, tableta o celular.
- **Acceso inmediato.** No hay programas que instalar ni actualizar: cada mejora llega a todos los usuarios al mismo tiempo.
- **Doble modo de facturación.** Con un CAI configurado, cada factura usa el siguiente número del rango autorizado y el sistema se bloquea a propósito si el CAI venció o se agotó. Sin CAI, el negocio emite comprobantes internos numerados (INT-000001) para llevar un orden desde el primer día. Cuando el negocio se registra, basta con cargar el CAI (por ahora con un script SQL y, desde la Fase 7, desde la interfaz).
- **Roles y permisos granulares.** Cuatro roles de fábrica (administrador, supervisor, vendedor y contador) y los que el administrador cree, con una matriz de permisos por módulo y acción. El servidor bloquea cada ruta (403), el vendedor solo ve sus propias facturas y todo queda en una auditoría que no se puede alterar. Ver [docs/permisos.md](docs/permisos.md).
- **Estadísticas para decidir.** Una pantalla con indicadores comparados contra el período anterior, seis gráficos, insights redactados con datos reales (qué se vende, cuándo, quién y con qué margen) y un ranking de vendedores, con reporte en PDF. Ver [docs/referencia-tecnica.md](docs/referencia-tecnica.md).
- **Ventas, inventario y finanzas conectados.** Una venta descuenta el stock, genera su asiento contable y, si queda a crédito, aparece sola en cuentas por cobrar con su vencimiento.
- **Contabilidad que el usuario no tiene que hacer.** Cada venta, compra, gasto, cobro y pago genera su partida doble. El dueño ve caja y bancos, lo que le deben, lo que debe y su utilidad del mes, y descarga el estado de resultados, el flujo de caja, el balance general y la antigüedad de saldos en PDF.
- **Hecho para quien no es técnico.** Formularios guiados, validaciones con mensajes claros y una interfaz que se adapta al celular.
- **Un archivo para adaptarlo a cada negocio.** Nombre, colores, módulos activos y unidades se definen en `client.config.js`.

## Qué incluye

| Fase | Módulo | Estado |
|---|---|---|
| 1 | Base: login con roles, menú, panel de inicio | Hecha |
| 2 | Categorías, clientes, proveedores e inventario con variantes, kits e imagen | Hecha |
| 3 | Punto de venta, facturación (CAI o interna), PDF, cotizaciones e historial de facturas | Hecha |
| 4 | Finanzas: partida doble, cuentas por cobrar y por pagar, ingresos, gastos, compras, libro diario y reportes en PDF | Hecha |
| 5 | Inventario visual y alertas de stock | Absorbida por la Fase 2 (la lista de reposición pasa a la Fase 8) |
| 6 | Estadísticas de ventas: indicadores, seis gráficos, insights automáticos, ranking de vendedores y reporte en PDF. Incluye el panel de inicio rediseñado y el menú de perfil | Hecha (se construyó después de la 7 para poder medir por vendedor y por rol) |
| 6.5 | Preparación para producción: una instancia por cliente, catálogo del negocio configurable, asistente de configuración inicial, paletas de colores validadas y contraseñas con retroalimentación en vivo | Hecha |
| 7 | Configuración, usuarios y roles con permisos granulares, contraseñas con bcrypt, bloqueo por intentos y auditoría | Hecha (se construyó antes que la 6, falta CSRF) |
| 8 | Avisos automáticos por WhatsApp o correo, asistente virtual con IA y método de pago en el punto de venta | Pendiente (ideas por validar) |

El detalle de cada pantalla, endpoint y regla de negocio está en [docs/referencia-tecnica.md](docs/referencia-tecnica.md).

## Stack técnico y por qué se eligió

| Capa | Tecnología | Por qué |
|---|---|---|
| Servidor | Node.js 20 y Express 4 | Un solo lenguaje en todo el proyecto. Express corre como función serverless, así no hay servidor propio que mantener. |
| Vistas | EJS (render en servidor) | Páginas rápidas, sin paso de compilación y fáciles de mantener por otro desarrollador. |
| Interactividad | Alpine.js | Filtros en vivo, modales y carrito sin cargar un framework pesado. |
| Estilos y gráficos | Tailwind CSS y Chart.js | Diseño consistente y gráficos de finanzas sin escribir CSS ni canvas a mano. |
| Base de datos | PostgreSQL en Supabase | Transacciones, triggers y funciones: las reglas críticas (stock, numeración fiscal, partida doble) viven en la base y se cumplen siempre. Dinero en `NUMERIC`, sin errores de redondeo. |
| Archivos | Supabase Storage | Imágenes de productos y logo sin montar un servidor de archivos. |
| Acceso a datos | `pg` (node-postgres) | Control directo de las transacciones y de las funciones de la base. |
| Sesión | `cookie-session` | La sesión viaja firmada en la cookie, algo necesario en serverless, donde no hay memoria compartida entre peticiones. |
| PDF | `pdfkit` | Facturas, cotizaciones y reportes generados en memoria, sin escribir en disco. |
| Despliegue | Vercel | HTTPS público automático y despliegue con cada `git push`. |

### Arquitectura

```mermaid
flowchart LR
    U["Usuario<br/>navegador en PC, tableta o celular"] -->|HTTPS| V["Vercel<br/>Express + EJS"]
    V -->|"SQL y funciones"| P[("Supabase<br/>PostgreSQL")]
    V -->|imágenes| S[("Supabase<br/>Storage")]
    P --- R["Reglas en la base:<br/>stock, numeración fiscal,<br/>partida doble"]
```

## Instalación

Necesitas Node.js 20, Git y una cuenta gratuita de Supabase. Para publicarlo, una cuenta de Vercel.

**Una instancia por cliente.** El mismo repositorio se despliega una vez por negocio: cada cliente tiene su propio proyecto de Vercel y su propia base de Supabase (decisión D-07). Hoy hay dos: `andeliza-dev.vercel.app`, para desarrollo y pruebas, y `andeliza-jcl-sport.vercel.app`, la producción de JCL Sport. Lo que cambia entre ellas son las variables de entorno, el contenido de `configuracion_negocio` y el seed con que se instaló. Los pasos de abajo sirven para los dos caminos; la diferencia está en el paso 2.

1. **Clonar e instalar**

   ```bash
   git clone https://github.com/DanielMorales24/Andeliza-ERP.git
   cd Andeliza-ERP
   npm install
   ```

2. **Crear la base de datos.** En un proyecto nuevo de Supabase abre *SQL Editor* y ejecuta en este orden:

   1. `db/migrations/01_schema_inicial.sql` a `db/migrations/08_migracion_fase6.5_categorias.sql` (ocho archivos, en orden)
   2. `db/functions.sql`
   3. Un solo seed, según el camino:
      - **Desarrollo local:** `db/seed.sql`, con datos de prueba completos (productos, clientes, proveedores, ventas y contabilidad).
      - **Instalación de un cliente:** `db/seed-produccion_*.sql`, con lo mínimo para que su administrador entre y configure el negocio con el asistente. En `db/` hay tres para elegir:
        - `db/seed-produccion.sql`: plantilla estándar (cualquier rubro).
        - `db/seed-produccion_<cliente>.sql`: ejemplos reales de negocios.

   Más detalles en [db/README.md](db/README.md).

3. **Variables de entorno.** Copia `.env.example` a `.env` y complétalo:

   | Variable | Qué poner |
   |---|---|
   | `DATABASE_URL` | Cadena del *Transaction pooler* de Supabase (puerto 6543). |
   | `SESSION_SECRET` | Un texto largo y aleatorio. Firma la cookie de sesión. |
   | `SUPABASE_URL` | URL del proyecto, para subir imágenes. |
   | `SUPABASE_KEY` | Clave secreta de Supabase. Solo en el servidor, nunca en el navegador ni en el repositorio. |

4. **Ejecutar**

   ```bash
   npm run dev
   ```

   Abre http://localhost:3000. Con el seed puedes entrar con `admin` / `admin123` (administrador), `vendedor` / `vendedor123`, `contador` / `contador123` o `supervisor` / `supervisor123`. Son usuarios de prueba: cámbialos antes de usar datos reales. Qué puede hacer cada rol está en [docs/permisos.md](docs/permisos.md).

5. **Iniciar la contabilidad.** Entra a *Finanzas > Resumen* y pulsa *Iniciar contabilidad hoy*. Después usa *Saldo inicial* para cargar con cuánto dinero arrancan Caja y Bancos. Si cargaste `db/seed.sql`, la contabilidad ya viene iniciada.

6. **Publicar en Vercel.** Importa el repositorio, agrega las cuatro variables de entorno y despliega. `vercel.json` ya incluye las vistas, los archivos públicos y `pdfkit` en el paquete. Comprueba con `/salud` (base de datos) y `/salud?pdf=1` (generación de PDF).

**Actualizar una base que ya está en la Fase 4.** La Fase 7 cambia las contraseñas a bcrypt y quita `usuarios.rol`, así que el orden importa: primero se hace `git push` y, cuando Vercel marque el despliegue como listo, se ejecutan, en este orden, `db/migrations/05_migracion_fase7.sql` y `db/functions.sql`. Los pasos, la verificación y qué hacer si algo falla están en [db/README.md](db/README.md).

### Instalar la instancia de un cliente nuevo

1. **Crea un proyecto nuevo de Supabase** para el cliente y ejecuta la cadena del paso 2 con `db/seed-produccion.sql`. El seed comprueba que la migración 07 y `functions.sql` ya estén, y no hace nada si la base ya tiene usuarios.
2. **Crea un proyecto nuevo de Vercel** conectado a este mismo repositorio, con sus cuatro variables de entorno (la `DATABASE_URL` de la base nueva y un `SESSION_SECRET` propio).
3. **La contraseña temporal.** `db/seed-produccion.sql` trae el marcador `CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR`: reemplázalo en una copia local por una contraseña temporal antes de ejecutarlo (sin reemplazarlo, el seed se detiene). **Antes de compartir la dirección**, entra con `soporte` y con `admin` y cambia las dos. El sistema obliga a hacerlo.
4. **El administrador del cliente** ve al entrar el asistente de configuración inicial: datos del negocio, logo, paleta de colores y, si quiere, unidades de venta y su primer vendedor. `soporte` no lo ve.

El detalle está en [db/README.md](db/README.md#instalación-de-una-instancia-nueva-producción).

## Estructura del repositorio

```text
andeliza-erp/
├── README.md                  Este archivo
├── docs/
│   ├── vision.md              Visión, Lean Canvas, hipótesis y alcance
│   ├── mapa-historias.md      Mapa de historias y cortes
│   ├── plan.md                Plan de 10 semanas y metodología
│   ├── modelo-datos.md        ERD y diccionario de datos
│   ├── referencia-tecnica.md  Pantallas, endpoints y reglas de negocio
│   └── bitacora/              Una bitácora por semana
├── db/
│   ├── migrations/            01 a 08: de la Fase 1 a la Fase 6.5 (la 05 es la Fase 7)
│   ├── functions.sql          Funciones y triggers (se puede repetir)
│   ├── seed.sql               Datos de prueba (desarrollo)
│   ├── seed-produccion.sql    Datos mínimos de una instancia nueva (producción)
│   └── README.md              Orden de ejecución
├── github-issues/
│   └── issues_mvp.md          Historias con criterios de aceptación
├── api/index.js               Entrada serverless de Vercel
├── app.js                     Aplicación Express
├── client.config.js           Catálogo maestro: todas las opciones que existen
├── controllers/  models/  routes/  services/  middlewares/  utils/
├── views/                     Plantillas EJS (una carpeta por módulo, incluidas estadisticas/ y perfil/)
├── public/                    CSS y JavaScript del navegador
└── vercel.json
```

Pantallas principales: `/` (panel de inicio), `/pos`, `/facturas`, `/inventario`, `/finanzas`, **`/estadisticas`**, `/configuracion` y, para cualquier persona con sesión, **`/perfil`** y **`/perfil/actividad`**.

## Documentación

- [Visión del proyecto](docs/vision.md)
- [Mapa de historias](docs/mapa-historias.md)
- [Plan de trabajo y metodología](docs/plan.md)
- [Modelo de datos](docs/modelo-datos.md)
- [Permisos y roles](docs/permisos.md)
- [Historias para GitHub Issues](github-issues/issues_mvp.md)
- [Bitácoras semanales](docs/bitacora/)

## Seguridad y límites conocidos

Andeliza ERP está en desarrollo y hay decisiones tomadas a propósito para avanzar con foco. Conviene tenerlas presentes antes de usarlo con datos reales.

- **Sin protección CSRF.** La cookie de sesión es `HttpOnly` y `SameSite=Lax`, pero falta un token en cada formulario. Está pendiente.
- **El bloqueo por intentos fallidos es por cuenta, no por IP.** Un atacante que pruebe muchos usuarios distintos no se frena con eso. Las contraseñas ya se guardan con bcrypt, las cuentas se bloquean 15 minutos tras 5 intentos fallidos y todo acceso denegado queda en la auditoría (detalle en [docs/permisos.md](docs/permisos.md)).
- **Sin RLS en Supabase.** Solo el servidor habla con la base, con credenciales en variables de entorno. La clave secreta nunca debe llegar al navegador.
- **Tailwind se carga por CDN.** Es una decisión pragmática. Compilar el CSS para producción queda pendiente.
- **Una instancia por cliente.** No hay tenencia compartida: cada negocio tiene su propia base y su propio despliegue, con el mismo código (decisión D-07).
- **Contraseña temporal del seed de producción.** El repositorio solo trae un marcador; la contraseña se pone en una copia local al instalar y el sistema obliga a cambiarla. Hay que hacerlo antes de dar a conocer la dirección de la instancia.
- **Facturación fiscal.** El sistema controla la numeración, el rango y la fecha límite del CAI e imprime los datos requeridos, pero no está certificado ni envía facturas al SAR. El formato debe validarse con un contador.
- **Sin pruebas automatizadas dentro del repositorio.** Las baterías de prueba se corrieron durante el desarrollo y todavía no forman parte del repo.
- **Pendientes de producto.** Métodos de pago, devoluciones y notas de crédito, y crédito fiscal sobre las compras.

## Autor

Daniel Morales. Proyecto de graduación de la carrera de Ingeniería en Informática, CEUTEC Honduras.