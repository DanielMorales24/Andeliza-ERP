-- =====================================================================
-- seed.sql  |  Andeliza ERP: datos de ejemplo consolidados (tienda deportiva)
-- Correr DESPUÉS de las migraciones 01 a 04 y de functions.sql. Una sola vez.
--
-- Qué carga:
--   1) Catálogo: usuarios de prueba, datos del negocio, CAI de prueba, categorías,
--      proveedores, clientes, productos con variantes y un kit.
--   2) Contabilidad: inicia 120 días atrás, saldos iniciales y cuatro meses de
--      ingresos y gastos, deudas por cobrar y por pagar, y dos compras.
--   3) Ventas de hoy, hechas con crear_venta (consumen el CAI, descuentan stock y
--      generan su partida): dos pagadas, una a crédito con un abono parcial y una
--      de una camiseta con variante.
--
-- SOLO PARA DESARROLLO Y DEMOSTRACIÓN: los usuarios, las contraseñas, el CAI y los
-- RTN son de prueba. No lo corras en la base de un cliente real.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Catálogo
-- ---------------------------------------------------------------------
-- Usuarios (cambia las contraseñas antes de usarlo de verdad)
INSERT INTO usuarios (nombre, usuario, contrasena, rol) VALUES
  ('Administrador', 'admin',    'admin123',    'admin'),
  ('Vendedor Demo', 'vendedor', 'vendedor123', 'vendedor');

-- Datos del negocio (los mismos de client.config.js)
UPDATE configuracion_negocio SET
  nombre    = 'SportCenter Demo',
  rtn       = '08019999999999',
  direccion = 'Barrio Centro, San Pedro Sula, Cortés',
  telefono  = '2550-0000',
  correo    = 'ventas@sportcenter.hn'
WHERE id = 1;

-- Configuración fiscal de prueba (CAI inventado, rango 1 a 500)
-- numero_actual = 0 porque es el último usado (rango_inicio - 1)
INSERT INTO configuracion_fiscal (cai, rango_inicio, rango_fin, numero_actual, fecha_limite, tasa_impuesto, moneda, pie_legal)
VALUES ('DEMO00-DEMO00-DEMO00-DEMO00-DEMO00-00', 1, 500, 0, CURRENT_DATE + 365, 0.1500, 'L',
        'Gracias por su compra. La factura es beneficio de todos, exíjala.');

-- Categorías
INSERT INTO categorias (nombre, descripcion) VALUES
  ('Camisetas',    'Camisetas de clubes, selecciones y entrenamiento'),
  ('Shorts',       'Shorts deportivos'),
  ('Pantalonetas', 'Pantalonetas de fútbol y entrenamiento'),
  ('Medias',       'Medias deportivas y de fútbol'),
  ('Calzado',      'Zapatillas y guayos'),
  ('Balones',      'Balones de fútbol y baloncesto'),
  ('Gorras',       'Gorras deportivas'),
  ('Accesorios',   'Botellas, canilleras, mochilas'),
  ('Infantil',     'Ropa deportiva para niños');

-- Proveedores
INSERT INTO proveedores (nombre, tipo, rtn, contacto, telefono, correo, direccion) VALUES
  ('Deportes Importados HN S. de R.L.',       'empresa', '05019888888888', 'Marcela Funes', '2557-1111', 'ventas@deportesimportados.hn', 'Col. Los Andes, San Pedro Sula'),
  ('Distribuidora Deportiva Centroamericana', 'empresa', '05019777777777', 'Luis Ordóñez',  '2558-2222', 'pedidos@ddcentroamerica.hn',   'Blvd. del Norte, San Pedro Sula'),
  ('Textiles Deportivos del Valle',           'empresa', '05019555555555', 'Karla Aguilar', '2559-4444', 'karla@textilesdelvalle.hn',    'Zona Industrial, Choloma');

-- Clientes
INSERT INTO clientes (nombre, tipo, rtn, telefono, correo, direccion) VALUES
  ('Consumidor Final',                'natural', NULL,             NULL,        NULL,                    NULL),
  ('Carlos Mendoza',                  'natural', '05011990123456', '9988-1234', 'carlos.mendoza@correo.com', 'Col. Satélite'),
  ('Club Deportivo Los Halcones',     'empresa', '05019666666666', '2550-3333', 'compras@loshalcones.hn',    'Barrio Suyapa'),
  ('Academia de Fútbol Estrellas',    'empresa', '05019444444444', '3344-5566', 'admin@academiaestrellas.hn', 'Res. Las Palmas');

