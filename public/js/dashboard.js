// Panel de inicio: gráfico de las ventas de los últimos 30 días (Chart.js, mismo cargador que Finanzas).
document.addEventListener('alpine:init', function () {
  Alpine.data('dashboardPagina', function () {
    return {
      d: { serie: [] },
      grafico: null,
      sinVentas: true,
      resumen: '',

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        const total = this.d.serie.reduce((t, p) => t + p.total, 0);
        const facturas = this.d.serie.reduce((t, p) => t + p.facturas, 0);
        this.sinVentas = !this.d.serie.some((p) => p.total > 0);
        this.resumen = dinero(total) + ' en ' + facturas + (facturas === 1 ? ' venta' : ' ventas');
        this.$nextTick(() => this.dibujar());
      },

      // Un color #rrggbb con transparencia; cualquier otro formato se usa tal cual
      conAlfa(color, alfa) { return /^#[0-9a-f]{6}$/i.test(color) ? color + alfa : color; },

      dibujar() {
        const lienzo = document.getElementById('grafico-ventas');
        if (!lienzo || !window.Chart || this.sinVentas) return;
        const primario = (getComputedStyle(document.documentElement).getPropertyValue('--primario') || '#1e40af').trim();
        const fondo = (contexto) => {
          // Degradado bajo la línea (se calcula cuando el gráfico ya conoce su área)
          const area = contexto.chart.chartArea;
          if (!area) return this.conAlfa(primario, '33');
          const g = contexto.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, this.conAlfa(primario, '55'));
          g.addColorStop(1, this.conAlfa(primario, '08'));
          return g;
        };
        const etiqueta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
        this.grafico = new window.Chart(lienzo, {
          type: 'line',
          data: {
            labels: this.d.serie.map((p) => etiqueta(p.inicio)),
            datasets: [{ label: 'Ventas', data: this.d.serie.map((p) => p.total), borderColor: primario, backgroundColor: fondo, fill: true, tension: 0.3, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHitRadius: 12 }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: (items) => 'Ventas del ' + items[0].label,
                  label: (c) => dinero(c.parsed.y),
                  afterLabel: (c) => { const f = this.d.serie[c.dataIndex].facturas; return f + (f === 1 ? ' factura' : ' facturas'); },
                },
              },
            },
            scales: {
              x: { grid: { display: false }, ticks: { maxTicksLimit: 8, autoSkip: true } },
              y: { beginAtZero: true, ticks: { callback: (v) => dinero(v).replace('.00', '') } },
            },
          },
        });
      },
    };
  });
});
