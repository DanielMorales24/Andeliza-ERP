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
| 3 | POS y facturación | Pendiente |
| 4 | Inventario visual, variantes | Pendiente |
| 5 | Finanzas | Pendiente |
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
   Si la base ya tenía el esquema de la Fase 1 y no quieres borrarla: correr `sql/migracion_fase2.sql`
   y después `sql/functions_es.sql` completo (se puede volver a correr sin problema).
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
services/storageService.js  Subida y borrado de imágenes en Supabase Storage (solo servidor)
public/js/             ui.js (utilidades), entidades.js, inventario.js, producto-form.js (Alpine)
routes/modulos.js      Páginas "próximamente" de los módulos que aún no existen
views/                 EJS: layouts, partials y una carpeta por módulo
sql/                   schema_es, functions_es, migracion_fase2, seed_deportes y seed_ferreteria_ejemplo
```

## Facturación: modo SAR o modo interno

`crear_venta` decide solo el tipo de número:

- **Hay una `configuracion_fiscal` activa**: usa el CAI (`CAI-00000001`) y la venta queda con `tipo_documento = 'fiscal'`.
  Si esa configuración está vencida o sin números, **bloquea** con un mensaje claro (no cae a interno por error).
- **No hay ninguna activa**: usa numeración propia (`INT-000001`, `INT-000002`...) con `tipo_documento = 'interno'`,
  sin bloquear la venta. El prefijo y el contador viven en `configuracion_negocio`.

Para un cliente sin SAR basta con no cargar la configuración fiscal (o dejarla inactiva:
`UPDATE configuracion_fiscal SET activo = FALSE;`). El dashboard muestra en qué modo está.

## Imágenes de productos

Se guardan en Supabase Storage, en un bucket público llamado `productos` (se crea solo la primera vez que se
sube una imagen). La subida pasa por el servidor con `SUPABASE_KEY`: la llave nunca llega al navegador.
El navegador reduce la foto a 1200 px (JPG) antes de enviarla, porque Vercel limita el cuerpo de una petición
a unos 4.5 MB y el servidor rechaza imágenes de más de 4 MB.

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

## Pendiente antes de producción real

Las contraseñas están en texto plano y no hay CSRF, límite de intentos de login ni RLS. Es una
decisión del proyecto para la primera versión. El bloque de RLS opcional está al final de `schema_es.sql`.
