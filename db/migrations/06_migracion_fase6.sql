-- =====================================================================
-- 06_migracion_fase6.sql  |  Estadísticas (Fase 6, historia HU-27)
--
-- Qué hace
--   * Agrega el único índice que faltaba (ventas.usuario_id). Los otros tres que
--     pedía la fase (creado_en, venta_id del detalle y estado) ya existen desde la
--     Fase 1: aquí se repiten con IF NOT EXISTS y no hacen nada.
--   * Crea funciones de SOLO LECTURA que devuelven JSON. No crea tablas, no cambia
--     columnas, no toca datos y no modifica ninguna función existente (crear_venta,
--     contabilizar_venta, etc. quedan exactamente como están).
--
-- Cómo se ejecuta: ANTES del git push (al revés que la 05). Es solo aditiva: el código
-- anterior no la nota, y el código nuevo la necesita, porque el panel de inicio y
-- /estadisticas llaman a estas funciones (sin ellas esas pantallas dan error hasta que corra).
-- Ya trae BEGIN y COMMIT: se aplica completo o no se aplica, y si falla no queda nada a medias.
-- Se puede ejecutar más de una vez (todo es IF NOT EXISTS / CREATE OR REPLACE).
-- Requiere lo que ya existe desde la Fase 4: fecha_local() y hoy_negocio(). No depende de functions.sql.
--
-- Criterios de cálculo (todos los períodos se miden por el DÍA LOCAL del negocio)
--   * Una venta cuenta sea cobrada (C) o a crédito (P). No existen ventas anuladas.
--   * "Ventas totales" incluye el impuesto, igual que Facturas y el panel de inicio.
--   * El margen bruto se calcula SIN impuesto: (precio - costo) x cantidad, con el
--     costo_unitario que cada venta guardó al momento de venderse. Los kits ya
--     guardan la suma del costo de sus componentes.
--   * Con filtro por categoría, una venta cuenta solo por sus líneas de esa categoría y su
--     impuesto se reparte en proporción (la suma por líneas coincide con el total de la venta).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Índices (verificados contra db/migrations antes de escribir esto)
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ventas_creado_en    ON ventas (creado_en);          -- ya existe (Fase 1)
CREATE INDEX IF NOT EXISTS idx_detalle_venta_venta ON detalle_venta (venta_id);    -- ya existe (Fase 1)
CREATE INDEX IF NOT EXISTS idx_ventas_estado       ON ventas (estado);             -- ya existe (Fase 1)
CREATE INDEX IF NOT EXISTS idx_ventas_usuario      ON ventas (usuario_id);         -- NUEVO: ranking y filtro por vendedor


-- ---------------------------------------------------------------------
-- 2. Piezas comunes
-- ---------------------------------------------------------------------

-- Zona horaria del negocio (la misma que usa fecha_local)
CREATE OR REPLACE FUNCTION zona_negocio()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE((SELECT zona_horaria FROM configuracion_negocio WHERE id = 1), 'America/Tegucigalpa')
$$;

-- Una fila por línea de venta del período, con sus importes ya calculados.
-- El filtro de fechas compara contra creado_en (así puede usar el índice) con los límites
-- del día local: de las 00:00 del día inicial a las 00:00 del día siguiente al final.
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
$$;


