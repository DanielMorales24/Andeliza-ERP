-- =====================================================================
-- 09_migracion_semana6.sql  |  Método de pago y anulación de facturas (Semana 6)
--
-- Qué hace
--   1. ventas.metodo_pago: efectivo, tarjeta, transferencia o cheque. Solo en ventas cobradas.
--      La partida de una venta cobrada carga Caja (efectivo) o Bancos (los demás). Issue #17.
--   2. Anulación de facturas sin borrar nada (ADR-003): ventas.anulada, quién, cuándo y por qué.
--      La función anular_venta devuelve el stock, revierte la partida con una contrapartida exacta
--      y deja el registro en la auditoría. El número de factura no se reutiliza.
--   3. detalle_venta.componentes: lo que un kit descontó de cada componente al venderse, para que
--      la anulación devuelva exactamente eso aunque el kit cambie después.
--   4. configuracion_negocio.metodos_pago_activos: qué métodos ofrece el punto de venta de este
--      negocio (catálogo maestro, decisión D-08). NULL = los predeterminados.
--   5. Permiso nuevo facturas.anular, para administrador y supervisor.
--   6. Las facturas anuladas dejan de contar en cuentas por cobrar (v_cxc), en la apertura contable
--      y en estadísticas (estadisticas_lineas).
--
-- Cómo se ejecuta: ANTES del git push, en cada base (primero desarrollo). Solo agrega: las columnas
-- tienen valor por defecto y crear_venta conserva su firma anterior (el parámetro nuevo va al final y
-- tiene valor por defecto), así que el código anterior sigue funcionando con la migración aplicada.
-- Trae BEGIN y COMMIT y se puede repetir. Las funciones de ventas son las mismas que trae functions.sql;
-- la vista v_cxc (migración 04) y estadisticas_lineas (migración 06) solo se actualizan aquí, por eso la
-- cadena de instalación sigue siendo: migraciones 01 a 09 en orden y después functions.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS metodo_pago      VARCHAR(20);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada          BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_en       TIMESTAMPTZ;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS anulada_por      BIGINT REFERENCES usuarios(id);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion VARCHAR(300);
ALTER TABLE detalle_venta ADD COLUMN IF NOT EXISTS componentes JSONB;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS metodos_pago_activos JSONB;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ventas_metodo_pago') THEN
    ALTER TABLE ventas ADD CONSTRAINT chk_ventas_metodo_pago
      CHECK (metodo_pago IS NULL OR metodo_pago IN ('efectivo', 'tarjeta', 'transferencia', 'cheque'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ventas_anulacion') THEN
    ALTER TABLE ventas ADD CONSTRAINT chk_ventas_anulacion
      CHECK ((anulada AND anulada_en IS NOT NULL AND motivo_anulacion IS NOT NULL)
          OR (NOT anulada AND anulada_en IS NULL AND anulada_por IS NULL AND motivo_anulacion IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_detalle_componentes') THEN
    ALTER TABLE detalle_venta ADD CONSTRAINT chk_detalle_componentes
      CHECK (componentes IS NULL OR jsonb_typeof(componentes) = 'array');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_negocio_metodos_pago') THEN
    ALTER TABLE configuracion_negocio ADD CONSTRAINT chk_negocio_metodos_pago
      CHECK (metodos_pago_activos IS NULL OR jsonb_typeof(metodos_pago_activos) = 'array');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ventas_anuladas ON ventas (anulada_en) WHERE anulada;

-- ---------------------------------------------------------------------
-- 2. Permiso para anular facturas: administrador y supervisor (roles de fábrica)
-- ---------------------------------------------------------------------
INSERT INTO permisos (modulo, accion, descripcion)
VALUES ('facturas', 'anular', 'Anular facturas: devuelve el stock y revierte la contabilidad')
ON CONFLICT (modulo, accion) DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.modulo = 'facturas' AND p.accion = 'anular'
 WHERE r.es_sistema AND r.nombre IN ('admin', 'supervisor')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. Funciones (idénticas a las de functions.sql)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS crear_venta(BIGINT, BIGINT, JSONB, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION cuenta_metodo_pago(p_metodo VARCHAR)
RETURNS VARCHAR
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_metodo = 'efectivo' THEN RETURN 'caja'; END IF;
  IF p_metodo IN ('tarjeta', 'transferencia', 'cheque') THEN RETURN 'bancos'; END IF;
  RAISE EXCEPTION 'El método de pago "%" no es válido.', COALESCE(p_metodo, '(vacío)');
END;
$$;

CREATE OR REPLACE FUNCTION crear_venta(
  p_cliente_id      BIGINT,
  p_usuario_id      BIGINT,
  p_items           JSONB,
  p_subtotal        NUMERIC,
  p_impuesto        NUMERIC,
  p_total           NUMERIC,
  p_numero_factura  VARCHAR DEFAULT NULL,
  p_estado          VARCHAR DEFAULT 'P',
  p_metodo_pago     VARCHAR DEFAULT NULL   -- efectivo | tarjeta | transferencia | cheque (solo ventas cobradas)
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
  v_costo_unit   NUMERIC;
  v_metodo       VARCHAR;
  v_consumo      JSONB;     -- lo que un kit descontó de cada componente (para poder anular la venta con exactitud)
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos.';
  END IF;

  -- La partida contable de la venta tiene que cuadrar: subtotal + impuesto = total
  IF ROUND(COALESCE(p_subtotal, 0) + COALESCE(p_impuesto, 0), 2) <> ROUND(COALESCE(p_total, 0), 2) THEN
    RAISE EXCEPTION 'Los totales de la venta no cuadran: subtotal + impuesto debe ser igual al total.';
  END IF;

  -- Modo de facturación: con CAI activo es fiscal, sin él es interno
  -- Método de pago: solo en ventas cobradas. Sin método se asume efectivo (lo que el sistema hacía antes).
  -- Una venta pendiente no lleva método: se registra en cada abono.
  IF p_estado = 'C' THEN
    v_metodo := COALESCE(NULLIF(BTRIM(p_metodo_pago), ''), 'efectivo');
    PERFORM cuenta_metodo_pago(v_metodo);   -- valida que el método exista
  END IF;

  v_tipo := CASE WHEN EXISTS (SELECT 1 FROM configuracion_fiscal WHERE activo = TRUE)
                 THEN 'fiscal' ELSE 'interno' END;

  IF p_numero_factura IS NOT NULL THEN
    v_factura := p_numero_factura;
  ELSIF v_tipo = 'fiscal' THEN
    v_factura := obtener_siguiente_numero_fiscal();
  ELSE
    v_factura := obtener_siguiente_numero_interno();
  END IF;

  INSERT INTO ventas (cliente_id, usuario_id, subtotal, impuesto, total, estado, numero_factura, tipo_documento, metodo_pago)
  VALUES (p_cliente_id, p_usuario_id, p_subtotal, p_impuesto, p_total, p_estado, v_factura, v_tipo, v_metodo)
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
    v_costo_unit := v_prod.precio_compra;
    v_consumo := NULL;

    IF v_prod.es_compuesto THEN
      -- Kit: se descuentan los componentes, el kit en sí no tiene stock
      IF v_variante_id IS NOT NULL THEN
        RAISE EXCEPTION 'El kit "%" no admite variantes.', v_prod.nombre;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM componentes_producto WHERE producto_padre_id = v_prod.id) THEN
        RAISE EXCEPTION 'El kit "%" no tiene componentes definidos.', v_prod.nombre;
      END IF;

      v_costo_unit := 0;
      v_consumo := '[]'::JSONB;
      FOR v_comp IN
        SELECT p.id, p.nombre, p.stock, p.precio_compra, cp.cantidad AS cant
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
            v_comp.nombre, v_prod.nombre, trim_scale(v_comp.stock);
        END IF;

        UPDATE productos SET stock = stock - (v_comp.cant * v_cantidad) WHERE id = v_comp.id;
        v_consumo := v_consumo || jsonb_build_object('producto_id', v_comp.id, 'cantidad', v_comp.cant * v_cantidad);
        -- el costo de un kit es la suma de lo que cuestan sus componentes
        v_costo_unit := v_costo_unit + v_comp.cant * v_comp.precio_compra;
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
          v_prod.nombre, v_var.nombre_variante, trim_scale(v_var.stock);
      END IF;

      UPDATE variantes_producto SET stock = stock - v_cantidad WHERE id = v_var.id;

    ELSE
      -- Producto simple
      IF v_variante_id IS NOT NULL THEN
        RAISE EXCEPTION 'El producto "%" no tiene variantes.', v_prod.nombre;
      END IF;

      IF v_prod.stock < v_cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente de "%". Disponible: %.', v_prod.nombre, trim_scale(v_prod.stock);
      END IF;

      UPDATE productos SET stock = stock - v_cantidad WHERE id = v_prod.id;
    END IF;

    INSERT INTO detalle_venta (venta_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario, subtotal, componentes)
    VALUES (v_venta_id, v_prod.id, v_variante_id, v_cantidad, v_precio, v_costo_unit, ROUND(v_cantidad * v_precio, 2), v_consumo);

  END LOOP;

  -- Partida de la venta (ingreso, impuesto, costo de ventas y caja o cuenta por cobrar)
  PERFORM contabilizar_venta(v_venta_id);

  INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalles)
  VALUES (p_usuario_id, 'crear_venta', 'ventas', v_venta_id,
          jsonb_build_object('numero_factura', v_factura, 'tipo_documento', v_tipo, 'total', p_total, 'metodo_pago', v_metodo));

  RETURN jsonb_build_object('venta_id', v_venta_id, 'numero_factura', v_factura, 'tipo_documento', v_tipo);
END;
$$;

CREATE OR REPLACE FUNCTION contabilizar_venta(p_venta_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v        ventas%ROWTYPE;
  v_inicio DATE;
  v_fecha  DATE;
  v_costo  NUMERIC;
  v_lineas JSONB := '[]'::JSONB;
BEGIN
  SELECT contabilidad_inicio INTO v_inicio FROM configuracion_negocio WHERE id = 1;
  IF v_inicio IS NULL THEN RETURN NULL; END IF;     -- contabilidad sin iniciar: la venta se hace igual

  SELECT * INTO v FROM ventas WHERE id = p_venta_id;
  v_fecha := fecha_local(v.creado_en);
  IF v_fecha < v_inicio THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(ROUND(cantidad * costo_unitario, 2)), 0) INTO v_costo FROM detalle_venta WHERE venta_id = p_venta_id;

  IF v.total > 0 THEN
    -- Cobrada: entra a Caja o a Bancos según el método de pago. Pendiente: Cuentas por cobrar.
    v_lineas := v_lineas || jsonb_build_object('clave', CASE WHEN v.estado = 'C' THEN cuenta_metodo_pago(COALESCE(v.metodo_pago, 'efectivo')) ELSE 'cxc' END, 'debe', v.total);
    IF v.subtotal > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'ventas', 'haber', v.subtotal); END IF;
    IF v.impuesto > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'isv_por_pagar', 'haber', v.impuesto); END IF;
  END IF;
  IF v_costo > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('clave', 'costo_ventas', 'debe', v_costo)
                         || jsonb_build_object('clave', 'inventario', 'haber', v_costo);
  END IF;

  IF jsonb_array_length(v_lineas) < 2 THEN RETURN NULL; END IF;
  RETURN crear_partida(v_fecha, 'Venta ' || v.numero_factura, 'venta', p_venta_id, v.usuario_id, v_lineas);
END;
$$;

CREATE OR REPLACE FUNCTION registrar_abono_cliente(
  p_venta_id BIGINT, p_ingreso_id BIGINT, p_monto NUMERIC, p_fecha DATE,
  p_cuenta_clave VARCHAR, p_notas TEXT, p_usuario_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta   ventas%ROWTYPE;
  v_ing     ingresos%ROWTYPE;
  v_saldo   NUMERIC;
  v_nuevo   NUMERIC;
  v_fdoc    DATE;
  v_ref     TEXT;
  v_cuenta  BIGINT;
  v_abono   BIGINT;
  v_pid     BIGINT;
BEGIN
  IF (p_venta_id IS NULL) = (p_ingreso_id IS NULL) THEN
    RAISE EXCEPTION 'Indica si el abono es de una factura o de un ingreso por cobrar.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del abono debe ser mayor que cero.'; END IF;
  IF p_monto <> ROUND(p_monto, 2) THEN RAISE EXCEPTION 'El monto no puede tener más de 2 decimales.'; END IF;
  v_cuenta := cuenta_efectivo(p_cuenta_clave);
  p_fecha := COALESCE(p_fecha, hoy_negocio());

  IF p_venta_id IS NOT NULL THEN
    SELECT * INTO v_venta FROM ventas WHERE id = p_venta_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La factura no existe.'; END IF;
    IF v_venta.anulada THEN RAISE EXCEPTION 'La factura % está anulada: no se le pueden registrar cobros.', v_venta.numero_factura; END IF;
    IF v_venta.estado <> 'P' THEN RAISE EXCEPTION 'La factura % ya está pagada.', v_venta.numero_factura; END IF;
    v_saldo := ROUND(v_venta.total - COALESCE((SELECT SUM(monto) FROM abonos_clientes WHERE venta_id = p_venta_id AND NOT anulado), 0), 2);
    v_fdoc  := fecha_local(v_venta.creado_en);
    v_ref   := 'factura ' || v_venta.numero_factura;
  ELSE
    SELECT * INTO v_ing FROM ingresos WHERE id = p_ingreso_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El ingreso no existe.'; END IF;
    IF v_ing.anulado THEN RAISE EXCEPTION 'El ingreso está anulado.'; END IF;
    IF v_ing.estado_cobro <> 'P' THEN RAISE EXCEPTION 'El ingreso "%" ya está cobrado.', v_ing.descripcion; END IF;
    v_saldo := ROUND(v_ing.monto - COALESCE((SELECT SUM(monto) FROM abonos_clientes WHERE ingreso_id = p_ingreso_id AND NOT anulado), 0), 2);
    v_fdoc  := v_ing.fecha;
    v_ref   := 'ingreso "' || v_ing.descripcion || '"';
  END IF;

  IF p_monto > v_saldo THEN
    RAISE EXCEPTION 'El abono (%) es mayor que el saldo pendiente (%).', TO_CHAR(p_monto, 'FM999999990.00'), TO_CHAR(v_saldo, 'FM999999990.00');
  END IF;
  IF p_fecha < v_fdoc THEN
    RAISE EXCEPTION 'La fecha del abono no puede ser anterior a la del documento (%).', TO_CHAR(v_fdoc, 'DD/MM/YYYY');
  END IF;

  INSERT INTO abonos_clientes (venta_id, ingreso_id, monto, fecha, cuenta_id, notas, usuario_id)
  VALUES (p_venta_id, p_ingreso_id, p_monto, p_fecha, v_cuenta, p_notas, p_usuario_id)
  RETURNING id INTO v_abono;

  v_pid := crear_partida(
    p_fecha, 'Abono a ' || v_ref, 'abono_cliente', v_abono, p_usuario_id,
    jsonb_build_array(jsonb_build_object('cuenta_id', v_cuenta, 'debe', p_monto), jsonb_build_object('clave', 'cxc', 'haber', p_monto))
  );
  UPDATE abonos_clientes SET partida_id = v_pid WHERE id = v_abono;

  v_nuevo := ROUND(v_saldo - p_monto, 2);
  IF v_nuevo = 0 THEN
    IF p_venta_id IS NOT NULL THEN UPDATE ventas SET estado = 'C' WHERE id = p_venta_id;
    ELSE UPDATE ingresos SET estado_cobro = 'C' WHERE id = p_ingreso_id; END IF;
  END IF;
  RETURN jsonb_build_object('abono_id', v_abono, 'partida_id', v_pid, 'saldo', v_nuevo, 'pagada', v_nuevo = 0);
END;
$$;

CREATE OR REPLACE FUNCTION generar_apertura_contable(p_fecha DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio DATE;
  v_fecha  DATE;
  v_inv    NUMERIC;
  v_cxc    NUMERIC;
  v_lineas JSONB := '[]'::JSONB;
  v_pid    BIGINT;
BEGIN
  SELECT contabilidad_inicio INTO v_inicio FROM configuracion_negocio WHERE id = 1 FOR UPDATE;
  IF v_inicio IS NOT NULL THEN
    RETURN jsonb_build_object('ya_iniciada', TRUE, 'fecha', v_inicio);
  END IF;

  v_fecha := COALESCE(p_fecha, hoy_negocio());
  IF v_fecha > hoy_negocio() THEN RAISE EXCEPTION 'La fecha de inicio no puede ser futura.'; END IF;

  UPDATE configuracion_negocio SET contabilidad_inicio = v_fecha WHERE id = 1;

  v_inv := valor_inventario();
  SELECT COALESCE(SUM(total), 0) INTO v_cxc FROM ventas WHERE estado = 'P' AND NOT anulada;

  IF v_inv > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'inventario', 'debe', v_inv); END IF;
  IF v_cxc > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'cxc', 'debe', v_cxc); END IF;
  IF v_inv + v_cxc > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('clave', 'capital', 'haber', v_inv + v_cxc);
    v_pid := crear_partida(v_fecha, 'Asiento de apertura', 'apertura', NULL, NULL, v_lineas);
  END IF;

  RETURN jsonb_build_object('ya_iniciada', FALSE, 'fecha', v_fecha, 'partida_id', v_pid, 'inventario', v_inv, 'cuentas_por_cobrar', v_cxc);
END;
$$;

CREATE OR REPLACE FUNCTION anular_venta(p_venta_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v           ventas%ROWTYPE;
  d           RECORD;
  c           RECORD;
  v_motivo    TEXT := NULLIF(BTRIM(p_motivo), '');
  v_partida   BIGINT;
  v_reversa   BIGINT;
  v_devuelto  JSONB := '[]'::JSONB;
  v_aprox     BOOLEAN := FALSE;
  v_contab    TEXT;
BEGIN
  IF v_motivo IS NULL OR char_length(v_motivo) < 5 THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación (al menos 5 caracteres).';
  END IF;

  SELECT * INTO v FROM ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La factura no existe.'; END IF;
  IF v.anulada THEN RAISE EXCEPTION 'La factura % ya está anulada.', v.numero_factura; END IF;
  IF EXISTS (SELECT 1 FROM abonos_clientes WHERE venta_id = p_venta_id AND NOT anulado) THEN
    RAISE EXCEPTION 'La factura % tiene abonos registrados. Anula primero esos abonos en Finanzas → Cuentas por cobrar.', v.numero_factura;
  END IF;

  -- 1. El stock vuelve exactamente como salió
  FOR d IN
    SELECT dv.id, dv.producto_id, dv.variante_id, dv.cantidad, dv.componentes, p.es_compuesto
      FROM detalle_venta dv JOIN productos p ON p.id = dv.producto_id
     WHERE dv.venta_id = p_venta_id ORDER BY dv.id
  LOOP
    IF d.componentes IS NOT NULL THEN
      -- kit: se devuelve lo que la venta descontó de cada componente (guardado al vender)
      FOR c IN SELECT (x->>'producto_id')::BIGINT AS producto_id, (x->>'cantidad')::NUMERIC AS cantidad
                 FROM jsonb_array_elements(d.componentes) x
      LOOP
        UPDATE productos SET stock = stock + c.cantidad WHERE id = c.producto_id;
        v_devuelto := v_devuelto || jsonb_build_object('producto_id', c.producto_id, 'cantidad', c.cantidad, 'por_kit', d.producto_id);
      END LOOP;
    ELSIF d.es_compuesto THEN
      -- kit vendido antes de la migración 09 (no guardó su consumo): se usa la composición actual
      v_aprox := TRUE;
      FOR c IN SELECT cp.producto_hijo_id AS producto_id, cp.cantidad * d.cantidad AS cantidad
                 FROM componentes_producto cp WHERE cp.producto_padre_id = d.producto_id
      LOOP
        UPDATE productos SET stock = stock + c.cantidad WHERE id = c.producto_id;
        v_devuelto := v_devuelto || jsonb_build_object('producto_id', c.producto_id, 'cantidad', c.cantidad, 'por_kit', d.producto_id);
      END LOOP;
    ELSIF d.variante_id IS NOT NULL THEN
      UPDATE variantes_producto SET stock = stock + d.cantidad WHERE id = d.variante_id;
      v_devuelto := v_devuelto || jsonb_build_object('producto_id', d.producto_id, 'variante_id', d.variante_id, 'cantidad', d.cantidad);
    ELSE
      UPDATE productos SET stock = stock + d.cantidad WHERE id = d.producto_id;
      v_devuelto := v_devuelto || jsonb_build_object('producto_id', d.producto_id, 'cantidad', d.cantidad);
    END IF;
  END LOOP;

  -- 2. La contabilidad: contrapartida exacta de la partida de la venta (si la tiene)
  SELECT id INTO v_partida FROM partidas
   WHERE origen_tipo = 'venta' AND origen_id = p_venta_id AND reversa_de IS NULL
   ORDER BY id LIMIT 1;
  IF v_partida IS NOT NULL THEN
    v_reversa := anular_partida(v_partida, p_usuario_id, 'factura ' || v.numero_factura || ' — ' || v_motivo);
    v_contab := 'revertida';
  ELSIF (SELECT contabilidad_inicio FROM configuracion_negocio WHERE id = 1) IS NOT NULL THEN
    v_contab := 'sin_partida';        -- la venta es anterior al inicio de la contabilidad
  ELSE
    v_contab := 'sin_contabilidad';
  END IF;

  -- 3. La venta queda marcada (no se borra nada)
  UPDATE ventas
     SET anulada = TRUE, anulada_en = NOW(), anulada_por = p_usuario_id, motivo_anulacion = LEFT(v_motivo, 300)
   WHERE id = p_venta_id;

  -- 4. Auditoría
  PERFORM registrar_auditoria(
    p_usuario_id, 'anular_venta', 'ventas', p_venta_id,
    'Anuló la factura ' || v.numero_factura || ' por ' || TO_CHAR(v.total, 'FM999999990.00') || ': ' || LEFT(v_motivo, 200),
    jsonb_build_object('numero_factura', v.numero_factura, 'total', v.total, 'estado', v.estado, 'metodo_pago', v.metodo_pago,
                       'motivo', v_motivo, 'partida', v_partida, 'partida_anulacion', v_reversa, 'contabilidad', v_contab,
                       'stock_devuelto', v_devuelto, 'kit_con_composicion_actual', v_aprox),
    p_ip);

  RETURN jsonb_build_object('venta_id', p_venta_id, 'numero_factura', v.numero_factura, 'partida_anulacion_id', v_reversa,
                            'contabilidad', v_contab, 'kit_con_composicion_actual', v_aprox);
END;
$$;

-- ---------------------------------------------------------------------
-- 4. Las facturas anuladas no se cobran ni cuentan en estadísticas
--    (misma vista de la migración 04 y misma función de la 06, con una condición más)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_cxc AS
SELECT x.*,
       COALESCE(x.fecha_vencimiento, x.fecha_doc + n.dias_credito)             AS vence,
       (x.fecha_vencimiento IS NULL)                                           AS plazo_estimado,
       hoy_negocio() - COALESCE(x.fecha_vencimiento, x.fecha_doc + n.dias_credito) AS dias_vencido
  FROM (
    SELECT 'venta'::TEXT AS origen, v.id AS doc_id, v.cliente_id,
           COALESCE(c.nombre, 'Consumidor Final') AS tercero,
           CASE WHEN v.tipo_documento = 'fiscal' THEN 'Factura ' || regexp_replace(v.numero_factura, '^.*-', '') ELSE v.numero_factura END AS referencia,
           fecha_local(v.creado_en) AS fecha_doc,
           v.fecha_vencimiento,
           v.total AS monto,
           ROUND(v.total - COALESCE((SELECT SUM(a.monto) FROM abonos_clientes a WHERE a.venta_id = v.id AND NOT a.anulado), 0), 2) AS saldo
      FROM ventas v LEFT JOIN clientes c ON c.id = v.cliente_id
     WHERE v.estado = 'P' AND NOT v.anulada          -- Semana 6: una factura anulada no se cobra
    UNION ALL
    SELECT 'ingreso'::TEXT, i.id, i.cliente_id,
           COALESCE(c.nombre, 'Sin cliente'),
           i.descripcion,
           i.fecha,
           i.fecha_vencimiento,
           i.monto,
           ROUND(i.monto - COALESCE((SELECT SUM(a.monto) FROM abonos_clientes a WHERE a.ingreso_id = i.id AND NOT a.anulado), 0), 2)
      FROM ingresos i LEFT JOIN clientes c ON c.id = i.cliente_id
     WHERE i.estado_cobro = 'P' AND NOT i.anulado
  ) x
  CROSS JOIN (SELECT dias_credito FROM configuracion_negocio WHERE id = 1) n;

CREATE OR REPLACE FUNCTION estadisticas_lineas(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL
)
RETURNS TABLE (
  venta_id BIGINT, usuario_id BIGINT, tipo_documento VARCHAR, estado VARCHAR, creado_en TIMESTAMPTZ, fecha DATE,
  producto_id BIGINT, categoria_id BIGINT, cantidad NUMERIC, neto NUMERIC, bruto NUMERIC, costo NUMERIC, con_costo BOOLEAN
)
LANGUAGE sql STABLE
AS $$
  SELECT v.id, v.usuario_id, v.tipo_documento, v.estado, v.creado_en, fecha_local(v.creado_en),
         d.producto_id, p.categoria_id, d.cantidad,
         d.subtotal,                                                                          -- neto: sin impuesto
         CASE WHEN v.subtotal > 0 THEN d.subtotal * v.total / v.subtotal ELSE 0 END,          -- bruto: con impuesto repartido
         d.costo_unitario * d.cantidad,
         d.costo_unitario > 0
    FROM ventas v
    JOIN detalle_venta d ON d.venta_id = v.id
    JOIN productos p ON p.id = d.producto_id
   WHERE v.creado_en >= (p_desde::timestamp AT TIME ZONE zona_negocio())
     AND v.creado_en <  ((p_hasta + 1)::timestamp AT TIME ZONE zona_negocio())
     AND (p_vendedor IS NULL OR v.usuario_id = p_vendedor)
     AND (p_categoria IS NULL OR p.categoria_id = p_categoria)
     AND NOT v.anulada                                   -- Semana 6: las facturas anuladas no cuentan
$$;

COMMIT;
