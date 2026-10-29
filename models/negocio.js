// Datos del negocio y de la facturación. Los datos del negocio salen de la tabla
// configuracion_negocio (editable desde la interfaz en la Fase 7) y, si un campo está
// vacío, de client.config.js.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../client.config');

const NOMBRE_POR_DEFECTO_DB = 'Mi Negocio'; // valor que trae schema_es.sql si nadie lo editó

async function obtener() {
  const base = config.negocio;
  let fila = {};
  try {
    const { rows } = await db.query(
      'SELECT nombre, logo_url, rtn, direccion, telefono, correo FROM configuracion_negocio WHERE id = 1'
    );
    fila = rows[0] || {};
  } catch (err) {
    console.error('[negocio] no se pudo leer configuracion_negocio:', err.message);
  }
  const elegir = (valorDb, valorConfig) => (valorDb && String(valorDb).trim() ? String(valorDb).trim() : valorConfig || '');
  return {
    nombre: fila.nombre && fila.nombre !== NOMBRE_POR_DEFECTO_DB ? fila.nombre : base.nombre,
    logoUrl: elegir(fila.logo_url, base.logoUrl),
    rtn: elegir(fila.rtn, base.rtn),
    direccion: elegir(fila.direccion, base.direccion),
    telefono: elegir(fila.telefono, base.telefono),
    correo: elegir(fila.correo, base.correo),
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
  return fiscal ? Number(fiscal.tasa_impuesto) : config.valoresPorDefecto.tasasImpuesto;
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

module.exports = { obtener, fiscalActiva, fiscalPorCai, tasaImpuesto, modoFacturacion, logo };
