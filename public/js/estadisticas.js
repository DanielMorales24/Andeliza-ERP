// Estadísticas: filtros que consultan /estadisticas/datos sin recargar la página y seis gráficos de Chart.js
// (mismo cargador y misma versión que Finanzas). Todo lo que se muestra viene del servidor: aquí solo se dibuja.
document.addEventListener('alpine:init', function () {
  Alpine.data('estadisticasPagina', function () {
    return {
      d: { hoy: '', periodos: {}, vendedores: [], categorias: [], puedeVerCartera: false },
      filtros: { periodo: 'mes', desde: '', hasta: '', vendedor: '', categoria: '' },
      rangoAbierto: false,
      borrador: { desde: '', hasta: '' },
      errorRango: '',
      cargando: false,
      error: '',
      r: null,
      modoTop: 'monto',
      graficos: {},
      sinGraficos: false,
      secuencia: 0,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.cargar();
      },

      get listaPeriodos() { return Object.keys(this.d.periodos).map((k) => ({ clave: k, nombre: this.d.periodos[k] })); },

      // "2026-11-09" -> "09/11/2026"
      fechaCorta(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; },

      get textoRango() {
        if (!this.r) return '';
        const g = this.r.rango;
        let t = 'Del ' + this.fechaCorta(g.desde) + ' al ' + this.fechaCorta(g.hasta);
        t += g.dias === 1 ? ' (1 día)' : ' (' + g.dias + ' días)';
        if (g.comparar && g.anterior) t += '. Comparado con el ' + this.fechaCorta(g.anterior.desde) + ' al ' + this.fechaCorta(g.anterior.hasta) + '.';
        else t += '. Sin comparación: se muestra todo el historial.';
        return t;
      },
      get tituloDelta() { return this.r && this.r.rango.anterior ? 'Frente al ' + this.fechaCorta(this.r.rango.anterior.desde) + ' - ' + this.fechaCorta(this.r.rango.anterior.hasta) : ''; },

      // Los filtros viajan como parámetros. Un período rápido va por clave y uno personalizado, por fechas.
      parametros(conPeriodo) {
        const p = new URLSearchParams();
        if (this.filtros.periodo === 'personalizado') { if (this.filtros.desde) p.set('desde', this.filtros.desde); p.set('hasta', this.filtros.hasta); }
        else if (conPeriodo) p.set('periodo', this.filtros.periodo);
        if (this.filtros.vendedor) p.set('vendedor', this.filtros.vendedor);
        if (this.filtros.categoria) p.set('categoria', this.filtros.categoria);
        return p;
      },
      // El PDF se pide con las fechas que se ven en pantalla (ya resueltas por el servidor)
      get urlPdf() {
        if (!this.r) return '#';
        const p = new URLSearchParams();
        if (this.r.rango.comparar) p.set('desde', this.r.rango.desde); else p.set('periodo', 'todo');
        p.set('hasta', this.r.rango.hasta);
        if (this.filtros.vendedor) p.set('vendedor', this.filtros.vendedor);
        if (this.filtros.categoria) p.set('categoria', this.filtros.categoria);
        return '/estadisticas/reporte.pdf?' + p.toString();
      },

      elegirPeriodo(clave) { this.filtros.periodo = clave; this.filtros.desde = ''; this.filtros.hasta = ''; this.rangoAbierto = false; this.cargar(); },
      abrirRango() {
        this.errorRango = '';
        this.borrador = { desde: this.r ? this.r.rango.desde : this.d.hoy, hasta: this.r ? this.r.rango.hasta : this.d.hoy };
        this.rangoAbierto = !this.rangoAbierto;
      },
      aplicarRango() {
        const { desde, hasta } = this.borrador;
        if (!desde || !hasta) { this.errorRango = 'Elige las dos fechas.'; return; }
        if (desde > hasta) { this.errorRango = 'La fecha inicial no puede ser mayor que la final.'; return; }
        this.filtros.periodo = 'personalizado'; this.filtros.desde = desde; this.filtros.hasta = hasta;
        this.rangoAbierto = false;
        this.cargar();
      },

      async cargar() {
        const n = ++this.secuencia;   // si el usuario cambia de filtro rápido, solo vale la última respuesta
        this.cargando = true; this.error = '';
        try {
          const r = await api('/estadisticas/datos?' + this.parametros(true).toString());
          if (n !== this.secuencia) return;
          this.r = r;
          this.$nextTick(() => this.dibujar());
        } catch (e) {
          if (n === this.secuencia) this.error = e.message || 'No se pudieron cargar las estadísticas.';
        } finally {
          if (n === this.secuencia) this.cargando = false;
        }
      },

      // ---- Presentación ----
      delta(k) {
        if (!this.r || !this.r.rango.comparar) return { texto: this.r ? 'Historial completo, sin comparación' : '', clase: 'text-gray-400' };
        if (!k || k.variacionPct === null || k.variacionPct === undefined) return { texto: 'Sin dato para comparar', clase: 'text-gray-400' };
        if (k.variacionPct === 0) return { texto: 'Igual que el período anterior', clase: 'text-gray-500' };
        const v = Math.abs(k.variacionPct);
        return { texto: (k.variacionPct > 0 ? '▲ ' : '▼ ') + (Number.isInteger(v) ? v : v.toFixed(1)) + '% vs período anterior', clase: k.variacionPct > 0 ? 'text-emerald-700' : 'text-red-700' };
      },
      get deltaPuntos() {
        const m = this.r && this.r.kpis.margenBruto;
        if (!m || m.difPuntos === null || m.difPuntos === undefined) return { texto: '', clase: 'text-gray-400' };
        if (m.difPuntos === 0) return { texto: 'Igual margen que el período anterior', clase: 'text-gray-500' };
        return { texto: (m.difPuntos > 0 ? '▲ +' : '▼ ') + m.difPuntos + ' puntos vs período anterior', clase: m.difPuntos > 0 ? 'text-emerald-700' : 'text-red-700' };
      },
      clasesTono(t) {
        return { positivo: 'border-emerald-200 bg-emerald-50 text-emerald-900', negativo: 'border-red-200 bg-red-50 text-red-900', alerta: 'border-amber-200 bg-amber-50 text-amber-900' }[t] || 'border-borde bg-white text-tinta';
      },

      // ---- Gráficos ----
      destruir() { Object.keys(this.graficos).forEach((k) => { try { this.graficos[k].destroy(); } catch (e) { /* ya estaba destruido */ } }); this.graficos = {}; },
      crear(id, config) { const el = document.getElementById(id); if (el) this.graficos[id] = new window.Chart(el, config); },
      colores() {
        const est = getComputedStyle(document.documentElement);
        const primario = (est.getPropertyValue('--primario') || '#1e40af').trim(); const acento = (est.getPropertyValue('--acento-fuerte') || est.getPropertyValue('--acento') || '#f59e0b').trim();   // en gráficos, el acento que se ve sobre blanco
        return { primario: primario, acento: acento, paleta: [primario, acento, '#0e7490', '#7c3aed', '#be185d', '#9ca3af'] };
      },
      conAlfa(color, alfa) { return /^#[0-9a-f]{6}$/i.test(color) ? color + alfa : color; },

      dibujar() {
        this.destruir();
        const r = this.r;
        if (!r || r.vacio) return;
        if (!window.Chart) { this.sinGraficos = true; return; }
        this.sinGraficos = false;
        const c = this.colores();
        const corto = (v) => dinero(v).replace('.00', '');
        const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 250 } };
        const sinLeyenda = { legend: { display: false } };
        const fac = (n) => n + (n === 1 ? ' factura' : ' facturas');

        // 1. Ventas en el tiempo: línea por día y barras por semana o mes
        const pts = r.serie.puntos; const linea = r.serie.agrupar === 'dia';
        this.crear('grafico-serie', {
          type: linea ? 'line' : 'bar',
          data: { labels: pts.map((p) => p.etiqueta), datasets: [{ label: 'Ventas', data: pts.map((p) => p.total), borderColor: c.primario, backgroundColor: linea ? this.conAlfa(c.primario, '22') : c.primario, fill: linea, tension: 0.3, borderWidth: 2, pointRadius: pts.length > 45 ? 0 : 2, pointHoverRadius: 5, borderRadius: 3 }] },
          options: { ...base, interaction: { mode: 'index', intersect: false }, plugins: { ...sinLeyenda, tooltip: { callbacks: { label: (x) => dinero(x.parsed.y), afterLabel: (x) => fac(pts[x.dataIndex].facturas) } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12, autoSkip: true } }, y: { beginAtZero: true, ticks: { callback: (v) => corto(v) } } } },
        });

        // 2. Top 10 productos
        this.dibujarTop(c, base, sinLeyenda, corto);

        // 3. Top 5 categorías (por monto)
        const cats = r.topCategorias.categorias.slice(); if (r.topCategorias.otras > 0) cats.push({ nombre: 'Otras', monto: r.topCategorias.otras, pct: r.topCategorias.otrasPct });
        this.crear('grafico-categorias', {
          type: 'doughnut',
          data: { labels: cats.map((x) => x.nombre), datasets: [{ data: cats.map((x) => x.monto), backgroundColor: cats.map((x, i) => c.paleta[i % c.paleta.length]), borderWidth: 2, borderColor: '#ffffff' }] },
          options: { ...base, cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (x) => x.label + ': ' + dinero(x.parsed) + ' (' + cats[x.dataIndex].pct + '%)' } } } },
        });

        // 4. Fiscal vs interno
        const fi = r.fiscalVsInterno;
        this.crear('grafico-fiscal', {
          type: 'doughnut',
          data: { labels: ['Fiscales', 'Internas'], datasets: [{ data: [fi.fiscales.facturas, fi.internas.facturas], backgroundColor: [c.primario, c.acento], borderWidth: 2, borderColor: '#ffffff' }] },
          options: { ...base, cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (x) => { const f = x.dataIndex === 0 ? fi.fiscales : fi.internas; return x.label + ': ' + fac(f.facturas) + ' (' + f.pct + '%) · ' + dinero(f.monto); } } } } },
        });

        // 5. Ventas por vendedor
        const rk = r.rankingVendedores;
        this.crear('grafico-vendedores', {
          type: 'bar',
          data: { labels: rk.map((v) => v.nombre), datasets: [{ label: 'Ventas', data: rk.map((v) => v.monto), backgroundColor: c.primario, borderRadius: 3 }] },
          options: { ...base, indexAxis: 'y', plugins: { ...sinLeyenda, tooltip: { callbacks: { label: (x) => dinero(x.parsed.x), afterLabel: (x) => fac(rk[x.dataIndex].facturas) + ' · ' + rk[x.dataIndex].porcentaje + '% del total' } } }, scales: { x: { beginAtZero: true, ticks: { callback: (v) => corto(v) } }, y: { grid: { display: false } } } },
        });

        // 6. Ventas por día de la semana
        const ds = r.porDiaSemana;
        this.crear('grafico-dias', {
          type: 'bar',
          data: { labels: ds.map((x) => x.nombre.charAt(0).toUpperCase() + x.nombre.slice(1)), datasets: [{ label: 'Ventas', data: ds.map((x) => x.total), backgroundColor: c.paleta[2], borderRadius: 3 }] },
          options: { ...base, plugins: { ...sinLeyenda, tooltip: { callbacks: { label: (x) => dinero(x.parsed.y), afterLabel: (x) => fac(ds[x.dataIndex].facturas) + ' · promedio ' + dinero(ds[x.dataIndex].promedio) + ' por día' } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: (v) => corto(v) } } } },
        });
      },

      cambiarTop(modo) {
        this.modoTop = modo;
        if (this.graficos['grafico-top']) { try { this.graficos['grafico-top'].destroy(); } catch (e) { /* nada */ } delete this.graficos['grafico-top']; }
        if (this.r && !this.r.vacio && window.Chart) {
          const c = this.colores();
          this.dibujarTop(c, { responsive: true, maintainAspectRatio: false, animation: { duration: 250 } }, { legend: { display: false } }, (v) => dinero(v).replace('.00', ''));
        }
      },
      dibujarTop(c, base, sinLeyenda, corto) {
        const porMonto = this.modoTop === 'monto';
        const lista = porMonto ? this.r.topProductos.porMonto : this.r.topProductos.porCantidad;
        const recortar = (t) => (t.length > 24 ? t.slice(0, 23) + '…' : t);
        this.crear('grafico-top', {
          type: 'bar',
          data: { labels: lista.map((p) => recortar(p.nombre)), datasets: [{ label: porMonto ? 'Monto vendido' : 'Unidades vendidas', data: lista.map((p) => (porMonto ? p.monto : p.unidades)), backgroundColor: porMonto ? c.primario : c.acento, borderRadius: 3 }] },
          options: {
            ...base, indexAxis: 'y',
            plugins: { ...sinLeyenda, tooltip: { callbacks: {
              title: (items) => lista[items[0].dataIndex].nombre,
              label: (x) => (porMonto ? dinero(x.parsed.x) : x.parsed.x + (x.parsed.x === 1 ? ' unidad' : ' unidades')),
              afterLabel: (x) => { const p = lista[x.dataIndex]; return porMonto ? p.unidades + ' u. · margen ' + p.margenPct + '%' : dinero(p.monto) + ' · margen ' + p.margenPct + '%'; },
            } } },
            scales: { x: { beginAtZero: true, ticks: { callback: (v) => (porMonto ? corto(v) : v) } }, y: { grid: { display: false } } },
          },
        });
      },
    };
  });
});
