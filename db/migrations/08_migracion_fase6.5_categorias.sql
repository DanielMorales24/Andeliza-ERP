-- =====================================================================
-- 08_migracion_fase6.5_categorias.sql  |  Categorías nuevas de gasto e ingreso
--
-- Qué hace
--   1. Agrega tres cuentas al plan de cuentas:
--        6106  gasto_servicios     Servicios públicos (agua, luz, internet y teléfono)
--        6107  gasto_impuestos     Impuestos municipales, tasas y contribuciones
--        4206  ingreso_comisiones  Comisiones ganadas
--      Siguen la numeración existente (61xx gastos de operación, 42xx otros ingresos). 6105 y 4205
--      ya son "Otros gastos" y "Otros ingresos" y no se renumeran: esos códigos ya están en partidas.
--      "Impuestos" es un GASTO del negocio (municipales, tasas). No tiene que ver con el ISV por
--      pagar (2201), que es un pasivo: el ISV cobrado en las ventas no es un gasto.
--   2. Vuelve a crear registrar_ingreso y registrar_gasto sin su lista fija de categorías: ahora una
--      categoría es válida si existe su cuenta activa (gasto_<clave> o ingreso_<clave>). Así una
--      categoría futura solo necesita su cuenta. Son las MISMAS definiciones que trae functions.sql.
--
-- Por qué las funciones vienen aquí y no solo en functions.sql: en una base que ya está en uso basta
-- con ejecutar ESTE archivo. No hace falta volver a correr functions.sql (que, en una base con
-- productos y sin contabilidad iniciada, inicia la contabilidad por su cuenta).
--
-- Cómo se ejecuta: ANTES del git push, en cada base. Solo agrega (tres filas y dos funciones que
-- aceptan más que antes): el código anterior sigue funcionando. Trae BEGIN y COMMIT y se puede repetir.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Las cuentas. Si ya existen con la misma clave, se respetan (se puede repetir).
--    Si su código lo usa otra cuenta, se detiene sin cambiar nada: no se adivina otro número.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  c RECORD;
  v_tipo VARCHAR;
  v_clave VARCHAR;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('6106', 'gasto_servicios',    'Servicios públicos (agua, luz, internet y teléfono)', 'gasto'),
      ('6107', 'gasto_impuestos',    'Impuestos municipales, tasas y contribuciones',       'gasto'),
      ('4206', 'ingreso_comisiones', 'Comisiones ganadas',                                  'ingreso')
    ) AS t(codigo, clave, nombre, tipo)
  LOOP
    SELECT tipo INTO v_tipo FROM plan_cuentas WHERE clave = c.clave;
    IF FOUND THEN
      IF v_tipo <> c.tipo THEN
        RAISE EXCEPTION 'La cuenta % ya existe pero es de tipo % (se esperaba %). Revísala antes de continuar.', c.clave, v_tipo, c.tipo;
      END IF;
      CONTINUE;   -- ya estaba: nada que hacer
    END IF;
    SELECT clave INTO v_clave FROM plan_cuentas WHERE codigo = c.codigo;
    IF FOUND THEN
      RAISE EXCEPTION 'El código % ya lo usa la cuenta "%". No se agregó ninguna cuenta.', c.codigo, COALESCE(v_clave, 'sin clave');
    END IF;
    INSERT INTO plan_cuentas (codigo, clave, nombre, tipo, es_efectivo, es_sistema, activo)
    VALUES (c.codigo, c.clave, c.nombre, c.tipo, FALSE, TRUE, TRUE);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2. Registro de ingresos y gastos, validando contra el plan de cuentas
