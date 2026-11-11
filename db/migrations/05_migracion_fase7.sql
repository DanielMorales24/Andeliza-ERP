-- =====================================================================
-- migracion_fase7.sql  |  Configuración, usuarios y roles con permisos granulares
--
-- DECISIÓN DE ARQUITECTURA: esta fase se construye ANTES que la Fase 6 (Estadísticas).
-- Motivo: (1) el entregable universitario de la semana pide "Login y Roles", y
-- (2) las estadísticas necesitan saber QUIÉN hizo cada venta y con qué ROL
-- (por ejemplo, "¿cuánto vendió el Vendedor A este mes?"). Con la arquitectura de
-- roles lista, las estadísticas se apoyan en ella en lugar de rehacerla después.
--
-- Qué hace (se puede correr más de una vez; NO borra usuarios):
--   * Crea roles, permisos y roles_permisos, con 4 roles de fábrica.
--   * Pasa usuarios.rol (texto) a usuarios.rol_id y conserva a todos los usuarios.
--   * Guarda las contraseñas con bcrypt (antes estaban en texto plano).
--   * Agrega control de intentos, versión de sesión y cambio obligatorio de contraseña.
--   * Crea recuperacion_contrasena (códigos temporales de un solo uso).
--   * Amplía auditoria y la vuelve de solo agregar (no se edita ni se borra).
--
-- Orden en una base existente:  1) este archivo   2) functions_es.sql completo
-- IMPORTANTE: el código anterior a la Fase 7 deja de poder iniciar sesión en cuanto
-- esto corre (las contraseñas pasan a bcrypt y desaparece usuarios.rol). Sube el
-- código nuevo enseguida: no se pierde ningún dato.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------
-- ROLES, PERMISOS Y SU RELACIÓN
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id           BIGSERIAL PRIMARY KEY,
  nombre       VARCHAR(40)  NOT NULL,
  descripcion  VARCHAR(200),
  activo       BOOLEAN      NOT NULL DEFAULT TRUE,
  es_sistema   BOOLEAN      NOT NULL DEFAULT FALSE,   -- los 4 de fábrica: no se renombran ni se borran
  creado_en    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_nombre ON roles (LOWER(nombre));

CREATE TABLE IF NOT EXISTS permisos (
  id           BIGSERIAL PRIMARY KEY,
  modulo       VARCHAR(30)  NOT NULL,
  accion       VARCHAR(20)  NOT NULL,
  descripcion  VARCHAR(200),
  CONSTRAINT uq_permisos UNIQUE (modulo, accion)
);

CREATE TABLE IF NOT EXISTS roles_permisos (
  rol_id      BIGINT NOT NULL REFERENCES roles(id)    ON DELETE CASCADE,
  permiso_id  BIGINT NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (rol_id, permiso_id)
);
CREATE INDEX IF NOT EXISTS idx_roles_permisos_permiso ON roles_permisos (permiso_id);

-- Candado en la base: los permisos de Configuración son SOLO del rol admin.
-- Así nadie puede darse (ni dar) acceso a Configuración saltándose la interfaz.
CREATE OR REPLACE FUNCTION validar_permiso_rol()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM permisos p WHERE p.id = NEW.permiso_id AND p.modulo = 'configuracion')
     AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = NEW.rol_id AND r.nombre = 'admin' AND r.es_sistema) THEN
    RAISE EXCEPTION 'Los permisos de Configuración son solo del administrador.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_permisos_configuracion ON roles_permisos;
CREATE TRIGGER trg_roles_permisos_configuracion BEFORE INSERT ON roles_permisos
  FOR EACH ROW EXECUTE FUNCTION validar_permiso_rol();

INSERT INTO roles (nombre, descripcion, es_sistema) VALUES
  ('admin',      'Control total del sistema, incluida la configuración', TRUE),
  ('supervisor', 'Inventario, finanzas y estadísticas. No accede a la configuración', TRUE),
  ('vendedor',   'Punto de venta y clientes. Solo ve las facturas que él mismo emitió', TRUE),
  ('contador',   'Finanzas y reportes. Ve todas las facturas', TRUE)
ON CONFLICT DO NOTHING;

