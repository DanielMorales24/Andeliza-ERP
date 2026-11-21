# ADR 001: Vercel y Supabase como plataforma, con Node.js, Express y EJS

- **Estado:** aceptada y vigente
- **Fecha de la decisión:** semana 1 (14 al 18 de octubre de 2026). Se registra como ADR en la semana 6.
- **Relacionada con:** [ADR 002](002-una-instancia-por-cliente.md), bitácora de la [semana 1](../bitacora/semana-1.md), [`docs/arquitectura.md`](../arquitectura.md)

## Contexto

Andeliza es un sistema de gestión para pequeñas empresas de Honduras. Los dos primeros clientes, una tienda deportiva y una floristería, no tienen personal de sistemas, no quieren comprar ni mantener un servidor y usan el sistema desde la computadora del mostrador, una tableta o el celular. En la asesoría con el ingeniero asesor del proyecto se fijó que el diferenciador es justamente ese: el cliente solo entra a una dirección web, sin instalar nada y sin costo de infraestructura (ver [`docs/vision.md`](../vision.md)).

Al mismo tiempo el sistema maneja dinero e impuestos: descuenta stock, reserva números fiscales del CAI y lleva contabilidad por partida doble, que la contadora de JCL Sport exigió desde la primera entrevista. Esas operaciones tienen que ser atómicas: o se guarda todo o no se guarda nada.

Las restricciones del proyecto: un solo desarrollador, un semestre, presupuesto cercano a cero y una URL pública con HTTPS desde las primeras semanas para probar con usuarios reales.

## Decisión

1. **Vercel** aloja la aplicación como una función serverless (`api/index.js`) y la publica con cada `git push`, con HTTPS y una vista previa por rama.
2. **Supabase** da la base de datos **PostgreSQL** y el **Storage** para las imágenes. La aplicación se conecta con `pg` por el *Transaction pooler* (puerto 6543, SSL), sin ORM.
3. La aplicación es **Node.js con Express y vistas EJS** generadas en el servidor; **Alpine.js** cubre lo interactivo y **Tailwind** los estilos, ambos sin paso de compilación.
4. Las reglas que no pueden fallar (stock, numeración fiscal, partida doble, cobros, contraseñas y, desde la semana 6, anulación de facturas) viven en **funciones de PostgreSQL** que corren en una sola transacción.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| **Servidor propio (VPS) con Node y PostgreSQL** | Da control total, pero alguien tiene que actualizar el sistema operativo, renovar certificados, hacer copias de seguridad y vigilar el servidor. Es exactamente el costo que el cliente no quiere y que un desarrollador solo no puede sostener para varios clientes. |
| **Firebase u otra base de documentos (NoSQL)** | Resuelve el alojamiento, pero la partida doble, los saldos y el stock son relaciones con restricciones (Debe = Haber, un abono no supera el saldo, un número fiscal no se repite). En PostgreSQL eso se expresa con transacciones, `CHECK`, claves foráneas y triggers; en una base de documentos habría que reconstruirlo en la aplicación. |
| **Aplicación de página única (React o Next.js) con una API** | Más piezas: compilación, estado en el cliente, una API separada y su contrato. Para formularios, tablas y reportes, páginas generadas en el servidor con un poco de Alpine son más rápidas de construir y de cargar en equipos modestos. |
| **Aplicación de escritorio** | Obliga a instalar y actualizar en cada equipo, no funciona desde el celular y deja los datos en una sola computadora. Contradice la propuesta de valor. |

## Consecuencias

**Positivas**

- El cliente no administra nada: entra a una dirección con HTTPS. Una corrección llega a todos con un `git push`.
- PostgreSQL permite que las reglas contables se cumplan siempre, llame quien llame: un error en el código de la aplicación no puede dejar una partida descuadrada.
- Supabase es PostgreSQL estándar: con `pg_dump` la base se puede llevar a otro proveedor. Lo único propio de Vercel es `api/index.js` y `vercel.json`.
- Los planes gratuitos alcanzan para los primeros clientes.

**Negativas y cómo se manejan**

- **Serverless cambia reglas de fondo.** No hay disco (los PDF se generan en memoria), no hay memoria compartida entre peticiones (la sesión va en una cookie firmada con `cookie-session`) y cada petición puede abrir su conexión (se usa el *pooler* y un pool pequeño). Se aprendió en la semana 1 y se probó desde el primer despliegue.
- **Arranques en frío.** La primera petición después de un rato sin uso tarda más. Es aceptable para el volumen de una pyme.
- **Dependencia de servicios gratuitos.** Hay límites de uso; el riesgo está en el plan y en la estructura de costos de la visión.
- **Estilos y scripts desde un CDN.** Si el CDN falla, la página pierde estilos. Está planeado compilar el CSS en la semana 9.
- **Lógica repartida entre Node y PL/pgSQL.** Quien mantenga el sistema necesita leer las dos. Se mitiga con una regla clara (lo que no puede fallar va en la base) y con [`docs/modelo-datos.md`](../modelo-datos.md), que lista cada función.
