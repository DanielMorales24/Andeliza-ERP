-- =====================================================================
-- functions.sql  |  Las RPCs críticas (correr DESPUÉS de las migraciones 01 a 04)
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
  v_costo_unit   NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos.';
  END IF;

  -- La partida contable de la venta tiene que cuadrar: subtotal + impuesto = total
  IF ROUND(COALESCE(p_subtotal, 0) + COALESCE(p_impuesto, 0), 2) <> ROUND(COALESCE(p_total, 0), 2) THEN
    RAISE EXCEPTION 'Los totales de la venta no cuadran: subtotal + impuesto debe ser igual al total.';
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
    v_costo_unit := v_prod.precio_compra;

    IF v_prod.es_compuesto THEN
      -- Kit: se descuentan los componentes, el kit en sí no tiene stock
      IF v_variante_id IS NOT NULL THEN
        RAISE EXCEPTION 'El kit "%" no admite variantes.', v_prod.nombre;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM componentes_producto WHERE producto_padre_id = v_prod.id) THEN
        RAISE EXCEPTION 'El kit "%" no tiene componentes definidos.', v_prod.nombre;
      END IF;

      v_costo_unit := 0;
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

    INSERT INTO detalle_venta (venta_id, producto_id, variante_id, cantidad, precio_unitario, costo_unitario, subtotal)
    VALUES (v_venta_id, v_prod.id, v_variante_id, v_cantidad, v_precio, v_costo_unit, ROUND(v_cantidad * v_precio, 2));

  END LOOP;

  -- Partida de la venta (ingreso, impuesto, costo de ventas y caja o cuenta por cobrar)
  PERFORM contabilizar_venta(v_venta_id);

  INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, detalles)
  VALUES (p_usuario_id, 'crear_venta', 'ventas', v_venta_id,
          jsonb_build_object('numero_factura', v_factura, 'tipo_documento', v_tipo, 'total', p_total));

  RETURN jsonb_build_object('venta_id', v_venta_id, 'numero_factura', v_factura, 'tipo_documento', v_tipo);
END;
$$;


-- =====================================================================
-- CONTABILIDAD (Fase 4)
-- Todas las operaciones de dinero pasan por estas funciones: cada una guarda
-- el documento y su partida en la misma transacción, o no guarda nada.
-- =====================================================================

-- Id de una cuenta a partir de su clave estable ('caja', 'cxc', 'ventas'...)
CREATE OR REPLACE FUNCTION cuenta_por_clave(p_clave VARCHAR)
RETURNS BIGINT
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  SELECT id INTO v_id FROM plan_cuentas WHERE clave = p_clave AND activo;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No existe la cuenta contable "%" en el plan de cuentas.', p_clave;
  END IF;
  RETURN v_id;
END;
$$;

-- Cuenta donde entra o sale el dinero: solo Caja o Bancos
CREATE OR REPLACE FUNCTION cuenta_efectivo(p_clave VARCHAR)
RETURNS BIGINT
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF p_clave IS NULL OR p_clave NOT IN ('caja', 'bancos') THEN
    RAISE EXCEPTION 'Elige si el dinero entra o sale de Caja o de Bancos.';
  END IF;
  RETURN cuenta_por_clave(p_clave);
END;
$$;

