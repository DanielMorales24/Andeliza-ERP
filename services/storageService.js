// Imágenes de productos en Supabase Storage. Se usa SUPABASE_KEY (la Secret Key),
// así que esto SOLO corre en el servidor: la llave nunca llega al navegador.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { ErrorValidacion } = require('../utils/validar');

const BUCKET = process.env.SUPABASE_BUCKET || 'productos';
const EXTENSIONES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

let cliente = null;
let bucketListo = false;

function obtenerCliente() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    throw new ErrorValidacion('Para subir imágenes falta configurar SUPABASE_URL y SUPABASE_KEY en el servidor.');
  }
  if (!cliente) {
    cliente = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

// Si el bucket no existe se crea (público: las fotos se muestran sin firmar la URL)
async function asegurarBucket() {
  if (bucketListo) return;
  const sb = obtenerCliente();

  const { data } = await sb.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: Object.keys(EXTENSIONES),
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error(`No se pudo preparar el almacenamiento de imágenes (bucket "${BUCKET}"): ${error.message}`);
    }
  }
  bucketListo = true;
}

// Sube la imagen y devuelve su URL pública
async function subirImagen(buffer, mimetype) {
  const extension = EXTENSIONES[mimetype];
  if (!extension) throw new ErrorValidacion('La imagen debe ser JPG, PNG o WebP.');

  await asegurarBucket();
  const sb = obtenerCliente();
  const ruta = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${extension}`;

  const { error } = await sb.storage.from(BUCKET).upload(ruta, buffer, {
    contentType: mimetype,
    cacheControl: '31536000', // el nombre cambia en cada subida, se puede cachear un año
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`);

  return sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

// Borra una imagen a partir de su URL pública. Si falla solo se registra: no es crítico.
async function eliminarImagen(url) {
  try {
    if (!url) return;
    const marca = `/${BUCKET}/`;
    const i = url.indexOf(marca);
    if (i === -1) return;
    const ruta = decodeURIComponent(url.slice(i + marca.length).split('?')[0]);
    const { error } = await obtenerCliente().storage.from(BUCKET).remove([ruta]);
    if (error) console.error('[storage] no se pudo borrar la imagen:', error.message);
  } catch (err) {
    console.error('[storage] no se pudo borrar la imagen:', err.message);
  }
}

module.exports = { subirImagen, eliminarImagen };
