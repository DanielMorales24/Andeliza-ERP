# Base de datos

Scripts de PostgreSQL (Supabase) de Andeliza ERP. Todo está en español, en `snake_case` sin ñ ni acentos.

## Orden de ejecución

| Orden | Archivo | Qué hace | ¿Se puede repetir? |
|---|---|---|---|
| 1 | `migrations/01_schema_inicial.sql` | Esquema de la Fase 1: 17 tablas de acceso, catálogo, ventas, compras, finanzas simples y configuración | No: es la creación inicial |
| 2 | `migrations/02_migracion_fase2.sql` | Facturación interna (`tipo_documento`, prefijo y contador de comprobantes internos) | Sí |
| 3 | `migrations/03_migracion_fase3.sql` | POS: `clave_cliente` para que un cobro repetido no duplique la venta, e índices | Sí |
| 4 | `migrations/04_migracion_fase4.sql` | Contabilidad por partida doble, abonos, pagos y las vistas `v_cxc` y `v_cxp` | Sí |
| 5 | `functions.sql` | Funciones y triggers (venta, numeración, partida doble, cobros, pagos) | Sí: todo es `CREATE OR REPLACE` |
| 6 | `seed.sql` | Datos de ejemplo de una tienda deportiva, con contabilidad y ventas | Solo una vez, y solo en desarrollo |

Después de la cadena la base tiene **22 tablas y 2 vistas**.

## Base nueva

Ejecuta los seis archivos en ese orden (el último es opcional). Las migraciones 02 a 04 son seguras sobre una base nueva porque solo agregan lo que falta.

## Base que ya está en una fase anterior

Ejecuta solo las migraciones que falten y luego `functions.sql` completo. Ejemplo: una base de la Fase 3 corre `04_migracion_fase4.sql` y después `functions.sql`. **Primero el SQL y después el código**: el código nuevo necesita las tablas nuevas.

Al correr `functions.sql` en una base que ya tiene datos, la contabilidad se inicia sola con el estado de ese día: inventario y ventas pendientes contra capital. Caja y Bancos arrancan en cero y se cargan desde *Finanzas > Saldo inicial*.

## Cómo se verificó

La cadena `01 → 04 + functions.sql` se comparó contra el esquema completo vigente: columnas, restricciones, índices, funciones, triggers y vistas son idénticos. Con `seed.sql` cargado, la base cumple que cada partida cuadra, que Activo = Pasivo + Patrimonio + Resultado y que cuentas por cobrar y por pagar coinciden con el detalle de documentos pendientes.

## Carpeta `sql/` anterior

La carpeta `sql/` del repositorio contiene la versión previa de estos scripts, antes de ordenarlos en `db/`. Ya no se usa y puede eliminarse con `git rm -r sql/` cuando confirmes que todo funciona desde `db/`.
