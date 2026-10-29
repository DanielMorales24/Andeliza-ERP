-- =====================================================================
-- schema_es.sql  |  Sistema de Gestión Web para Pyme (Supabase / Postgres)
-- Todo en español: tablas, columnas y funciones, snake_case sin ñ ni acentos.
-- Correr en: Supabase > SQL Editor > New query > Run
-- Orden: 1) schema_es.sql  2) functions_es.sql  3) seed_deportes.sql
--        (o seed_ferreteria_ejemplo.sql, uno solo de los dos seeds)
-- Single-tenant: sin business_id, sin RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PRIMERA VEZ (viniendo de las tablas en inglés):
-- borra la línea "/*" y la línea "*/" del bloque de abajo para que corra
-- el DROP. Elimina las tablas y funciones en inglés (y las de español,
-- por si necesitas recrearlas). Es entorno de desarrollo: se pierde todo.
-- ---------------------------------------------------------------------
/*
DROP TABLE IF EXISTS
  -- versión anterior, en inglés
  audit_logs, temporary_codes, business_settings, purchase_items, purchases,
  expenses, incomes, fiscal_config, sale_items, sales, product_compositions,
  products, customers, providers, categories, users,
  -- versión en español
  auditoria, codigos_temporales, configuracion_negocio, detalle_compra, compras,
  gastos, ingresos, configuracion_fiscal, detalle_venta, ventas,
  variantes_producto, componentes_producto, productos, clientes, proveedores,
  categorias, usuarios
CASCADE;

DROP FUNCTION IF EXISTS get_next_fiscal_number();
DROP FUNCTION IF EXISTS create_sale(BIGINT, BIGINT, JSONB, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS obtener_siguiente_numero_fiscal();
DROP FUNCTION IF EXISTS crear_venta(BIGINT, BIGINT, JSONB, NUMERIC, NUMERIC, NUMERIC, VARCHAR, VARCHAR);
*/

-- Zona horaria de Honduras (sin esto CURRENT_DATE y los "ventas del día"
-- usarían UTC y a partir de las 6 pm ya cuentan como el día siguiente)
ALTER DATABASE postgres SET timezone TO 'America/Tegucigalpa';


