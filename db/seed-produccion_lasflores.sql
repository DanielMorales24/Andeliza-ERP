-- =====================================================================
-- seed-produccion-las-flores.sql  |  Datos mínimos: Las Flores (floristería)
--
-- Para qué sirve: dejar una base recién creada lista para que Ana Girón
-- (representante de Las Flores) entre y configure el negocio con el
-- asistente. NO es el seed de desarrollo (seed.sql).
--
-- Orden: migraciones 01 a 08, después functions.sql y al final este archivo.
--
-- Diferencias con el seed de JCL Sport
--   * Nombre: Las Flores
--   * Categorías de floristería (no deportivas)
--   * Unidades activas: unidad, ramo, docena, paquete, cien
--   * Contraseña temporal distinta
--
-- IMPORTANTE (SAR): Las Flores SÍ está inscrita en el SAR. Después del
-- asistente, Ana debe cargar su CAI real desde Configuración → Facturación.
-- Mientras no lo haga, el sistema emite comprobantes internos (INT-000001).
-- El CAI NO va en este archivo: es un dato fiscal real que solo ella tiene.
--
-- Qué carga
--   * El negocio: 'Las Flores' y el logo genérico. RTN, dirección, teléfono
--     y correo quedan vacíos (los llena Ana en el asistente).
--   * Dos usuarios administradores con contraseña temporal:
--       admin    'Administrador del Sistema'  -> ve el asistente
--       soporte  'Administrador de Soporte'   -> no lo ve
--   * Nueve categorías de floristería, sin productos.
-- Qué NO carga: productos, clientes, proveedores, CAI ni contabilidad.
--
-- Es seguro repetirlo: si la base ya tiene usuarios, no cambia nada.
--
-- SEGURIDAD: este archivo trae el marcador
-- 'CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR'. Antes de ejecutarlo, en una copia
-- local, reemplázalo por la contraseña temporal (LasFlores2026!) y no subas
-- esa copia al repo. Si se ejecuta sin reemplazar, la política de contraseñas
-- lo detiene y no se crea ningún usuario.
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
    RAISE EXCEPTION 'Falta la migración 08. Ejecuta primero las migraciones 01 a 08.';
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
    RAISE EXCEPTION 'No existe el rol admin de fábrica. Revisa que la migración 08 se haya ejecutado.';
  END IF;

  -- 1. El negocio
  INSERT INTO configuracion_negocio (id, nombre) VALUES (1, 'Mi Negocio') ON CONFLICT (id) DO NOTHING;
  UPDATE configuracion_negocio
     SET nombre = 'Las Flores',
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
         unidades_activas = '["unidad", "ramo", "docena", "paquete", "cien"]'::jsonb
   WHERE id = 1;

  -- 2. Los dos administradores
  PERFORM validar_contrasena(v_clave, 'admin');
  INSERT INTO usuarios (nombre, usuario, contrasena, rol_id, activo, debe_cambiar_contrasena, onboarding_pendiente) VALUES
    ('Administrador del Sistema', 'admin',   hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, TRUE),
    ('Administrador de Soporte',  'soporte', hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, FALSE);

  -- 3. Categorías de floristería (sin productos)
  INSERT INTO categorias (nombre) VALUES
    ('Flores naturales'),
    ('Ramos y arreglos'),
    ('Plantas'),
    ('Arreglos fúnebres'),
    ('Globos'),
    ('Peluches'),
    ('Tarjetas y detalles'),
    ('Decoración'),
    ('Arreglos por encargo')
  ON CONFLICT (nombre) DO NOTHING;

  PERFORM registrar_auditoria(NULL, 'instalacion', 'configuracion_negocio', 1,
    'Instalación inicial de Las Flores (floristería) con el seed de producción', NULL, NULL);
END $$;

COMMIT;