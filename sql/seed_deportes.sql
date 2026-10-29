-- =====================================================================
-- seed_deportes.sql  |  Datos de ejemplo: tienda deportiva y camisetas de fútbol
-- Correr DESPUÉS de schema_es.sql y functions_es.sql. Una sola vez.
-- (Usa este seed O seed_ferreteria_ejemplo.sql, no los dos.)
-- Los usuarios y el CAI son de prueba.
-- =====================================================================

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

-- Algo de movimiento para probar finanzas
INSERT INTO ingresos (tipo, descripcion, monto, fecha, notas) VALUES
  ('alquileres', 'Alquiler de local pequeño',     4500, CURRENT_DATE - 12, 'Mes actual'),
  ('servicios',  'Estampado de nombres y números', 850, CURRENT_DATE - 5,  '');

INSERT INTO gastos (categoria, descripcion, monto, fecha, notas) VALUES
  ('logistica',     'Flete de mercadería',   1200, CURRENT_DATE - 10, ''),
  ('operativos',    'Energía eléctrica',     2300, CURRENT_DATE - 7,  ''),
  ('marketing',     'Publicidad en redes',    900, CURRENT_DATE - 4,  ''),
  ('mantenimiento', 'Reparación de vitrina',  650, CURRENT_DATE - 3,  '');
