-- =====================================================================
-- migracion_fase4.sql  |  Contabilidad por partida doble, CxC y CxP
-- Sirve para bases de la Fase 3 (no borra datos) y también para bases nuevas
-- (schema_es.sql ya la trae al final). Se puede correr más de una vez.
--
-- Orden en una base existente:  1) este archivo   2) functions_es.sql completo
-- (functions_es.sql inicia la contabilidad solo, con el estado que tenga la base)
-- =====================================================================


-- ---------------------------------------------------------------------
-- Ajustes del negocio
--   zona_horaria         : para saber qué día es "hoy" y a qué día pertenece una venta
--   dias_credito         : plazo que se supone cuando una deuda no trae fecha de vencimiento
--   contabilidad_inicio  : día en que arrancó la contabilidad (NULL = todavía no se inicia)
--   numero_partida_actual: contador sin saltos de los números de partida (P-000001...)
-- ---------------------------------------------------------------------
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS zona_horaria          VARCHAR(60) NOT NULL DEFAULT 'America/Tegucigalpa';
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS dias_credito          INT NOT NULL DEFAULT 30;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS contabilidad_inicio   DATE;
ALTER TABLE configuracion_negocio ADD COLUMN IF NOT EXISTS numero_partida_actual INT NOT NULL DEFAULT 0;


