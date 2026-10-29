-- =====================================================================
-- migracion_fase2.sql  |  Habilita la facturación interna (INT-000001)
-- Para bases que YA corrieron schema_es.sql de la Fase 1. No borra datos.
-- Se puede correr más de una vez.
--
-- Orden: 1) este archivo   2) functions_es.sql completo
-- (bases nuevas: no hace falta, schema_es.sql ya trae todo esto)
-- =====================================================================

ALTER TABLE configuracion_negocio
  ADD COLUMN IF NOT EXISTS prefijo_factura_interna VARCHAR(10) NOT NULL DEFAULT 'INT';

ALTER TABLE configuracion_negocio
  ADD COLUMN IF NOT EXISTS numero_factura_interna INT NOT NULL DEFAULT 0;

-- Las ventas que ya existen tienen número con CAI, por eso el default es 'fiscal'
ALTER TABLE ventas
  ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10) NOT NULL DEFAULT 'fiscal'
  CHECK (tipo_documento IN ('fiscal', 'interno'));