-- ---------------------------------------------------------------------
-- crear_partida: el único camino para escribir en el libro diario.
-- p_lineas = [{"clave": "caja", "debe": 100}, {"cuenta_id": 7, "haber": 100, "detalle": "..."}]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_partida(
  p_fecha        DATE,
  p_descripcion  TEXT,
  p_origen_tipo  VARCHAR,
  p_origen_id    BIGINT,
  p_usuario_id   BIGINT,
  p_lineas       JSONB,
  p_reversa_de   BIGINT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio  DATE;
  v_numero  INT;
  v_id      BIGINT;
  v_linea   JSONB;
  v_cuenta  BIGINT;
  v_debe    NUMERIC;
  v_haber   NUMERIC;
  v_tdebe   NUMERIC := 0;
  v_thaber  NUMERIC := 0;
BEGIN
  SELECT contabilidad_inicio INTO v_inicio FROM configuracion_negocio WHERE id = 1;
  IF v_inicio IS NULL THEN
    RAISE EXCEPTION 'La contabilidad todavía no se ha iniciado. Inícialas desde Finanzas.';
  END IF;

  p_fecha := COALESCE(p_fecha, hoy_negocio());
  IF p_fecha < v_inicio THEN
    RAISE EXCEPTION 'La fecha (%) es anterior al inicio de la contabilidad (%).', TO_CHAR(p_fecha, 'DD/MM/YYYY'), TO_CHAR(v_inicio, 'DD/MM/YYYY');
  END IF;
  IF p_fecha > hoy_negocio() THEN
    RAISE EXCEPTION 'La fecha no puede ser futura.';
  END IF;
  IF p_descripcion IS NULL OR BTRIM(p_descripcion) = '' THEN
    RAISE EXCEPTION 'La partida necesita una descripción.';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) < 2 THEN
    RAISE EXCEPTION 'Una partida necesita al menos dos líneas.';
  END IF;

  -- Número correlativo sin saltos (el UPDATE bloquea la fila: dos partidas a la vez no repiten número)
  UPDATE configuracion_negocio SET numero_partida_actual = numero_partida_actual + 1
   WHERE id = 1 RETURNING numero_partida_actual INTO v_numero;

  INSERT INTO partidas (numero, fecha, descripcion, origen_tipo, origen_id, reversa_de, usuario_id)
  VALUES ('P-' || LPAD(v_numero::TEXT, 6, '0'), p_fecha, LEFT(BTRIM(p_descripcion), 300), p_origen_tipo, p_origen_id, p_reversa_de, p_usuario_id)
  RETURNING id INTO v_id;

  FOR v_linea IN SELECT value FROM jsonb_array_elements(p_lineas) LOOP
    v_debe  := COALESCE((v_linea->>'debe')::NUMERIC, 0);
    v_haber := COALESCE((v_linea->>'haber')::NUMERIC, 0);
    IF v_debe <> ROUND(v_debe, 2) OR v_haber <> ROUND(v_haber, 2) THEN
      RAISE EXCEPTION 'Los montos de la partida no pueden tener más de 2 decimales.';
    END IF;
    IF v_debe < 0 OR v_haber < 0 OR (v_debe > 0) = (v_haber > 0) THEN
      RAISE EXCEPTION 'Cada línea debe llevar un monto mayor que cero en el Debe o en el Haber (no en ambos).';
    END IF;

    IF v_linea ? 'cuenta_id' THEN
      v_cuenta := (v_linea->>'cuenta_id')::BIGINT;
      PERFORM 1 FROM plan_cuentas WHERE id = v_cuenta AND activo;
      IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta contable % no existe o está inactiva.', v_cuenta; END IF;
    ELSE
      v_cuenta := cuenta_por_clave(v_linea->>'clave');
    END IF;

    INSERT INTO partida_lineas (partida_id, cuenta_id, debe, haber, detalle)
    VALUES (v_id, v_cuenta, v_debe, v_haber, LEFT(v_linea->>'detalle', 200));
    v_tdebe  := v_tdebe + v_debe;
    v_thaber := v_thaber + v_haber;
  END LOOP;

  IF v_tdebe <> v_thaber THEN
    RAISE EXCEPTION 'La partida no cuadra: Debe % y Haber %.', v_tdebe, v_thaber;
  END IF;
  RETURN v_id;
END;
$$;