-- ---------------------------------------------------------------------
-- Fechas en la hora del negocio (no en UTC)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fecha_local(p_ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT (p_ts AT TIME ZONE COALESCE((SELECT zona_horaria FROM configuracion_negocio WHERE id = 1), 'America/Tegucigalpa'))::DATE
$$;

CREATE OR REPLACE FUNCTION hoy_negocio()
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT fecha_local(NOW())
$$;


-- ---------------------------------------------------------------------
-- PLAN DE CUENTAS
-- clave: nombre estable con el que el sistema ubica cada cuenta (el código
--        puede cambiar, la clave no). es_efectivo: Caja y Bancos (flujo de caja).
-- Naturaleza: activos y gastos suben por el Debe; pasivos, patrimonio e
--             ingresos suben por el Haber.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id           BIGSERIAL PRIMARY KEY,
  codigo       VARCHAR(10)  NOT NULL UNIQUE,
  clave        VARCHAR(40)  UNIQUE,
  nombre       VARCHAR(120) NOT NULL,
  tipo         VARCHAR(12)  NOT NULL CHECK (tipo IN ('activo', 'pasivo', 'patrimonio', 'ingreso', 'gasto')),
  es_efectivo  BOOLEAN NOT NULL DEFAULT FALSE,
  es_sistema   BOOLEAN NOT NULL DEFAULT TRUE,
  activo       BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO plan_cuentas (codigo, clave, nombre, tipo, es_efectivo) VALUES
  ('1101', 'caja',                'Caja general',                         'activo',     TRUE),
  ('1102', 'bancos',              'Bancos',                               'activo',     TRUE),
  ('1201', 'cxc',                 'Cuentas por cobrar',                   'activo',     FALSE),
  ('1301', 'inventario',          'Inventario de mercadería',             'activo',     FALSE),
  ('2101', 'cxp',                 'Cuentas por pagar',                    'pasivo',     FALSE),
  ('2201', 'isv_por_pagar',       'Impuesto sobre ventas por pagar',      'pasivo',     FALSE),
  ('3101', 'capital',             'Capital y aportes',                    'patrimonio', FALSE),
  ('4101', 'ventas',              'Ventas',                               'ingreso',    FALSE),
  ('4201', 'ingreso_intereses',   'Intereses ganados',                    'ingreso',    FALSE),
  ('4202', 'ingreso_alquileres',  'Alquileres ganados',                   'ingreso',    FALSE),
  ('4203', 'ingreso_servicios',   'Servicios prestados',                  'ingreso',    FALSE),
  ('4204', 'ingreso_inversiones', 'Rendimiento de inversiones',           'ingreso',    FALSE),
  ('4205', 'ingreso_otros',       'Otros ingresos',                       'ingreso',    FALSE),
  ('5101', 'costo_ventas',        'Costo de ventas',                      'gasto',      FALSE),
  ('5201', 'ajuste_inventario',   'Ajustes de inventario (mermas y sobrantes)', 'gasto', FALSE),
  ('6101', 'gasto_logistica',     'Gastos de logística',                  'gasto',      FALSE),
  ('6102', 'gasto_marketing',     'Gastos de marketing',                  'gasto',      FALSE),
  ('6103', 'gasto_operativos',    'Gastos operativos',                    'gasto',      FALSE),
  ('6104', 'gasto_mantenimiento', 'Gastos de mantenimiento',              'gasto',      FALSE),
  ('6105', 'gasto_otros',         'Otros gastos',                         'gasto',      FALSE)
ON CONFLICT (codigo) DO NOTHING;


-- ---------------------------------------------------------------------
-- LIBRO DIARIO: partidas (asientos) y sus líneas (Debe / Haber)
-- Las partidas NO se editan ni se borran: un error se corrige con una
-- contrapartida (anulación), que queda a la vista en el libro.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partidas (
  id           BIGSERIAL PRIMARY KEY,
  numero       VARCHAR(20)  NOT NULL UNIQUE,
  fecha        DATE         NOT NULL,
  descripcion  VARCHAR(300) NOT NULL,
  origen_tipo  VARCHAR(30)  NOT NULL,   -- venta | abono_cliente | ingreso | gasto | compra | pago_proveedor | manual | apertura | ajuste_inventario | anulacion
  origen_id    BIGINT,
  reversa_de   BIGINT REFERENCES partidas(id),
  usuario_id   BIGINT,
  creado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_partidas_reversa ON partidas (reversa_de) WHERE reversa_de IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_partidas_fecha  ON partidas (fecha, id);
CREATE INDEX IF NOT EXISTS idx_partidas_origen ON partidas (origen_tipo, origen_id);

CREATE TABLE IF NOT EXISTS partida_lineas (
  id          BIGSERIAL PRIMARY KEY,
  partida_id  BIGINT NOT NULL REFERENCES partidas(id),
  cuenta_id   BIGINT NOT NULL REFERENCES plan_cuentas(id),
  debe        NUMERIC(18,2) NOT NULL DEFAULT 0,
  haber       NUMERIC(18,2) NOT NULL DEFAULT 0,
  detalle     VARCHAR(200),
  CONSTRAINT chk_partida_linea CHECK (debe >= 0 AND haber >= 0 AND (debe > 0) <> (haber > 0))
);
CREATE INDEX IF NOT EXISTS idx_partida_lineas_partida ON partida_lineas (partida_id);
CREATE INDEX IF NOT EXISTS idx_partida_lineas_cuenta  ON partida_lineas (cuenta_id);

-- Candado 1: una partida solo se guarda si el Debe y el Haber suman lo mismo (se revisa al confirmar)
CREATE OR REPLACE FUNCTION verificar_partida_balanceada()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_debe  NUMERIC;
  v_haber NUMERIC;
  v_lineas INT;
BEGIN
  SELECT COALESCE(SUM(debe), 0), COALESCE(SUM(haber), 0), COUNT(*)
    INTO v_debe, v_haber, v_lineas
    FROM partida_lineas WHERE partida_id = NEW.partida_id;

  IF v_lineas < 2 OR v_debe = 0 OR v_debe <> v_haber THEN
    RAISE EXCEPTION 'La partida % no cuadra: Debe % y Haber % (mínimo 2 líneas).', NEW.partida_id, v_debe, v_haber;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_partida_balanceada ON partida_lineas;
CREATE CONSTRAINT TRIGGER trg_partida_balanceada
  AFTER INSERT ON partida_lineas
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION verificar_partida_balanceada();

-- Candado 2: lo registrado no se modifica ni se borra
CREATE OR REPLACE FUNCTION bloquear_cambios_partidas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Las partidas contables no se modifican ni se borran: se corrigen con una contrapartida (anulación).';
END;
$$;

DROP TRIGGER IF EXISTS trg_partidas_inmutables ON partidas;
CREATE TRIGGER trg_partidas_inmutables BEFORE UPDATE OR DELETE ON partidas
  FOR EACH ROW EXECUTE FUNCTION bloquear_cambios_partidas();

DROP TRIGGER IF EXISTS trg_partida_lineas_inmutables ON partida_lineas;
CREATE TRIGGER trg_partida_lineas_inmutables BEFORE UPDATE OR DELETE ON partida_lineas
  FOR EACH ROW EXECUTE FUNCTION bloquear_cambios_partidas();


-- ---------------------------------------------------------------------
-- Condición de pago en lo que ya existía
--   estado: P = pendiente (por cobrar / por pagar), C = cobrado / pagado
-- ---------------------------------------------------------------------
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE;

ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS estado_cobro       VARCHAR(1) NOT NULL DEFAULT 'C' CHECK (estado_cobro IN ('P', 'C'));
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS fecha_vencimiento  DATE;
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS cliente_id         BIGINT REFERENCES clientes(id);
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS cuenta_id          BIGINT REFERENCES plan_cuentas(id);
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS anulado            BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS partida_id         BIGINT REFERENCES partidas(id);
ALTER TABLE ingresos ADD COLUMN IF NOT EXISTS usuario_id         BIGINT;

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS estado_pago        VARCHAR(1) NOT NULL DEFAULT 'C' CHECK (estado_pago IN ('P', 'C'));
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS fecha_vencimiento  DATE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS proveedor_id       BIGINT REFERENCES proveedores(id);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS cuenta_id          BIGINT REFERENCES plan_cuentas(id);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS anulado            BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS partida_id         BIGINT REFERENCES partidas(id);
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS usuario_id         BIGINT;

ALTER TABLE compras ADD COLUMN IF NOT EXISTS estado_pago        VARCHAR(1) NOT NULL DEFAULT 'C' CHECK (estado_pago IN ('P', 'C'));
ALTER TABLE compras ADD COLUMN IF NOT EXISTS fecha_vencimiento  DATE;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS cuenta_id          BIGINT REFERENCES plan_cuentas(id);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS partida_id         BIGINT REFERENCES partidas(id);
ALTER TABLE compras ADD COLUMN IF NOT EXISTS usuario_id         BIGINT;

CREATE INDEX IF NOT EXISTS idx_ventas_vencimiento  ON ventas (fecha_vencimiento) WHERE estado = 'P';
CREATE INDEX IF NOT EXISTS idx_ingresos_estado     ON ingresos (estado_cobro);
CREATE INDEX IF NOT EXISTS idx_gastos_estado       ON gastos (estado_pago);
CREATE INDEX IF NOT EXISTS idx_compras_estado      ON compras (estado_pago);


-- ---------------------------------------------------------------------
-- ABONOS de clientes (cuentas por cobrar) y PAGOS a proveedores (cuentas por pagar)
-- Un abono o pago se puede anular (queda marcado y su partida se contrarresta).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abonos_clientes (
  id                BIGSERIAL PRIMARY KEY,
  venta_id          BIGINT REFERENCES ventas(id),
  ingreso_id        BIGINT REFERENCES ingresos(id),
  monto             NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  fecha             DATE NOT NULL,
  cuenta_id         BIGINT NOT NULL REFERENCES plan_cuentas(id),
  notas             TEXT,
  usuario_id        BIGINT,
  partida_id        BIGINT REFERENCES partidas(id),
  anulado           BOOLEAN NOT NULL DEFAULT FALSE,
  anulado_en        TIMESTAMPTZ,
  motivo_anulacion  TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_abono_origen CHECK ((venta_id IS NOT NULL)::INT + (ingreso_id IS NOT NULL)::INT = 1)
);
CREATE INDEX IF NOT EXISTS idx_abonos_venta   ON abonos_clientes (venta_id)   WHERE venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abonos_ingreso ON abonos_clientes (ingreso_id) WHERE ingreso_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abonos_fecha   ON abonos_clientes (fecha);

CREATE TABLE IF NOT EXISTS pagos_proveedores (
  id                BIGSERIAL PRIMARY KEY,
  compra_id         BIGINT REFERENCES compras(id),
  gasto_id          BIGINT REFERENCES gastos(id),
  monto             NUMERIC(18,2) NOT NULL CHECK (monto > 0),
  fecha             DATE NOT NULL,
  cuenta_id         BIGINT NOT NULL REFERENCES plan_cuentas(id),
  notas             TEXT,
  usuario_id        BIGINT,
  partida_id        BIGINT REFERENCES partidas(id),
  anulado           BOOLEAN NOT NULL DEFAULT FALSE,
  anulado_en        TIMESTAMPTZ,
  motivo_anulacion  TEXT,
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_pago_origen CHECK ((compra_id IS NOT NULL)::INT + (gasto_id IS NOT NULL)::INT = 1)
);
CREATE INDEX IF NOT EXISTS idx_pagos_compra ON pagos_proveedores (compra_id) WHERE compra_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_gasto  ON pagos_proveedores (gasto_id)  WHERE gasto_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_fecha  ON pagos_proveedores (fecha);


-- ---------------------------------------------------------------------
-- CARTERA: lo que nos deben (v_cxc) y lo que debemos (v_cxp), con su saldo
-- vence = fecha de vencimiento, o fecha del documento + dias_credito si no la tiene
-- dias_vencido > 0: ya venció hace esos días. <= 0: faltan esos días (o está al día)
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
     WHERE v.estado = 'P'
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

CREATE OR REPLACE VIEW v_cxp AS
SELECT x.*,
       COALESCE(x.fecha_vencimiento, x.fecha_doc + n.dias_credito)             AS vence,
       (x.fecha_vencimiento IS NULL)                                           AS plazo_estimado,
       hoy_negocio() - COALESCE(x.fecha_vencimiento, x.fecha_doc + n.dias_credito) AS dias_vencido
  FROM (
    SELECT 'compra'::TEXT AS origen, c.id AS doc_id, c.proveedor_id,
           COALESCE(p.nombre, 'Sin proveedor') AS tercero,
           'Compra #' || c.id AS referencia,
           c.fecha AS fecha_doc,
           c.fecha_vencimiento,
           c.total AS monto,
           ROUND(c.total - COALESCE((SELECT SUM(a.monto) FROM pagos_proveedores a WHERE a.compra_id = c.id AND NOT a.anulado), 0), 2) AS saldo
      FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
     WHERE c.estado_pago = 'P'
    UNION ALL
    SELECT 'gasto'::TEXT, g.id, g.proveedor_id,
           COALESCE(p.nombre, 'Acreedores varios'),
           g.descripcion,
           g.fecha,
           g.fecha_vencimiento,
           g.monto,
           ROUND(g.monto - COALESCE((SELECT SUM(a.monto) FROM pagos_proveedores a WHERE a.gasto_id = g.id AND NOT a.anulado), 0), 2)
      FROM gastos g LEFT JOIN proveedores p ON p.id = g.proveedor_id
     WHERE g.estado_pago = 'P' AND NOT g.anulado
  ) x
  CROSS JOIN (SELECT dias_credito FROM configuracion_negocio WHERE id = 1) n;