-- ---------------------------------------------------------------------
-- 3. Indicadores del período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_kpis(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH l AS (SELECT * FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria)),
       f AS (SELECT venta_id, MIN(tipo_documento) AS tipo, MIN(estado) AS estado, SUM(bruto) AS bruto
               FROM l GROUP BY venta_id)
  SELECT jsonb_build_object(
    'ventas_total',        ROUND(COALESCE((SELECT SUM(bruto) FROM f), 0), 2),
    'ventas_netas',        ROUND(COALESCE((SELECT SUM(neto) FROM l), 0), 2),
    'facturas',            (SELECT COUNT(*) FROM f),
    'ticket_promedio',     ROUND(COALESCE((SELECT SUM(bruto) / NULLIF(COUNT(*), 0) FROM f), 0), 2),
    'costo',               ROUND(COALESCE((SELECT SUM(costo) FROM l), 0), 2),
    'margen',              ROUND(COALESCE((SELECT SUM(neto - costo) FROM l), 0), 2),
    'margen_pct',          COALESCE(ROUND((SELECT SUM(neto - costo) / NULLIF(SUM(neto), 0) * 100 FROM l), 1), 0),
    'cobertura_costo_pct', COALESCE(ROUND((SELECT SUM(neto) FILTER (WHERE con_costo) / NULLIF(SUM(neto), 0) * 100 FROM l), 1), 100),
    'productos_distintos', (SELECT COUNT(DISTINCT producto_id) FROM l),
    'unidades',            COALESCE((SELECT SUM(cantidad) FROM l), 0),
    'facturas_fiscales',   (SELECT COUNT(*) FROM f WHERE tipo = 'fiscal'),
    'facturas_internas',   (SELECT COUNT(*) FROM f WHERE tipo = 'interno'),
    'monto_fiscal',        ROUND(COALESCE((SELECT SUM(bruto) FROM f WHERE tipo = 'fiscal'), 0), 2),
    'monto_interno',       ROUND(COALESCE((SELECT SUM(bruto) FROM f WHERE tipo = 'interno'), 0), 2),
    'facturas_credito',    (SELECT COUNT(*) FROM f WHERE estado = 'P'),
    'monto_credito',       ROUND(COALESCE((SELECT SUM(bruto) FROM f WHERE estado = 'P'), 0), 2)
  )
$$;


-- ---------------------------------------------------------------------
-- 4. Ventas a lo largo del tiempo (rellena con ceros los períodos sin ventas)
--    p_agrupar: 'dia' | 'semana' | 'mes' | NULL (automático: hasta 62 días por día,
--    hasta 270 por semana y más por mes). La semana empieza el lunes.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_serie(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL, p_agrupar TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH u AS (
    SELECT x.unidad,
           CASE x.unidad WHEN 'dia' THEN 'day' WHEN 'semana' THEN 'week' ELSE 'month' END AS trunc,
           CASE x.unidad WHEN 'dia' THEN INTERVAL '1 day' WHEN 'semana' THEN INTERVAL '1 week' ELSE INTERVAL '1 month' END AS paso
      FROM (SELECT CASE WHEN p_agrupar IN ('dia', 'semana', 'mes') THEN p_agrupar
                        WHEN p_hasta - p_desde + 1 <= 62 THEN 'dia'
                        WHEN p_hasta - p_desde + 1 <= 270 THEN 'semana'
                        ELSE 'mes' END AS unidad) x
  ),
  g AS (
    SELECT date_trunc((SELECT trunc FROM u), l.fecha::timestamp)::date AS inicio,
           SUM(l.bruto) AS total, COUNT(DISTINCT l.venta_id) AS facturas
      FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria) l
     GROUP BY 1
  ),
  p AS (
    SELECT s::date AS inicio
      FROM generate_series(date_trunc((SELECT trunc FROM u), p_desde::timestamp), p_hasta::timestamp, (SELECT paso FROM u)) s
  )
  SELECT jsonb_build_object(
    'agrupar', (SELECT unidad FROM u),
    'puntos', COALESCE((SELECT jsonb_agg(jsonb_build_object('inicio', p.inicio, 'total', ROUND(COALESCE(g.total, 0), 2),
                                                              'facturas', COALESCE(g.facturas, 0)) ORDER BY p.inicio)
                          FROM p LEFT JOIN g ON g.inicio = p.inicio), '[]'::jsonb)
  )
$$;


