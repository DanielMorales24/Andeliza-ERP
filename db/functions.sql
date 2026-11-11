-- =====================================================================
-- functions.sql  |  Las RPCs críticas (correr DESPUÉS de las migraciones 01 a 08)
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


-- =====================================================================
-- SEGURIDAD (Fase 7): contraseñas, sesiones, roles y permisos
-- (Decisión de arquitectura D-01: esta fase se hizo antes que Estadísticas para que estas puedan medir por vendedor y por rol.)
-- Toda la lógica que decide si una cuenta entra, se bloquea o cambia de
-- contraseña vive aquí, en la base, para que sea atómica y no se pueda saltar.
-- Las contraseñas se guardan con bcrypt (pgcrypto). Se puede volver a correr completo.
-- =====================================================================

-- Anotar en la auditoría (la usan las demás funciones y también el servidor)
CREATE OR REPLACE FUNCTION registrar_auditoria(
  p_usuario_id BIGINT, p_accion VARCHAR, p_entidad VARCHAR, p_entidad_id BIGINT,
  p_descripcion TEXT, p_detalles JSONB DEFAULT NULL, p_ip TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_id BIGINT;
BEGIN
  INSERT INTO auditoria (usuario_id, accion, entidad, entidad_id, descripcion, detalles, ip)
  VALUES (p_usuario_id, LEFT(p_accion, 50), LEFT(p_entidad, 50), p_entidad_id, p_descripcion, p_detalles, LEFT(p_ip, 64))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION hash_contrasena(p_texto TEXT)
RETURNS TEXT
LANGUAGE sql VOLATILE
SET search_path = public, extensions
AS $$
  SELECT crypt(p_texto, gen_salt('bf', 10))
$$;

-- Política de contraseñas: 8 a 72 caracteres, con letras y números, y distinta del usuario
CREATE OR REPLACE FUNCTION validar_contrasena(p_texto TEXT, p_usuario TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_texto IS NULL OR LENGTH(p_texto) < 8 THEN
    RAISE EXCEPTION 'La contraseña debe tener al menos 8 caracteres.';
  END IF;
  IF OCTET_LENGTH(p_texto) > 72 THEN
    RAISE EXCEPTION 'La contraseña no puede tener más de 72 caracteres.';
  END IF;
  IF p_texto !~ '[[:alpha:]]' OR p_texto !~ '[0-9]' THEN
    RAISE EXCEPTION 'La contraseña debe combinar letras y números.';
  END IF;
  IF p_usuario IS NOT NULL AND LOWER(p_texto) = LOWER(p_usuario) THEN
    RAISE EXCEPTION 'La contraseña no puede ser igual al usuario.';
  END IF;
END;
$$;

-- Cuántos administradores activos hay, sin contar a uno (para no quedarse sin ninguno)
CREATE OR REPLACE FUNCTION otros_administradores_activos(p_excepto BIGINT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_n INT;
BEGIN
  PERFORM 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
   WHERE r.nombre = 'admin' AND r.es_sistema AND u.activo FOR UPDATE OF u;   -- serializa cambios simultáneos
  SELECT COUNT(*) INTO v_n FROM usuarios u JOIN roles r ON r.id = u.rol_id
   WHERE r.nombre = 'admin' AND r.es_sistema AND u.activo AND u.id <> p_excepto;
  RETURN v_n;
END;
$$;

-- ---------------------------------------------------------------------
-- Inicio de sesión. NO lanza error en los fallos: devuelve el motivo, para que el
-- conteo de intentos quede guardado (un error revertiría la transacción).
--   motivos: credenciales | bloqueado | inactivo | rol_inactivo
-- 5 intentos fallidos seguidos bloquean la cuenta 15 minutos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION autenticar_usuario(p_usuario TEXT, p_contrasena TEXT, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  u         usuarios%ROWTYPE;
  v_rol     roles%ROWTYPE;
  v_ok      BOOLEAN;
  c_maximo  CONSTANT INT := 5;
  c_minutos CONSTANT INT := 15;
BEGIN
  SELECT * INTO u FROM usuarios WHERE LOWER(usuario) = LOWER(BTRIM(COALESCE(p_usuario, ''))) FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM crypt(COALESCE(p_contrasena, ''), '$2a$10$abcdefghijklmnopqrstuu');   -- tarda lo mismo que un usuario real
    PERFORM registrar_auditoria(NULL, 'login_fallido', 'usuarios', NULL,
      'Intento de inicio de sesión con un usuario que no existe: ' || LEFT(COALESCE(p_usuario, ''), 60), NULL, p_ip);
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'credenciales');
  END IF;

  IF u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'bloqueado',
      'minutos', CEIL(EXTRACT(EPOCH FROM (u.bloqueado_hasta - NOW())) / 60)::INT);
  END IF;

  v_ok := (u.contrasena = crypt(COALESCE(p_contrasena, ''), u.contrasena));

  IF NOT v_ok THEN
    IF u.intentos_fallidos + 1 >= c_maximo THEN
      UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + (c_minutos || ' minutes')::INTERVAL WHERE id = u.id;
      PERFORM registrar_auditoria(u.id, 'cuenta_bloqueada', 'usuarios', u.id,
        'La cuenta de ' || u.usuario || ' se bloqueó ' || c_minutos || ' minutos por intentos fallidos', NULL, p_ip);
      RETURN jsonb_build_object('ok', FALSE, 'motivo', 'bloqueado', 'minutos', c_minutos);
    END IF;
    UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = u.id;
    PERFORM registrar_auditoria(u.id, 'login_fallido', 'usuarios', u.id, 'Contraseña incorrecta para ' || u.usuario, NULL, p_ip);
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'credenciales', 'restantes', c_maximo - (u.intentos_fallidos + 1));
  END IF;

  IF NOT u.activo THEN
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'inactivo');
  END IF;
  SELECT * INTO v_rol FROM roles WHERE id = u.rol_id;
  IF NOT v_rol.activo THEN
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'rol_inactivo');
  END IF;

  UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = u.id;
  PERFORM registrar_auditoria(u.id, 'login', 'usuarios', u.id, 'Inició sesión', NULL, p_ip);
  RETURN jsonb_build_object('ok', TRUE, 'usuario_id', u.id, 'debe_cambiar', u.debe_cambiar_contrasena, 'sesion_version', u.sesion_version);
