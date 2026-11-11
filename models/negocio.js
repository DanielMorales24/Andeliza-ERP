// Datos del negocio y de la facturación de ESTA instancia. Todo sale de la tabla configuracion_negocio:
// la identidad (nombre, RTN, logo), el formato regional, la paleta y lo que el negocio eligió del
// catálogo maestro. client.config.js solo aporta los valores de fábrica mientras la base no tiene el dato.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../client.config');
const Catalogo = require('../utils/catalogo');
const Colores = require('../utils/colores');

const NOMBRE_POR_DEFECTO_DB = 'Mi Negocio'; // valor que trae el esquema si nadie lo editó
const LOGO_GENERICO = '/img/logo.png';
const FABRICA = config.valoresPorDefecto;

const COLUMNAS_NEGOCIO = `nombre, logo_url, rtn, direccion, telefono, correo, zona_horaria, moneda, formato_fecha, tasa_impuesto,
  paleta_id, color_primario, color_acento, unidades_activas, tipos_variante_activos, opciones_variante_activas,
  categorias_gasto_activas, tipos_ingreso_activos, onboarding_completado, onboarding_paso`;

// Sin caché a propósito: en Vercel cada instancia tendría la suya y, tras guardar en Configuración,
// otra instancia podría seguir mostrando lo viejo. Es una lectura por llave primaria.
function invalidar() { /* nada que invalidar; se deja para no cambiar quién lo llama */ }

async function obtener() {
  let fila = {};
  try {
    const { rows } = await db.query(`SELECT ${COLUMNAS_NEGOCIO} FROM configuracion_negocio WHERE id = 1`);
    fila = rows[0] || {};
  } catch (err) {
    console.error('[negocio] no se pudo leer configuracion_negocio:', err.message);
  }
  return armar(fila);
}

// De la fila de la base a lo que usa la aplicación. Lo que falte toma su valor de fábrica.
function armar(fila) {
  const texto = (v) => (v && String(v).trim() ? String(v).trim() : '');
  const base = Catalogo.paleta(FABRICA.paleta);
  const primario = Colores.normalizar(fila.color_primario) || base.primario;
  const acento = Colores.normalizar(fila.color_acento) || base.acento;
  return {
    nombre: texto(fila.nombre) && fila.nombre !== NOMBRE_POR_DEFECTO_DB ? texto(fila.nombre) : config.negocio.nombre,
    logoUrl: texto(fila.logo_url) || config.negocio.logoUrl,
    logoPropio: Boolean(texto(fila.logo_url)) && texto(fila.logo_url) !== LOGO_GENERICO,
    rtn: texto(fila.rtn), direccion: texto(fila.direccion), telefono: texto(fila.telefono), correo: texto(fila.correo),
    zonaHoraria: texto(fila.zona_horaria) || FABRICA.zonaHoraria,
    moneda: texto(fila.moneda) || FABRICA.moneda,
    formatoFecha: texto(fila.formato_fecha) || FABRICA.formatoFecha,
    tasaImpuesto: fila.tasa_impuesto === undefined || fila.tasa_impuesto === null ? FABRICA.tasasImpuesto : Number(fila.tasa_impuesto),
    paletaId: Catalogo.paleta(fila.paleta_id) ? fila.paleta_id : FABRICA.paleta,
    colores: Colores.derivar(primario, acento),   // { primario, acento, acentoFuerte }
    catalogo: Catalogo.resolver(fila),            // lo que este negocio tiene activo
    onboardingCompletado: fila.onboarding_completado === true,
    onboardingPaso: Number(fila.onboarding_paso) || 1,
  };
}

const COLUMNAS_FISCAL = 'cai, rango_inicio, rango_fin, numero_actual, fecha_limite, tasa_impuesto, moneda, pie_legal';

async function fiscalActiva() {
  const { rows } = await db.query(`SELECT ${COLUMNAS_FISCAL} FROM configuracion_fiscal WHERE activo`);
  return rows[0] || null;
}