-- ---------------------------------------------------------------------
-- 5. Productos más vendidos: por cantidad y por monto, y el de mejor margen
--    (el margen % solo se calcula sobre líneas con costo registrado)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_top_productos(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL, p_limite INT DEFAULT 10
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH g AS (
    SELECT l.producto_id, p.nombre, p.imagen_url,
           SUM(l.cantidad) AS unidades, SUM(l.bruto) AS monto, SUM(l.neto) AS neto, SUM(l.neto - l.costo) AS margen,
           SUM(l.neto) FILTER (WHERE l.con_costo) AS neto_con_costo,
           SUM(l.neto - l.costo) FILTER (WHERE l.con_costo) AS margen_con_costo,
           COUNT(DISTINCT l.venta_id) AS facturas
      FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria) l
      JOIN productos p ON p.id = l.producto_id
     GROUP BY l.producto_id, p.nombre, p.imagen_url
  ),
  fila AS (
    SELECT producto_id, unidades, monto,
           jsonb_build_object('producto_id', producto_id, 'nombre', nombre, 'imagen_url', imagen_url, 'unidades', unidades,
                              'monto', ROUND(monto, 2), 'margen', ROUND(margen, 2),
                              'margen_pct', CASE WHEN neto > 0 THEN ROUND(margen / neto * 100, 1) ELSE 0 END,
                              'facturas', facturas) AS j
      FROM g
  )
  SELECT jsonb_build_object(
    'por_cantidad', COALESCE((SELECT jsonb_agg(t.j ORDER BY t.unidades DESC, t.monto DESC, t.producto_id)
                                FROM (SELECT * FROM fila ORDER BY unidades DESC, monto DESC, producto_id LIMIT p_limite) t), '[]'::jsonb),
    'por_monto',    COALESCE((SELECT jsonb_agg(t.j ORDER BY t.monto DESC, t.unidades DESC, t.producto_id)
                                FROM (SELECT * FROM fila ORDER BY monto DESC, unidades DESC, producto_id LIMIT p_limite) t), '[]'::jsonb),
    'mejor_margen', (SELECT jsonb_build_object('producto_id', producto_id, 'nombre', nombre, 'unidades', unidades,
                                               'margen_pct', ROUND(margen_con_costo / neto_con_costo * 100, 1))
                       FROM g WHERE neto_con_costo > 0
                      ORDER BY margen_con_costo / neto_con_costo DESC, margen_con_costo DESC, producto_id LIMIT 1)
  )
$$;


-- ---------------------------------------------------------------------
-- 6. Categorías con más ventas: las primeras N y el resto agrupado en "otras"
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_top_categorias(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL, p_limite INT DEFAULT 5
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH g AS (
    SELECT l.categoria_id, COALESCE(c.nombre, 'Sin categoría') AS nombre, SUM(l.bruto) AS monto, SUM(l.cantidad) AS unidades
      FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria) l
      LEFT JOIN categorias c ON c.id = l.categoria_id
     GROUP BY l.categoria_id, COALESCE(c.nombre, 'Sin categoría')
  ),
  top AS (SELECT * FROM g ORDER BY monto DESC, nombre LIMIT p_limite)
  SELECT jsonb_build_object(
    'categorias', COALESCE((SELECT jsonb_agg(jsonb_build_object('categoria_id', categoria_id, 'nombre', nombre,
                                                                'monto', ROUND(monto, 2), 'unidades', unidades)
                                             ORDER BY monto DESC, nombre) FROM top), '[]'::jsonb),
    'otras', ROUND(COALESCE((SELECT SUM(monto) FROM g), 0) - COALESCE((SELECT SUM(monto) FROM top), 0), 2),
    'total', ROUND(COALESCE((SELECT SUM(monto) FROM g), 0), 2)
  )
$$;


-- ---------------------------------------------------------------------
-- 7. Ranking de vendedores. NO aplica el filtro de vendedor: muestra a todo el equipo
--    para que el porcentaje del total tenga sentido. Une usuarios y roles (por eso solo
--    es posible desde que ventas.usuario_id existe y los usuarios tienen rol: decisión D-01).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_vendedores(p_desde DATE, p_hasta DATE, p_categoria BIGINT DEFAULT NULL)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH f AS (
    SELECT venta_id, usuario_id, MAX(creado_en) AS creado_en, SUM(bruto) AS bruto
      FROM estadisticas_lineas(p_desde, p_hasta, NULL, p_categoria)
     GROUP BY venta_id, usuario_id
  ),
  g AS (SELECT usuario_id, COUNT(*) AS facturas, SUM(bruto) AS monto, MAX(creado_en) AS ultima FROM f GROUP BY usuario_id),
  t AS (SELECT COALESCE(SUM(monto), 0) AS total FROM g)
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('usuario_id', g.usuario_id, 'nombre', COALESCE(u.nombre, 'Sin vendedor'), 'usuario', u.usuario,
                              'rol', r.nombre, 'activo', COALESCE(u.activo, FALSE), 'facturas', g.facturas,
                              'monto', ROUND(g.monto, 2), 'ticket_promedio', ROUND(g.monto / g.facturas, 2),
                              'porcentaje', CASE WHEN t.total > 0 THEN ROUND(g.monto / t.total * 100, 1) ELSE 0 END,
                              'ultima_venta', g.ultima)
           ORDER BY g.monto DESC, g.usuario_id), '[]'::jsonb)
    FROM g CROSS JOIN t
    LEFT JOIN usuarios u ON u.id = g.usuario_id
    LEFT JOIN roles r ON r.id = u.rol_id
