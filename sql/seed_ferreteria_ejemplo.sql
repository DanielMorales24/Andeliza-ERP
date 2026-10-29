-- =====================================================================
-- seed_ferreteria_ejemplo.sql  |  Semilla alternativa: ferretería
-- Para probar el sistema con otro tipo de negocio (unidades por kilo, metro,
-- saco, caja; sin variantes). Correr en lugar de seed_deportes.sql, no
-- además: los usuarios y la configuración fiscal chocarían.
-- =====================================================================

INSERT INTO usuarios (nombre, usuario, contrasena, rol) VALUES
  ('Administrador', 'admin',    'admin123',    'admin'),
  ('Vendedor Demo', 'vendedor', 'vendedor123', 'vendedor');

UPDATE configuracion_negocio SET
  nombre    = 'Ferretería Demo',
  rtn       = '08019999999999',
  direccion = 'Barrio Centro, San Pedro Sula, Cortés',
  telefono  = '2550-0000',
  correo    = 'ventas@ferreteriademo.hn'
WHERE id = 1;

-- CAI inventado, rango 1 a 500. numero_actual = 0 (último usado)
INSERT INTO configuracion_fiscal (cai, rango_inicio, rango_fin, numero_actual, fecha_limite, tasa_impuesto, moneda, pie_legal)
VALUES ('DEMO00-DEMO00-DEMO00-DEMO00-DEMO00-00', 1, 500, 0, CURRENT_DATE + 365, 0.1500, 'L',
        'Gracias por su compra. La factura es beneficio de todos, exíjala.');

INSERT INTO categorias (nombre, descripcion) VALUES
  ('Herramientas', 'Herramientas manuales'),
  ('Eléctrico',    'Cables, breakers y accesorios'),
  ('Plomería',     'Tubería y accesorios'),
  ('Construcción', 'Cemento, block, varilla'),
  ('Ferretería',   'Clavos, tornillos y similares'),
  ('Papelería',    'Cuadernos, lápices, útiles'),
  ('Abarrotes',    'Granos y básicos');

INSERT INTO proveedores (nombre, tipo, rtn, contacto, telefono, correo, direccion) VALUES
  ('Distribuidora Ferretera del Norte', 'empresa', '05019888888888', 'Carlos Mejía', '2557-1111', 'ventas@dfnorte.hn',         'Col. Los Andes, San Pedro Sula'),
  ('Importaciones El Constructor',      'empresa', '05019777777777', 'Ana Reyes',    '2558-2222', 'pedidos@elconstructor.hn', 'Blvd. del Norte, San Pedro Sula');

INSERT INTO clientes (nombre, tipo, rtn, telefono, correo, direccion) VALUES
  ('Consumidor Final',                  'natural', NULL,             NULL,        NULL,                   NULL),
  ('Juan Pérez',                        'natural', '05011990123456', '9988-1234', 'juan.perez@correo.com', 'Col. Satélite'),
  ('Constructora Atlántida S. de R.L.', 'empresa', '05019666666666', '2550-3333', 'compras@catlantida.hn', 'Zona Industrial');

-- Variedad de unidades; uno con stock bajo, uno agotado, uno con decimales
INSERT INTO productos (sku, nombre, categoria_id, proveedor_id, precio_compra, precio_venta, unidad, stock, stock_minimo, descripcion)
SELECT v.sku, v.nombre, c.id, p.id, v.precio_compra, v.precio_venta, v.unidad, v.stock, v.stock_minimo, v.descripcion
FROM (VALUES
  ('MAR-001', 'Martillo de uña 16 oz',        'Herramientas', 'Distribuidora Ferretera del Norte', 95,  150, 'unidad', 25,   5,  'Mango de fibra de vidrio'),
  ('DES-001', 'Destornillador plano 6"',      'Herramientas', 'Distribuidora Ferretera del Norte', 35,  60,  'unidad', 40,   10, ''),
  ('DES-002', 'Destornillador Phillips 6"',   'Herramientas', 'Distribuidora Ferretera del Norte', 35,  60,  'unidad', 3,    10, 'Stock bajo a propósito'),
  ('CAB-012', 'Cable THHN #12',               'Eléctrico',    'Importaciones El Constructor',      9,   14,  'metro',  300,  50, 'Se vende por metro'),
  ('BRK-020', 'Breaker 20A',                  'Eléctrico',    'Importaciones El Constructor',      85,  135, 'unidad', 0,    5,  'Agotado a propósito'),
  ('TUB-050', 'Tubo PVC 1/2"',                'Plomería',     'Importaciones El Constructor',      55,  85,  'unidad', 60,   15, ''),
  ('CEM-001', 'Cemento gris 42.5 kg',         'Construcción', 'Distribuidora Ferretera del Norte', 165, 195, 'saco',   80,   20, ''),
  ('CLV-002', 'Clavos 2"',                    'Ferretería',   'Distribuidora Ferretera del Norte', 22,  35,  'kilo',   45.5, 10, 'Se vende por kilo'),
  ('TOR-100', 'Tornillos 1" (caja x100)',     'Ferretería',   'Distribuidora Ferretera del Norte', 70,  110, 'caja',   30,   8,  ''),
  ('PAP-001', 'Cuaderno universitario',       'Papelería',    'Importaciones El Constructor',      28,  45,  'unidad', 100,  20, ''),
  ('LAP-012', 'Lápiz grafito HB',             'Papelería',    'Importaciones El Constructor',      30,  48,  'docena', 50,   10, ''),
  ('ARR-001', 'Arroz blanco',                 'Abarrotes',    'Importaciones El Constructor',      22,  28,  'kilo',   120,  30, ''),
  ('KIT-001', 'Kit de herramientas básico',   'Herramientas', 'Distribuidora Ferretera del Norte', 165, 250, 'unidad', 0,    0,  'Martillo + 2 destornilladores')
) AS v(sku, nombre, categoria, proveedor, precio_compra, precio_venta, unidad, stock, stock_minimo, descripcion)
LEFT JOIN categorias  c ON c.nombre = v.categoria
LEFT JOIN proveedores p ON p.nombre = v.proveedor;

UPDATE productos SET es_compuesto = TRUE WHERE sku = 'KIT-001';

INSERT INTO componentes_producto (producto_padre_id, producto_hijo_id, cantidad)
SELECT k.id, h.id, v.cantidad
FROM (VALUES
  ('KIT-001', 'MAR-001', 1),
  ('KIT-001', 'DES-001', 1),
  ('KIT-001', 'DES-002', 1)
) AS v(kit, hijo, cantidad)
JOIN productos k ON k.sku = v.kit
JOIN productos h ON h.sku = v.hijo;

INSERT INTO ingresos (tipo, descripcion, monto, fecha, notas) VALUES
  ('alquileres', 'Alquiler de bodega',          4500, CURRENT_DATE - 12, 'Mes actual'),
  ('servicios',  'Servicio de corte a medida',   850, CURRENT_DATE - 5,  '');

INSERT INTO gastos (categoria, descripcion, monto, fecha, notas) VALUES
  ('logistica',     'Flete de mercadería',   1200, CURRENT_DATE - 10, ''),
  ('operativos',    'Energía eléctrica',     2300, CURRENT_DATE - 7,  ''),
  ('mantenimiento', 'Reparación de estante',  650, CURRENT_DATE - 3,  '');
