// =====================================================================
// client.config.js  |  CATÁLOGO MAESTRO (decisión de arquitectura D-08)
//
// Este archivo dice QUÉ EXISTE en el sistema: todas las opciones que una pyme de la región
// puede necesitar. Es el mismo para todas las instancias (un repositorio, un despliegue
// por cliente) y no se edita para un cliente en particular.
//
// Lo que ELIGE cada negocio (qué unidades usa, su paleta, su moneda...) se guarda en SU base
// de datos, en la tabla configuracion_negocio, y se cambia desde Configuración sin tocar el
// código ni volver a desplegar. Si el negocio no ha elegido nada, valen las "predeterminadas".
//
// Los datos del negocio (nombre, RTN, dirección, logo) NO van aquí: viven solo en la base.
// Para agregar una opción nueva (otra unidad, otra paleta) basta añadirla a su lista.
// =====================================================================
const numeros = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => String(desde + i));

module.exports = {
  // Valores de fábrica: solo se muestran mientras la base todavía no tiene el dato
  negocio: {
    nombre: 'Mi Negocio',
    logoUrl: '/img/logo.png',
  },

  // Si una funcionalidad está en false: no sale en el menú y su ruta responde 404.
  funcionalidades: {
    pos: true,
    inventario: true,
    facturas: true,
    estadisticas: true,
    finanzas: true,
    compras: true,
    variantes: true,
    productosCompuestos: true,
  },

  // De fábrica, mientras la base no diga otra cosa (son los mismos DEFAULT de la migración 07)
  valoresPorDefecto: {
    moneda: 'L',
    formatoFecha: 'DD/MM/YYYY',
    zonaHoraria: 'America/Tegucigalpa',
    tasasImpuesto: 0.15,
    paleta: 'azul-deportivo',
  },

  catalogo: {
    // Unidades de venta. "decimal: true" = se puede vender en fracciones (1.5 metros).
    unidades: [
      { clave: 'unidad', nombre: 'Unidad', predeterminada: true },
      { clave: 'par', nombre: 'Par', predeterminada: true },
      { clave: 'paquete', nombre: 'Paquete', predeterminada: true },
      { clave: 'docena', nombre: 'Docena' },
      { clave: 'cien', nombre: 'Ciento' },
      { clave: 'caja', nombre: 'Caja' },
      { clave: 'bolsa', nombre: 'Bolsa' },
      { clave: 'saco', nombre: 'Saco' },
      { clave: 'juego', nombre: 'Juego' },
      { clave: 'rollo', nombre: 'Rollo' },
      { clave: 'ramo', nombre: 'Ramo' },
      { clave: 'botella', nombre: 'Botella' },
      { clave: 'kilo', nombre: 'Kilo', decimal: true },
      { clave: 'libra', nombre: 'Libra', decimal: true },
      { clave: 'onza', nombre: 'Onza', decimal: true },
      { clave: 'quintal', nombre: 'Quintal', decimal: true },
      { clave: 'metro', nombre: 'Metro', decimal: true },
      { clave: 'yarda', nombre: 'Yarda', decimal: true },
      { clave: 'pie', nombre: 'Pie', decimal: true },
      { clave: 'litro', nombre: 'Litro', decimal: true },
      { clave: 'galon', nombre: 'Galón', decimal: true },
    ],

    // En qué se diferencian las variantes de un producto
    tiposVariante: [
      { clave: 'talla', nombre: 'Talla', predeterminada: true },
      { clave: 'color', nombre: 'Color' },
      { clave: 'equipo', nombre: 'Equipo', predeterminada: true },
      { clave: 'material', nombre: 'Material' },
      { clave: 'acabado', nombre: 'Acabado' },
      { clave: 'capacidad', nombre: 'Capacidad' },
      { clave: 'presentacion', nombre: 'Presentación' },
    ],

    // Las opciones que se sugieren para cada tipo de variante. "predeterminadas" en null = todas.
    opcionesVariante: {
      talla: {
        grupos: [
          { nombre: 'Letras', valores: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'] },
          { nombre: 'Números (pantalón y calzado)', valores: numeros(28, 46) },
        ],
        predeterminadas: ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
      },
      color: {
        grupos: [{ nombre: 'Colores', valores: ['Negro', 'Blanco', 'Gris', 'Rojo', 'Azul', 'Azul marino', 'Celeste', 'Verde', 'Amarillo', 'Naranja', 'Rosado', 'Morado', 'Café', 'Beige', 'Dorado'] }],
        predeterminadas: null,
      },
      equipo: {
        grupos: [{ nombre: 'Equipación', valores: ['Local', 'Visitante', 'Tercera', 'Retro', 'Entrenamiento', 'Especial'] }],
        predeterminadas: ['Local', 'Visitante', 'Tercera', 'Retro'],
      },
      material: {
        grupos: [{ nombre: 'Materiales', valores: ['Algodón', 'Poliéster', 'Licra', 'Nailon', 'Mezclilla', 'Lana', 'Cuero', 'Sintético', 'Plástico', 'Metal', 'Madera'] }],
        predeterminadas: null,
      },
      acabado: {
        grupos: [{ nombre: 'Acabados', valores: ['Mate', 'Brillante', 'Satinado', 'Texturizado', 'Natural'] }],
        predeterminadas: null,
      },
      capacidad: {
        grupos: [{ nombre: 'Capacidades', valores: ['250 ml', '500 ml', '750 ml', '1 L', '1.5 L', '2 L', '1 galón', '5 galones'] }],
        predeterminadas: null,
      },
      presentacion: {
        grupos: [{ nombre: 'Presentaciones', valores: ['Individual', 'Bolsa', 'Caja', 'Botella', 'Lata', 'Sobre', 'Frasco', 'Granel'] }],
        predeterminadas: null,
      },
    },

    monedas: [
      { clave: 'L', nombre: 'Lempira (L)' },
      { clave: '$', nombre: 'Dólar estadounidense ($)' },
      { clave: 'Q', nombre: 'Quetzal (Q)' },
      { clave: '₡', nombre: 'Colón (₡)' },
      { clave: 'C$', nombre: 'Córdoba (C$)' },
    ],

    formatosFecha: [
      { clave: 'DD/MM/YYYY', nombre: 'Día/mes/año (31/12/2026)' },
      { clave: 'MM/DD/YYYY', nombre: 'Mes/día/año (12/31/2026)' },
      { clave: 'YYYY-MM-DD', nombre: 'Año-mes-día (2026-12-31)' },
    ],

    zonasHorarias: [
      { clave: 'America/Tegucigalpa', nombre: 'Honduras' },
      { clave: 'America/Guatemala', nombre: 'Guatemala' },
      { clave: 'America/El_Salvador', nombre: 'El Salvador' },
      { clave: 'America/Managua', nombre: 'Nicaragua' },
      { clave: 'America/Costa_Rica', nombre: 'Costa Rica' },
      { clave: 'America/Panama', nombre: 'Panamá' },
      { clave: 'America/Belize', nombre: 'Belice' },
      { clave: 'America/Mexico_City', nombre: 'México (centro)' },
    ],

    // Categorías de gasto y tipos de ingreso. Cada una tiene su cuenta en el plan de cuentas
    // (gasto_<clave> o ingreso_<clave>) y las funciones registrar_gasto y registrar_ingreso aceptan
    // cualquier clave que tenga su cuenta activa. Para agregar una nueva: su cuenta (en una migración)
    // y su entrada aquí. Una prueba comprueba que las dos listas coincidan.
    categoriasGasto: [
      { clave: 'logistica', nombre: 'Logística', predeterminada: true },
      { clave: 'marketing', nombre: 'Marketing', predeterminada: true },
      { clave: 'operativos', nombre: 'Operativos', predeterminada: true },
      { clave: 'mantenimiento', nombre: 'Mantenimiento', predeterminada: true },
      { clave: 'servicios', nombre: 'Servicios (agua, luz, internet, teléfono)', predeterminada: true },
      { clave: 'impuestos', nombre: 'Impuestos municipales y tasas', predeterminada: true },
      { clave: 'otros', nombre: 'Otros', predeterminada: true },
    ],

    // "comisiones" no viene activa: solo la usan los negocios que cobran comisiones o referidos
    tiposIngreso: [
      { clave: 'intereses', nombre: 'Intereses', predeterminada: true },
      { clave: 'alquileres', nombre: 'Alquileres', predeterminada: true },
      { clave: 'servicios', nombre: 'Servicios', predeterminada: true },
      { clave: 'inversiones', nombre: 'Inversiones', predeterminada: true },
      { clave: 'comisiones', nombre: 'Comisiones (cobradas, referidos)' },
      { clave: 'otros', nombre: 'Otros', predeterminada: true },
    ],

    // Todavía sin uso en pantalla: quedan listos para la historia HU-31 (método de pago en el POS)
    metodosPago: [
      { clave: 'efectivo', nombre: 'Efectivo' },
      { clave: 'transferencia', nombre: 'Transferencia' },
      { clave: 'tarjeta', nombre: 'Tarjeta' },
      { clave: 'cheque', nombre: 'Cheque' },
    ],

    documentosIdentidad: [
      { clave: 'RTN', nombre: 'RTN (Honduras)' },
      { clave: 'DNI', nombre: 'DNI' },
      { clave: 'CEDULA', nombre: 'Cédula' },
      { clave: 'PASAPORTE', nombre: 'Pasaporte' },
      { clave: 'NIT', nombre: 'NIT' },
    ],

    // Tasas de impuesto sobre ventas, en porcentaje
    tasasImpuesto: [
      { valor: 0, nombre: 'Exento (0 %)' },
      { valor: 12, nombre: 'IVA de Guatemala (12 %)' },
      { valor: 13, nombre: 'IVA de El Salvador y Costa Rica (13 %)' },
      { valor: 15, nombre: 'ISV de Honduras (15 %)' },
      { valor: 16, nombre: 'IVA de México (16 %)' },
      { valor: 18, nombre: 'ISV de Honduras para bebidas y tabaco (18 %)' },
    ],

    // Paletas de la marca (decisión D-11). Todas cumplen las reglas de utils/colores.js:
    // texto blanco legible sobre el primario (WCAG AA, 4.5:1) y un acento que se distingue de él.
    paletas: [
      { id: 'azul-deportivo', nombre: 'Azul Deportivo', primario: '#1E40AF', acento: '#F59E0B' },
      { id: 'verde-bosque', nombre: 'Verde Bosque', primario: '#1B4332', acento: '#D8F3DC' },
      { id: 'rojo-fuego', nombre: 'Rojo Fuego', primario: '#991B1B', acento: '#FCD34D' },
      { id: 'morado-profundo', nombre: 'Morado Profundo', primario: '#5B21B6', acento: '#F0ABFC' },
      { id: 'gris-ejecutivo', nombre: 'Gris Ejecutivo', primario: '#1F2937', acento: '#60A5FA' },
      { id: 'naranja-calido', nombre: 'Naranja Cálido', primario: '#C2410C', acento: '#FED7AA' },
      { id: 'verde-menta', nombre: 'Verde Menta', primario: '#047857', acento: '#A7F3D0' },
      { id: 'azul-noche', nombre: 'Azul Noche', primario: '#0C4A6E', acento: '#38BDF8' },
      { id: 'vino-tinto', nombre: 'Vino Tinto', primario: '#7F1D3F', acento: '#FBBF24' },
      { id: 'turquesa', nombre: 'Turquesa', primario: '#115E59', acento: '#FDE68A' },
    ],
  },
};
