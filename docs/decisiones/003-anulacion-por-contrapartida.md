# ADR 003: una factura se anula con una contrapartida contable, nunca se borra

- **Estado:** aceptada e implementada en la semana 6 (migración 09)
- **Fecha de la decisión:** semana 6 (16 de noviembre de 2026)
- **Relacionada con:** [ADR 001](001-stack-vercel-supabase.md), [`docs/arquitectura.md`](../arquitectura.md), [`docs/pruebas-usuarios.md`](../pruebas-usuarios.md), [`db/README.md`](../../db/README.md)

## Contexto

Hasta la semana 5 una venta no se podía deshacer. En las pruebas con usuarias reales (13 de noviembre) la tarea cronometrada tuvo que ser siempre una venta real, porque una de prueba se habría quedado para siempre en el inventario y en la contabilidad. Para la semana 6 se pidió poder **revertir una venta hecha por error**, con una condición explícita: **bajo ningún concepto borrar datos**.

Lo que ya existía condiciona la forma de hacerlo:

- **La contabilidad es por partida doble y sus partidas no se modifican ni se borran** (trigger `bloquear_cambios_partidas`). Ingresos, gastos, abonos, pagos y asientos manuales ya se anulan con `anular_partida`, que crea la contrapartida con el Debe y el Haber invertidos y la liga a la original (`reversa_de`, con un índice único para que solo se anule una vez).
- **La numeración fiscal es correlativa.** Las Flores emite facturas con CAI: un número que desaparece deja un hueco sin explicación en el rango autorizado.
- **El stock de un kit está en sus componentes** y la receta del kit puede cambiar después de la venta.
- **`ventas.estado` es el estado de pago** (`P` pendiente, `C` pagada) y de él dependen la vista de cuentas por cobrar, la apertura contable, el panel y el historial.
- La contadora de JCL Sport valida el sistema por el libro diario: todo movimiento tiene que poder rastrearse.

## Decisión

Una factura se **anula**, no se borra, con la función `anular_venta(venta, usuario, motivo, ip)`, que en **una sola transacción**:

1. Exige un **motivo** (5 caracteres o más) y bloquea la venta (`FOR UPDATE`) para que dos personas no la anulen a la vez.
2. Rechaza una factura **ya anulada** y una que tenga **abonos vigentes** (primero se anulan los abonos, igual que con ingresos y gastos).
3. **Devuelve el stock** al producto, a la variante o a cada componente del kit. Desde la migración 09 `detalle_venta.componentes` guarda lo que consumió cada kit al venderse, así que se devuelve exactamente eso aunque la receta haya cambiado.
4. **Revierte la partida** de la venta con `anular_partida`: la contrapartida es la original con el Debe y el Haber invertidos, línea por línea, y queda ligada a ella.
5. **Marca la venta** con `anulada = TRUE`, cuándo, quién y por qué. La venta, su detalle y su partida original quedan intactos.
6. **Deja la constancia en la auditoría** con el stock devuelto, las dos partidas y el motivo.

En la aplicación, solo quien tiene el permiso nuevo **`facturas.anular`** (administrador y supervisor de fábrica) ve el botón *Anular*, que abre una confirmación con lo que va a pasar. El número de la factura **no se reutiliza**.

Para marcar la anulación se usa una **columna booleana `anulada`** y no un tercer valor `A` en `estado`.

## Alternativas consideradas

| Alternativa | Por qué no se eligió |
|---|---|
| **Borrar la venta y su detalle** (y devolver el stock) | Prohibido por el pedido y por el diseño: la partida no se puede borrar, así que la contabilidad quedaría con un asiento sin documento. Se pierde el rastro de lo que pasó y la numeración fiscal queda con un hueco. |
| **Corregir la venta editando sus líneas** | Cambia en silencio un documento ya emitido y obligaría a reescribir una partida inmutable. Tampoco explica por qué cambió. |
| **Un tercer estado `A` en `ventas.estado`** | Mezcla dos preguntas distintas: si se pagó y si es válida. Se perdería si la factura anulada estaba pagada o pendiente cuando se anuló, y cada consulta que hoy filtra por `estado = 'P'` tendría que revisarse para no tratar `A` como pagada. Los ingresos y gastos ya usan un booleano `anulado`: mantener el mismo patrón hace el modelo más fácil de leer. |
| **Nota de crédito fiscal o devolución parcial** | Es lo más completo para el SAR, pero es otro documento con su propia numeración y reglas, y cambia el alcance de la semana. Queda como trabajo futuro (ver consecuencias). |

## Consecuencias

**Positivas**

- **Rastro completo.** En el libro diario se ven la venta y su contrapartida (el enlace *Ver asiento contable* de Facturas lleva directo a las dos). En el historial, la factura sigue con la insignia «Anulada», el motivo y quién la anuló. La auditoría tiene el detalle del stock devuelto.
- **La balanza sigue cuadrando** y cada cuenta afectada suma cero entre la partida original y su contrapartida. Las pruebas lo comprueban para ventas en efectivo, con tarjeta, al crédito y con kits.
- **Atomicidad.** Si algo falla dentro de la función no queda nada a medias: ni stock devuelto sin contrapartida ni contrapartida sin la marca.
- **Coherencia con el resto del sistema:** se anula como se anulan ingresos, gastos, abonos y asientos.

**Negativas y cómo se manejan**

- **Toda consulta que sume ventas debe excluir las anuladas.** Se ajustaron cuentas por cobrar (`v_cxc`), la apertura contable, las estadísticas, el panel y los totales del historial. Queda como regla del modelo en [`docs/modelo-datos.md`](../modelo-datos.md) para las consultas futuras.
- **Anular una factura con cobros toma dos pasos** (anular los abonos y después la factura). Es intencional: cada abono tiene su propia partida y su propio rastro.
- **Factura fiscal anulada.** Su número queda usado. Si ya se entregó al cliente, el contador decide si corresponde una nota de crédito ante el SAR; el sistema todavía no la emite y la ventana de confirmación lo advierte.
- **Ventas de antes de iniciar la contabilidad** no tienen partida: al anularlas vuelve el stock y la respuesta lo dice (`sin_partida`).
- **Kits vendidos antes de la migración 09** no tienen guardado su consumo: se devuelven con la receta actual y la auditoría lo marca (`kit_con_composicion_actual`).
- **La anulación es total.** Una devolución de una parte de la venta todavía no existe.
