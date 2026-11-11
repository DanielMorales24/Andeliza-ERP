// Contraste y distancia entre colores (decisión D-11). Sirve para dos cosas:
//   1) comprobar que una pareja primario + acento se puede usar (texto legible, colores distinguibles)
//   2) derivar el "acento fuerte": el mismo tono del acento, oscurecido hasta que se vea sobre blanco
// Las fórmulas son las de WCAG 2.1 (luminancia relativa y razón de contraste) y CIE76 (ΔE en L*a*b*).
const HEX = /^#[0-9a-f]{6}$/i;
const BLANCO = '#FFFFFF';

// Umbrales
const REGLAS = {
  textoBlanco: 4.5,        // WCAG AA para texto normal: blanco sobre el primario
  acentoSobrePrimario: 3,  // el acento se usa encima del primario (marca del menú, franja del acceso)
  distancia: 25,           // ΔE mínimo entre primario y acento: por debajo se ven como el mismo color
  sobreBlanco: 3,          // WCAG 1.4.11: elementos gráficos y anillo de foco sobre fondo claro
};

const normalizar = (c) => (typeof c === 'string' && HEX.test(c.trim()) ? c.trim().toUpperCase() : null);
const aRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const aHex = (rgb) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const lineal = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

function luminancia(hex) {
  const [r, g, b] = aRgb(hex).map(lineal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Razón de contraste entre dos colores: de 1 (iguales) a 21 (negro sobre blanco)
function contraste(a, b) {
  const x = luminancia(a); const y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function aLab(hex) {
  const [r, g, b] = aRgb(hex).map(lineal);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

// Qué tan distintos se ven dos colores (ΔE CIE76): 0 = idénticos, más de 25 = claramente distintos
function distancia(a, b) {
  const p = aLab(a); const q = aLab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

function aHsl(hex) {
  const [r, g, b] = aRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min; const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function deHsl([h, s, l]) {
  if (s === 0) return aHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const canal = (t) => { let x = t; if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return aHex([canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255]);
}

// Oscurece un color conservando su tono y su saturación hasta que alcance el contraste pedido
function oscurecerHasta(hex, minimo = REGLAS.sobreBlanco, sobre = BLANCO) {
  const [h, s] = aHsl(hex); let l = aHsl(hex)[2]; let c = hex.toUpperCase();
  while (contraste(c, sobre) < minimo && l > 0) { l = Math.max(0, l - 0.01); c = deHsl([h, s, l]); }
  return c;
}

const redondear = (n) => Math.round(n * 100) / 100;

// Los colores que usa la interfaz a partir de una pareja ya aceptada
function derivar(primario, acento) {
  return { primario, acento, acentoFuerte: oscurecerHasta(acento) };
}

// ¿Se puede usar esta pareja? Devuelve las medidas y, si no, por qué (con palabras para el usuario)
function evaluar(primarioCrudo, acentoCrudo) {
  const primario = normalizar(primarioCrudo); const acento = normalizar(acentoCrudo);
  if (!primario || !acento) {
    return { valida: false, problemas: [{ regla: 'formato', mensaje: 'Los colores deben escribirse como #RRGGBB (por ejemplo #1E40AF).' }], medidas: null, colores: null };
  }
  const medidas = {
    textoBlanco: redondear(contraste(BLANCO, primario)),
    acentoSobrePrimario: redondear(contraste(acento, primario)),
    distancia: redondear(distancia(primario, acento)),
  };
  const problemas = [];
  if (medidas.textoBlanco < REGLAS.textoBlanco) {
    problemas.push({ regla: 'textoBlanco', mensaje: `Con este color primario, el texto blanco no sería legible (contraste ${medidas.textoBlanco}:1 y el mínimo es ${REGLAS.textoBlanco}:1). Elige un tono más oscuro.` });
  }
  if (medidas.distancia < REGLAS.distancia) {
    problemas.push({ regla: 'distancia', mensaje: 'El acento se parece demasiado al color primario: en pantalla se verían como el mismo color.' });
  } else if (medidas.acentoSobrePrimario < REGLAS.acentoSobrePrimario) {
    problemas.push({ regla: 'acentoSobrePrimario', mensaje: `El acento no se distinguiría sobre el color primario (contraste ${medidas.acentoSobrePrimario}:1 y el mínimo es ${REGLAS.acentoSobrePrimario}:1).` });
  }
  return { valida: problemas.length === 0, problemas, medidas, colores: derivar(primario, acento) };
}

module.exports = { REGLAS, normalizar, luminancia, contraste, distancia, oscurecerHasta, derivar, evaluar };
