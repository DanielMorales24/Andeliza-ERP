# Bitácora de la semana 3: modelo de datos y núcleo transaccional

**Periodo:** 26 de octubre al 1 de noviembre de 2026  ·  **Horas dedicadas:** 25 horas

**Meta de la semana:** ordenar el modelo de datos y poder cobrar una venta con factura. Además se adelantó la contabilidad, que el plan tenía para la semana siguiente.

## Qué hicimos

**Datos y documentación**

- Generamos el diagrama entidad-relación y el diccionario de datos leyendo el catálogo de una base real, para que coincidan con los scripts (`docs/modelo-datos.md`). Son 22 tablas y 2 vistas.
- Ordenamos los scripts en `db/migrations` del 01 al 04 y comprobamos que correrlos en secuencia deja una base idéntica al esquema completo vigente.
- Consolidamos `db/seed.sql` con catálogo, contabilidad y ventas de ejemplo.

**Punto de venta y facturación (Fase 3)**

- Punto de venta con el catálogo y el carrito lado a lado en escritorio, y un botón flotante con el total que abre el carrito en el celular.
- Variantes en una ventana ligera, cliente con autocompletado y alta rápida sin perder la venta.
- Cobro con factura de CAI o comprobante interno, factura y cotización en PDF, e historial de facturas con filtros.
- Carrito que se conserva 12 horas y búsqueda por SKU exacto con Enter, pensada para lector de códigos.
- Puesta en producción en Vercel.

**Finanzas y contabilidad (Fase 4, adelantada)**

- Partida doble con plan de cuentas, libro diario y líneas Debe y Haber.
- Cada venta, compra, gasto, cobro y pago genera su partida en la misma transacción.
- Cuentas por cobrar y por pagar con abonos y pagos parciales, vencimiento y antigüedad de saldos.
- Ingresos, gastos y compras con condición de pago, panel con indicadores y gráfico de seis meses, y cuatro reportes en PDF.

## Decisiones técnicas

| Decisión | Alternativas | Por qué |
|---|---|---|
| Cada cobro lleva una clave (`clave_cliente`) | Confiar en que el usuario no haga doble clic | Con mala conexión un cobro se reintenta. La clave hace que el segundo intento devuelva la misma venta, sin otro descuento de stock ni otro número de factura. |
| Totales calculados en centavos con la misma fórmula que Postgres | Calcular con decimales en JavaScript | Evita diferencias de centavos entre lo que ve el usuario y lo que guarda la base. Se comprobó con miles de carritos aleatorios. |
| PDF generado en memoria | Guardarlo en disco | Vercel no permite escribir archivos de forma permanente. |
| El impuesto se suma al precio, con opción para precios con impuesto incluido | Solo precios con impuesto incluido | Fue lo que se aprobó para la primera versión y la opción cubre a quien maneje sus precios con el impuesto incluido. |
| La partida doble vive en la base de datos | Calcular los asientos en Node | Una partida descuadrada no se puede confirmar, pase lo que pase en la aplicación. |
| El libro diario no se edita: se corrige con una contrapartida | Permitir editar o borrar asientos | Es el principio de una contabilidad confiable y deja rastro de cada corrección. |
| Costo promedio ponderado en las compras | Usar el último costo | Mantiene el inventario del libro alineado con las existencias. |
| La contabilidad arranca con un asiento de apertura | Intentar reconstruir todo el historial | El inventario y las ventas pendientes se toman como punto de partida y el dinero en Caja se carga como saldo inicial. |
| Las ventas pagadas entran a Caja | Capturar ya el método de pago | El método de pago queda para una fase posterior. |

## Retos y cómo se resolvieron

- **PDF que no funcionaba en producción.** `pdfkit` carga sus fuentes de una forma que Vercel no detecta. Agregamos `node_modules/pdfkit/**` a `includeFiles`.
- **Error al listar facturas sin fechas.** Una prueba descubrió que el rango "todo" mandaba a la base un parámetro que la consulta no usaba, y Postgres lo rechazaba. Lo corregimos.
- **Datos de ejemplo que fallaban.** Los movimientos de ejemplo tenían fechas anteriores al inicio de la contabilidad. Los separamos y ahora acomodan sus fechas.
- **Avisos por centavos.** El costo promedio redondea a dos decimales y generaba avisos de inventario desajustado por unos pocos centavos. Subimos el umbral del aviso a un lempira.

## Qué aprendimos

Las pruebas con casos extremos encontraron errores que a mano nunca habríamos visto, como el parámetro sin usar o los cobros simultáneos por la última unidad de un producto. Aprendimos también que poner la regla en la base de datos, y no en el código, hace que dos personas cobrando al mismo tiempo no puedan romper el stock ni los números de factura. En contabilidad confirmamos que vale más hacer imposible el error que detectarlo después: un asiento que no cuadra simplemente no se guarda. Y que la documentación se vuelve confiable cuando sale de la base real y no de la memoria.

## Pendiente

- Inventario visual y alertas de stock (Fase 5).
- Reforzar la seguridad: hash de contraseñas, protección CSRF y límite de intentos (Fase 7).

*(Nota: La evidencia real de las conversaciones con las pymes y la validación de las hipótesis H1, H2 y H3 ya fueron documentadas y adjuntadas en el archivo `docs/vision.md`).*