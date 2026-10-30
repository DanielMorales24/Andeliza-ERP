// Cuentas por cobrar y por pagar: lista con antigüedad, abonos/pagos parciales e historial.
document.addEventListener('alpine:init', function () {
  const TRAMOS = [
    { clave: 'al_dia', etiqueta: 'Al día', min: -Infinity, max: 0, color: 'text-emerald-700', insignia: 'ins-ok' },
    { clave: 't1_30', etiqueta: 'Vencido 1 a 30', min: 1, max: 30, color: 'text-amber-700', insignia: 'ins-bajo' },
    { clave: 't31_60', etiqueta: 'Vencido 31 a 60', min: 31, max: 60, color: 'text-orange-700', insignia: 'ins-agotado' },
    { clave: 't61_90', etiqueta: 'Vencido 61 a 90', min: 61, max: 90, color: 'text-red-700', insignia: 'ins-agotado' },
    { clave: 't91', etiqueta: 'Más de 90', min: 91, max: Infinity, color: 'text-red-800', insignia: 'ins-agotado' },
  ];
  const tramoDe = function (dias) { return TRAMOS.find(function (t) { return dias >= t.min && dias <= t.max; }); };
  const r2 = function (n) { return Math.round((Number(n) + 1e-9) * 100) / 100; };

  Alpine.data('cartera', function () {
    return {
      d: { tipo: 'cxc', textos: {}, filas: [], estado: {} },
      filas: [],
      busqueda: '',
      tramo: '',
      ab: null,
      hist: null,
      anulando: null,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.filas = this.d.filas.map((f) => this.preparar(f));
      },

      preparar(f) {
        f._h = normalizarTexto([f.tercero, f.referencia].join(' '));
        return f;
      },

      get porTramo() {
        return TRAMOS.map((t) => {
          const x = this.filas.filter((f) => tramoDe(f.dias_vencido).clave === t.clave);
          return { clave: t.clave, etiqueta: t.etiqueta, color: t.color, monto: r2(x.reduce((s, f) => s + f.saldo, 0)), cantidad: x.length };
        });
      },
      get total() { return r2(this.filas.reduce((s, f) => s + f.saldo, 0)); },
      get vencido() { return r2(this.filas.filter((f) => f.dias_vencido > 0).reduce((s, f) => s + f.saldo, 0)); },
      get filtradas() {
        const q = normalizarTexto(this.busqueda.trim());
        return this.filas.filter((f) => (!this.tramo || tramoDe(f.dias_vencido).clave === this.tramo) && (!q || f._h.includes(q)));
      },

      etiquetaVenc(f) {
        const n = f.dias_vencido;
        if (n > 0) return 'Vencido ' + n + (n === 1 ? ' día' : ' días');
        if (n === 0) return 'Vence hoy';
        return 'Al día (' + (-n) + (n === -1 ? ' día' : ' días') + ')';
      },
      claseVenc(f) { return tramoDe(f.dias_vencido).insignia; },

      cerrarTodo() {
        if (this.anulando) { if (!this.anulando.guardando) this.anulando = null; return; }
        if (this.ab) { this.cerrarAbono(); return; }
        this.hist = null;
      },

      // ---------- Abono o pago ----------
      get nuevoSaldo() { return this.ab ? r2(this.ab.fila.saldo - (Number(this.ab.monto) || 0)) : 0; },

      abrirAbono(f) {
        this.ab = { fila: f, monto: f.saldo, fecha: this.d.estado.hoy, cuenta: 'caja', notas: '', error: '', guardando: false };
        this.$nextTick(() => { const el = document.getElementById('ab-monto'); if (el) { el.focus(); el.select(); } });
      },
      cerrarAbono() { if (this.ab && !this.ab.guardando) this.ab = null; },

      async guardarAbono() {
        const a = this.ab;
        a.error = '';
        const monto = Number(a.monto);
        if (!(monto > 0)) { a.error = 'Escribe un monto mayor que cero.'; return; }
        if (monto > a.fila.saldo) { a.error = 'El monto es mayor que el saldo pendiente (' + dinero(a.fila.saldo) + ').'; return; }
        a.guardando = true;
        try {
          const ruta = this.d.tipo === 'cxc' ? '/finanzas/cxc/abonos' : '/finanzas/cxp/pagos';
          const r = await api(ruta, { method: 'POST', body: { origen: a.fila.origen, doc_id: a.fila.doc_id, monto: monto, fecha: a.fecha, cuenta: a.cuenta, notas: a.notas } });
          if (r.documento) {
            const i = this.filas.findIndex((x) => x.origen === a.fila.origen && x.doc_id === a.fila.doc_id);
            if (i !== -1) this.filas.splice(i, 1, this.preparar(r.documento));
          } else {
            this.filas = this.filas.filter((x) => !(x.origen === a.fila.origen && x.doc_id === a.fila.doc_id));
          }
          toast(r.pagada ? 'Saldado: ' + dinero(monto) + ' registrados.' : (this.d.tipo === 'cxc' ? 'Abono' : 'Pago') + ' de ' + dinero(monto) + ' registrado. Saldo: ' + dinero(r.saldo) + '.');
          this.ab = null;
        } catch (e) {
          a.error = e.message;
          a.guardando = false;
        }
      },

      // ---------- Historial ----------
      async abrirHistorial(f) {
        this.hist = { fila: f, movimientos: [], cargando: true, error: '' };
        await this.cargarHistorial();
      },
      async cargarHistorial() {
        const h = this.hist;
        if (!h) return;
        try {
          const r = await api('/finanzas/' + this.d.tipo + '/' + h.fila.origen + '/' + h.fila.doc_id);
          h.movimientos = r.movimientos;
          if (r.documento) Object.assign(h.fila, r.documento);
        } catch (e) { h.error = e.message; } finally { h.cargando = false; }
      },
      async confirmarAnular() {
        const a = this.anulando;
        a.guardando = true; a.error = '';
        try {
          const ruta = this.d.tipo === 'cxc' ? '/finanzas/cxc/abonos/' : '/finanzas/cxp/pagos/';
          await api(ruta + a.mov.id + '/anular', { method: 'POST', body: { motivo: a.motivo } });
          this.anulando = null;
          toast('Movimiento anulado: la deuda volvió a quedar pendiente.');
          const r = await api('/finanzas/' + this.d.tipo + '/datos');
          this.filas = r.filas.map((f) => this.preparar(f));
          if (this.hist) {
            const f = this.filas.find((x) => x.origen === this.hist.fila.origen && x.doc_id === this.hist.fila.doc_id);
            if (f) this.hist.fila = f;
            await this.cargarHistorial();
          }
        } catch (e) { a.error = e.message; a.guardando = false; }
      },
    };
  });
});