-- ---------------------------------------------------------------------
-- USUARIOS
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id          BIGSERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  usuario     VARCHAR(60)  NOT NULL UNIQUE,
  contrasena  VARCHAR(255) NOT NULL,            -- texto plano por ahora
  rol         VARCHAR(10)  NOT NULL DEFAULT 'vendedor'
              CHECK (rol IN ('admin', 'vendedor')),
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- CATÁLOGO: categorías, proveedores, clientes
-- ---------------------------------------------------------------------
CREATE TABLE categorias (
  id           BIGSERIAL PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL UNIQUE,
  descripcion  TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE proveedores (
  id         BIGSERIAL PRIMARY KEY,
  nombre     VARCHAR(150) NOT NULL,
  tipo       VARCHAR(20)  NOT NULL DEFAULT 'empresa',   -- natural | empresa
  rtn        VARCHAR(20),
  contacto   VARCHAR(150),
  telefono   VARCHAR(30),
  correo     VARCHAR(150),
  direccion  TEXT,
  notas      TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clientes (
  id         BIGSERIAL PRIMARY KEY,
  nombre     VARCHAR(150) NOT NULL,
  tipo       VARCHAR(20)  NOT NULL DEFAULT 'natural',   -- natural | empresa
  rtn        VARCHAR(20),
  telefono   VARCHAR(30),
  correo     VARCHAR(150),
  direccion  TEXT,
  notas      TEXT,
  activo     BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- PRODUCTOS
-- stock y cantidades en NUMERIC porque se vende por kilo, metro, etc.
-- unidad sin CHECK para poder agregar unidades (litro, galón...) sin ALTER.
-- Valores usados: unidad, par, paquete, metro, kilo, caja, saco, docena, ramo
-- Si el producto tiene variantes, el stock vive en variantes_producto
-- y productos.stock se queda en 0.
-- ---------------------------------------------------------------------
CREATE TABLE productos (
  id              BIGSERIAL PRIMARY KEY,
  sku             VARCHAR(50) UNIQUE,
  nombre          VARCHAR(200) NOT NULL,
  categoria_id    BIGINT REFERENCES categorias(id)  ON DELETE SET NULL,
  proveedor_id    BIGINT REFERENCES proveedores(id) ON DELETE SET NULL,
  precio_compra   NUMERIC(18,2) NOT NULL DEFAULT 0,
  precio_venta    NUMERIC(18,2) NOT NULL DEFAULT 0,
  unidad          VARCHAR(20)   NOT NULL DEFAULT 'unidad',
  stock           NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_minimo    NUMERIC(12,2) NOT NULL DEFAULT 0,
  descripcion     TEXT,
  imagen_url      TEXT,
  es_compuesto    BOOLEAN NOT NULL DEFAULT FALSE,   -- kit
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Variantes (talla, equipo/edición, color...) con stock propio
CREATE TABLE variantes_producto (
  id               BIGSERIAL PRIMARY KEY,
  producto_id      BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  sku              VARCHAR(50) UNIQUE,
  nombre_variante  VARCHAR(100) NOT NULL,       -- ej: "M / Local"
  atributos        JSONB,                       -- {"talla":"M","equipo":"Local"}
  stock            NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_minimo     NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (producto_id, nombre_variante)
);
CREATE INDEX idx_variantes_producto ON variantes_producto (producto_id);

-- Componentes de un kit (un solo nivel: un kit no contiene otro kit,
-- y sus componentes no deben tener variantes)
CREATE TABLE componentes_producto (
  id                 BIGSERIAL PRIMARY KEY,
  producto_padre_id  BIGINT NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  producto_hijo_id   BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad           NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  UNIQUE (producto_padre_id, producto_hijo_id),
  CHECK (producto_padre_id <> producto_hijo_id)
);


-- ---------------------------------------------------------------------
-- VENTAS
-- estado: P = pendiente, C = cancelada (o sea, pagada)
-- cliente_id puede ser NULL (consumidor final)
-- tipo_documento: fiscal = número con CAI del SAR, interno = INT-000001
--   (negocios sin SAR, o mientras no haya configuración fiscal activa)
-- ---------------------------------------------------------------------
CREATE TABLE ventas (
  id              BIGSERIAL PRIMARY KEY,
  cliente_id      BIGINT REFERENCES clientes(id) ON DELETE SET NULL,
  usuario_id      BIGINT REFERENCES usuarios(id),
  subtotal        NUMERIC(18,2) NOT NULL DEFAULT 0,
  impuesto        NUMERIC(18,2) NOT NULL DEFAULT 0,
  total           NUMERIC(18,2) NOT NULL DEFAULT 0,
  estado          VARCHAR(1) NOT NULL DEFAULT 'P' CHECK (estado IN ('P', 'C')),
  numero_factura  VARCHAR(80) UNIQUE,
  tipo_documento  VARCHAR(10) NOT NULL DEFAULT 'fiscal'
                  CHECK (tipo_documento IN ('fiscal', 'interno')),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- costo_unitario = costo del producto al momento de vender (para el margen real)
-- variante_id es NULL cuando el producto no maneja variantes
CREATE TABLE detalle_venta (
  id               BIGSERIAL PRIMARY KEY,
  venta_id         BIGINT NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  producto_id      BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  variante_id      BIGINT REFERENCES variantes_producto(id) ON DELETE SET NULL,
  cantidad         NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(18,2) NOT NULL,
  costo_unitario   NUMERIC(18,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(18,2) NOT NULL
);


-- ---------------------------------------------------------------------
-- CONFIGURACIÓN FISCAL
-- numero_actual = ÚLTIMO número usado (arranca en rango_inicio - 1)
-- tasa_impuesto en decimal: 0.1500 = 15%
-- ---------------------------------------------------------------------
CREATE TABLE configuracion_fiscal (
  id              BIGSERIAL PRIMARY KEY,
  cai             VARCHAR(100) NOT NULL,
  rango_inicio    INT NOT NULL,
  rango_fin       INT NOT NULL,
  numero_actual   INT NOT NULL,
  fecha_limite    DATE NOT NULL,
  tasa_impuesto   NUMERIC(5,4) NOT NULL DEFAULT 0.1500,
  moneda          VARCHAR(10)  NOT NULL DEFAULT 'L',
  pie_legal       TEXT,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT chk_fiscal_rango  CHECK (rango_fin >= rango_inicio),
  CONSTRAINT chk_fiscal_actual CHECK (numero_actual >= rango_inicio - 1
                                  AND numero_actual <= rango_fin)
);

-- Solo una fila activa a la vez
CREATE UNIQUE INDEX uq_configuracion_fiscal_activo ON configuracion_fiscal (activo) WHERE activo;


-- ---------------------------------------------------------------------
-- FINANZAS
-- ingresos.tipo: intereses | alquileres | servicios | inversiones | otros
-- gastos.categoria: logistica | marketing | operativos | mantenimiento | otros
-- ---------------------------------------------------------------------
CREATE TABLE ingresos (
  id           BIGSERIAL PRIMARY KEY,
  tipo         VARCHAR(30) NOT NULL DEFAULT 'otros',
  descripcion  VARCHAR(255) NOT NULL,
  monto        NUMERIC(18,2) NOT NULL CHECK (monto >= 0),
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  notas        TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE gastos (
  id           BIGSERIAL PRIMARY KEY,
  categoria    VARCHAR(30) NOT NULL DEFAULT 'otros',
  descripcion  VARCHAR(255) NOT NULL,
  monto        NUMERIC(18,2) NOT NULL CHECK (monto >= 0),
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  notas        TEXT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE compras (
  id            BIGSERIAL PRIMARY KEY,
  proveedor_id  BIGINT REFERENCES proveedores(id),
  total         NUMERIC(18,2) NOT NULL DEFAULT 0,
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- variante_id: se llena cuando se compra stock de una variante concreta
CREATE TABLE detalle_compra (
  id               BIGSERIAL PRIMARY KEY,
  compra_id        BIGINT NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id      BIGINT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  variante_id      BIGINT REFERENCES variantes_producto(id) ON DELETE SET NULL,
  cantidad         NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  precio_unitario  NUMERIC(18,2) NOT NULL,
  subtotal         NUMERIC(18,2) NOT NULL
);


-- ---------------------------------------------------------------------
-- NEGOCIO (una sola fila, id = 1), ACCESO MÓVIL Y AUDITORÍA
-- numero_factura_interna = ÚLTIMO número interno usado (arranca en 0)
-- ---------------------------------------------------------------------
CREATE TABLE configuracion_negocio (
  id                       INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre                   VARCHAR(150) NOT NULL DEFAULT 'Mi Negocio',
  logo_url                 TEXT,
  rtn                      VARCHAR(20),
  direccion                TEXT,
  telefono                 VARCHAR(30),
  correo                   VARCHAR(150),
  prefijo_factura_interna  VARCHAR(10) NOT NULL DEFAULT 'INT',
  numero_factura_interna   INT NOT NULL DEFAULT 0
);
INSERT INTO configuracion_negocio (id, nombre) VALUES (1, 'Mi Negocio');

CREATE TABLE codigos_temporales (
  id         BIGSERIAL PRIMARY KEY,
  codigo     VARCHAR(6) NOT NULL,
  expira_en  TIMESTAMPTZ NOT NULL,
  usado      BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE auditoria (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT,
  accion      VARCHAR(50) NOT NULL,
  entidad     VARCHAR(50),
  entidad_id  BIGINT,
  detalles    JSONB,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ---------------------------------------------------------------------
-- ÍNDICES (sku y usuario ya tienen el suyo por el UNIQUE)
-- ---------------------------------------------------------------------
CREATE INDEX idx_productos_nombre      ON productos (nombre);
CREATE INDEX idx_productos_categoria   ON productos (categoria_id);
CREATE INDEX idx_productos_proveedor   ON productos (proveedor_id);

CREATE INDEX idx_clientes_nombre       ON clientes (nombre);
CREATE INDEX idx_clientes_telefono     ON clientes (telefono);
CREATE INDEX idx_clientes_rtn          ON clientes (rtn);
CREATE INDEX idx_clientes_correo       ON clientes (correo);

CREATE INDEX idx_proveedores_nombre    ON proveedores (nombre);
CREATE INDEX idx_proveedores_rtn       ON proveedores (rtn);
CREATE INDEX idx_proveedores_correo    ON proveedores (correo);

CREATE INDEX idx_ventas_creado_en      ON ventas (creado_en);
CREATE INDEX idx_ventas_cliente        ON ventas (cliente_id);
CREATE INDEX idx_ventas_estado         ON ventas (estado);
CREATE INDEX idx_detalle_venta_venta   ON detalle_venta (venta_id);
CREATE INDEX idx_detalle_venta_prod    ON detalle_venta (producto_id);

CREATE INDEX idx_ingresos_fecha        ON ingresos (fecha);
CREATE INDEX idx_gastos_fecha          ON gastos (fecha);
CREATE INDEX idx_compras_fecha         ON compras (fecha);
CREATE INDEX idx_detalle_compra_compra ON detalle_compra (compra_id);
CREATE INDEX idx_componentes_padre     ON componentes_producto (producto_padre_id);
CREATE INDEX idx_codigos_codigo        ON codigos_temporales (codigo);


-- ---------------------------------------------------------------------
-- OPCIONAL: cerrar la API REST de Supabase (descomentar si quieres)
-- Con RLS activo y sin policies, nadie entra por la Data API con las keys
-- anon/authenticated. Tu app usa DATABASE_URL (rol postgres), que ignora
-- RLS, así que no cambia nada en el código.
-- ---------------------------------------------------------------------
-- DO $$
-- DECLARE t TEXT;
-- BEGIN
--   FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
--     EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
--   END LOOP;
-- END $$;
