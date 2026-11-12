-- =====================================================================
-- seed-produccion.sql  |  Seed estándar para una instancia nueva
--
-- Para qué sirve: dejar una base recién creada lista para que el
-- administrador del cliente entre y configure el negocio con el
-- asistente de onboarding. Es la plantilla GENÉRICA: funciona para
-- cualquier pyme y no asume un rubro específico.
--
-- Orden: migraciones 01 a 08, después functions.sql y al final este archivo.
--
-- Cuándo usar los ejemplos por cliente
--   Si el cliente ya tiene un rubro definido y sus datos (nombre,
--   categorías típicas, unidades de venta), conviene partir de un
--   ejemplo concreto en lugar de este estándar:
--     · db/seed-produccion_jclsport.sql   (tienda deportiva)
--     · db/seed-produccion_lasflores.sql  (floristería)
--   Copia uno, ajústalo a la pyme y guárdalo como
--   db/seed-produccion_<cliente>.sql. Este archivo se mantiene como
--   el punto de partida universal.
--
-- Qué carga
--   * El negocio con nombre genérico 'Mi Negocio' y logo genérico.
--     El administrador lo renombra en el asistente con su RTN,
--     dirección, teléfono y correo reales.
--   * Dos usuarios administradores con contraseña temporal (cambio
--     obligatorio al primer login):
--       admin    'Administrador del Sistema'  -> ve el asistente
--       soporte  'Administrador de Soporte'   -> no lo ve
--   * Tres categorías genéricas que el administrador puede renombrar
--     o borrar: General, Productos, Servicios.
-- Qué NO carga: productos, clientes, proveedores, CAI, contabilidad.
--
-- Es seguro repetirlo: si la base ya tiene usuarios, no cambia nada.
--
-- SEGURIDAD: este archivo NO trae una contraseña real. Antes de
-- ejecutarlo, en una copia local, reemplaza el marcador
-- CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR por una contraseña temporal
-- (8+ caracteres, letras y números) y no subas esa copia. Si lo
-- ejecutas sin reemplazarlo, la política de contraseñas lo detiene
-- y no se crea ningún usuario. Entra con las dos cuentas y cámbiala
-- ANTES de dar a conocer la dirección del sistema.
-- Ver db/README.md, "Instalación de una instancia nueva".
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_rol_admin BIGINT;
  v_clave     CONSTANT TEXT := 'CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'configuracion_negocio'
                    AND column_name = 'onboarding_completado') THEN
    RAISE EXCEPTION 'Falta la migración 07. Ejecuta primero las migraciones 01 a 08.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hash_contrasena'
                  AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'Falta functions.sql. Ejecútalo antes que este archivo.';
  END IF;

  IF EXISTS (SELECT 1 FROM usuarios) THEN
    RAISE NOTICE 'Esta base ya tiene usuarios: el seed de producción no cambia nada.';
    RETURN;
  END IF;

  SELECT id INTO v_rol_admin FROM roles WHERE nombre = 'admin' AND es_sistema;
  IF v_rol_admin IS NULL THEN
    RAISE EXCEPTION 'No existe el rol admin de fábrica. Revisa que la migración 05 se haya ejecutado.';
  END IF;

  -- 1. El negocio, con valores genéricos. El administrador lo completa
  --    en el asistente de configuración inicial.
  INSERT INTO configuracion_negocio (id, nombre) VALUES (1, 'Mi Negocio') ON CONFLICT (id) DO NOTHING;
  UPDATE configuracion_negocio
     SET nombre = 'Mi Negocio',
         logo_url = '/img/logo.png',
         rtn = NULL,
         direccion = NULL,
         telefono = NULL,
         correo = NULL,
         zona_horaria = 'America/Tegucigalpa',
         dias_credito = 30,
         contabilidad_inicio = NULL,
         onboarding_completado = FALSE,
         onboarding_paso = 1,
         unidades_activas = '["unidad"]'::jsonb
   WHERE id = 1;

  -- 2. Los dos administradores con contraseña temporal y cambio obligatorio
  PERFORM validar_contrasena(v_clave, 'admin');
  INSERT INTO usuarios (nombre, usuario, contrasena, rol_id, activo, debe_cambiar_contrasena, onboarding_pendiente) VALUES
    ('Administrador del Sistema', 'admin',   hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, TRUE),
    ('Administrador de Soporte',  'soporte', hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, FALSE);

  -- 3. Categorías genéricas. El administrador puede renombrarlas o
  --    borrarlas desde la interfaz. Los ejemplos por cliente traen
  --    categorías específicas de su rubro.
  INSERT INTO categorias (nombre) VALUES
    ('General'),
    ('Productos'),
    ('Servicios')
  ON CONFLICT (nombre) DO NOTHING;

  PERFORM registrar_auditoria(NULL, 'instalacion', 'configuracion_negocio', 1,
    'Instalación inicial con el seed estándar de producción', NULL, NULL);
END $$;

COMMIT;