-- =====================================================================
-- 07_migracion_fase6.5.sql  |  Preparación para producción (Fase 6.5)
--
-- Qué hace (todo en la tabla configuracion_negocio, más una columna en usuarios)
--   1. Formato regional: moneda, formato de fecha y tasa de impuesto por defecto.
--   2. Identidad visual: la paleta elegida y sus dos colores.
--   3. Elecciones del catálogo maestro: qué unidades, tipos de variante, opciones,
--      categorías de gasto y tipos de ingreso usa ESTE negocio (decisión D-08).
--   4. Asistente de configuración inicial (onboarding, decisión D-09).
--   5. La función completar_onboarding().
--
-- El catálogo maestro (todo lo que EXISTE) vive en client.config.js y es igual para
-- todas las instancias. Aquí se guarda solo lo que ELIGIÓ este negocio. Una columna
-- de elección en NULL significa "usa las predeterminadas del catálogo".
--
-- Cómo se ejecuta: ANTES del git push, igual que la 06. Solo agrega columnas con valor
-- por defecto y una función: el código anterior no lo nota. El código nuevo sí la necesita.
-- Trae BEGIN y COMMIT (se aplica completa o no se aplica) y se puede repetir.
-- Los valores por defecto reproducen lo que el sistema ya hacía (azul y ámbar, L, DD/MM/YYYY,
-- 15 %), así que una instalación existente no cambia de aspecto ni de comportamiento.
-- No toca las migraciones 01 a 06 ni ninguna función existente.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Formato regional
-- ---------------------------------------------------------------------
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS moneda        VARCHAR(5)   NOT NULL DEFAULT 'L';
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS formato_fecha VARCHAR(20)  NOT NULL DEFAULT 'DD/MM/YYYY';
-- Tasa que se aplica cuando NO hay un CAI activo (facturación interna). Con CAI manda la tasa del CAI.
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS tasa_impuesto NUMERIC(5,4) NOT NULL DEFAULT 0.15;

-- ---------------------------------------------------------------------
-- 2. Identidad visual. Los colores siempre salen de una paleta del catálogo:
--    el servidor los copia aquí al elegirla (nunca llegan escritos desde el navegador).
-- ---------------------------------------------------------------------
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS paleta_id      VARCHAR(30) NOT NULL DEFAULT 'azul-deportivo';
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS color_primario VARCHAR(7)  NOT NULL DEFAULT '#1E40AF';
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS color_acento   VARCHAR(7)  NOT NULL DEFAULT '#F59E0B';

-- ---------------------------------------------------------------------
-- 3. Elecciones del catálogo maestro (NULL = las predeterminadas del catálogo)
--    Listas planas: ["unidad","par"].  Opciones de variante: {"talla":["S","M"],"equipo":["Local"]}
-- ---------------------------------------------------------------------
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS unidades_activas          JSONB;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS tipos_variante_activos    JSONB;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS opciones_variante_activas JSONB;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS categorias_gasto_activas  JSONB;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS tipos_ingreso_activos     JSONB;

-- ---------------------------------------------------------------------
-- 4. Asistente de configuración inicial
--    onboarding_completado : el NEGOCIO ya fue configurado (hecho de la instancia)
--    onboarding_paso       : el paso más avanzado al que se llegó (1 a 6), para retomar
--    usuarios.onboarding_pendiente : a QUIÉN le toca hacerlo
--    El asistente solo se muestra si el negocio no lo ha completado Y el usuario lo tiene pendiente.
--    Por eso una instalación existente no lo ve: ningún usuario lo tiene pendiente.
-- ---------------------------------------------------------------------
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS onboarding_completado    BOOLEAN  NOT NULL DEFAULT FALSE;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS onboarding_paso          SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS onboarding_completado_en TIMESTAMPTZ;
ALTER TABLE usuarios              ADD COLUMN IF NOT EXISTS onboarding_pendiente     BOOLEAN  NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- Restricciones (se agregan una sola vez)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_colores') THEN
    ALTER TABLE configuracion_negocio ADD CONSTRAINT chk_negocio_colores
      CHECK (color_primario ~ '^#[0-9A-Fa-f]{6}$' AND color_acento ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_regional') THEN
    ALTER TABLE configuracion_negocio ADD CONSTRAINT chk_negocio_regional
      CHECK (tasa_impuesto >= 0 AND tasa_impuesto <= 1 AND btrim(moneda) <> '' AND btrim(formato_fecha) <> '');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_catalogo') THEN
    ALTER TABLE configuracion_negocio ADD CONSTRAINT chk_negocio_catalogo CHECK (
          (unidades_activas          IS NULL OR jsonb_typeof(unidades_activas)          = 'array')
      AND (tipos_variante_activos    IS NULL OR jsonb_typeof(tipos_variante_activos)    = 'array')
      AND (opciones_variante_activas IS NULL OR jsonb_typeof(opciones_variante_activas) = 'object')
      AND (categorias_gasto_activas  IS NULL OR jsonb_typeof(categorias_gasto_activas)  = 'array')
      AND (tipos_ingreso_activos     IS NULL OR jsonb_typeof(tipos_ingreso_activos)     = 'array'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_onboarding') THEN
    ALTER TABLE configuracion_negocio ADD CONSTRAINT chk_negocio_onboarding CHECK (onboarding_paso BETWEEN 1 AND 6);
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. Cerrar el asistente. La regla vive en la base para que no se pueda saltar con una
--    petición armada a mano: sin los datos esenciales, el asistente no se da por completado.
--    (registrar_auditoria viene de functions.sql; al ser plpgsql se resuelve al ejecutarse.)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION completar_onboarding(p_usuario_id BIGINT, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v           configuracion_negocio%ROWTYPE;
  v_pendiente BOOLEAN;
BEGIN
  SELECT * INTO v FROM configuracion_negocio WHERE id = 1 FOR UPDATE;
  IF v.onboarding_completado THEN
    RETURN jsonb_build_object('ok', TRUE, 'ya_estaba', TRUE);
  END IF;

  SELECT onboarding_pendiente INTO v_pendiente FROM usuarios WHERE id = p_usuario_id AND activo;
  IF NOT COALESCE(v_pendiente, FALSE) THEN
    RAISE EXCEPTION 'Esta cuenta no tiene pendiente la configuración inicial.';
  END IF;
  IF COALESCE(btrim(v.rtn), '') = '' OR COALESCE(btrim(v.direccion), '') = ''
     OR COALESCE(btrim(v.telefono), '') = '' OR COALESCE(btrim(v.correo), '') = '' THEN
    RAISE EXCEPTION 'Faltan los datos del negocio: RTN, dirección, teléfono y correo.';
  END IF;
  IF COALESCE(btrim(v.logo_url), '') = '' OR v.logo_url = '/img/logo.png' THEN
    RAISE EXCEPTION 'Falta subir el logo del negocio.';
  END IF;
  IF v.onboarding_paso < 5 THEN
    RAISE EXCEPTION 'Falta elegir la paleta de colores.';
  END IF;

  UPDATE configuracion_negocio
     SET onboarding_completado = TRUE, onboarding_completado_en = NOW(), onboarding_paso = 6
   WHERE id = 1;
  UPDATE usuarios SET onboarding_pendiente = FALSE WHERE onboarding_pendiente;
  PERFORM registrar_auditoria(p_usuario_id, 'completar_onboarding', 'configuracion_negocio', 1,
                              'Completó la configuración inicial del negocio', NULL, p_ip);
  RETURN jsonb_build_object('ok', TRUE, 'ya_estaba', FALSE);
END;
$$;

COMMIT;