$$;


-- ---------------------------------------------------------------------
-- 8. Ventas por día de la semana (1 = lunes ... 7 = domingo) y mejor día del período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_dia_semana(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH g AS (
    SELECT EXTRACT(ISODOW FROM l.fecha)::INT AS dow, SUM(l.bruto) AS total, COUNT(DISTINCT l.venta_id) AS facturas
      FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria) l GROUP BY 1
  ),
  d AS (
    SELECT EXTRACT(ISODOW FROM x)::INT AS dow, COUNT(*) AS dias
      FROM generate_series(p_desde::timestamp, p_hasta::timestamp, INTERVAL '1 day') x GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('dow', s.dow, 'dias', COALESCE(d.dias, 0), 'total', ROUND(COALESCE(g.total, 0), 2),
                              'facturas', COALESCE(g.facturas, 0),
                              'promedio', CASE WHEN COALESCE(d.dias, 0) > 0 THEN ROUND(COALESCE(g.total, 0) / d.dias, 2) ELSE 0 END)
           ORDER BY s.dow), '[]'::jsonb)
    FROM generate_series(1, 7) s(dow)
    LEFT JOIN g ON g.dow = s.dow
    LEFT JOIN d ON d.dow = s.dow
$$;

CREATE OR REPLACE FUNCTION estadisticas_mejor_dia(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT jsonb_build_object('fecha', l.fecha, 'total', ROUND(SUM(l.bruto), 2), 'facturas', COUNT(DISTINCT l.venta_id))
    FROM estadisticas_lineas(p_desde, p_hasta, p_vendedor, p_categoria) l
   GROUP BY l.fecha
   ORDER BY SUM(l.bruto) DESC, l.fecha
   LIMIT 1
$$;


-- ---------------------------------------------------------------------
-- 9. Todo junto, en una sola llamada, para la pantalla de Estadísticas.
--    * p_desde NULL = "Todo": desde la primera venta. Sin comparación.
--    * p_hasta NULL = hasta hoy (día local del negocio).
--    * Con comparación: el período anterior de igual longitud, pegado al actual.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION estadisticas_panel(
  p_desde DATE, p_hasta DATE, p_vendedor BIGINT DEFAULT NULL, p_categoria BIGINT DEFAULT NULL, p_agrupar TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_todo  BOOLEAN := (p_desde IS NULL);
  v_hasta DATE := COALESCE(p_hasta, hoy_negocio());
  v_desde DATE;
  v_dias  INT;
  v_pd    DATE;
  v_ph    DATE;
BEGIN
  v_desde := COALESCE(p_desde, (SELECT MIN(fecha_local(v.creado_en)) FROM ventas v), v_hasta);
  IF v_desde > v_hasta THEN
    RAISE EXCEPTION 'La fecha inicial no puede ser mayor que la final.';
  END IF;
  v_dias := v_hasta - v_desde + 1;
  IF NOT v_todo THEN
    v_ph := v_desde - 1;
    v_pd := v_ph - (v_dias - 1);
  END IF;

  RETURN jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'dias', v_dias, 'comparar', NOT v_todo,
    'anterior', CASE WHEN v_todo THEN NULL ELSE jsonb_build_object('desde', v_pd, 'hasta', v_ph) END,
    'kpis', estadisticas_kpis(v_desde, v_hasta, p_vendedor, p_categoria),
    'kpis_anterior', CASE WHEN v_todo THEN NULL ELSE estadisticas_kpis(v_pd, v_ph, p_vendedor, p_categoria) END,
    'serie', estadisticas_serie(v_desde, v_hasta, p_vendedor, p_categoria, p_agrupar),
    'top_productos', estadisticas_top_productos(v_desde, v_hasta, p_vendedor, p_categoria, 10),
    'top_categorias', estadisticas_top_categorias(v_desde, v_hasta, p_vendedor, p_categoria, 5),
    'vendedores', estadisticas_vendedores(v_desde, v_hasta, p_categoria),
    'dia_semana', estadisticas_dia_semana(v_desde, v_hasta, p_vendedor, p_categoria),
    'mejor_dia', estadisticas_mejor_dia(v_desde, v_hasta, p_vendedor, p_categoria)
  );
END;
$$;

COMMIT;
