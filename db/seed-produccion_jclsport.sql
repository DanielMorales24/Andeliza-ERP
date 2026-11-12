-- =====================================================================
-- seed-produccion.sql  |  Datos mínimos de una instancia nueva: JCL Sport
--
-- Para qué sirve: dejar una base recién creada lista para que el administrador del
-- cliente entre y la configure con el asistente. NO es el seed de desarrollo (seed.sql).
--
-- Orden: migraciones 01 a 08, después functions.sql y al final este archivo.
--
-- Qué carga
--   * Los datos del negocio: nombre 'JCL Sport' y el logo genérico. El RTN, la dirección,
--     el teléfono y el correo quedan vacíos: los llena el administrador en el asistente.
--   * Dos usuarios administradores con contraseña temporal (se les obliga a cambiarla):
--       admin    'Administrador del Sistema'  -> ve el asistente de configuración
--       soporte  'Administrador de Soporte'   -> no lo ve
--   * Nueve categorías de tienda deportiva, sin productos.
-- Qué NO carga: productos, clientes, proveedores, CAI ni contabilidad.
--
-- Es seguro repetirlo: si la base ya tiene algún usuario, no cambia nada. Por eso tampoco
-- puede pisar una instancia en uso ni la base de desarrollo.
--
-- IMPORTANTE (seguridad): este archivo NO trae una contraseña. Antes de ejecutarlo, en una copia
-- local, reemplaza el marcador CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR por una contraseña temporal y
-- no subas esa copia. Si lo ejecutas sin reemplazarlo, la política de contraseñas lo detiene y no se
-- crea nadie. Entra con las dos cuentas y cámbiala ANTES de dar a conocer la dirección del sistema.
-- Ver db/README.md, "Instalación de una instancia nueva".
-- =====================================================================

BEGIN;

DO $$
DECLARE
  v_rol_admin BIGINT;
  v_clave     CONSTANT TEXT := 'CAMBIAR_ESTA_CLAVE_ANTES_DE_EJECUTAR';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'configuracion_negocio' AND column_name = 'onboarding_completado') THEN
    RAISE EXCEPTION 'Falta la migración 08. Ejecuta primero las migraciones 01 a 08.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'hash_contrasena' AND pronamespace = 'public'::regnamespace) THEN
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

  -- 1. El negocio. Lo que no se menciona conserva su valor de fábrica.
  INSERT INTO configuracion_negocio (id, nombre) VALUES (1, 'Mi Negocio') ON CONFLICT (id) DO NOTHING;
  UPDATE configuracion_negocio
     SET nombre = 'JCL Sport', logo_url = '/img/logo.png',
         rtn = NULL, direccion = NULL, telefono = NULL, correo = NULL,
         zona_horaria = 'America/Tegucigalpa', dias_credito = 30, contabilidad_inicio = NULL,
         onboarding_completado = FALSE, onboarding_paso = 1,
         unidades_activas = '["unidad", "par"]'::jsonb
   WHERE id = 1;

  -- 2. Los dos administradores. La contraseña temporal debe cumplir la política (con el marcador sin
  --    reemplazar, validar_contrasena se detiene aquí) y se guarda con bcrypt.
  PERFORM validar_contrasena(v_clave, 'admin');
  INSERT INTO usuarios (nombre, usuario, contrasena, rol_id, activo, debe_cambiar_contrasena, onboarding_pendiente) VALUES
    ('Administrador del Sistema', 'admin',   hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, TRUE),
    ('Administrador de Soporte',  'soporte', hash_contrasena(v_clave), v_rol_admin, TRUE, TRUE, FALSE);

  -- 3. Categorías de una tienda deportiva (sin productos)
  INSERT INTO categorias (nombre) VALUES
    ('Camisetas'), ('Pantalones'), ('Calzado'), ('Balones'), ('Accesorios'),
    ('Gorras'), ('Medias'), ('Sudaderas'), ('Conjuntos')
  ON CONFLICT (nombre) DO NOTHING;

  PERFORM registrar_auditoria(NULL, 'instalacion', 'configuracion_negocio', 1,
                              'Instalación inicial de la instancia con el seed de producción', NULL, NULL);
END $$;

COMMIT;
