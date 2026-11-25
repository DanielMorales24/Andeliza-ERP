-- =====================================================================
-- Datos de prueba de Andeliza ERP
-- Se cargan en la base andeliza_test DESPUÉS de las migraciones 01 a 09 y de functions.sql
-- (tests/soporte/base.js lo hace solo). Son inventados: no vienen de ningún cliente.
--
--   Usuarios (todos con la contraseña Pruebas.2026): admin, supervisor, vendedor, contador
--   Productos: tres simples, uno con dos tallas, un kit (1 gorra + 2 medias) y uno para la prueba E2E
--   Contabilidad iniciada hace 30 días, con saldo inicial en Caja (10 000) y en Bancos (20 000)
-- =====================================================================
BEGIN;

UPDATE configuracion_negocio SET
  nombre                = 'Negocio de Pruebas',
  zona_horaria          = 'America/Tegucigalpa',
  dias_credito          = 30,
  onboarding_completado = TRUE,
  onboarding_paso       = 6
WHERE id = 1;

INSERT INTO usuarios (nombre, usuario, contrasena, rol_id) VALUES
  ('Admin de Pruebas',      'admin',      hash_contrasena('Pruebas.2026'), (SELECT id FROM roles WHERE nombre = 'admin'      AND es_sistema)),
  ('Supervisor de Pruebas', 'supervisor', hash_contrasena('Pruebas.2026'), (SELECT id FROM roles WHERE nombre = 'supervisor' AND es_sistema)),
  ('Vendedor de Pruebas',   'vendedor',   hash_contrasena('Pruebas.2026'), (SELECT id FROM roles WHERE nombre = 'vendedor'   AND es_sistema)),
  ('Contador de Pruebas',   'contador',   hash_contrasena('Pruebas.2026'), (SELECT id FROM roles WHERE nombre = 'contador'   AND es_sistema));

INSERT INTO categorias (nombre) VALUES ('Pruebas');
INSERT INTO proveedores (nombre) VALUES ('Proveedor de Pruebas');
INSERT INTO clientes (nombre, tipo) VALUES ('Cliente de Pruebas', 'natural');

INSERT INTO productos (sku, nombre, categoria_id, precio_compra, precio_venta, unidad, stock, stock_minimo)
SELECT v.sku, v.nombre, (SELECT id FROM categorias WHERE nombre = 'Pruebas'), v.compra, v.venta, 'unidad', v.stock, 2
FROM (VALUES
  ('PRU-CAM', 'Camiseta de prueba',   120.00, 200.00, 50),
  ('PRU-GOR', 'Gorra de prueba',       60.00, 100.00, 40),
  ('PRU-MED', 'Medias de prueba',      20.00,  50.00, 60),
  ('PRU-TAL', 'Uniforme con tallas',   90.00, 180.00,  0),
  ('PRU-KIT', 'Kit de prueba',          0.00, 180.00,  0),
  ('E2E-001', 'Producto para la prueba de punta a punta', 80.00, 150.00, 25)
) AS v(sku, nombre, compra, venta, stock);

UPDATE productos SET es_compuesto = TRUE WHERE sku = 'PRU-KIT';
INSERT INTO componentes_producto (producto_padre_id, producto_hijo_id, cantidad) VALUES
  ((SELECT id FROM productos WHERE sku = 'PRU-KIT'), (SELECT id FROM productos WHERE sku = 'PRU-GOR'), 1),
  ((SELECT id FROM productos WHERE sku = 'PRU-KIT'), (SELECT id FROM productos WHERE sku = 'PRU-MED'), 2);

INSERT INTO variantes_producto (producto_id, sku, nombre_variante, atributos, stock, stock_minimo) VALUES
  ((SELECT id FROM productos WHERE sku = 'PRU-TAL'), 'PRU-TAL-M', 'Talla M', '{"talla": "M"}', 10, 1),
  ((SELECT id FROM productos WHERE sku = 'PRU-TAL'), 'PRU-TAL-L', 'Talla L', '{"talla": "L"}',  8, 1);

-- Contabilidad: apertura con el inventario de arriba y saldo inicial en Caja y Bancos
SELECT generar_apertura_contable(hoy_negocio() - 30);
SELECT registrar_saldo_inicial('caja',   10000, hoy_negocio() - 30, (SELECT id FROM usuarios WHERE usuario = 'admin'));
SELECT registrar_saldo_inicial('bancos', 20000, hoy_negocio() - 30, (SELECT id FROM usuarios WHERE usuario = 'admin'));

COMMIT;