// La configuración con la que se emitió una factura (si se cambió de CAI después, se reimprime con el suyo)
async function fiscalPorCai(cai) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_FISCAL} FROM configuracion_fiscal WHERE cai = $1 ORDER BY activo DESC, id DESC LIMIT 1`, [cai]
  );
  return rows[0] || null;
}

async function tasaImpuesto() {
  const fiscal = await fiscalActiva();
  // Con CAI manda la tasa del CAI. Sin CAI (facturación interna), la tasa por defecto que eligió el negocio.
  return fiscal ? Number(fiscal.tasa_impuesto) : (await obtener()).tasaImpuesto;
}

// Modo de facturación: SAR (hay CAI activo) o interno (sin CAI, números INT-000001)
async function modoFacturacion() {
  try {
    const fiscal = await db.query(
      'SELECT rango_fin - numero_actual AS restantes, fecha_limite, (fecha_limite - CURRENT_DATE) AS dias FROM configuracion_fiscal WHERE activo'
    );
    if (fiscal.rows[0]) {
      const f = fiscal.rows[0];
      return { modo: 'sar', restantes: f.restantes, fechaLimite: f.fecha_limite, dias: f.dias };
    }
    const interno = await db.query(
      `SELECT prefijo_factura_interna || '-' || LPAD((numero_factura_interna + 1)::TEXT, 6, '0') AS siguiente
         FROM configuracion_negocio WHERE id = 1`
    );
    return { modo: 'interno', siguiente: interno.rows[0] ? interno.rows[0].siguiente : null };
  } catch (err) {
    // Si falta correr una migración, el resto de la pantalla debe seguir funcionando
    console.error('[negocio] no se pudo leer el modo de facturación:', err.message);
    return null;
  }
}

// Logo para el PDF. pdfkit solo acepta PNG y JPEG: cualquier otra cosa se ignora.
// Puede ser una ruta de public/ (/img/logo.png) o una URL (Supabase Storage).
const cacheLogo = new Map();

const esPNG = (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const esJPEG = (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

async function logo(url) {
  if (!url) return null;
  const guardado = cacheLogo.get(url);
  if (guardado && guardado.hasta > Date.now()) return guardado.buffer;

  let buffer = null;
  try {
    if (/^https?:\/\//i.test(url)) {
      const control = new AbortController();
      const temporizador = setTimeout(() => control.abort(), 3000);
      try {
        const r = await fetch(url, { signal: control.signal });
        if (r.ok) buffer = Buffer.from(await r.arrayBuffer());
      } finally {
        clearTimeout(temporizador);
      }
    } else {
      const publico = path.join(__dirname, '..', 'public');
      const ruta = path.join(publico, url.replace(/^\/+/, ''));
      if (ruta.startsWith(publico + path.sep)) buffer = fs.readFileSync(ruta);
    }
    if (buffer && (buffer.length > 3 * 1024 * 1024 || !(esPNG(buffer) || esJPEG(buffer)))) buffer = null;
  } catch (err) {
    console.error('[pdf] el logo no está disponible, se imprime sin logo:', err.message);
    buffer = null;
  }
  cacheLogo.set(url, { buffer, hasta: Date.now() + (buffer ? 10 * 60 * 1000 : 60 * 1000) });
  return buffer;
}

// ---------- Edición desde Configuración (Fase 7) ----------

// Lo que hay en la base tal cual (para que el formulario muestre lo guardado)
async function obtenerCrudo() {
  const { rows } = await db.query(`SELECT ${COLUMNAS_NEGOCIO} FROM configuracion_negocio WHERE id = 1`);
  return rows[0] || {};
}

async function actualizar(d) {
  await db.query(
    `UPDATE configuracion_negocio SET nombre = $1, rtn = $2, direccion = $3, telefono = $4, correo = $5, logo_url = $6 WHERE id = 1`,
    [d.nombre, d.rtn || null, d.direccion || null, d.telefono || null, d.correo || null, d.logoUrl || null]
  );
  invalidar();
}

// La configuración fiscal que se muestra en el formulario: la activa, o la última que hubo
async function fiscalParaFormulario() {
  const { rows } = await db.query(
    `SELECT id, ${COLUMNAS_FISCAL}, activo FROM configuracion_fiscal ORDER BY activo DESC, id DESC LIMIT 1`
  );
  return rows[0] || null;
}

// Apaga el modo SAR (las facturas nuevas pasan a ser comprobantes internos). El historial se conserva.
async function apagarFiscal() {
  const { rowCount } = await db.query('UPDATE configuracion_fiscal SET activo = FALSE WHERE activo');
  return rowCount > 0;
}

// Enciende el modo SAR con un CAI. Si el CAI es el mismo que ya existe, se actualizan sus datos
// sin tocar el número en curso (así nunca se repite un número de factura). Si es otro CAI,
// o cambió el inicio del rango, se crea uno nuevo que arranca en su primer número.
async function guardarFiscal(d) {
  const monedaNegocio = (await obtener()).moneda;
  return db.transaccion(async (cx) => {
    await cx.query('SELECT 1 FROM configuracion_negocio WHERE id = 1 FOR UPDATE');   // serializa cambios simultáneos
    const previa = (await cx.query('SELECT * FROM configuracion_fiscal WHERE cai = $1 ORDER BY id DESC LIMIT 1', [d.cai])).rows[0];

    await cx.query('UPDATE configuracion_fiscal SET activo = FALSE WHERE activo AND (id IS DISTINCT FROM $1)', [previa ? previa.id : null]);

    if (previa && previa.rango_inicio === d.rangoInicio) {
      if (d.rangoFin < previa.numero_actual) {
        throw new (require('../utils/validar').ErrorValidacion)(`El fin del rango no puede ser menor que el último número usado (${previa.numero_actual}).`);
      }
      await cx.query(
        `UPDATE configuracion_fiscal SET rango_fin = $1, fecha_limite = $2, tasa_impuesto = $3, pie_legal = $4, activo = TRUE WHERE id = $5`,
        [d.rangoFin, d.fechaLimite, d.tasa, d.pieLegal || null, previa.id]
      );
      return { id: previa.id, nuevo: false };
    }

    const ins = await cx.query(
      `INSERT INTO configuracion_fiscal (cai, rango_inicio, rango_fin, numero_actual, fecha_limite, tasa_impuesto, moneda, pie_legal, activo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE) RETURNING id`,
      [d.cai, d.rangoInicio, d.rangoFin, d.rangoInicio - 1, d.fechaLimite, d.tasa, monedaNegocio, d.pieLegal || null]
    );
    return { id: ins.rows[0].id, nuevo: true };
  });
}

// ---------- Formato regional, paleta y catálogo (Fase 6.5) ----------

async function guardarRegional(d) {
  await db.query('UPDATE configuracion_negocio SET moneda = $1, formato_fecha = $2, zona_horaria = $3, tasa_impuesto = $4 WHERE id = 1',
    [d.moneda, d.formatoFecha, d.zonaHoraria, d.tasaImpuesto]);
}

// p viene de Catalogo.validarPaleta: los colores son los del catálogo, no los que mande el navegador
async function guardarPaleta(p) {
  await db.query('UPDATE configuracion_negocio SET paleta_id = $1, color_primario = $2, color_acento = $3 WHERE id = 1', [p.id, p.primario, p.acento]);
}

async function guardarCatalogo(e) {
  await db.query(
    `UPDATE configuracion_negocio
        SET unidades_activas = $1::jsonb, tipos_variante_activos = $2::jsonb, opciones_variante_activas = $3::jsonb,
            categorias_gasto_activas = $4::jsonb, tipos_ingreso_activos = $5::jsonb
      WHERE id = 1`,
    [JSON.stringify(e.unidades), JSON.stringify(e.tiposVariante), JSON.stringify(e.opcionesVariante), JSON.stringify(e.categoriasGasto), JSON.stringify(e.tiposIngreso)]
  );
}

// Cuántos productos usan cada unidad (para avisar antes de desactivar una que está en uso)
async function usoUnidades() {
  const { rows } = await db.query('SELECT unidad, COUNT(*)::int AS n FROM productos GROUP BY unidad');
  return Object.fromEntries(rows.map((r) => [r.unidad, r.n]));
}

async function guardarUnidades(unidades) {
  await db.query('UPDATE configuracion_negocio SET unidades_activas = $1::jsonb WHERE id = 1', [JSON.stringify(unidades)]);
}

async function guardarMovimientos(categoriasGasto, tiposIngreso) {
  await db.query('UPDATE configuracion_negocio SET categorias_gasto_activas = $1::jsonb, tipos_ingreso_activos = $2::jsonb WHERE id = 1',
    [JSON.stringify(categoriasGasto), JSON.stringify(tiposIngreso)]);
}

// ---------- Asistente de configuración inicial ----------

async function guardarContacto(d) {
  await db.query('UPDATE configuracion_negocio SET rtn = $1, direccion = $2, telefono = $3, correo = $4 WHERE id = 1', [d.rtn, d.direccion, d.telefono, d.correo]);
}

async function guardarLogo(url) {
  await db.query('UPDATE configuracion_negocio SET logo_url = $1 WHERE id = 1', [url]);
  cacheLogo.clear();
}

// Recuerda hasta qué paso se llegó (nunca retrocede) para poder retomar el asistente
async function avanzarOnboarding(paso) {
  await db.query('UPDATE configuracion_negocio SET onboarding_paso = GREATEST(onboarding_paso, $1) WHERE id = 1 AND NOT onboarding_completado', [paso]);
}

async function completarOnboarding(usuarioId, ip) {
  const { rows } = await db.query('SELECT completar_onboarding($1, $2) AS r', [usuarioId, ip || null]);
  return rows[0].r;
}

module.exports = {
  obtener, fiscalActiva, fiscalPorCai, tasaImpuesto, modoFacturacion, logo, LOGO_GENERICO,
  obtenerCrudo, actualizar, fiscalParaFormulario, apagarFiscal, guardarFiscal, invalidar,
  guardarRegional, guardarPaleta, guardarCatalogo, guardarUnidades, guardarMovimientos, usoUnidades,
  guardarContacto, guardarLogo, avanzarOnboarding, completarOnboarding,
};
