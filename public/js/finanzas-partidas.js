// Libro diario, balanza de comprobación y asientos manuales.
document.addEventListener('alpine:init', function () {
  const r2 = function (n) { return Math.round((Number(n) + 1e-9) * 100) / 100; };

  Alpine.data('partidas', function () {
    return {
      d: { libro: { partidas: [], hayMas: false, cantidad: 0 }, cuentas: [], balanza: { filas: [] }, origenes: {}, estado: {} },
      vista: 'libro',
      libro: { partidas: [], hayMas: false, cantidad: 0 },
      balanza: { filas: [], debe: 0, haber: 0, cuadra: true },
      f: { q: '', desde: '', hasta: '', cuenta: '', origen: '', orden: 'desc' },
      fb: { desde: '', hasta: '' },
      cargando: false,
      error: '',
      secuencia: 0,
      temporizador: null,
      modal: '',
      guardando: false,
      as: { fecha: '', descripcion: '', lineas: [] },
      anulando: null,
      uid: 1,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.libro = this.d.libro;
        this.balanza = this.d.balanza;
        ['f.desde', 'f.hasta', 'f.cuenta', 'f.origen', 'f.orden'].forEach((k) => this.$watch(k, () => this.cargar(true)));
        this.$watch('f.q', () => { clearTimeout(this.temporizador); this.temporizador = setTimeout(() => this.cargar(true), 300); });
        ['fb.desde', 'fb.hasta'].forEach((k) => this.$watch(k, () => this.cargarBalanza()));
      },

      cerrar() {
        if (this.anulando) { if (!this.anulando.guardando) this.anulando = null; return; }
        if (!this.guardando) { this.modal = ''; this.error = ''; }
      },

      // Solo se anulan directo los asientos manuales (el resto se anula desde su documento)
      puedeAnular(p) {
        return !p.anulada && !p.reversa_de && ['manual', 'saldo_inicial', 'ajuste_inventario'].includes(p.origen_tipo);
      },

      async cargar(reiniciar) {
        const mia = ++this.secuencia;
        this.error = '';
        if (this.f.desde && this.f.hasta && this.f.desde > this.f.hasta) { this.error = 'La fecha inicial no puede ser mayor que la final.'; return; }
        this.cargando = true;
        try {
          const p = new URLSearchParams({ q: this.f.q.trim(), desde: this.f.desde, hasta: this.f.hasta, cuenta: this.f.cuenta, origen: this.f.origen, orden: this.f.orden, offset: reiniciar ? 0 : this.libro.partidas.length });
          const r = await api('/finanzas/partidas/datos?' + p);
          if (mia !== this.secuencia) return;
          if (reiniciar) this.libro = { partidas: r.partidas, hayMas: r.hayMas, cantidad: r.cantidad };
          else {
            const ya = new Set(this.libro.partidas.map((x) => x.id));
            this.libro = { partidas: this.libro.partidas.concat(r.partidas.filter((x) => !ya.has(x.id))), hayMas: r.hayMas, cantidad: r.cantidad };
          }
        } catch (e) { if (mia === this.secuencia) this.error = e.message; } finally { if (mia === this.secuencia) this.cargando = false; }
      },

      async abrirBalanza() { this.vista = 'balanza'; await this.cargarBalanza(); },
      async cargarBalanza() {
        try {
          const r = await api('/finanzas/partidas/balanza?' + new URLSearchParams({ desde: this.fb.desde, hasta: this.fb.hasta }));
          this.balanza = r;
        } catch (e) { toast(e.message, 'error'); }
      },

      // ---------- Asiento manual ----------
      nuevaLinea() { return { uid: this.uid++, cuenta_id: '', debe: '', haber: '' }; },
      abrirAsiento() {
        this.error = '';
        this.as = { fecha: this.d.estado.hoy, descripcion: '', lineas: [this.nuevaLinea(), this.nuevaLinea()] };
        this.modal = 'asiento';
      },
      agregarLinea() { this.as.lineas.push(this.nuevaLinea()); },
      quitarLinea(i) { if (this.as.lineas.length > 2) this.as.lineas.splice(i, 1); },
      get sumaDebe() { return r2(this.as.lineas.reduce((s, l) => s + (Number(l.debe) || 0), 0)); },
      get sumaHaber() { return r2(this.as.lineas.reduce((s, l) => s + (Number(l.haber) || 0), 0)); },
      get cuadra() {
        return this.sumaDebe > 0 && this.sumaDebe === this.sumaHaber
          && this.as.lineas.every((l) => l.cuenta_id && ((Number(l.debe) > 0) !== (Number(l.haber) > 0)));
      },

      async guardarAsiento() {
        this.error = '';
        if (!this.as.descripcion.trim()) { this.error = 'Escribe una descripción.'; return; }
        if (!this.cuadra) { this.error = 'El asiento no cuadra o hay líneas incompletas.'; return; }
        this.guardando = true;
        try {
          await api('/finanzas/partidas', { method: 'POST', body: {
            fecha: this.as.fecha, descripcion: this.as.descripcion,
            lineas: this.as.lineas.map((l) => ({ cuenta_id: l.cuenta_id, debe: l.debe, haber: l.haber })),
          } });
          toast('Asiento registrado.');
          this.guardando = false; this.modal = '';
          await this.cargar(true);
          if (this.vista === 'balanza') await this.cargarBalanza();
        } catch (e) { this.error = e.message; this.guardando = false; }
      },

      async confirmarAnular() {
        const a = this.anulando;
        a.guardando = true; a.error = '';
        try {
          await api('/finanzas/partidas/' + a.p.id + '/anular', { method: 'POST', body: { motivo: a.motivo } });
          this.anulando = null;
          toast('Partida anulada: se creó su contrapartida.');
          await this.cargar(true);
        } catch (e) { a.error = e.message; a.guardando = false; }
      },
    };
  });
});
