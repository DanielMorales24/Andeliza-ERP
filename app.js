require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const expressLayouts = require('express-ejs-layouts');

const config = require('./client.config');
const db = require('./db');
const formato = require('./utils/formato');
const { manejarErrores } = require('./utils/errores');
const { modulosVisibles } = require('./modulos');

const enProduccion = process.env.NODE_ENV === 'production';
if (enProduccion && !process.env.SESSION_SECRET) {
  throw new Error('Falta la variable de entorno SESSION_SECRET');
}

const app = express();

app.set('trust proxy', 1); // Vercel va detrás de un proxy (necesario para la cookie secure)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sesión en cookie firmada: funciona en serverless (MemoryStore no)
app.use(cookieSession({
  name: 'sesion',
  keys: [process.env.SESSION_SECRET || 'solo-para-desarrollo-local'],
  maxAge: 12 * 60 * 60 * 1000, // 12 horas
  httpOnly: true,
  sameSite: 'lax',
  secure: enProduccion,
}));

// Disponible en todas las vistas
app.locals.config = config;
app.locals.dinero = formato.dinero;
app.locals.fecha = formato.fecha;
app.locals.modulosVisibles = modulosVisibles;

app.use((req, res, next) => {
  res.locals.rutaActual = req.path;
  res.locals.titulo = '';
  next();
});

// Para comprobar el despliegue: GET /salud  (y GET /salud?pdf=1 también prueba la generación de PDF)
app.get('/salud', async (req, res) => {
  try {
    await db.query('SELECT 1');
    const respuesta = { ok: true, base_de_datos: 'conectada' };
    if (req.query.pdf === '1') {
      try {
        const buffer = await require('./services/pdfService').generar({
          tipo: 'interno', negocio: { nombre: 'Prueba' }, logo: null, color: config.negocio.colores.primario, fecha: new Date(),
          tasaPct: 0, numero: 'PRUEBA', estado: 'C', cliente: null, items: [], subtotal: 0, impuesto: 0, total: 0,
        });
        respuesta.pdf = `ok (${buffer.length} bytes)`;
      } catch (err) {
        console.error('[salud] el PDF falló:', err);
        respuesta.pdf = 'error: ' + err.message;
        respuesta.ok = false;
      }
    }
    res.status(respuesta.ok ? 200 : 500).json(respuesta);
  } catch (err) {
    console.error('[salud] sin conexión a la base de datos:', err.message);
    res.status(500).json({ ok: false, base_de_datos: 'sin conexión' });
  }
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/finanzas', require('./routes/finanzas'));
app.use('/pos', require('./routes/pos'));
app.use('/facturas', require('./routes/facturas'));
app.use('/inventario', require('./routes/inventario'));
app.use('/categorias', require('./routes/categorias'));
app.use('/clientes', require('./routes/clientes'));
app.use('/proveedores', require('./routes/proveedores'));
// Rutas de módulos pendientes. Cada fase pone su router real ANTES de esta línea.
app.use('/', require('./routes/modulos'));

app.use((req, res) => {
  res.status(404).render('errores/404', { layout: 'layouts/auth', titulo: 'No encontrada' });
});

// Todo error termina aquí: los esperados vuelven con su mensaje, el resto queda en los logs de Vercel
app.use(manejarErrores(enProduccion));

if (process.env.NODE_ENV !== 'production') {
  const puerto = process.env.PORT || 3000;
  app.listen(puerto, () => console.log(`http://localhost:${puerto}`));
}

module.exports = app;