-- Contrapartida: copia una partida con el Debe y el Haber invertidos. Es la forma de "anular".
CREATE OR REPLACE FUNCTION anular_partida(p_partida_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_p      partidas%ROWTYPE;
  v_lineas JSONB;
BEGIN
  SELECT * INTO v_p FROM partidas WHERE id = p_partida_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La partida no existe.'; END IF;
  IF v_p.origen_tipo = 'anulacion' THEN RAISE EXCEPTION 'Una anulación no se puede anular.'; END IF;
  IF EXISTS (SELECT 1 FROM partidas WHERE reversa_de = v_p.id) THEN
    RAISE EXCEPTION 'La partida % ya está anulada.', v_p.numero;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('cuenta_id', cuenta_id, 'debe', haber, 'haber', debe, 'detalle', detalle) ORDER BY id)
    INTO v_lineas FROM partida_lineas WHERE partida_id = v_p.id;

  RETURN crear_partida(
    hoy_negocio(),
    'Anulación de ' || v_p.numero || COALESCE(': ' || NULLIF(BTRIM(p_motivo), ''), ''),
    'anulacion', v_p.id, p_usuario_id, v_lineas, v_p.id
  );
END;
$$;

-- Solo las partidas manuales y los ajustes de inventario se anulan directamente;
-- el resto se anula desde su documento (abono, pago, ingreso, gasto)
CREATE OR REPLACE FUNCTION anular_partida_manual(p_partida_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo VARCHAR;
BEGIN
  SELECT origen_tipo INTO v_tipo FROM partidas WHERE id = p_partida_id;
  IF v_tipo IS NULL THEN RAISE EXCEPTION 'La partida no existe.'; END IF;
  IF v_tipo NOT IN ('manual', 'ajuste_inventario', 'saldo_inicial') THEN
    RAISE EXCEPTION 'Esta partida la generó el sistema (%). Anúlala desde el documento que la originó.', v_tipo;
  END IF;
  RETURN anular_partida(p_partida_id, p_usuario_id, p_motivo);
END;
$$;

CREATE OR REPLACE FUNCTION registrar_partida_manual(p_fecha DATE, p_descripcion TEXT, p_lineas JSONB, p_usuario_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN crear_partida(p_fecha, p_descripcion, 'manual', NULL, p_usuario_id, p_lineas);
END;
$$;

CREATE OR REPLACE FUNCTION registrar_saldo_inicial(p_cuenta_clave VARCHAR, p_monto NUMERIC, p_fecha DATE, p_usuario_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_cuenta BIGINT := cuenta_efectivo(p_cuenta_clave);
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El saldo inicial debe ser mayor que cero.'; END IF;
  RETURN crear_partida(
    p_fecha, 'Saldo inicial de ' || CASE p_cuenta_clave WHEN 'caja' THEN 'Caja' ELSE 'Bancos' END, 'saldo_inicial', NULL, p_usuario_id,
    jsonb_build_array(jsonb_build_object('cuenta_id', v_cuenta, 'debe', p_monto), jsonb_build_object('clave', 'capital', 'haber', p_monto))
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Partida de una venta del POS (la llama crear_venta)
--   Pagada:    Caja            / Ventas + Impuesto por pagar
--   Pendiente: Cuentas x cobrar / Ventas + Impuesto por pagar
--   y siempre: Costo de ventas / Inventario
-- ---------------------------------------------------------------------
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
    v_lineas := v_lineas || jsonb_build_object('clave', CASE WHEN v.estado = 'C' THEN 'caja' ELSE 'cxc' END, 'debe', v.total);
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

-- ---------------------------------------------------------------------
-- Valor de las existencias (a costo) y saldo de una cuenta
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION valor_inventario()
RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(SUM(ROUND(
           CASE WHEN EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo)
                THEN (SELECT COALESCE(SUM(v.stock), 0) FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo)
                ELSE p.stock END * p.precio_compra, 2)), 0)
    FROM productos p
   WHERE NOT p.es_compuesto
$$;

-- Saldo con el signo natural: activos y gastos = Debe - Haber; el resto = Haber - Debe
CREATE OR REPLACE FUNCTION saldo_cuenta(p_clave VARCHAR)
RETURNS NUMERIC
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(SUM(CASE WHEN c.tipo IN ('activo', 'gasto') THEN l.debe - l.haber ELSE l.haber - l.debe END), 0)
    FROM plan_cuentas c JOIN partida_lineas l ON l.cuenta_id = c.id
   WHERE c.clave = p_clave
$$;

-- ---------------------------------------------------------------------
-- Inicio de la contabilidad: deja el estado de hoy como saldos de apertura
--   Inventario (a costo) + Cuentas por cobrar (ventas pendientes) = Capital
-- El dinero en Caja y Bancos arranca en cero: se registra el saldo inicial aparte.
-- ---------------------------------------------------------------------
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
  SELECT COALESCE(SUM(total), 0) INTO v_cxc FROM ventas WHERE estado = 'P';

  IF v_inv > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'inventario', 'debe', v_inv); END IF;
  IF v_cxc > 0 THEN v_lineas := v_lineas || jsonb_build_object('clave', 'cxc', 'debe', v_cxc); END IF;
  IF v_inv + v_cxc > 0 THEN
    v_lineas := v_lineas || jsonb_build_object('clave', 'capital', 'haber', v_inv + v_cxc);
    v_pid := crear_partida(v_fecha, 'Asiento de apertura', 'apertura', NULL, NULL, v_lineas);
  END IF;

  RETURN jsonb_build_object('ya_iniciada', FALSE, 'fecha', v_fecha, 'partida_id', v_pid, 'inventario', v_inv, 'cuentas_por_cobrar', v_cxc);
END;
$$;

-- Iguala el Inventario del libro con el valor real de las existencias.
-- p_contra = 'capital' (carga inicial de mercadería) o 'ajuste' (mermas y sobrantes: pasa por resultados)
CREATE OR REPLACE FUNCTION conciliar_inventario(p_usuario_id BIGINT, p_contra VARCHAR DEFAULT 'ajuste')
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_valor  NUMERIC := valor_inventario();
  v_saldo  NUMERIC := saldo_cuenta('inventario');
  v_dif    NUMERIC;
  v_contra VARCHAR;
  v_pid    BIGINT;
BEGIN
  v_contra := CASE p_contra WHEN 'capital' THEN 'capital' WHEN 'ajuste' THEN 'ajuste_inventario' END;
  IF v_contra IS NULL THEN RAISE EXCEPTION 'Elige si el ajuste va a capital o a resultados.'; END IF;

  v_dif := ROUND(v_valor - v_saldo, 2);
  IF v_dif = 0 THEN
    RETURN jsonb_build_object('diferencia', 0, 'valor_existencias', v_valor, 'saldo_libro', v_saldo);
  END IF;

  v_pid := crear_partida(
    hoy_negocio(),
    'Conciliación de inventario con existencias (' || CASE WHEN v_dif > 0 THEN 'sobrante' ELSE 'faltante' END || ')',
    'ajuste_inventario', NULL, p_usuario_id,
    CASE WHEN v_dif > 0
         THEN jsonb_build_array(jsonb_build_object('clave', 'inventario', 'debe', v_dif), jsonb_build_object('clave', v_contra, 'haber', v_dif))
         ELSE jsonb_build_array(jsonb_build_object('clave', v_contra, 'debe', -v_dif), jsonb_build_object('clave', 'inventario', 'haber', -v_dif))
    END
  );
  RETURN jsonb_build_object('diferencia', v_dif, 'valor_existencias', v_valor, 'saldo_libro', v_saldo, 'partida_id', v_pid);
END;
$$;

-- ---------------------------------------------------------------------
-- INGRESOS varios (intereses, alquileres, servicios, inversiones, otros)
--   Cobrado:    Caja o Bancos / Ingreso      Por cobrar: Cuentas por cobrar / Ingreso
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
  IF p_tipo IS NULL OR p_tipo NOT IN ('intereses', 'alquileres', 'servicios', 'inversiones', 'otros') THEN
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

CREATE OR REPLACE FUNCTION anular_ingreso(p_ingreso_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_i ingresos%ROWTYPE;
BEGIN
  SELECT * INTO v_i FROM ingresos WHERE id = p_ingreso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El ingreso no existe.'; END IF;
  IF v_i.anulado THEN RAISE EXCEPTION 'El ingreso ya está anulado.'; END IF;
  IF EXISTS (SELECT 1 FROM abonos_clientes WHERE ingreso_id = p_ingreso_id AND NOT anulado) THEN
    RAISE EXCEPTION 'Este ingreso tiene cobros registrados. Anula primero esos cobros.';
  END IF;
  IF v_i.partida_id IS NOT NULL THEN PERFORM anular_partida(v_i.partida_id, p_usuario_id, p_motivo); END IF;
  UPDATE ingresos SET anulado = TRUE WHERE id = p_ingreso_id;
  RETURN jsonb_build_object('ingreso_id', p_ingreso_id);
END;
$$;

-- ---------------------------------------------------------------------
-- GASTOS (logística, marketing, operativos, mantenimiento, otros)
--   Pagado:    Gasto / Caja o Bancos        Por pagar: Gasto / Cuentas por pagar
-- ---------------------------------------------------------------------
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
  IF p_categoria IS NULL OR p_categoria NOT IN ('logistica', 'marketing', 'operativos', 'mantenimiento', 'otros') THEN
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

CREATE OR REPLACE FUNCTION anular_gasto(p_gasto_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_g gastos%ROWTYPE;
BEGIN
  SELECT * INTO v_g FROM gastos WHERE id = p_gasto_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El gasto no existe.'; END IF;
  IF v_g.anulado THEN RAISE EXCEPTION 'El gasto ya está anulado.'; END IF;
  IF EXISTS (SELECT 1 FROM pagos_proveedores WHERE gasto_id = p_gasto_id AND NOT anulado) THEN
    RAISE EXCEPTION 'Este gasto tiene pagos registrados. Anula primero esos pagos.';
  END IF;
  IF v_g.partida_id IS NOT NULL THEN PERFORM anular_partida(v_g.partida_id, p_usuario_id, p_motivo); END IF;
  UPDATE gastos SET anulado = TRUE WHERE id = p_gasto_id;
  RETURN jsonb_build_object('gasto_id', p_gasto_id);
END;
$$;

-- ---------------------------------------------------------------------
-- COMPRAS de inventario: suben el stock y el costo (promedio ponderado)
--   Pagada:    Inventario / Caja o Bancos     Por pagar: Inventario / Cuentas por pagar
-- p_items = [{"producto_id": 1, "variante_id": null, "cantidad": 10, "precio_unitario": 45.5}]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_compra(
  p_proveedor_id BIGINT, p_items JSONB, p_fecha DATE, p_notas TEXT,
  p_estado VARCHAR, p_cuenta_clave VARCHAR, p_fecha_venc DATE, p_usuario_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_compra_id BIGINT;
  v_item      JSONB;
  v_prod      productos%ROWTYPE;
  v_cant      NUMERIC;
  v_precio    NUMERIC;
  v_sub       NUMERIC;
  v_total     NUMERIC := 0;
  v_var_id    BIGINT;
  v_con_var   BOOLEAN;
  v_antes     NUMERIC;
  v_costo     NUMERIC;
  v_cuenta    BIGINT;
  v_pid       BIGINT;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La compra no tiene productos.';
  END IF;
  IF p_estado NOT IN ('C', 'P') THEN RAISE EXCEPTION 'Indica si la compra está pagada o por pagar.'; END IF;
  p_fecha := COALESCE(p_fecha, hoy_negocio());
  IF p_estado = 'C' THEN v_cuenta := cuenta_efectivo(p_cuenta_clave); END IF;
  IF p_estado = 'P' AND p_fecha_venc IS NOT NULL AND p_fecha_venc < p_fecha THEN
    RAISE EXCEPTION 'La fecha de vencimiento no puede ser anterior a la fecha de la compra.';
  END IF;

  INSERT INTO compras (proveedor_id, total, fecha, notas, estado_pago, fecha_vencimiento, cuenta_id, usuario_id)
  VALUES (p_proveedor_id, 0, p_fecha, p_notas, p_estado, CASE WHEN p_estado = 'P' THEN p_fecha_venc END, v_cuenta, p_usuario_id)
  RETURNING id INTO v_compra_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_cant   := (v_item->>'cantidad')::NUMERIC;
    v_precio := (v_item->>'precio_unitario')::NUMERIC;
    v_var_id := NULLIF(v_item->>'variante_id', '')::BIGINT;

    IF v_cant IS NULL OR v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida en el producto %.', v_item->>'producto_id'; END IF;
    IF v_precio IS NULL OR v_precio < 0 THEN RAISE EXCEPTION 'Precio inválido en el producto %.', v_item->>'producto_id'; END IF;
    IF v_cant <> ROUND(v_cant, 2) OR v_precio <> ROUND(v_precio, 2) THEN
      RAISE EXCEPTION 'Cantidad y precio no pueden tener más de 2 decimales.';
    END IF;

    SELECT * INTO v_prod FROM productos WHERE id = (v_item->>'producto_id')::BIGINT FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto % no existe.', v_item->>'producto_id'; END IF;
    IF NOT v_prod.activo THEN RAISE EXCEPTION 'El producto "%" está inactivo.', v_prod.nombre; END IF;
    IF v_prod.es_compuesto THEN RAISE EXCEPTION 'El kit "%" no se compra: se compran sus componentes.', v_prod.nombre; END IF;

    v_con_var := EXISTS (SELECT 1 FROM variantes_producto WHERE producto_id = v_prod.id AND activo);
    IF v_con_var AND v_var_id IS NULL THEN
      RAISE EXCEPTION 'El producto "%" requiere elegir una variante.', v_prod.nombre;
    END IF;
    IF NOT v_con_var AND v_var_id IS NOT NULL THEN
      RAISE EXCEPTION 'El producto "%" no tiene variantes.', v_prod.nombre;
    END IF;

    -- Existencias antes de esta compra (de todo el producto) para el costo promedio
    IF v_con_var THEN
      SELECT COALESCE(SUM(stock), 0) INTO v_antes FROM variantes_producto WHERE producto_id = v_prod.id AND activo;
      UPDATE variantes_producto SET stock = stock + v_cant
       WHERE id = v_var_id AND producto_id = v_prod.id AND activo;
      IF NOT FOUND THEN RAISE EXCEPTION 'La variante % no existe o no pertenece al producto "%".', v_var_id, v_prod.nombre; END IF;
    ELSE
      v_antes := v_prod.stock;
      UPDATE productos SET stock = stock + v_cant WHERE id = v_prod.id;
    END IF;

    v_costo := CASE WHEN v_antes > 0 THEN ROUND((v_antes * v_prod.precio_compra + v_cant * v_precio) / (v_antes + v_cant), 2) ELSE v_precio END;
    UPDATE productos SET precio_compra = v_costo WHERE id = v_prod.id;

    v_sub := ROUND(v_cant * v_precio, 2);
    INSERT INTO detalle_compra (compra_id, producto_id, variante_id, cantidad, precio_unitario, subtotal)
    VALUES (v_compra_id, v_prod.id, v_var_id, v_cant, v_precio, v_sub);
    v_total := v_total + v_sub;
  END LOOP;

  UPDATE compras SET total = v_total WHERE id = v_compra_id;

  IF v_total > 0 THEN
    v_pid := crear_partida(
      p_fecha, 'Compra de inventario #' || v_compra_id, 'compra', v_compra_id, p_usuario_id,
      jsonb_build_array(
        jsonb_build_object('clave', 'inventario', 'debe', v_total),
        CASE WHEN p_estado = 'C' THEN jsonb_build_object('cuenta_id', v_cuenta, 'haber', v_total) ELSE jsonb_build_object('clave', 'cxp', 'haber', v_total) END
      )
    );
    UPDATE compras SET partida_id = v_pid WHERE id = v_compra_id;
  END IF;
  RETURN jsonb_build_object('compra_id', v_compra_id, 'partida_id', v_pid, 'total', v_total);
END;
$$;

-- ---------------------------------------------------------------------
-- ABONOS de clientes (Caja o Bancos / Cuentas por cobrar). Parciales o totales.
-- Cuando el saldo llega a cero, la venta (o el ingreso) pasa a cobrada.
-- ---------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION anular_abono_cliente(p_abono_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_a abonos_clientes%ROWTYPE;
BEGIN
  SELECT * INTO v_a FROM abonos_clientes WHERE id = p_abono_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El abono no existe.'; END IF;
  IF v_a.anulado THEN RAISE EXCEPTION 'El abono ya está anulado.'; END IF;

  IF v_a.venta_id IS NOT NULL THEN PERFORM 1 FROM ventas WHERE id = v_a.venta_id FOR UPDATE;
  ELSE PERFORM 1 FROM ingresos WHERE id = v_a.ingreso_id FOR UPDATE; END IF;

  PERFORM anular_partida(v_a.partida_id, p_usuario_id, COALESCE(p_motivo, 'abono anulado'));
  UPDATE abonos_clientes SET anulado = TRUE, anulado_en = NOW(), motivo_anulacion = p_motivo WHERE id = p_abono_id;

  -- La deuda vuelve a estar pendiente
  IF v_a.venta_id IS NOT NULL THEN UPDATE ventas SET estado = 'P' WHERE id = v_a.venta_id AND estado = 'C';
  ELSE UPDATE ingresos SET estado_cobro = 'P' WHERE id = v_a.ingreso_id AND estado_cobro = 'C'; END IF;
  RETURN jsonb_build_object('abono_id', p_abono_id);
END;
$$;

-- ---------------------------------------------------------------------
-- PAGOS a proveedores (Cuentas por pagar / Caja o Bancos). Parciales o totales.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_pago_proveedor(
  p_compra_id BIGINT, p_gasto_id BIGINT, p_monto NUMERIC, p_fecha DATE,
  p_cuenta_clave VARCHAR, p_notas TEXT, p_usuario_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_compra  compras%ROWTYPE;
  v_gasto   gastos%ROWTYPE;
  v_saldo   NUMERIC;
  v_nuevo   NUMERIC;
  v_fdoc    DATE;
  v_ref     TEXT;
  v_cuenta  BIGINT;
  v_pago    BIGINT;
  v_pid     BIGINT;
BEGIN
  IF (p_compra_id IS NULL) = (p_gasto_id IS NULL) THEN
    RAISE EXCEPTION 'Indica si el pago es de una compra o de un gasto por pagar.';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del pago debe ser mayor que cero.'; END IF;
  IF p_monto <> ROUND(p_monto, 2) THEN RAISE EXCEPTION 'El monto no puede tener más de 2 decimales.'; END IF;
  v_cuenta := cuenta_efectivo(p_cuenta_clave);
  p_fecha := COALESCE(p_fecha, hoy_negocio());

  IF p_compra_id IS NOT NULL THEN
    SELECT * INTO v_compra FROM compras WHERE id = p_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La compra no existe.'; END IF;
    IF v_compra.estado_pago <> 'P' THEN RAISE EXCEPTION 'La compra #% ya está pagada.', p_compra_id; END IF;
    v_saldo := ROUND(v_compra.total - COALESCE((SELECT SUM(monto) FROM pagos_proveedores WHERE compra_id = p_compra_id AND NOT anulado), 0), 2);
    v_fdoc  := v_compra.fecha;
    v_ref   := 'compra #' || p_compra_id;
  ELSE
    SELECT * INTO v_gasto FROM gastos WHERE id = p_gasto_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El gasto no existe.'; END IF;
    IF v_gasto.anulado THEN RAISE EXCEPTION 'El gasto está anulado.'; END IF;
    IF v_gasto.estado_pago <> 'P' THEN RAISE EXCEPTION 'El gasto "%" ya está pagado.', v_gasto.descripcion; END IF;
    v_saldo := ROUND(v_gasto.monto - COALESCE((SELECT SUM(monto) FROM pagos_proveedores WHERE gasto_id = p_gasto_id AND NOT anulado), 0), 2);
    v_fdoc  := v_gasto.fecha;
    v_ref   := 'gasto "' || v_gasto.descripcion || '"';
  END IF;

  IF p_monto > v_saldo THEN
    RAISE EXCEPTION 'El pago (%) es mayor que el saldo pendiente (%).', TO_CHAR(p_monto, 'FM999999990.00'), TO_CHAR(v_saldo, 'FM999999990.00');
  END IF;
  IF p_fecha < v_fdoc THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser anterior a la del documento (%).', TO_CHAR(v_fdoc, 'DD/MM/YYYY');
  END IF;

  INSERT INTO pagos_proveedores (compra_id, gasto_id, monto, fecha, cuenta_id, notas, usuario_id)
  VALUES (p_compra_id, p_gasto_id, p_monto, p_fecha, v_cuenta, p_notas, p_usuario_id)
  RETURNING id INTO v_pago;

  v_pid := crear_partida(
    p_fecha, 'Pago de ' || v_ref, 'pago_proveedor', v_pago, p_usuario_id,
    jsonb_build_array(jsonb_build_object('clave', 'cxp', 'debe', p_monto), jsonb_build_object('cuenta_id', v_cuenta, 'haber', p_monto))
  );
  UPDATE pagos_proveedores SET partida_id = v_pid WHERE id = v_pago;

  v_nuevo := ROUND(v_saldo - p_monto, 2);
  IF v_nuevo = 0 THEN
    IF p_compra_id IS NOT NULL THEN UPDATE compras SET estado_pago = 'C' WHERE id = p_compra_id;
    ELSE UPDATE gastos SET estado_pago = 'C' WHERE id = p_gasto_id; END IF;
  END IF;
  RETURN jsonb_build_object('pago_id', v_pago, 'partida_id', v_pid, 'saldo', v_nuevo, 'pagada', v_nuevo = 0);
END;
$$;

CREATE OR REPLACE FUNCTION anular_pago_proveedor(p_pago_id BIGINT, p_usuario_id BIGINT, p_motivo TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_p pagos_proveedores%ROWTYPE;
BEGIN
  SELECT * INTO v_p FROM pagos_proveedores WHERE id = p_pago_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pago no existe.'; END IF;
  IF v_p.anulado THEN RAISE EXCEPTION 'El pago ya está anulado.'; END IF;

  IF v_p.compra_id IS NOT NULL THEN PERFORM 1 FROM compras WHERE id = v_p.compra_id FOR UPDATE;
  ELSE PERFORM 1 FROM gastos WHERE id = v_p.gasto_id FOR UPDATE; END IF;

  PERFORM anular_partida(v_p.partida_id, p_usuario_id, COALESCE(p_motivo, 'pago anulado'));
  UPDATE pagos_proveedores SET anulado = TRUE, anulado_en = NOW(), motivo_anulacion = p_motivo WHERE id = p_pago_id;

  IF v_p.compra_id IS NOT NULL THEN UPDATE compras SET estado_pago = 'P' WHERE id = v_p.compra_id AND estado_pago = 'C';
  ELSE UPDATE gastos SET estado_pago = 'P' WHERE id = v_p.gasto_id AND estado_pago = 'C'; END IF;
  RETURN jsonb_build_object('pago_id', p_pago_id);
END;
$$;


-- ---------------------------------------------------------------------
-- Inicio automático de la contabilidad en bases que ya tienen datos
-- (en una base nueva y vacía se inicia desde Finanzas, o con generar_apertura_contable())
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM configuracion_negocio WHERE id = 1 AND contabilidad_inicio IS NULL)
     AND (EXISTS (SELECT 1 FROM ventas) OR EXISTS (SELECT 1 FROM productos)) THEN
    PERFORM generar_apertura_contable();
  END IF;
END $$;
