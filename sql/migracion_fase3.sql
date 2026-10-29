-- =====================================================================
-- migracion_fase3.sql  |  POS: cobros que no se duplican + índices
-- Para bases que ya corrieron la migración de la Fase 2. No borra datos.
-- Se puede correr más de una vez.
--
-- Orden: 1) este archivo   2) functions_es.sql completo
-- (bases nuevas: no hace falta, schema_es.sql ya trae todo esto)
-- =====================================================================

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS clave_cliente VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ventas_clave_cliente
  ON ventas (clave_cliente) WHERE clave_cliente IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_tipo ON ventas (tipo_documento);
