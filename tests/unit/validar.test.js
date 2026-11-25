// Foco: REGLAS DE NEGOCIO en la entrada. Lo que llega del navegador se valida antes de tocar la base.
const V = require('../../utils/validar');

describe('dinero', () => {
  test('acepta montos con hasta 2 decimales y coma o punto decimal', () => {
    expect(V.dinero('150', 'El monto')).toBe(150);
    expect(V.dinero('99,95', 'El monto')).toBe(99.95);
    expect(V.dinero(0.01, 'El monto')).toBe(0.01);
  });

  test.each([
    ['', 'es obligatorio'],
    ['0', 'debe ser mayor que cero'],
    ['-5', 'debe ser mayor que cero'],
    ['10.005', 'no puede tener más de 2 decimales'],
    ['diez', 'debe ser un número'],
  ])('rechaza "%s" con el mensaje "%s"', (entrada, mensaje) => {
    expect(() => V.dinero(entrada, 'El monto')).toThrow(V.ErrorValidacion);
    expect(() => V.dinero(entrada, 'El monto')).toThrow(mensaje);
  });
});

describe('eleccion (métodos de pago, categorías)', () => {
  const activos = ['efectivo', 'tarjeta', 'transferencia'];

  test('devuelve el valor si está entre los permitidos', () => {
    expect(V.eleccion('tarjeta', 'El método de pago', activos, 'efectivo')).toBe('tarjeta');
  });

  test('sin valor usa el predeterminado (una pantalla vieja que no manda el método)', () => {
    expect(V.eleccion(undefined, 'El método de pago', activos, 'efectivo')).toBe('efectivo');
  });

  test('un valor que el negocio no tiene activo se rechaza', () => {
    expect(() => V.eleccion('cheque', 'El método de pago', activos, 'efectivo')).toThrow('El método de pago no es válido.');
  });
});

describe('cuentaEfectivo', () => {
  test('solo acepta caja o bancos', () => {
    expect(V.cuentaEfectivo('caja')).toBe('caja');
    expect(V.cuentaEfectivo('bancos')).toBe('bancos');
    expect(() => V.cuentaEfectivo('cxc')).toThrow(V.ErrorValidacion);
  });
});

describe('fechaISO', () => {
  test('acepta fechas reales y rechaza las imposibles', () => {
    expect(V.fechaISO('2026-02-28', 'La fecha')).toBe('2026-02-28');
    expect(V.fechaISO('', 'La fecha')).toBeNull();
    expect(() => V.fechaISO('2026-02-30', 'La fecha')).toThrow('no es una fecha válida');
    expect(() => V.fechaISO('30/11/2026', 'La fecha')).toThrow('no es una fecha válida');
  });
});

describe('idOpcional', () => {
  test('convierte ids válidos y rechaza los que no son enteros positivos', () => {
    expect(V.idOpcional('42')).toBe(42);
    expect(V.idOpcional('')).toBeNull();
    expect(() => V.idOpcional('-1', 'El producto')).toThrow('El producto no es válido.');
    expect(() => V.idOpcional('1 OR 1=1', 'El producto')).toThrow('El producto no es válido.');
  });
});
