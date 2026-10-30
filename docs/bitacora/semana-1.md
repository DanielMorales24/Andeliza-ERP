# Bitácora de la semana 1: visión y fundamentos

**Periodo:** 14 de octubre al 18 de octubre de 2026  ·  **Horas dedicadas:** 12 horas

**Meta de la semana:** dejar claro qué se construye, para quién y con qué tecnología, y tener la base de datos y el esqueleto de la aplicación funcionando.

## Qué hicimos

- Definimos el planteamiento: un sistema de gestión y contabilidad para pymes hondureñas que funcione todo desde el navegador, sin instalar nada y sin servidor propio, con facturación del SAR o interna.
- Escribimos el `README.md` y `docs/vision.md` con el problema, el segmento, la propuesta de valor, el Lean Canvas y las tres hipótesis riesgosas.
- Definimos la tecnología: Node.js con Express y EJS, PostgreSQL en Supabase y Vercel.
- Empezamos por la base de datos antes que por la aplicación. Escribimos el esquema, las funciones y los datos de ejemplo, los corrimos en Supabase sin errores y probamos `crear_venta` con kits para confirmar que descuenta el stock de los componentes.
- Reescribimos toda la base de datos en español: tablas, columnas, funciones y claves JSON.
- Armamos el esqueleto de la aplicación: inicio de sesión con roles, menú lateral que cambia según el rol, panel de inicio con tarjetas de resumen y el modo de facturación vigente, y la ruta `/salud` para comprobar la conexión.
- Creamos `client.config.js`: un solo archivo donde vive lo que cambia de un negocio a otro (nombre, colores, módulos activos y valores por defecto).

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Todo en la nube con Supabase y Vercel | Servidor propio o aplicación de escritorio | La propuesta de valor es que el usuario no compre ni mantenga infraestructura. Entrar a una URL es lo único que se le pide. |
| Node, Express y EJS con Alpine.js | Una aplicación de página única con un framework | Menos piezas, sin paso de compilación y páginas rápidas. Alpine alcanza para las partes interactivas. |
| Reglas críticas en funciones de PostgreSQL | Programar esas reglas en Node | Stock, numeración fiscal y cobros se cumplen siempre y de forma atómica, sin importar quién llame. |
| Base de datos y código en español | Nombres en inglés | Se presentará a clientes hispanohablantes y facilita el soporte y el traspaso a otros desarrolladores locales. |
| `cookie-session` para la sesión | Memoria del servidor o JWT | En Vercel cada petición puede caer en una instancia distinta. La sesión firmada en la cookie no depende de memoria compartida. |
| `pg` directo con conversión de tipos | Un ORM | Control de las transacciones y de las funciones de la base. `NUMERIC` se lee como número, `BIGINT` como entero y `DATE` como texto para evitar corrimientos de zona horaria. |
| Una instancia por cliente | Multi-tenant con `negocio_id` y RLS | Mucha menos complejidad. Cada cliente tiene su propio Supabase y su propio Vercel, y se personaliza con un archivo. |
| Facturación dual: CAI del SAR o comprobante interno | Solo facturación con CAI | Muchas pymes todavía no están inscritas y necesitan igual un comprobante ordenado. |
| Pragmatismo: por ahora sin bcrypt, CSRF, RLS, pruebas en el repositorio, Docker ni multi-tenant | Endurecer todo desde el inicio | Avanzar con foco en el flujo principal. Quedó registrado como deuda y se resuelve en la Fase 7. |

## Retos y cómo se resolvieron

- **Conexión desde un entorno serverless.** Una conexión directa a PostgreSQL no es adecuada cuando cada petición puede abrir la suya. Usamos la cadena del *Transaction pooler* de Supabase, con el puerto 6543.
- **Qué día es hoy.** Para que la fecha de cada venta sea la de Honduras fijamos la zona horaria de la base en `America/Tegucigalpa` y leemos `DATE` como texto, así el controlador no la desplaza.
- **Sesión sin memoria compartida.** La sesión en memoria no sobrevive en serverless. Elegimos `cookie-session` desde el inicio.

## Qué aprendimos

Pensar primero la base de datos ahorró mucho retrabajo. Cuando las reglas de stock y de numeración viven en la base, la aplicación se vuelve más simple y más difícil de romper. También entendimos que "serverless" cambia cosas de fondo que no se ven en el escritorio, como la sesión, la conexión a la base y el disco, y que conviene probarlas desde el primer despliegue y no al final. Y dejar por escrito qué decisiones tomamos a propósito, incluida la deuda de seguridad, nos obliga a volver sobre ellas en vez de olvidarlas.

## Para la semana 2

Planear el trabajo (mapa de historias, plan e issues), construir los datos maestros y hacer el primer despliegue en Vercel.