-- =====================================================================
-- seed_finanzas_demo.sql  |  OPCIONAL: movimientos de dinero de ejemplo para probar Finanzas
-- Correr DESPUÉS de functions_es.sql y de un seed de catálogo (seed_deportes o seed_ferreteria_ejemplo).
-- Si la contabilidad todavía no se inició, la inicia 120 días atrás; si ya estaba iniciada,
-- acomoda las fechas de ejemplo a partir de su día de inicio. NO usar en una base de un cliente real.
-- =====================================================================

SELECT generar_apertura_contable(hoy_negocio() - 120);

DO $$
DECLARE
  v_ini   DATE;
  v_user  BIGINT;
  v_prov  BIGINT;
  v_p1    BIGINT;
  v_p2    BIGINT;
  i       INT;
  f       DATE;
  fecha   DATE;
BEGIN
  SELECT contabilidad_inicio INTO v_ini FROM configuracion_negocio WHERE id = 1;
  SELECT id INTO v_user FROM usuarios ORDER BY id LIMIT 1;
  SELECT id INTO v_prov FROM proveedores ORDER BY id LIMIT 1;
  SELECT id INTO v_p1 FROM productos p WHERE activo AND NOT es_compuesto AND NOT EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id) ORDER BY id LIMIT 1;
  SELECT id INTO v_p2 FROM productos p WHERE activo AND NOT es_compuesto AND NOT EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id) ORDER BY id OFFSET 1 LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM partidas WHERE origen_tipo = 'saldo_inicial') THEN
    PERFORM registrar_saldo_inicial('caja',   15000, v_ini, v_user);
    PERFORM registrar_saldo_inicial('bancos', 40000, v_ini, v_user);
  END IF;

  -- Cuatro meses de ingresos y gastos corrientes (nunca antes del inicio de la contabilidad)
  FOR i IN 0..3 LOOP
    f := GREATEST(hoy_negocio() - (i * 30 + 12), v_ini);
    PERFORM registrar_ingreso('alquileres', 'Alquiler de local', 4500, f, NULL, 'C', 'bancos', NULL, NULL, v_user);
    PERFORM registrar_gasto('operativos', 'Energía eléctrica', 1800 + i * 150, f, NULL, 'C', 'caja', NULL, NULL, v_user);
    PERFORM registrar_gasto('marketing', 'Publicidad en redes', 900 + i * 100, LEAST(f + 3, hoy_negocio()), NULL, 'C', 'bancos', NULL, NULL, v_user);
    PERFORM registrar_gasto('logistica', 'Flete de mercadería', 1200, LEAST(f + 5, hoy_negocio()), NULL, 'C', 'caja', NULL, NULL, v_user);
  END LOOP;

  -- Algo por cobrar (una deuda ya vencida) y algo por pagar
  fecha := GREATEST(hoy_negocio() - 50, v_ini);
  PERFORM registrar_ingreso('servicios', 'Estampado de uniformes para el club', 3200, fecha, NULL, 'P', NULL, NULL, GREATEST(hoy_negocio() - 20, fecha), v_user);
  PERFORM registrar_ingreso('servicios', 'Servicio de personalización', 850, GREATEST(hoy_negocio() - 3, v_ini), NULL, 'P', NULL, NULL, hoy_negocio() + 12, v_user);
  PERFORM registrar_gasto('mantenimiento', 'Reparación de vitrina', 650, GREATEST(hoy_negocio() - 8, v_ini), NULL, 'P', NULL, NULL, hoy_negocio() + 7, v_user);

  -- Una compra de mercadería pagada y otra por pagar
  IF v_p1 IS NOT NULL THEN
    PERFORM registrar_compra(v_prov, jsonb_build_array(jsonb_build_object('producto_id', v_p1, 'cantidad', 20, 'precio_unitario', (SELECT precio_compra FROM productos WHERE id = v_p1))),
                             GREATEST(hoy_negocio() - 25, v_ini), NULL, 'C', 'bancos', NULL, v_user);
  END IF;
  IF v_p2 IS NOT NULL THEN
    PERFORM registrar_compra(v_prov, jsonb_build_array(jsonb_build_object('producto_id', v_p2, 'cantidad', 30, 'precio_unitario', (SELECT precio_compra FROM productos WHERE id = v_p2))),
                             GREATEST(hoy_negocio() - 6, v_ini), 'Pedido de reposición', 'P', NULL, hoy_negocio() + 24, v_user);
  END IF;
END $$;