-- Catálogo de permisos: módulo + acción. "ver_propias" = ver solo lo que uno mismo generó.
INSERT INTO permisos (modulo, accion, descripcion) VALUES
  ('dashboard',     'ver',        'Ver el panel de inicio'),
  ('pos',           'ver',        'Abrir el punto de venta y buscar productos'),
  ('pos',           'crear',      'Cobrar ventas y hacer cotizaciones'),
  ('inventario',    'ver',        'Ver productos y categorías'),
  ('inventario',    'crear',      'Crear productos y categorías'),
  ('inventario',    'editar',     'Editar productos y categorías'),
  ('inventario',    'eliminar',   'Desactivar y reactivar productos y categorías'),
  ('clientes',      'ver',        'Ver la lista de clientes'),
  ('clientes',      'crear',      'Crear clientes (también el alta rápida del punto de venta)'),
  ('clientes',      'editar',     'Editar clientes'),
  ('clientes',      'eliminar',   'Desactivar y reactivar clientes'),
  ('proveedores',   'ver',        'Ver la lista de proveedores'),
  ('proveedores',   'crear',      'Crear proveedores'),
  ('proveedores',   'editar',     'Editar proveedores'),
  ('proveedores',   'eliminar',   'Desactivar y reactivar proveedores'),
  ('facturas',      'ver',        'Ver y descargar TODAS las facturas'),
  ('facturas',      'ver_propias','Ver y descargar solo las facturas que el usuario emitió'),
  ('facturas',      'editar',     'Marcar facturas como pagadas'),
  ('finanzas',      'ver',        'Ver finanzas, cartera, libro diario y reportes'),
  ('finanzas',      'crear',      'Registrar ingresos, gastos, compras, abonos, pagos y asientos'),
  ('finanzas',      'editar',     'Conciliar el inventario con las existencias'),
  ('finanzas',      'eliminar',   'Anular ingresos, gastos, abonos, pagos y asientos'),
  ('estadisticas',  'ver',        'Ver las estadísticas de ventas'),
  ('configuracion', 'ver',        'Ver la configuración, los usuarios, los roles y la auditoría'),
  ('configuracion', 'crear',      'Crear usuarios y roles'),
  ('configuracion', 'editar',     'Editar el negocio, los usuarios, los roles y sus permisos'),
  ('configuracion', 'eliminar',   'Eliminar roles')
ON CONFLICT (modulo, accion) DO NOTHING;

-- El admin siempre tiene todos los permisos (aunque se agreguen permisos nuevos en el futuro)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.nombre = 'admin' AND r.es_sistema
ON CONFLICT DO NOTHING;

-- Permisos de fábrica de los otros roles. Solo se cargan si el rol todavía no tiene ninguno,
-- para no pisar lo que el administrador haya ajustado después.
WITH defs (rol, permiso) AS (VALUES
  ('supervisor', 'dashboard.ver'),
  ('supervisor', 'pos.ver'), ('supervisor', 'pos.crear'),
  ('supervisor', 'inventario.ver'), ('supervisor', 'inventario.crear'), ('supervisor', 'inventario.editar'), ('supervisor', 'inventario.eliminar'),
  ('supervisor', 'clientes.ver'), ('supervisor', 'clientes.crear'), ('supervisor', 'clientes.editar'), ('supervisor', 'clientes.eliminar'),
  ('supervisor', 'proveedores.ver'), ('supervisor', 'proveedores.crear'), ('supervisor', 'proveedores.editar'), ('supervisor', 'proveedores.eliminar'),
  ('supervisor', 'facturas.ver'), ('supervisor', 'facturas.editar'),
  ('supervisor', 'finanzas.ver'), ('supervisor', 'finanzas.crear'), ('supervisor', 'finanzas.editar'), ('supervisor', 'finanzas.eliminar'),
  ('supervisor', 'estadisticas.ver'),
  ('vendedor', 'pos.ver'), ('vendedor', 'pos.crear'),
  ('vendedor', 'clientes.ver'), ('vendedor', 'clientes.crear'), ('vendedor', 'clientes.editar'),
  ('vendedor', 'facturas.ver_propias'),
  ('contador', 'finanzas.ver'), ('contador', 'finanzas.crear'), ('contador', 'finanzas.editar'), ('contador', 'finanzas.eliminar'),
  ('contador', 'facturas.ver')
)
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
  FROM defs d
  JOIN roles r ON r.nombre = d.rol
  JOIN permisos p ON p.modulo || '.' || p.accion = d.permiso
 WHERE NOT EXISTS (SELECT 1 FROM roles_permisos x WHERE x.rol_id = r.id)
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- USUARIOS: de texto a rol_id, contraseñas con bcrypt y control de cuenta
--   debe_cambiar_contrasena : obliga a cambiarla en el primer inicio de sesión
--   intentos_fallidos / bloqueado_hasta : bloqueo temporal por intentos fallidos
--   sesion_version : al subirla, todas las sesiones abiertas del usuario se cierran
-- ---------------------------------------------------------------------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id                    BIGINT REFERENCES roles(id);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_contrasena   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS intentos_fallidos         INT NOT NULL DEFAULT 0;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS bloqueado_hasta           TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS sesion_version            INT NOT NULL DEFAULT 1;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acceso             TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contrasena_cambiada_en    TIMESTAMPTZ;

