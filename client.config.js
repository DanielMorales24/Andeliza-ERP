// =====================================================================
// client.config.js
// Lo único que cambia entre un cliente y otro. Todo lo personalizable
// vive aquí: nada de nombres, colores ni textos del negocio en el código.
// Se inyecta en las vistas como "config" (app.locals.config).
//
// Nota para la Fase 7: los datos del negocio de abajo son los valores
// iniciales. Si el dueño los edita desde Configuración, se guardan en la
// tabla configuracion_negocio y esos valores pasan por encima de estos.
// Los colores y las funcionalidades siempre se quedan en este archivo.
// =====================================================================
module.exports = {
  negocio: {
    nombre: 'JCL SPORT Demo',
    nombreCorto: 'JCL SPORT',
    logoUrl: '/img/logo.png',
    rtn: '08019999999999',
    direccion: 'Barrio Centro, San Pedro Sula, Cortés',
    telefono: '2550-0000',
    correo: 'ventas@jclsport.hn',
    colores: {
      primario: '#1e40af', // azul deportivo
      acento: '#f59e0b',   // naranja/amarillo
    },
  },

  // Si una funcionalidad está en false: no sale en el menú y su ruta responde 404.
  funcionalidades: {
    pos: true,
    inventario: true,
    facturas: true,
    estadisticas: true,
    finanzas: true,
    compras: true,
    variantes: true,           // activado para este cliente
    productosCompuestos: true, // el uniforme completo
    accesoQR: false,           // se activa en Fase 8
  },

  valoresPorDefecto: {
    moneda: 'L',
    formatoFecha: 'DD/MM/YYYY',
    tasasImpuesto: 0.15,
    zonaHoraria: 'America/Tegucigalpa',
    unidades: ['unidad', 'par', 'paquete'],
    tiposVariante: ['talla', 'equipo'],
    tallas: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    equipos: ['Local', 'Visitante', 'Tercera', 'Retro'],
  },
};
