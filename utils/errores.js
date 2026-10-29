const { ErrorValidacion } = require('./validar');

// ¿El cliente espera JSON? (las llamadas fetch de la interfaz mandan Accept: application/json)
function pideJSON(req) {
  return (req.headers.accept || '').includes('application/json');
}

// Traduce errores de Postgres a mensajes entendibles. Devuelve null si no sabe cuál es.
function traducirErrorDB(err) {
  if (!err || !err.code) return null;
  if (err.code === '23505') {
    const c = err.constraint || '';
    if (c === 'productos_sku_key') return 'Ya existe un producto con ese SKU.';
    if (c === 'variantes_producto_sku_key') return 'Ya existe una variante con ese SKU.';
    if (c.startsWith('variantes_producto_producto_id_nombre')) return 'Ya existe una variante con ese nombre en este producto.';
    if (c === 'categorias_nombre_key') return 'Ya existe una categoría con ese nombre.';
    return 'Ya existe un registro con esos datos.';
  }
  if (err.code === '23503') return 'Uno de los datos elegidos (categoría, proveedor o producto) ya no existe.';
  if (err.code === '22003') return 'Un número es demasiado grande.';
  return null;
}

// Manejador final de Express: los errores esperados vuelven como JSON con su mensaje,
// el resto queda en los logs (Vercel) y se muestra una página de error.
function manejarErrores(enProduccion) {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    let estado = null;
    let mensaje = null;
    if (err instanceof ErrorValidacion) {
      estado = 422; mensaje = err.message;
    } else if (err && err.code === 'LIMIT_FILE_SIZE') {
      estado = 413; mensaje = 'La imagen pesa más de 4 MB.';
    } else if (err && err.name === 'MulterError') {
      estado = 422; mensaje = 'No se pudo leer el archivo enviado.';
    } else if (traducirErrorDB(err)) {
      estado = 422; mensaje = traducirErrorDB(err);
    }

    if (estado) {
      if (pideJSON(req)) return res.status(estado).json({ error: mensaje });
      return res.status(estado).render('errores/500', { layout: 'layouts/auth', titulo: 'Error', mensaje });
    }

    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
    if (pideJSON(req)) {
      return res.status(500).json({ error: 'Ocurrió un error inesperado. Quedó registrado; intenta de nuevo.' });
    }
    res.status(500).render('errores/500', {
      layout: 'layouts/auth',
      titulo: 'Error',
      mensaje: enProduccion ? null : err.message,
    });
  };
}

module.exports = { pideJSON, traducirErrorDB, manejarErrores };
