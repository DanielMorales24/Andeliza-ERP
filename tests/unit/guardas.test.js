// Aislamiento: las pruebas BORRAN su base al empezar. Esta guarda impide que eso pase con una base real.
const { validarBaseDePruebas, ocultarClave } = require('../soporte/guardas');

describe('validarBaseDePruebas', () => {
  test('acepta una base local cuyo nombre termina en _test', () => {
    expect(validarBaseDePruebas('postgresql://postgres:postgres@localhost:5432/andeliza_test')).toBe('andeliza_test');
    expect(validarBaseDePruebas('postgres://ci:ci@127.0.0.1:5432/otra_test')).toBe('otra_test');
  });

  test.each([
    ['Supabase (producción)', 'postgresql://postgres.abcd:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres', 'Supabase'],
    ['otro servidor', 'postgresql://u:p@db.ejemplo.com:5432/andeliza_test', 'no es local'],
    ['base de desarrollo', 'postgresql://u:p@localhost:5432/andeliza', 'no termina en _test'],
    ['base sin nombre', 'postgresql://u:p@localhost:5432/', 'no termina en _test'],
    ['vacía', '', 'falta DATABASE_URL'],
    ['otro motor', 'mysql://u:p@localhost:3306/andeliza_test', 'no es una URL de PostgreSQL'],
  ])('rechaza %s', (_caso, url, mensaje) => {
    expect(() => validarBaseDePruebas(url)).toThrow(mensaje);
  });

  test('el mensaje de error no muestra la contraseña', () => {
    expect(() => validarBaseDePruebas('postgresql://postgres:MiClaveReal@db.x.supabase.co:5432/postgres')).toThrow(/postgres:\*\*\*\*@/);
    expect(ocultarClave('postgresql://u:secreta@h:5432/b')).toBe('postgresql://u:****@h:5432/b');
  });
});