DO $$
BEGIN
  -- Los usuarios actuales pasan a la nueva estructura (ninguno se borra)
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'rol') THEN
    EXECUTE 'UPDATE usuarios u SET rol_id = r.id FROM roles r WHERE r.nombre = u.rol AND u.rol_id IS NULL';
  END IF;
  -- Cualquier usuario que haya quedado sin rol recibe el de menos privilegios
  UPDATE usuarios SET rol_id = (SELECT id FROM roles WHERE nombre = 'vendedor') WHERE rol_id IS NULL;
END $$;

ALTER TABLE usuarios ALTER COLUMN rol_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON usuarios (rol_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_usuario_minuscula ON usuarios (LOWER(usuario));

-- Las contraseñas que estaban en texto plano pasan a bcrypt (las que ya son hash no se tocan)
UPDATE usuarios
   SET contrasena = crypt(contrasena, gen_salt('bf', 10)), contrasena_cambiada_en = NOW()
 WHERE contrasena !~ '^\$2[aby]\$[0-9]{2}\$';

-- A partir de aquí la base rechaza una contraseña que no sea un hash bcrypt
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS chk_contrasena_hash;
ALTER TABLE usuarios ADD CONSTRAINT chk_contrasena_hash CHECK (contrasena ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$');

ALTER TABLE usuarios DROP COLUMN IF EXISTS rol;
COMMENT ON COLUMN usuarios.contrasena IS 'Hash bcrypt (pgcrypto). Nunca texto plano.';


-- ---------------------------------------------------------------------
-- RECUPERACIÓN DE CONTRASEÑA: códigos temporales de un solo uso.
-- Se guarda el HASH del código (SHA-256), no el código: quien lea la base no puede usarlo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recuperacion_contrasena (
  id          BIGSERIAL PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo      VARCHAR(64)  NOT NULL,
  expiracion  TIMESTAMPTZ  NOT NULL,
  usado       BOOLEAN      NOT NULL DEFAULT FALSE,
  creado_por  BIGINT,
  creado_en   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  usado_en    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_recuperacion_usuario ON recuperacion_contrasena (usuario_id, usado);


-- ---------------------------------------------------------------------
-- AUDITORÍA: quién hizo qué, cuándo y desde dónde. Solo se agrega, no se edita ni se borra.
-- ---------------------------------------------------------------------
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS usuario_nombre VARCHAR(150);
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS descripcion    TEXT;
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS ip             VARCHAR(64);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria (creado_en DESC, id DESC);

-- Completa el nombre de quien actuó (queda aunque el usuario cambie de nombre) y, si falta, una descripción
CREATE OR REPLACE FUNCTION completar_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.usuario_nombre IS NULL AND NEW.usuario_id IS NOT NULL THEN
    SELECT nombre INTO NEW.usuario_nombre FROM usuarios WHERE id = NEW.usuario_id;
  END IF;
  IF NEW.descripcion IS NULL THEN
    NEW.descripcion := NEW.accion || COALESCE(' en ' || NEW.entidad, '') || COALESCE(' #' || NEW.entidad_id, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_completar ON auditoria;
CREATE TRIGGER trg_auditoria_completar BEFORE INSERT ON auditoria
  FOR EACH ROW EXECUTE FUNCTION completar_auditoria();

CREATE OR REPLACE FUNCTION bloquear_cambios_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'La auditoría no se modifica ni se borra.';
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_inmutable ON auditoria;
CREATE TRIGGER trg_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_cambios_auditoria();