END;
$$;

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_usuario(
  p_nombre TEXT, p_usuario TEXT, p_contrasena TEXT, p_rol_id BIGINT, p_debe_cambiar BOOLEAN, p_actor_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rol roles%ROWTYPE;
  v_id  BIGINT;
  v_usuario TEXT := BTRIM(COALESCE(p_usuario, ''));
BEGIN
  IF BTRIM(COALESCE(p_nombre, '')) = '' THEN RAISE EXCEPTION 'El nombre es obligatorio.'; END IF;
  IF LENGTH(p_nombre) > 150 THEN RAISE EXCEPTION 'El nombre es demasiado largo.'; END IF;
  IF v_usuario !~ '^[A-Za-z0-9._-]{3,60}$' THEN
    RAISE EXCEPTION 'El usuario debe tener de 3 a 60 caracteres: letras, números, punto, guion o guion bajo.';
  END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE LOWER(usuario) = LOWER(v_usuario)) THEN
    RAISE EXCEPTION 'Ya existe un usuario con ese nombre de usuario.';
  END IF;
  SELECT * INTO v_rol FROM roles WHERE id = p_rol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rol elegido no existe.'; END IF;
  IF NOT v_rol.activo THEN RAISE EXCEPTION 'El rol "%" está desactivado.', v_rol.nombre; END IF;
  PERFORM validar_contrasena(p_contrasena, v_usuario);

  INSERT INTO usuarios (nombre, usuario, contrasena, rol_id, debe_cambiar_contrasena, contrasena_cambiada_en)
  VALUES (BTRIM(p_nombre), v_usuario, hash_contrasena(p_contrasena), p_rol_id, COALESCE(p_debe_cambiar, TRUE), NOW())
  RETURNING id INTO v_id;

  PERFORM registrar_auditoria(p_actor_id, 'crear_usuario', 'usuarios', v_id,
    'Creó al usuario ' || v_usuario || ' con el rol ' || v_rol.nombre, NULL, NULL);
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION actualizar_usuario(p_id BIGINT, p_nombre TEXT, p_rol_id BIGINT, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  u        usuarios%ROWTYPE;
  v_actual roles%ROWTYPE;
  v_nuevo  roles%ROWTYPE;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe.'; END IF;
  IF BTRIM(COALESCE(p_nombre, '')) = '' THEN RAISE EXCEPTION 'El nombre es obligatorio.'; END IF;
  IF LENGTH(p_nombre) > 150 THEN RAISE EXCEPTION 'El nombre es demasiado largo.'; END IF;

  SELECT * INTO v_actual FROM roles WHERE id = u.rol_id;
  SELECT * INTO v_nuevo  FROM roles WHERE id = p_rol_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rol elegido no existe.'; END IF;

  IF p_rol_id <> u.rol_id THEN
    IF p_id = p_actor_id THEN RAISE EXCEPTION 'No puedes cambiar tu propio rol.'; END IF;
    IF NOT v_nuevo.activo THEN RAISE EXCEPTION 'El rol "%" está desactivado.', v_nuevo.nombre; END IF;
    IF v_actual.nombre = 'admin' AND v_actual.es_sistema AND u.activo AND otros_administradores_activos(p_id) = 0 THEN
      RAISE EXCEPTION 'Debe quedar al menos un administrador activo.';
    END IF;
  END IF;

  UPDATE usuarios SET nombre = BTRIM(p_nombre), rol_id = p_rol_id WHERE id = p_id;
  PERFORM registrar_auditoria(p_actor_id, 'actualizar_usuario', 'usuarios', p_id,
    'Actualizó al usuario ' || u.usuario || CASE WHEN p_rol_id <> u.rol_id THEN ' (rol: ' || v_actual.nombre || ' a ' || v_nuevo.nombre || ')' ELSE '' END, NULL, NULL);
  RETURN jsonb_build_object('id', p_id);
END;
$$;

-- Activar o desactivar. Al desactivar se suben la versión de sesión: la persona queda fuera YA.
CREATE OR REPLACE FUNCTION cambiar_estado_usuario(p_id BIGINT, p_activo BOOLEAN, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  u     usuarios%ROWTYPE;
  v_rol roles%ROWTYPE;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe.'; END IF;
  IF u.activo = p_activo THEN RETURN jsonb_build_object('id', p_id, 'sin_cambios', TRUE); END IF;
  SELECT * INTO v_rol FROM roles WHERE id = u.rol_id;

  IF NOT p_activo THEN
    IF p_id = p_actor_id THEN RAISE EXCEPTION 'No puedes desactivar tu propia cuenta.'; END IF;
    IF v_rol.nombre = 'admin' AND v_rol.es_sistema AND otros_administradores_activos(p_id) = 0 THEN
      RAISE EXCEPTION 'Debe quedar al menos un administrador activo.';
    END IF;
    UPDATE usuarios SET activo = FALSE, sesion_version = sesion_version + 1 WHERE id = p_id;
  ELSE
    UPDATE usuarios SET activo = TRUE, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = p_id;
  END IF;

  PERFORM registrar_auditoria(p_actor_id, CASE WHEN p_activo THEN 'activar_usuario' ELSE 'desactivar_usuario' END, 'usuarios', p_id,
    CASE WHEN p_activo THEN 'Reactivó al usuario ' ELSE 'Desactivó al usuario ' END || u.usuario, NULL, NULL);
  RETURN jsonb_build_object('id', p_id, 'activo', p_activo);
END;
$$;

-- ---------------------------------------------------------------------
-- Cambio de contraseña por la propia persona (pide la actual)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cambiar_contrasena(p_usuario_id BIGINT, p_actual TEXT, p_nueva TEXT, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  u usuarios%ROWTYPE;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe o está desactivado.'; END IF;
  PERFORM validar_contrasena(p_nueva, u.usuario);

  IF u.contrasena <> crypt(COALESCE(p_actual, ''), u.contrasena) THEN
    IF u.intentos_fallidos + 1 >= 5 THEN
      UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL '15 minutes', sesion_version = sesion_version + 1 WHERE id = u.id;
    ELSE
      UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = u.id;
    END IF;
    PERFORM registrar_auditoria(u.id, 'cambio_contrasena_fallido', 'usuarios', u.id, 'Contraseña actual incorrecta al intentar cambiarla', NULL, p_ip);
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'actual_incorrecta');
  END IF;
  IF u.contrasena = crypt(p_nueva, u.contrasena) THEN
    RAISE EXCEPTION 'La nueva contraseña debe ser distinta de la actual.';
  END IF;

  UPDATE usuarios
     SET contrasena = hash_contrasena(p_nueva), debe_cambiar_contrasena = FALSE, intentos_fallidos = 0, bloqueado_hasta = NULL,
         contrasena_cambiada_en = NOW(), sesion_version = sesion_version + 1
   WHERE id = u.id;
  PERFORM registrar_auditoria(u.id, 'cambiar_contrasena', 'usuarios', u.id, 'Cambió su contraseña', NULL, p_ip);
  RETURN jsonb_build_object('ok', TRUE, 'sesion_version', u.sesion_version + 1);
END;
$$;

-- ---------------------------------------------------------------------
-- Recuperación: el administrador genera un código temporal (30 minutos, un solo uso)
-- y la persona lo usa para elegir una contraseña nueva. Se guarda solo el hash del código.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION generar_codigo_recuperacion(p_usuario_id BIGINT, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  u         usuarios%ROWTYPE;
  v_alfabeto CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   -- sin 0, O, 1, I (no se confunden)
  v_bytes   BYTEA := gen_random_bytes(8);
  v_codigo  TEXT := '';
  v_expira  TIMESTAMPTZ := NOW() + INTERVAL '30 minutes';
  i INT;
BEGIN
  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El usuario no existe.'; END IF;
  IF NOT u.activo THEN RAISE EXCEPTION 'El usuario está desactivado: reactívalo antes de generar un código.'; END IF;

  FOR i IN 0..7 LOOP
    v_codigo := v_codigo || SUBSTR(v_alfabeto, (get_byte(v_bytes, i) % 32) + 1, 1);
  END LOOP;

  UPDATE recuperacion_contrasena SET usado = TRUE, usado_en = NOW() WHERE usuario_id = u.id AND NOT usado;   -- el anterior queda inválido
  INSERT INTO recuperacion_contrasena (usuario_id, codigo, expiracion, creado_por)
  VALUES (u.id, encode(digest(v_codigo, 'sha256'), 'hex'), v_expira, p_actor_id);

  PERFORM registrar_auditoria(p_actor_id, 'generar_codigo_recuperacion', 'usuarios', u.id,
    'Generó un código de recuperación de contraseña para ' || u.usuario, NULL, NULL);
  RETURN jsonb_build_object('codigo', SUBSTR(v_codigo, 1, 4) || '-' || SUBSTR(v_codigo, 5, 4), 'expiracion', v_expira, 'minutos', 30);
END;
$$;

-- Usa el código. Los fallos NO lanzan error (para guardar el conteo de intentos y bloquear).
CREATE OR REPLACE FUNCTION usar_codigo_recuperacion(p_usuario TEXT, p_codigo TEXT, p_nueva TEXT, p_ip TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  u        usuarios%ROWTYPE;
  v_norm   TEXT := UPPER(REGEXP_REPLACE(COALESCE(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_id     BIGINT;
BEGIN
  SELECT * INTO u FROM usuarios WHERE LOWER(usuario) = LOWER(BTRIM(COALESCE(p_usuario, ''))) FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'codigo_invalido');
  END IF;
  IF u.bloqueado_hasta IS NOT NULL AND u.bloqueado_hasta > NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'bloqueado', 'minutos', CEIL(EXTRACT(EPOCH FROM (u.bloqueado_hasta - NOW())) / 60)::INT);
  END IF;

  PERFORM validar_contrasena(p_nueva, u.usuario);   -- una contraseña débil se rechaza sin gastar el código

  SELECT id INTO v_id FROM recuperacion_contrasena
   WHERE usuario_id = u.id AND NOT usado AND expiracion > NOW() AND codigo = encode(digest(v_norm, 'sha256'), 'hex')
   FOR UPDATE;

  IF v_id IS NULL OR NOT u.activo THEN
    IF u.intentos_fallidos + 1 >= 5 THEN
      UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = NOW() + INTERVAL '15 minutes' WHERE id = u.id;
      PERFORM registrar_auditoria(u.id, 'cuenta_bloqueada', 'usuarios', u.id,
        'La cuenta de ' || u.usuario || ' se bloqueó 15 minutos por intentos fallidos con códigos de recuperación', NULL, p_ip);
      RETURN jsonb_build_object('ok', FALSE, 'motivo', 'bloqueado', 'minutos', 15);
    END IF;
    UPDATE usuarios SET intentos_fallidos = intentos_fallidos + 1 WHERE id = u.id;
    PERFORM registrar_auditoria(u.id, 'recuperacion_fallida', 'usuarios', u.id, 'Código de recuperación incorrecto o vencido para ' || u.usuario, NULL, p_ip);
    RETURN jsonb_build_object('ok', FALSE, 'motivo', 'codigo_invalido');
  END IF;

  UPDATE recuperacion_contrasena SET usado = TRUE, usado_en = NOW() WHERE usuario_id = u.id AND NOT usado;
  UPDATE usuarios
     SET contrasena = hash_contrasena(p_nueva), debe_cambiar_contrasena = FALSE, intentos_fallidos = 0, bloqueado_hasta = NULL,
         contrasena_cambiada_en = NOW(), sesion_version = sesion_version + 1
   WHERE id = u.id;
  PERFORM registrar_auditoria(u.id, 'recuperar_contrasena', 'usuarios', u.id, 'Cambió su contraseña con un código de recuperación', NULL, p_ip);
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- ---------------------------------------------------------------------
-- Roles y permisos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_rol(p_nombre TEXT, p_descripcion TEXT, p_copiar_de BIGINT, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_nombre TEXT := BTRIM(COALESCE(p_nombre, ''));
  v_id     BIGINT;
BEGIN
  IF LENGTH(v_nombre) < 2 OR LENGTH(v_nombre) > 40 THEN RAISE EXCEPTION 'El nombre del rol debe tener de 2 a 40 caracteres.'; END IF;
  IF EXISTS (SELECT 1 FROM roles WHERE LOWER(nombre) = LOWER(v_nombre)) THEN RAISE EXCEPTION 'Ya existe un rol con ese nombre.'; END IF;
  IF LENGTH(COALESCE(p_descripcion, '')) > 200 THEN RAISE EXCEPTION 'La descripción es demasiado larga (máximo 200 caracteres).'; END IF;

  INSERT INTO roles (nombre, descripcion) VALUES (v_nombre, NULLIF(BTRIM(COALESCE(p_descripcion, '')), '')) RETURNING id INTO v_id;

  IF p_copiar_de IS NOT NULL THEN       -- parte de los permisos de otro rol (menos Configuración)
    INSERT INTO roles_permisos (rol_id, permiso_id)
    SELECT v_id, rp.permiso_id FROM roles_permisos rp JOIN permisos p ON p.id = rp.permiso_id
     WHERE rp.rol_id = p_copiar_de AND p.modulo <> 'configuracion';
  END IF;

  PERFORM registrar_auditoria(p_actor_id, 'crear_rol', 'roles', v_id, 'Creó el rol ' || v_nombre, NULL, NULL);
  RETURN jsonb_build_object('id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION actualizar_rol(p_id BIGINT, p_nombre TEXT, p_descripcion TEXT, p_activo BOOLEAN, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r        roles%ROWTYPE;
  v_nombre TEXT := BTRIM(COALESCE(p_nombre, ''));
  v_n      INT;
BEGIN
  SELECT * INTO r FROM roles WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rol no existe.'; END IF;
  IF LENGTH(COALESCE(p_descripcion, '')) > 200 THEN RAISE EXCEPTION 'La descripción es demasiado larga (máximo 200 caracteres).'; END IF;

  IF r.es_sistema THEN
    IF LOWER(v_nombre) <> LOWER(r.nombre) THEN RAISE EXCEPTION 'Los roles de fábrica no se pueden renombrar.'; END IF;
    v_nombre := r.nombre;
  ELSE
    IF LENGTH(v_nombre) < 2 OR LENGTH(v_nombre) > 40 THEN RAISE EXCEPTION 'El nombre del rol debe tener de 2 a 40 caracteres.'; END IF;
    IF EXISTS (SELECT 1 FROM roles WHERE LOWER(nombre) = LOWER(v_nombre) AND id <> p_id) THEN RAISE EXCEPTION 'Ya existe un rol con ese nombre.'; END IF;
  END IF;

  IF NOT p_activo AND r.activo THEN
    IF r.nombre = 'admin' AND r.es_sistema THEN RAISE EXCEPTION 'El rol administrador no se puede desactivar.'; END IF;
    SELECT COUNT(*) INTO v_n FROM usuarios WHERE rol_id = p_id AND activo;
    IF v_n > 0 THEN RAISE EXCEPTION 'El rol tiene % usuario(s) activo(s). Cámbiales el rol antes de desactivarlo.', v_n; END IF;
  END IF;

  UPDATE roles SET nombre = v_nombre, descripcion = NULLIF(BTRIM(COALESCE(p_descripcion, '')), ''), activo = p_activo WHERE id = p_id;
  PERFORM registrar_auditoria(p_actor_id, 'actualizar_rol', 'roles', p_id, 'Actualizó el rol ' || v_nombre || CASE WHEN p_activo <> r.activo THEN (CASE WHEN p_activo THEN ' (activado)' ELSE ' (desactivado)' END) ELSE '' END, NULL, NULL);
  RETURN jsonb_build_object('id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION eliminar_rol(p_id BIGINT, p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r roles%ROWTYPE;
BEGIN
  SELECT * INTO r FROM roles WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rol no existe.'; END IF;
  IF r.es_sistema THEN RAISE EXCEPTION 'Los roles de fábrica no se pueden eliminar.'; END IF;
  IF EXISTS (SELECT 1 FROM usuarios WHERE rol_id = p_id) THEN RAISE EXCEPTION 'El rol tiene usuarios asignados. Cámbiales el rol antes de eliminarlo.'; END IF;
  DELETE FROM roles WHERE id = p_id;
  PERFORM registrar_auditoria(p_actor_id, 'eliminar_rol', 'roles', p_id, 'Eliminó el rol ' || r.nombre, NULL, NULL);
  RETURN jsonb_build_object('id', p_id);
END;
$$;

-- Reemplaza los permisos de un rol. Reglas: el admin no se toca, Configuración es solo del admin,
-- y cualquier acción (crear, editar, eliminar) exige también "ver" en ese módulo.
CREATE OR REPLACE FUNCTION guardar_permisos_rol(p_rol_id BIGINT, p_permiso_ids BIGINT[], p_actor_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  r        roles%ROWTYPE;
  v_ids    BIGINT[] := COALESCE(ARRAY(SELECT DISTINCT x FROM UNNEST(COALESCE(p_permiso_ids, '{}'::BIGINT[])) x), '{}');
  v_mal    BIGINT;
  v_pre    TEXT;
  v_agregados TEXT[];
  v_quitados  TEXT[];
BEGIN
  SELECT * INTO r FROM roles WHERE id = p_rol_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El rol no existe.'; END IF;
  IF r.nombre = 'admin' AND r.es_sistema THEN RAISE EXCEPTION 'Los permisos del administrador no se pueden cambiar.'; END IF;

  SELECT x INTO v_mal FROM UNNEST(v_ids) x WHERE NOT EXISTS (SELECT 1 FROM permisos WHERE id = x) LIMIT 1;
  IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'El permiso % no existe.', v_mal; END IF;

  IF EXISTS (SELECT 1 FROM permisos WHERE id = ANY(v_ids) AND modulo = 'configuracion') THEN
    RAISE EXCEPTION 'Los permisos de Configuración son solo del administrador.';
  END IF;

  SELECT p.modulo || ' (' || p.accion || ')' INTO v_pre
    FROM permisos p
   WHERE p.id = ANY(v_ids) AND p.accion NOT IN ('ver', 'ver_propias')
     AND NOT EXISTS (SELECT 1 FROM permisos v WHERE v.modulo = p.modulo AND v.accion = 'ver' AND v.id = ANY(v_ids))
   LIMIT 1;
  IF v_pre IS NOT NULL THEN
    RAISE EXCEPTION 'Para dar permiso en % también hace falta el permiso de ver de ese módulo.', v_pre;
  END IF;

  SELECT COALESCE(ARRAY_AGG(p.modulo || '.' || p.accion ORDER BY p.modulo, p.accion), '{}') INTO v_agregados
    FROM permisos p WHERE p.id = ANY(v_ids) AND NOT EXISTS (SELECT 1 FROM roles_permisos x WHERE x.rol_id = p_rol_id AND x.permiso_id = p.id);
  SELECT COALESCE(ARRAY_AGG(p.modulo || '.' || p.accion ORDER BY p.modulo, p.accion), '{}') INTO v_quitados
    FROM roles_permisos x JOIN permisos p ON p.id = x.permiso_id WHERE x.rol_id = p_rol_id AND NOT (x.permiso_id = ANY(v_ids));

  DELETE FROM roles_permisos WHERE rol_id = p_rol_id;
  INSERT INTO roles_permisos (rol_id, permiso_id) SELECT p_rol_id, UNNEST(v_ids);

  PERFORM registrar_auditoria(p_actor_id, 'cambiar_permisos_rol', 'roles', p_rol_id,
    'Cambió los permisos del rol ' || r.nombre || ' (+' || COALESCE(ARRAY_LENGTH(v_agregados, 1), 0) || ' / -' || COALESCE(ARRAY_LENGTH(v_quitados, 1), 0) || ')',
    jsonb_build_object('agregados', v_agregados, 'quitados', v_quitados), NULL);
  RETURN jsonb_build_object('rol_id', p_rol_id, 'total', COALESCE(ARRAY_LENGTH(v_ids, 1), 0), 'agregados', v_agregados, 'quitados', v_quitados);
END;
$$;
