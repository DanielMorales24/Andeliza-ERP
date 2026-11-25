// Reglas que impiden que una prueba toque una base que no sea de pruebas.
// Son funciones puras (sin efectos) para poder probarlas en tests/unit/guardas.test.js.

const HOSTS_PERMITIDOS = ['localhost', '127.0.0.1', '::1', '[::1]'];

// Oculta la contraseña de una URL para poder mostrarla en un mensaje de error
function ocultarClave(url) {
  return String(url || '').replace(/(postgres(?:ql)?:\/\/[^:/@]+:)[^@]*@/i, '$1****@');
}

// Lanza un error si la URL no es de una base local de pruebas. Devuelve el nombre de la base.
//   - Tiene que ser PostgreSQL en esta máquina (localhost): nunca Supabase ni otro servidor.
//   - El nombre de la base tiene que terminar en "_test", así no se confunde con desarrollo.
function validarBaseDePruebas(url) {
  const motivo = (texto) => new Error(
    `Las pruebas se detuvieron antes de tocar la base: ${texto}\n` +
    `  DATABASE_URL = ${ocultarClave(url) || '(vacía)'}\n` +
    '  Usa una base local cuyo nombre termine en _test (ver .env.test.example y docs/pruebas.md).'
  );
  if (!url) throw motivo('falta DATABASE_URL.');
  if (/supabase|pooler/i.test(url)) throw motivo('la URL apunta a Supabase.');

  let u;
  try { u = new URL(url); } catch (_) { throw motivo('la URL no es válida.'); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw motivo('no es una URL de PostgreSQL.');
  if (!HOSTS_PERMITIDOS.includes(u.hostname)) throw motivo(`el servidor "${u.hostname}" no es local.`);

  const base = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!/^[a-z0-9_]+_test$/i.test(base)) throw motivo(`la base "${base || '(sin nombre)'}" no termina en _test.`);
  return base;
}

module.exports = { validarBaseDePruebas, ocultarClave, HOSTS_PERMITIDOS };
