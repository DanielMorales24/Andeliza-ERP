// Historial de facturas: los filtros consultan al servidor en vivo (sin recargar la página).
document.addEventListener('alpine:init', function () {
  const sumarDias = function (iso, dias) {
    const p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
  };

  Alpine.data('facturas', function () {
    return {
      d: { hoy: '', filtros: {}, filas: [], resumen: {}, hayMas: false },
      f: { desde: '', hasta: '', tipo: '', estado: '', q: '' },
      filas: [],
      resumen: { cantidad: 0, suma: 0, pendiente: 0 },
      hayMas: false,
      cargando: false,
      error: '',
      aviso: '',
      confirmar: null,
      pagando: false,
      secuencia: 0,
      temporizador: null,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.f = { desde: this.d.filtros.desde, hasta: this.d.filtros.hasta, tipo: this.d.filtros.tipo, estado: this.d.filtros.estado, q: this.d.filtros.q };
        this.filas = this.d.filas;
        this.resumen = this.d.resumen;
        this.hayMas = this.d.hayMas;

        ['f.desde', 'f.hasta', 'f.tipo', 'f.estado'].forEach((k) => this.$watch(k, () => this.cargar(true)));
        this.$watch('f.q', () => {
          clearTimeout(this.temporizador);
          this.temporizador = setTimeout(() => this.cargar(true), 300);
        });
      },

      // ---- Rangos rápidos ----
      get presets() {
        const hoy = this.d.hoy;
        return [
          { etiqueta: 'Hoy', desde: hoy, hasta: hoy },
          { etiqueta: '7 días', desde: sumarDias(hoy, -6), hasta: hoy },
          { etiqueta: 'Este mes', desde: hoy.slice(0, 8) + '01', hasta: hoy },
          { etiqueta: 'Todo', desde: '', hasta: '' },
        ];
      },
      presetActivo(p) { return this.f.desde === p.desde && this.f.hasta === p.hasta; },
      aplicarPreset(p) { this.f.desde = p.desde; this.f.hasta = p.hasta; },

      get hayFiltros() { return !!(this.f.tipo || this.f.estado || this.f.q); },
      limpiar() { this.f.tipo = ''; this.f.estado = ''; this.f.q = ''; },

      // ---- Consulta ----
      params(reiniciar) {
        return new URLSearchParams({
          desde: this.f.desde, hasta: this.f.hasta, tipo: this.f.tipo, estado: this.f.estado,
          q: this.f.q.trim(), offset: reiniciar ? 0 : this.filas.length,
        });
      },

      async cargar(reiniciar) {
        this.error = '';
        if (this.f.desde && this.f.hasta && this.f.desde > this.f.hasta) {
          this.error = 'La fecha inicial no puede ser mayor que la final.';
          return;
        }
        const mia = ++this.secuencia; // si llega una respuesta vieja, se descarta
        this.cargando = true;
        try {
          const r = await api('/facturas/datos?' + this.params(reiniciar));
          if (mia !== this.secuencia) return;
          if (reiniciar) {
            this.filas = r.filas;
            try { window.history.replaceState(null, '', '?' + this.params(true).toString().replace(/&?offset=0/, '')); } catch (e) { /* nada */ }
          } else {
            const ya = new Set(this.filas.map((x) => x.id));
            this.filas = this.filas.concat(r.filas.filter((x) => !ya.has(x.id)));
          }
          this.resumen = r.resumen;
          this.hayMas = r.hayMas;
        } catch (e) {
          if (mia === this.secuencia) this.error = e.message;
        } finally {
          if (mia === this.secuencia) this.cargando = false;
        }
      },

      // ---- Marcar como pagada ----
      pedirPago(fila) { this.confirmar = fila; },
      cancelarPago() { if (!this.pagando) this.confirmar = null; },
      async confirmarPago() {
        const fila = this.confirmar;
        if (!fila || this.pagando) return;
        this.pagando = true;
        try {
          await api('/facturas/' + fila.id + '/pagada', { method: 'PATCH' });
          this.confirmar = null;
          if (this.f.estado === 'P') {
            // En la vista de pendientes la fila ya no corresponde: sale de la lista
            this.filas = this.filas.filter((x) => x.id !== fila.id);
            this.resumen = { cantidad: Math.max(0, this.resumen.cantidad - 1), suma: Math.max(0, +(this.resumen.suma - fila.total).toFixed(2)), pendiente: Math.max(0, +(this.resumen.pendiente - fila.total).toFixed(2)) };
          } else {
            const i = this.filas.findIndex((x) => x.id === fila.id);
            if (i !== -1) this.filas.splice(i, 1, Object.assign({}, this.filas[i], { estado: 'C' }));
            this.resumen = Object.assign({}, this.resumen, { pendiente: Math.max(0, +(this.resumen.pendiente - fila.total).toFixed(2)) });
          }
          toast('Factura ' + fila.numero_corto + ' marcada como pagada.');
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          this.pagando = false;
        }
      },
    };
  });
});
