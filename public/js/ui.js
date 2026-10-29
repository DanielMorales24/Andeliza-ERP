// Utilidades compartidas por todas las pantallas (se carga antes de Alpine).
(function () {
  // Para buscar sin importar mayúsculas ni acentos: "camion" encuentra "Camión"
  window.normalizarTexto = function (t) {
    return String(t === null || t === undefined ? '' : t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  };

  window.dinero = function (n) {
    const v = Number(n) || 0;
    return window.APP.moneda + ' ' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // 45.5 -> "45.5", 18 -> "18" (sin ceros de sobra)
  window.cantidad = function (n) {
    return String(+(Number(n) || 0).toFixed(2));
  };

  window.iniciales = function (nombre) {
    const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((partes[0] || '?')[0] + (partes.length > 1 ? partes[1][0] : '')).toUpperCase();
  };

  // Llamadas al servidor. Devuelve el JSON o lanza Error con un mensaje para mostrar.
  window.api = async function (url, opciones) {
    opciones = opciones || {};
    const pedido = { method: opciones.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opciones.formData) {
      pedido.body = opciones.formData;
    } else if (opciones.body !== undefined) {
      pedido.headers['Content-Type'] = 'application/json';
      pedido.body = JSON.stringify(opciones.body);
    }

    let respuesta;
    try {
      respuesta = await fetch(url, pedido);
    } catch (e) {
      throw new Error('No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    }

    let datos = null;
    try { datos = await respuesta.json(); } catch (e) { /* sin cuerpo JSON */ }

    if (respuesta.status === 401) {
      window.location.href = '/login';
      throw new Error((datos && datos.error) || 'Tu sesión expiró.');
    }
    if (!respuesta.ok) throw new Error((datos && datos.error) || 'No se pudo completar la acción.');
    return datos;
  };

  // Preferencias de la persona (ej. vista lista o tarjetas), sin romper si el navegador bloquea el almacenamiento
  window.preferencia = {
    leer: function (clave, defecto) { try { return window.localStorage.getItem(clave) || defecto; } catch (e) { return defecto; } },
    guardar: function (clave, valor) { try { window.localStorage.setItem(clave, valor); } catch (e) { /* nada */ } },
  };

  document.addEventListener('alpine:init', function () {
    window.Alpine.store('toasts', {
      items: [],
      siguiente: 1,
      mostrar: function (mensaje, tipo) {
        const id = this.siguiente++;
        tipo = tipo || 'ok';
        this.items.push({ id: id, mensaje: mensaje, tipo: tipo });
        setTimeout(() => this.quitar(id), tipo === 'error' ? 7000 : 3500);
      },
      quitar: function (id) { this.items = this.items.filter(function (t) { return t.id !== id; }); },
    });
  });

  window.toast = function (mensaje, tipo) { window.Alpine.store('toasts').mostrar(mensaje, tipo); };

  // Aviso que se muestra después de redirigir (ej. "Producto guardado")
  window.toastDiferido = function (mensaje, tipo) {
    try { window.sessionStorage.setItem('toast', JSON.stringify({ mensaje: mensaje, tipo: tipo || 'ok' })); } catch (e) { /* nada */ }
  };
  document.addEventListener('alpine:initialized', function () {
    try {
      const guardado = window.sessionStorage.getItem('toast');
      if (!guardado) return;
      window.sessionStorage.removeItem('toast');
      const t = JSON.parse(guardado);
      window.toast(t.mensaje, t.tipo);
    } catch (e) { /* nada */ }
  });
})();
