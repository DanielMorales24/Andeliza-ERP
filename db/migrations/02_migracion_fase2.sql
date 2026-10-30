-- =====================================================================
-- 02_migracion_fase2.sql  |  Habilita la facturación interna (INT-000001)
-- Para bases que YA corrieron 01_schema_inicial.sql. No borra datos.
-- Se puede correr más de una vez.
--
-- Orden: 1) este archivo   2) db/functions.sql completo
-- (en una base nueva se corre en la secuencia 01 -> 04 y luego db/functions.sql)
-- =====================================================================

ALTER TABLE configuracion_negocio
  ADD COLUMN IF NOT EXISTS prefijo_factura_interna VARCHAR(10) NOT NULL DEFAULT 'INT';

ALTER TABLE configuracion_negocio
  ADD COLUMN IF NOT EXISTS numero_factura_interna INT NOT NULL DEFAULT 0;

-- Las ventas que ya existen tienen número con CAI, por eso el default es 'fiscal'
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) NOT NULL DEFAULT 'fiscal'
  CHECK (tipo_documento IN ('fiscal', 'interno'));
