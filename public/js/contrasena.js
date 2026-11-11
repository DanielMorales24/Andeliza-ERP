// Contraseñas con retroalimentación en vivo (decisión D-10): requisitos que se marcan mientras se escribe,
// barra de fortaleza, botón para ver lo escrito y confirmación. Es comodidad, no seguridad: quien decide es el
// servidor (función validar_contrasena en la base). Los requisitos son exactamente los que valida el servidor.
(function () {
  function bytes(t) { return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(t).length : unescape(encodeURIComponent(t)).length; }

  function evaluarClave(clave, usuario) {
    var c = String(clave || '');
    var u = String(usuario || '').trim().toLowerCase();
    var requisitos = [
      { id: 'largo', texto: 'Mínimo 8 caracteres', ok: c.length >= 8 },
      { id: 'letra', texto: 'Al menos una letra', ok: /[A-Za-z\u00C0-\u024F]/.test(c) },
      { id: 'numero', texto: 'Al menos un número', ok: /[0-9]/.test(c) },
      { id: 'usuario', texto: 'Distinta del nombre de usuario', ok: c.length > 0 && (u === '' || c.toLowerCase() !== u) },
    ];
    if (bytes(c) > 72) requisitos.push({ id: 'maximo', texto: 'Máximo 72 caracteres', ok: false });
    var cumple = requisitos.every(function (r) { return r.ok; });

    // Fortaleza: orienta, no bloquea. Suma por longitud y por variedad de caracteres.
    var puntos = 0;
    if (c.length >= 8) puntos += 1;
    if (c.length >= 12) puntos += 1;
    if (c.length >= 16) puntos += 1;
    if (/[a-z]/.test(c) && /[A-Z]/.test(c)) puntos += 1;
    if (/[^A-Za-z0-9]/.test(c)) puntos += 1;
    var nivel = !c ? 0 : (!cumple || puntos <= 1) ? 1 : (puntos <= 3 ? 2 : 3);
    return { requisitos: requisitos, cumple: cumple, nivel: nivel, texto: ['', 'Débil', 'Media', 'Fuerte'][nivel] };
  }
  window.evaluarClave = evaluarClave;

  document.addEventListener('alpine:init', function () {
    Alpine.data('claveSegura', function (opciones) {
      opciones = opciones || {};
      return {
        clave: '', confirmar: '', ver: false, usuario: opciones.usuario || '',
        get evaluacion() { return evaluarClave(this.clave, this.usuario); },
        get requisitos() { return this.evaluacion.requisitos; },
        get cumple() { return this.evaluacion.cumple; },
        get nivel() { return this.evaluacion.nivel; },
        get textoFortaleza() { return this.evaluacion.texto; },
        get coincide() { return this.confirmar.length > 0 && this.clave === this.confirmar; },
        get noCoincide() { return this.confirmar.length > 0 && this.clave !== this.confirmar; },
        // Solo entonces se habilita el botón de guardar
        get valida() { return this.cumple && this.coincide; },
        limpiar() { this.clave = ''; this.confirmar = ''; this.ver = false; },
      };
    });
  });
})();
