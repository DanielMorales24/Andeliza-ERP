// Ingresos varios, gastos y compras de inventario, con su condición de pago.
document.addEventListener('alpine:init', function () {
  const sumarDias = function (iso, dias) {
    const p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2] + dias)).toISOString().slice(0, 10);
  };
  const r2 = function (n) { return Math.round((Number(n) + 1e-9) * 100) / 100; };

  Alpine.data('movimientos', function () {
    return {
      d: { estado: {}, listas: {}, catalogos: { clientes: [], proveedores: [], productos: [] }, tiposIngreso: [], categoriasGasto: [], compras: true },
      tab: 'ingresos',
      listasTab: {},
      f: { q: '', desde: '', hasta: '', estado: '' },
      filtrosPorTab: {},
      cargando: false,
      errorLista: '',
      secuencia: 0,
      temporizador: null,
      modal: '',
      error: '',
      guardando: false,
      anulando: null,
      fs: {},
      fc: { items: [] },
      busquedaProd: '',
      listaProd: false,
      uid: 1,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.listasTab = JSON.parse(JSON.stringify(this.d.listas));
        ['ingresos', 'gastos', 'compras'].forEach((t) => { this.filtrosPorTab[t] = { q: '', desde: this.d.inicioMes, hasta: this.d.estado.hoy, estado: '' }; });
        this.f = Object.assign({}, this.filtrosPorTab.ingresos);

        ['f.desde', 'f.hasta', 'f.estado'].forEach((k) => this.$watch(k, () => this.cargar(true)));
        this.$watch('f.q', () => { clearTimeout(this.temporizador); this.temporizador = setTimeout(() => this.cargar(true), 300); });

        const nuevo = new URLSearchParams(window.location.search).get('nuevo');
        if (['ingreso', 'gasto', 'compra'].includes(nuevo)) this.$nextTick(() => this.abrir(nuevo));
      },

      get pestanas() {
        const t = [{ clave: 'ingresos', etiqueta: 'Ingresos' }, { clave: 'gastos', etiqueta: 'Gastos' }];
        if (this.d.compras) t.push({ clave: 'compras', etiqueta: 'Compras' });
        return t;
      },
      get lista() { return this.listasTab[this.tab] || { filas: [], hayMas: false, resumen: { cantidad: 0, suma: 0 } }; },
      get textoNuevo() { return { ingresos: 'Nuevo ingreso', gastos: 'Nuevo gasto', compras: 'Nueva compra' }[this.tab]; },

      cambiarTab(t) {
        if (t === this.tab) return;
        this.filtrosPorTab[this.tab] = Object.assign({}, this.f);
        this.tab = t;
        this.f = Object.assign({}, this.filtrosPorTab[t]);   // los watchers recargan solos si algo cambió
      },

      textoEstado(m) {
        if (m.anulado) return 'Anulado';
        if (this.tab === 'ingresos') return m.estado === 'C' ? 'Cobrado' : (m.movido > 0 ? 'Cobro parcial' : 'Por cobrar');
        return m.estado === 'C' ? 'Pagado' : (m.movido > 0 ? 'Pago parcial' : 'Por pagar');
      },
      claseEstado(m) {
        if (m.anulado) return 'ins-neutra';
        return m.estado === 'C' ? 'ins-ok' : 'ins-bajo';
      },

      async cargar(reiniciar) {
        const tab = this.tab;
        const mia = ++this.secuencia;
        this.errorLista = '';
        if (this.f.desde && this.f.hasta && this.f.desde > this.f.hasta) { this.errorLista = 'La fecha inicial no puede ser mayor que la final.'; return; }
        this.cargando = true;
        try {
          const p = new URLSearchParams({ tipo: tab, desde: this.f.desde, hasta: this.f.hasta, estado: this.f.estado, q: this.f.q.trim(), offset: reiniciar ? 0 : this.listasTab[tab].filas.length });
          const r = await api('/finanzas/movimientos/datos?' + p);
          if (mia !== this.secuencia) return;
          const actual = this.listasTab[tab];
          if (reiniciar) this.listasTab[tab] = { filas: r.filas, hayMas: r.hayMas, resumen: r.resumen };
          else {
            const ya = new Set(actual.filas.map((x) => x.id));
            this.listasTab[tab] = { filas: actual.filas.concat(r.filas.filter((x) => !ya.has(x.id))), hayMas: r.hayMas, resumen: r.resumen };
          }
        } catch (e) { if (mia === this.secuencia) this.errorLista = e.message; } finally { if (mia === this.secuencia) this.cargando = false; }
      },

      // ---------- Formularios ----------
      nuevo() { this.abrir({ ingresos: 'ingreso', gastos: 'gasto', compras: 'compra' }[this.tab]); },
      cerrar() {
        if (this.anulando) { if (!this.anulando.guardando) this.anulando = null; return; }
        if (!this.guardando) { this.modal = ''; this.error = ''; }
      },
      abrir(tipo) {
        this.error = '';
        const hoy = this.d.estado.hoy;
        if (tipo === 'compra') {
          this.fc = { proveedor: '', fecha: hoy, estado: 'C', cuenta: 'caja', vencimiento: '', notas: '', items: [] };
          this.busquedaProd = ''; this.listaProd = false;
        } else {
          this.fs = { tipo: tipo === 'ingreso' ? 'otros' : 'operativos', descripcion: '', monto: '', fecha: hoy, estado: 'C', cuenta: 'caja', tercero: '', vencimiento: '', notas: '' };
        }
        this.modal = tipo;
      },
      // Al elegir «por cobrar/pagar» se propone el plazo normal del negocio
      ajustarVenc(form) {
        if (form.estado === 'P') form.vencimiento = sumarDias(form.fecha || this.d.estado.hoy, this.d.estado.diasCredito || 30);
      },

      async guardarSimple() {
        const f = this.fs;
        this.error = '';
        if (!String(f.descripcion).trim()) { this.error = 'Escribe una descripción.'; return; }
        if (!(Number(f.monto) > 0)) { this.error = 'Escribe un monto mayor que cero.'; return; }
        this.guardando = true;
        try {
          const ingreso = this.modal === 'ingreso';
          const cuerpo = {
            descripcion: f.descripcion, monto: f.monto, fecha: f.fecha, estado: f.estado, cuenta: f.estado === 'C' ? f.cuenta : null,
            vencimiento: f.estado === 'P' ? f.vencimiento : null, notas: f.notas,
          };
          if (ingreso) { cuerpo.tipo = f.tipo; cuerpo.cliente_id = f.tercero || null; } else { cuerpo.categoria = f.tipo; cuerpo.proveedor_id = f.tercero || null; }
          await api(ingreso ? '/finanzas/ingresos' : '/finanzas/gastos', { method: 'POST', body: cuerpo });
          toast((ingreso ? 'Ingreso' : 'Gasto') + ' registrado' + (f.estado === 'P' ? ' en ' + (ingreso ? 'Cuentas por cobrar.' : 'Cuentas por pagar.') : '.'));
          this.guardando = false; this.modal = '';
          await this.cargar(true);
        } catch (e) { this.error = e.message; this.guardando = false; }
      },

      // ---------- Compra ----------
      get resultadosProd() {
        const q = normalizarTexto(this.busquedaProd.trim());
        return this.d.catalogos.productos.filter((p) => !q || normalizarTexto(p.nombre + ' ' + (p.sku || '')).includes(q)).slice(0, 8);
      },
      agregarProducto(p) {
        const existente = this.fc.items.find((x) => x.producto_id === p.id && p.variantes.length === 0);
        if (existente) { existente.cantidad = Number(existente.cantidad) + 1; } else {
          this.fc.items.push({ uid: this.uid++, producto_id: p.id, nombre: p.nombre, sku: p.sku, variantes: p.variantes, variante_id: p.variantes.length === 1 ? p.variantes[0].id : '', cantidad: 1, precio: p.precio_compra });
        }
        this.busquedaProd = ''; this.listaProd = false;
      },
      subtotalItem(it) { return r2((Number(it.cantidad) || 0) * (Number(it.precio) || 0)); },
      get totalCompra() { return r2(this.fc.items.reduce((s, it) => s + this.subtotalItem(it), 0)); },

      async guardarCompra() {
        const f = this.fc;
        this.error = '';
        if (!f.items.length) { this.error = 'Agrega al menos un producto.'; return; }
        for (const it of f.items) {
          if (it.variantes.length > 0 && !it.variante_id) { this.error = 'Elige la variante de «' + it.nombre + '».'; return; }
          if (!(Number(it.cantidad) > 0)) { this.error = 'La cantidad de «' + it.nombre + '» debe ser mayor que cero.'; return; }
          if (!(Number(it.precio) >= 0) || it.precio === '') { this.error = 'Escribe el costo de «' + it.nombre + '».'; return; }
        }
        this.guardando = true;
        try {
          await api('/finanzas/compras', { method: 'POST', body: {
            proveedor_id: f.proveedor || null, fecha: f.fecha, estado: f.estado, cuenta: f.estado === 'C' ? f.cuenta : null,
            vencimiento: f.estado === 'P' ? f.vencimiento : null, notas: f.notas,
            items: f.items.map((it) => ({ producto_id: it.producto_id, variante_id: it.variante_id || null, cantidad: it.cantidad, precio_unitario: it.precio })),
          } });
          toast('Compra registrada: ' + dinero(this.totalCompra) + (f.estado === 'P' ? '. Quedó en Cuentas por pagar.' : '.'));
          this.guardando = false; this.modal = '';
          await this.cargar(true);
        } catch (e) { this.error = e.message; this.guardando = false; }
      },

      // ---------- Anular ----------
      async confirmarAnular() {
        const a = this.anulando;
        a.guardando = true; a.error = '';
        try {
          await api('/finanzas/' + (this.tab === 'ingresos' ? 'ingresos' : 'gastos') + '/' + a.m.id + '/anular', { method: 'POST', body: { motivo: a.motivo } });
          this.anulando = null;
          toast('Registro anulado.');
          await this.cargar(true);
        } catch (e) { a.error = e.message; a.guardando = false; }
      },
    };
  });
});
