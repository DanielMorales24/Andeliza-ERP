// Foco: REGLAS DE NEGOCIO. Cuando una función de la base rechaza algo (RAISE EXCEPTION, código P0001),
// la persona tiene que recibir ese mensaje con un 422, no un "error inesperado".
const { manejarErrores, traducirErrorDB } = require('../../utils/errores');
const { ErrorValidacion } = require('../../utils/validar');

// Respuesta falsa de Express que solo guarda lo que se le pide
function respuestaFalsa() {
  const r = { headersSent: false, estado: null, cuerpo: null, vista: null };
  r.status = (s) => { r.estado = s; return r; };
  r.json = (c) => { r.cuerpo = c; return r; };
  r.render = (v, datos) => { r.vista = v; r.cuerpo = datos; return r; };
  return r;
}
const pideJSON = { headers: { accept: 'application/json' }, method: 'POST', originalUrl: '/x' };

describe('manejarErrores', () => {
  const manejar = manejarErrores(false);

  test('un rechazo de la base (P0001) llega como 422 con el mismo mensaje', () => {
    // Preparar
    const err = Object.assign(new Error('La factura INT-000001 tiene abonos registrados.'), { code: 'P0001' });
    const res = respuestaFalsa();
    // Actuar
    manejar(err, pideJSON, res, () => {});
    // Comprobar
    expect(res.estado).toBe(422);
    expect(res.cuerpo).toEqual({ error: 'La factura INT-000001 tiene abonos registrados.' });
  });

  test('un ErrorValidacion también es 422', () => {
    const res = respuestaFalsa();
    manejar(new ErrorValidacion('El monto debe ser mayor que cero.'), pideJSON, res, () => {});
    expect(res.estado).toBe(422);
    expect(res.cuerpo.error).toBe('El monto debe ser mayor que cero.');
  });

  test('un error desconocido es 500 y no muestra detalles internos', () => {
    const espia = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = respuestaFalsa();
    manejar(new Error('connection terminated: secreto interno'), pideJSON, res, () => {});
    expect(res.estado).toBe(500);
    expect(res.cuerpo.error).not.toMatch(/secreto/);
    espia.mockRestore();
  });
});

describe('traducirErrorDB', () => {
  test('un SKU repetido se explica en palabras', () => {
    expect(traducirErrorDB({ code: '23505', constraint: 'productos_sku_key' })).toBe('Ya existe un producto con ese SKU.');
  });
  test('un error que no conoce devuelve null', () => {
    expect(traducirErrorDB({ code: '99999' })).toBeNull();
  });
});
