-- =====================================================================
-- functions_es.sql  |  Las RPCs críticas (correr DESPUÉS de schema_es.sql)
-- Todo es CREATE OR REPLACE: se puede volver a correr completo sin problema.
--
-- Facturación en dos modos:
--   * Con configuracion_fiscal activa -> número fiscal con CAI (SAR)
--   * Sin configuración fiscal activa -> número interno INT-000001, sin bloquear
-- Si hay configuración activa pero está vencida o sin números, se BLOQUEA
-- a propósito (no se emiten comprobantes internos por error con un CAI vigente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) obtener_siguiente_numero_fiscal()
-- Bloquea la fila fiscal activa, valida fecha y rango, incrementa y
-- devuelve el número listo para imprimir: CAI-00000001
-- Si algo falla lanza EXCEPTION con un mensaje que se puede mostrar tal cual.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_siguiente_numero_fiscal()
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_config     configuracion_fiscal%ROWTYPE;
  v_siguiente  INT;
BEGIN
  SELECT * INTO v_config
  FROM configuracion_fiscal
  WHERE activo = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No hay configuración fiscal activa. Configúrala en Configuración > Parámetros fiscales.';
  END IF;

  IF v_config.fecha_limite < CURRENT_DATE THEN
    RAISE EXCEPTION 'La fecha límite de emisión (%) ya venció. Solicita un nuevo CAI.', v_config.fecha_limite;
  END IF;

  IF v_config.numero_actual >= v_config.rango_fin THEN
    RAISE EXCEPTION 'Se agotó el rango de numeración fiscal (último número: %).', v_config.rango_fin;
  END IF;

  v_siguiente := v_config.numero_actual + 1;

  UPDATE configuracion_fiscal SET numero_actual = v_siguiente WHERE id = v_config.id;

  RETURN v_config.cai || '-' || LPAD(v_siguiente::TEXT, 8, '0');
END;
$$;


-- ---------------------------------------------------------------------
-- 1b) obtener_siguiente_numero_interno()
-- Número secuencial para negocios sin SAR: INT-000001, INT-000002...
-- El UPDATE bloquea la fila, así dos ventas simultáneas no repiten número.
-- Si la venta falla, el rollback devuelve el número (no quedan huecos).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION obtener_siguiente_numero_interno()
RETURNS VARCHAR
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefijo  VARCHAR;
  v_numero   INT;
BEGIN
  UPDATE configuracion_negocio
     SET numero_factura_interna = numero_factura_interna + 1
   WHERE id = 1
  RETURNING prefijo_factura_interna, numero_factura_interna INTO v_prefijo, v_numero;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falta la fila de configuracion_negocio (id = 1).';
  END IF;

  RETURN v_prefijo || '-' || CASE WHEN v_numero < 1000000 THEN LPAD(v_numero::TEXT, 6, '0') ELSE v_numero::TEXT END;
END;
$$;


