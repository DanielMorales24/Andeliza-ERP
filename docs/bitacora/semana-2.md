# Bitácora de la semana 2: planeación y datos maestros

**Periodo:** 19 de octubre al 25 de octubre de 2026  ·  **Horas dedicadas:** 18 horas

**Meta de la semana:** planear el trabajo y poder cargar el catálogo desde la nube.

## Qué hicimos

**Planeación**

- Armamos el mapa de historias con siete actividades, dos roles y tres cortes (`docs/mapa-historias.md`).
- Redactamos el plan de diez semanas con la definición del piso de app completa y la metodología de trabajo (`docs/plan.md`).
- Escribimos treinta y una historias con criterios de aceptación en formato Dado, Cuando, Entonces para copiarlas a GitHub Issues (`github-issues/issues_mvp.md`).

**Construcción (Fase 2)**

- Categorías con ventana modal.
- Clientes y proveedores con vista de lista y de tarjetas, búsqueda en vivo y RTN opcional.
- Inventario: productos con imagen guardada en Supabase Storage, variantes por talla y edición con stock propio, kits con componentes y unidades leídas de `client.config.js`.
- Facturación interna: si no hay un CAI activo, la venta no se bloquea y recibe un número interno secuencial (INT-000001). Con CAI activo usa la numeración del SAR. Esto se aplicó con la migración `02_migracion_fase2.sql`.
- Primer despliegue en Vercel, con subida de imágenes y conexión a la base funcionando en la nube.
- Probamos la lógica con baterías automáticas de la API y de la interfaz.

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Variantes con stock propio en una tabla aparte | Crear un producto por cada talla | El cliente 1 vende camisetas por talla (S a XXXL) y por edición (Local, Visitante, Tercera, Retro). Un solo producto con variantes mantiene el catálogo limpio y el stock exacto. |
| Imágenes en Supabase Storage | Guardarlas en el disco del servidor | Vercel no permite escribir archivos de forma permanente. |
| RTN opcional | RTN obligatorio | No todas las pymes están inscritas en el SAR. |
| Con CAI vencido o agotado, la facturación se bloquea. Sin CAI, se usa el modo interno | Caer siempre al modo interno | Si hay un CAI vigente y se emitiera un comprobante interno por error, se perdería el control fiscal. Bloquear obliga a corregir. |
| Desactivar en lugar de borrar | Borrar registros | Se conserva el historial de ventas y compras. |
| Migraciones que se pueden repetir (`IF NOT EXISTS`) | Migraciones de una sola ejecución | Una base a medio actualizar no queda rota si se corre de nuevo. |
| Unidades de medida en `client.config.js` | Unidades fijas | Una ferretería vende por metro o kilo y una tienda deportiva por par o paquete. |

## Retos y cómo se resolvieron

- **Llevar las vistas y los archivos públicos a producción.** EJS lee las plantillas del disco y Vercel solo empaqueta lo que detecta. Declaramos `includeFiles` en `vercel.json` para las vistas, la carpeta pública y `client.config.js`.
- **Probar sin subir archivos reales.** Para las pruebas de imágenes usamos un servidor falso que imita a Supabase Storage.
- **Stock con variantes.** Un producto con variantes tiene su propio stock en cero y el real vive en cada variante. Lo reflejamos en las validaciones y en las alertas.

## Qué aprendimos

Escribir las historias con criterios de aceptación antes de seguir programando aclaró casos que no habíamos pensado, como qué pasa con un producto agotado en el carrito o con un cliente sin RTN. También vimos que una decisión que parece de interfaz, como permitir un cliente sin datos, termina siendo una regla de datos que hay que cuidar en la base. Y desplegar temprano nos ahorró sorpresas: lo que funciona en la computadora no siempre funciona igual en la nube.

## Para la semana 3

Ordenar el modelo de datos y las migraciones, y construir el punto de venta con la facturación.