-- Productos. Las camisetas con variantes llevan stock 0 aquí: el stock real
-- está en variantes_producto. El resto de productos va sin variantes para
-- mantener el seed corto.
INSERT INTO productos (sku, nombre, categoria_id, proveedor_id, precio_compra, precio_venta, unidad, stock, stock_minimo, descripcion)
SELECT v.sku, v.nombre, c.id, p.id, v.precio_compra, v.precio_venta, v.unidad, v.stock, v.stock_minimo, v.descripcion
FROM (VALUES
  ('CAM-RMA', 'Camiseta Real Madrid',                  'Camisetas',    'Deportes Importados HN S. de R.L.',       450, 850,  'unidad', 0,  0,  'Réplica oficial. Variantes por talla y edición'),
  ('CAM-BAR', 'Camiseta FC Barcelona',                 'Camisetas',    'Deportes Importados HN S. de R.L.',       450, 850,  'unidad', 0,  0,  'Réplica oficial. Variantes por talla y edición'),
  ('CAM-OLI', 'Camiseta Olimpia',                      'Camisetas',    'Textiles Deportivos del Valle',           380, 750,  'unidad', 0,  0,  'Variantes por talla y edición'),
  ('CAM-HON', 'Camiseta Selección de Honduras',        'Camisetas',    'Textiles Deportivos del Valle',           420, 800,  'unidad', 0,  0,  'Variantes por talla y edición'),
  ('CAM-ENT', 'Camiseta de entrenamiento',             'Camisetas',    'Textiles Deportivos del Valle',           150, 350,  'unidad', 40, 8,  'Sin variantes (se usa en el uniforme completo)'),
  ('SHO-001', 'Short deportivo de running',            'Shorts',       'Distribuidora Deportiva Centroamericana', 140, 320,  'unidad', 30, 6,  ''),
  ('PAN-001', 'Pantaloneta de entrenamiento',          'Pantalonetas', 'Textiles Deportivos del Valle',           130, 300,  'unidad', 35, 8,  ''),
  ('MED-001', 'Medias deportivas',                     'Medias',       'Distribuidora Deportiva Centroamericana', 35,  90,   'par',    60, 12, ''),
  ('MED-002', 'Medias de fútbol caña alta',            'Medias',       'Distribuidora Deportiva Centroamericana', 45,  120,  'par',    40, 10, ''),
  ('MED-003', 'Pack de 3 medias tobilleras',           'Medias',       'Distribuidora Deportiva Centroamericana', 80,  195,  'paquete', 25, 5, ''),
  ('CAL-001', 'Zapatillas deportivas running',         'Calzado',      'Deportes Importados HN S. de R.L.',       780, 1450, 'par',    12, 3,  ''),
  ('CAL-002', 'Guayos de fútbol',                      'Calzado',      'Deportes Importados HN S. de R.L.',       650, 1250, 'par',    10, 3,  ''),
  ('BAL-001', 'Balón de fútbol N° 5',                  'Balones',      'Distribuidora Deportiva Centroamericana', 380, 750,  'unidad', 18, 4,  ''),
  ('BAL-002', 'Balón de baloncesto N° 7',              'Balones',      'Distribuidora Deportiva Centroamericana', 420, 800,  'unidad', 8,  3,  ''),
  ('GOR-001', 'Gorra deportiva',                       'Gorras',       'Textiles Deportivos del Valle',           110, 280,  'unidad', 22, 5,  ''),
  ('ACC-001', 'Botella deportiva 750 ml',              'Accesorios',   'Distribuidora Deportiva Centroamericana', 60,  150,  'unidad', 30, 8,  ''),
  ('ACC-002', 'Canilleras',                            'Accesorios',   'Distribuidora Deportiva Centroamericana', 70,  180,  'par',    20, 5,  ''),
  ('ACC-003', 'Mochila deportiva',                     'Accesorios',   'Textiles Deportivos del Valle',           200, 450,  'unidad', 14, 4,  ''),
  ('INF-001', 'Conjunto infantil de entrenamiento',    'Infantil',     'Textiles Deportivos del Valle',           220, 480,  'unidad', 16, 4,  'Camiseta y pantaloneta'),
  ('KIT-001', 'Uniforme de entrenamiento completo',    'Camisetas',    'Textiles Deportivos del Valle',           315, 650,  'unidad', 0,  0,  'Camiseta + pantaloneta + medias')
) AS v(sku, nombre, categoria, proveedor, precio_compra, precio_venta, unidad, stock, stock_minimo, descripcion)
LEFT JOIN categorias  c ON c.nombre = v.categoria
LEFT JOIN proveedores p ON p.nombre = v.proveedor;

UPDATE productos SET es_compuesto = TRUE WHERE sku = 'KIT-001';