-- ---------------------------------------------------------------------
-- 2) crear_venta(...)
-- Inserta venta + detalle y descuenta stock: del producto, de la variante
-- o de los componentes si es kit. Todo en una sola transacción: si algo
-- falla, no queda nada a medias.
--
-- p_numero_factura es opcional: si no lo mandas, la función toma el número
-- aquí adentro: fiscal (CAI) si hay configuracion_fiscal activa, interno
-- (INT-000001) si no la hay. Así, si la venta falla (ej. stock insuficiente),
-- el número NO se pierde, porque el rollback lo devuelve.
--
-- p_items = [
--   {"producto_id": 1, "cantidad": 2, "precio_unitario": 150},
--   {"producto_id": 7, "variante_id": 31, "cantidad": 1}
-- ]
-- precio_unitario es opcional (si falta, usa precio_venta del producto).
-- variante_id es obligatorio si el producto tiene variantes activas, y
-- no se acepta si no las tiene. Los kits solo admiten componentes sin variantes.
-- p_estado: 'P' pendiente (default) o 'C' pagada.
--
-- Desde Node:
--   const { rows } = await pool.query(
--     'SELECT crear_venta($1,$2,$3::jsonb,$4,$5,$6) AS resultado',
--     [clienteId, usuarioId, JSON.stringify(items), subtotal, impuesto, total]);
--   rows[0].resultado  ->  { venta_id, numero_factura, tipo_documento }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_venta(
  p_cliente_id      BIGINT,
  p_usuario_id      BIGINT,
  p_items           JSONB,
  p_subtotal        NUMERIC,
  p_impuesto        NUMERIC,
  p_total           NUMERIC,
  p_numero_factura  VARCHAR DEFAULT NULL,
  p_estado          VARCHAR DEFAULT 'P'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta_id     BIGINT;
  v_factura      VARCHAR;
  v_item         JSONB;
  v_prod         productos%ROWTYPE;
  v_var          variantes_producto%ROWTYPE;
  v_comp         RECORD;
  v_cantidad     NUMERIC;
  v_precio       NUMERIC;
  v_variante_id  BIGINT;
  v_tipo         VARCHAR;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos.';
  END IF;

  -- Modo de facturación: con CAI activo es fiscal, sin él es interno
  v_tipo := CASE WHEN EXISTS (SELECT 1 FROM configuracion_fiscal WHERE activo = TRUE)
                 THEN 'fiscal' ELSE 'interno' END;

  IF p_numero_factura IS NOT NULL THEN
    v_factura := p_numero_factura;
  ELSIF v_tipo = 'fiscal' THEN
    v_factura := obtener_siguiente_numero_fiscal();
  ELSE
    v_factura := obtener_siguiente_numero_interno();
  END IF;

  INSERT INTO ventas (cliente_id, usuario_id, subtotal, impuesto, total, estado, numero_factura, tipo_documento)
  VALUES (p_cliente_id, p_usuario_id, p_subtotal, p_impuesto, p_total, p_estado, v_factura, v_tipo)
  RETURNING id INTO v_venta_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP

    v_cantidad    := (v_item->>'cantidad')::NUMERIC;
    v_variante_id := NULLIF(v_item->>'variante_id', '')::BIGINT;

    IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
      RAISE EXCEPTION 'Cantidad inválida en el producto %.', v_item->>'producto_id';
    END IF;

    -- FOR UPDATE: si dos ventas piden el mismo producto, la segunda espera
    SELECT * INTO v_prod
    FROM productos
    WHERE id = (v_item->>'producto_id')::BIGINT AND activo = TRUE
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no existe o está inactivo.', v_item->>'producto_id';
    END IF;

    v_precio := COALESCE((v_item->>'precio_unitario')::NUMERIC, v_prod.precio_venta);

    IF v_prod.es_compuesto THEN
      -- Kit: se descuentan los componentes, el kit en sí no tiene stock
      IF v_variante_id IS NOT NULL THEN
        RAISE EXCEPTION 'El kit "%" no admite variantes.', v_prod.nombre;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM componentes_producto WHERE producto_padre_id = v_prod.id) THEN
        RAISE EXCEPTION 'El kit "%" no tiene componentes definidos.', v_prod.nombre;
      END IF;

      FOR v_comp IN
        SELECT p.id, p.nombre, p.stock, cp.cantidad AS cant
        FROM componentes_producto cp
        JOIN productos p ON p.id = cp.producto_hijo_id
        WHERE cp.producto_padre_id = v_prod.id
        FOR UPDATE OF p
      LOOP
        IF EXISTS (SELECT 1 FROM variantes_producto WHERE producto_id = v_comp.id AND activo) THEN
          RAISE EXCEPTION 'El componente "%" del kit "%" tiene variantes; los kits solo admiten componentes sin variantes.',
            v_comp.nombre, v_prod.nombre;
        END IF;

        IF v_comp.stock < v_comp.cant * v_cantidad THEN
          RAISE EXCEPTION 'Stock insuficiente de "%" (componente del kit "%"). Disponible: %.',
            v_comp.nombre, v_prod.nombre, v_comp.stock;
        END IF;

        UPDATE productos SET stock = stock - (v_comp.cant * v_cantidad) WHERE id = v_comp.id;
      END LOOP;

    ELSIF EXISTS (SELECT 1 FROM variantes_producto WHERE producto_id = v_prod.id AND activo) THEN
      -- Producto con variantes: el stock se descuenta de la variante elegida
      IF v_variante_id IS NULL THEN
        RAISE EXCEPTION 'El producto "%" requiere elegir una variante.', v_prod.nombre;
      END IF;

      SELECT * INTO v_var
      FROM variantes_producto
      WHERE id = v_variante_id AND producto_id = v_prod.id AND activo = TRUE
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'La variante % no existe o no pertenece al producto "%".', v_variante_id, v_prod.nombre;
      END IF;

      IF v_var.stock < v_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente de "%" (%). Disponible: %.',
          v_prod.nombre, v_var.nombre_variante, v_var.stock;
      END IF;

      UPDATE variantes_producto SET stock = stock - v_cantidad WHERE id = v_var.id;

    ELSE
      -- Producto simple
      IF v_variante_id IS NOT NULL THEN
        RAISE EXCEPTION 'El producto "%" no tiene variantes.', v_prod.nombre;
      END IF;

      IF v_prod.stock < v_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente de "%". Disponible: %.', v_prod.nombre, v_prod.stock;
      END IF;

      UPDATE productos SET stock = stock - v_cantidad WHERE id = v_prod.id;
    END IF;

    INSERT INTO detalle_venta (venta_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario, subtotal)
    VALUES (v_venta_id, v_prod.id, v_variante_id, v_cantidad, v_precio, v_prod.precio_compra, ROUND(v_cantidad * v_precio, 2));

  END LOOP;

  INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalles)
  VALUES (p_usuario_id, 'crear_venta', 'ventas', v_venta_id,
          jsonb_build_object('numero_factura', v_factura, 'tipo_documento', v_tipo, 'total', p_total));

  RETURN jsonb_build_object('venta_id', v_venta_id, 'numero_factura', v_factura, 'tipo_documento', v_tipo);
END;
$$;


-- ---------------------------------------------------------------------
-- Prueba rápida (después de correr seed_deportes.sql). El ROLLBACK no deja rastro:
--
-- BEGIN;
--   SELECT crear_venta(
--     NULL, 1,
--     jsonb_build_array(
--       jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'CAM-RMA'),
--                          'variante_id', (SELECT id FROM variantes_producto WHERE sku = 'CAM-RMA-LOC-M'),
--                          'cantidad', 2),
--       jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'KIT-001'),
--                          'cantidad', 1)),
--     2300, 345, 2645);
--   SELECT sku, stock FROM variantes_producto WHERE sku = 'CAM-RMA-LOC-M';
--   SELECT sku, stock FROM productos WHERE sku IN ('CAM-ENT', 'PAN-001', 'MED-001');
-- ROLLBACK;
-- ---------------------------------------------------------------------