--    (copiadas tal cual de functions.sql; una prueba comprueba que son idénticas)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_ingreso(
  p_tipo VARCHAR, p_descripcion TEXT, p_monto NUMERIC, p_fecha DATE, p_notas TEXT,
  p_estado VARCHAR, p_cuenta_clave VARCHAR, p_cliente_id BIGINT, p_fecha_venc DATE, p_usuario_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_id     BIGINT;
  v_pid    BIGINT;
  v_cuenta BIGINT;
BEGIN
  -- Un tipo es válido si existe su cuenta de ingreso activa en el plan de cuentas (ingreso_<tipo>).
  -- Agregar un tipo nuevo es agregar su cuenta (ver la migración 08), sin cambiar esta función.
  IF p_tipo IS NULL OR p_tipo !~ '^[a-z_]{1,30}$'
     OR NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE clave = 'ingreso_' || p_tipo AND tipo = 'ingreso' AND activo) THEN
    RAISE EXCEPTION 'El tipo de ingreso no es válido.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del ingreso debe ser mayor que cero.'; END IF;
  IF p_monto <> ROUND(p_monto, 2) THEN RAISE EXCEPTION 'El monto no puede tener más de 2 decimales.'; END IF;
  IF p_estado NOT IN ('C', 'P') THEN RAISE EXCEPTION 'Indica si el ingreso está cobrado o por cobrar.'; END IF;
  p_fecha := COALESCE(p_fecha, hoy_negocio());
  IF p_estado = 'C' THEN v_cuenta := cuenta_efectivo(p_cuenta_clave); END IF;
  IF p_estado = 'P' AND p_fecha_venc IS NOT NULL AND p_fecha_venc < p_fecha THEN
    RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha del ingreso.';
  END IF;

  INSERT INTO ingresos (tipo, descripcion, monto, fecha, notas, estado_cobro, fecha_vencimiento, cliente_id, cuenta_id, usuario_id)
  VALUES (p_tipo, LEFT(BTRIM(p_descripcion), 255), p_monto, p_fecha, p_notas, p_estado,
          CASE WHEN p_estado = 'P' THEN p_fecha_venc END, p_cliente_id, v_cuenta, p_usuario_id)
  RETURNING id INTO v_id;

  v_pid := crear_partida(
    p_fecha, 'Ingreso: ' || BTRIM(p_descripcion), 'ingreso', v_id, p_usuario_id,
    jsonb_build_array(
      CASE WHEN p_estado = 'C' THEN jsonb_build_object('cuenta_id', v_cuenta, 'debe', p_monto) ELSE jsonb_build_object('clave', 'cxc', 'debe', p_monto) END,
      jsonb_build_object('clave', 'ingreso_' || p_tipo, 'haber', p_monto)
    )
  );
  UPDATE ingresos SET partida_id = v_pid WHERE id = v_id;
  RETURN jsonb_build_object('ingreso_id', v_id, 'partida_id', v_pid);
END;
$$;

CREATE OR REPLACE FUNCTION registrar_gasto(
  p_categoria VARCHAR, p_descripcion TEXT, p_monto NUMERIC, p_fecha DATE, p_notas TEXT,
  p_estado VARCHAR, p_cuenta_clave VARCHAR, p_proveedor_id BIGINT, p_fecha_venc DATE, p_usuario_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_id     BIGINT;
  v_pid    BIGINT;
  v_cuenta BIGINT;
BEGIN
  -- Una categoría es válida si existe su cuenta de gasto activa en el plan de cuentas (gasto_<categoría>).
  -- Agregar una categoría nueva es agregar su cuenta (ver la migración 08), sin cambiar esta función.
  IF p_categoria IS NULL OR p_categoria !~ '^[a-z_]{1,30}$'
     OR NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE clave = 'gasto_' || p_categoria AND tipo = 'gasto' AND activo) THEN
    RAISE EXCEPTION 'La categoría del gasto no es válida.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del gasto debe ser mayor que cero.'; END IF;
  IF p_monto <> ROUND(p_monto, 2) THEN RAISE EXCEPTION 'El monto no puede tener más de 2 decimales.'; END IF;
  IF p_estado NOT IN ('C', 'P') THEN RAISE EXCEPTION 'Indica si el gasto está pagado o por pagar.'; END IF;
  p_fecha := COALESCE(p_fecha, hoy_negocio());
  IF p_estado = 'C' THEN v_cuenta := cuenta_efectivo(p_cuenta_clave); END IF;
  IF p_estado = 'P' AND p_fecha_venc IS NOT NULL AND p_fecha_venc < p_fecha THEN
    RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha del gasto.';
  END IF;

  INSERT INTO gastos (categoria, descripcion, monto, fecha, notas, estado_pago, fecha_vencimiento, proveedor_id, cuenta_id, usuario_id)
  VALUES (p_categoria, LEFT(BTRIM(p_descripcion), 255), p_monto, p_fecha, p_notas, p_estado,
          CASE WHEN p_estado = 'P' THEN p_fecha_venc END, p_proveedor_id, v_cuenta, p_usuario_id)
  RETURNING id INTO v_id;

  v_pid := crear_partida(
    p_fecha, 'Gasto: ' || BTRIM(p_descripcion), 'gasto', v_id, p_usuario_id,
    jsonb_build_array(
      jsonb_build_object('clave', 'gasto_' || p_categoria, 'debe', p_monto),
      CASE WHEN p_estado = 'C' THEN jsonb_build_object('cuenta_id', v_cuenta, 'haber', p_monto) ELSE jsonb_build_object('clave', 'cxp', 'haber', p_monto) END
    )
  );
  UPDATE gastos SET partida_id = v_pid WHERE id = v_id;
  RETURN jsonb_build_object('gasto_id', v_id, 'partida_id', v_pid);
END;
$$;

COMMIT;