-- Componentes del uniforme completo
INSERT INTO componentes_producto (producto_padre_id, producto_hijo_id, cantidad)
SELECT k.id, h.id, v.cantidad
FROM (VALUES
  ('KIT-001', 'CAM-ENT', 1),
  ('KIT-001', 'PAN-001', 1),
  ('KIT-001', 'MED-001', 1)
) AS v(kit, hijo, cantidad)
JOIN productos k ON k.sku = v.kit
JOIN productos h ON h.sku = v.hijo;

-- Variantes de camisetas: tallas S/M/L/XL por cada edición
-- (stock inicial pseudo-aleatorio pero estable, entre 3 y 11)
INSERT INTO variantes_producto (producto_id, sku, nombre_variante, atributos, stock, stock_minimo)
SELECT p.id,
       p.sku || '-' || UPPER(LEFT(e.equipo, 3)) || '-' || t.talla,
       t.talla || ' / ' || e.equipo,
       jsonb_build_object('talla', t.talla, 'equipo', e.equipo),
       (3 + (p.id * 7 + t.orden * 5 + LENGTH(e.equipo)) % 9)::NUMERIC,
       2
FROM productos p
JOIN (VALUES
  ('CAM-RMA', 'Local'), ('CAM-RMA', 'Visitante'),
  ('CAM-BAR', 'Local'), ('CAM-BAR', 'Visitante'),
  ('CAM-OLI', 'Local'), ('CAM-OLI', 'Visitante'),
  ('CAM-HON', 'Local'), ('CAM-HON', 'Visitante'), ('CAM-HON', 'Retro')
) AS e(sku, equipo) ON e.sku = p.sku
CROSS JOIN (VALUES ('S', 1), ('M', 2), ('L', 3), ('XL', 4)) AS t(talla, orden);

-- Para probar alertas de stock: una variante con stock bajo y otra agotada
UPDATE variantes_producto SET stock = 1 WHERE sku = 'CAM-RMA-LOC-S';
UPDATE variantes_producto SET stock = 0 WHERE sku = 'CAM-OLI-LOC-XL';


-- ---------------------------------------------------------------------
-- 2) Contabilidad de ejemplo (necesita functions.sql)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 3) Ventas de ejemplo (hoy). Los totales son subtotal + 15 % de impuesto.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_vend  BIGINT := (SELECT id FROM usuarios WHERE usuario = 'vendedor');
  v_admin BIGINT := (SELECT id FROM usuarios WHERE usuario = 'admin');
  v_cred  JSONB;
BEGIN
  -- Venta pagada a un cliente: un balón y dos pares de medias
  PERFORM crear_venta(
    (SELECT id FROM clientes WHERE nombre = 'Carlos Mendoza'), v_vend,
    jsonb_build_array(
      jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'BAL-001'), 'cantidad', 1),
      jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'MED-002'), 'cantidad', 2)),
    990.00, 148.50, 1138.50, NULL, 'C');

  -- Venta pagada sin cliente (queda como Consumidor Final)
  PERFORM crear_venta(
    NULL, v_vend,
    jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'GOR-001'), 'cantidad', 2)),
    560.00, 84.00, 644.00, NULL, 'C');

  -- Camiseta con variante (talla M, edición Local)
  PERFORM crear_venta(
    (SELECT id FROM clientes WHERE nombre = 'Academia de Fútbol Estrellas'), v_vend,
    jsonb_build_array(jsonb_build_object(
      'producto_id', (SELECT id FROM productos WHERE sku = 'CAM-RMA'),
      'variante_id', (SELECT id FROM variantes_producto WHERE sku = 'CAM-RMA-LOC-M'), 'cantidad', 1)),
    850.00, 127.50, 977.50, NULL, 'C');

  -- Venta a crédito para un club: queda en cuentas por cobrar, vence en 15 días
  -- y el cliente ya hizo un primer abono
  v_cred := crear_venta(
    (SELECT id FROM clientes WHERE nombre = 'Club Deportivo Los Halcones'), v_vend,
    jsonb_build_array(jsonb_build_object('producto_id', (SELECT id FROM productos WHERE sku = 'CAM-ENT'), 'cantidad', 10)),
    3500.00, 525.00, 4025.00, NULL, 'P');
  UPDATE ventas SET fecha_vencimiento = hoy_negocio() + 15 WHERE id = (v_cred->>'venta_id')::BIGINT;
  PERFORM registrar_abono_cliente((v_cred->>'venta_id')::BIGINT, NULL, 1500.00, NULL, 'caja', 'Primer abono', v_admin);
END $$;
