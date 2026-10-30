// Resumen financiero: tarjetas, gráfico de 6 meses, saldo inicial y conciliación de inventario.
document.addEventListener('alpine:init', function () {
  Alpine.data('finanzasResumen', function () {
    return {
      d: { estado: {}, caja: {}, cxc: {}, cxp: {}, utilidadMes: {}, meses: [], inventario: {} },
      modal: '',
      error: '',
      trabajando: false,
      saldo: { cuenta: 'caja', monto: '', fecha: '' },
      contra: 'capital',
      grafico: null,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.saldo.fecha = this.d.estado.hoy;
        this.$nextTick(() => this.dibujar());
      },

      nombreMes(m) {
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const p = m.split('-');
        return meses[Number(p[1]) - 1] + ' ' + p[0];
      },

      // "Subió 12 % frente al mes pasado"
      get comparacion() {
        const u = this.d.utilidadMes;
        if (!u) return { texto: '', clase: '' };
        const base = 'Ingresos ' + dinero(u.ingresos) + '  Gastos ' + dinero(u.gastos);
        if (!u.anterior) return { texto: base, clase: '' };
        const dif = u.utilidad - u.anterior;
        const pct = Math.abs(u.anterior) > 0 ? Math.round(Math.abs(dif) / Math.abs(u.anterior) * 100) + ' %' : '';
        if (dif === 0) return { texto: base + '  Igual que el mes pasado', clase: '' };
        return { texto: base + '  ' + (dif > 0 ? '▲ Mejor' : '▼ Peor') + ' que el mes pasado' + (pct ? ' (' + pct + ')' : ''), clase: dif > 0 ? 'text-emerald-700' : 'text-red-700' };
      },

      dibujar() {
        const lienzo = document.getElementById('grafico-meses');
        if (!lienzo || !window.Chart) return;
        const etiquetas = this.d.meses.map((m) => this.nombreMes(m.mes).replace(/^./, (c) => c.toUpperCase()).slice(0, 3) + ' ' + m.mes.slice(2, 4));
        const estilo = getComputedStyle(document.documentElement);
        const primario = (estilo.getPropertyValue('--primario') || '#1e40af').trim();
        const acento = (estilo.getPropertyValue('--acento') || '#f59e0b').trim();
        this.grafico = new window.Chart(lienzo, {
          type: 'bar',
          data: {
            labels: etiquetas,
            datasets: [
              { label: 'Flujo de caja', data: this.d.meses.map((m) => m.flujo), backgroundColor: primario, borderRadius: 3 },
              { label: 'Utilidad', data: this.d.meses.map((m) => m.utilidad), backgroundColor: acento, borderRadius: 3 },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { position: 'bottom' },
              tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + dinero(c.parsed.y) } },
            },
            scales: { y: { ticks: { callback: (v) => dinero(v).replace('.00', '') } } },
          },
        });
      },

      cerrar() { if (!this.trabajando) { this.modal = ''; this.error = ''; } },
      abrirSaldo() { this.error = ''; this.modal = 'saldo'; },
      abrirConciliar() { this.error = ''; this.contra = 'capital'; this.modal = 'conciliar'; },

      async iniciar() {
        this.trabajando = true;
        try { await api('/finanzas/iniciar', { method: 'POST', body: {} }); toastDiferido('Contabilidad iniciada.'); window.location.reload(); }
        catch (e) { toast(e.message, 'error'); this.trabajando = false; }
      },
      async guardarSaldo() {
        this.error = ''; this.trabajando = true;
        try {
          await api('/finanzas/saldo-inicial', { method: 'POST', body: this.saldo });
          toastDiferido('Saldo inicial registrado.'); window.location.reload();
        } catch (e) { this.error = e.message; this.trabajando = false; }
      },
      async conciliar() {
        this.error = ''; this.trabajando = true;
        try {
          await api('/finanzas/conciliar-inventario', { method: 'POST', body: { contra: this.contra } });
          toastDiferido('Inventario conciliado.'); window.location.reload();
        } catch (e) { this.error = e.message; this.trabajando = false; }
      },
    };
  });
});
