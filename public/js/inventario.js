// Listado de productos: búsqueda en vivo, filtros, vista lista/tarjetas.
// Todo se filtra en memoria, por eso responde al instante.
document.addEventListener('alpine:init', function () {
  Alpine.data('listadoProductos', function () {
    return {
      filas: [],
      categorias: [],
      busqueda: '',
      categoria: '',
      estado: '',
      mostrarInactivos: false,
      vista: 'lista',
      limite: 60,

      init() {
        const datos = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.filas = datos.filas.map((f) => this.preparar(f));
        this.categorias = [...new Set(this.filas.map((f) => f.categoria).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

        const guardada = preferencia.leer('vista:inventario', window.innerWidth < 768 ? 'tarjetas' : 'lista');
        this.vista = guardada === 'tarjetas' ? 'tarjetas' : 'lista';

        ['busqueda', 'categoria', 'estado', 'mostrarInactivos'].forEach((k) => this.$watch(k, () => { this.limite = 60; }));
      },

      // Busca por nombre, SKU (también el de las variantes), categoría y proveedor
      preparar(f) {
        f._h = normalizarTexto([f.nombre, f.sku, f.skus_variantes, f.categoria, f.proveedor].join(' '));
        return f;
      },

      cambiarVista(v) {
        this.vista = v;
        preferencia.guardar('vista:inventario', v);
      },

      get base() { return this.filas.filter((f) => this.mostrarInactivos || f.activo); },
      get filtradas() {
        const q = normalizarTexto(this.busqueda.trim());
        return this.base.filter((f) =>
          (!this.categoria || f.categoria === this.categoria)
          && (!this.estado || f.estado_stock === this.estado)
          && (!q || f._h.includes(q)));
      },
      get visibles() { return this.filtradas.slice(0, this.limite); },
      get hayInactivos() { return this.filas.some((f) => !f.activo); },
      conteo(estado) { return this.base.filter((f) => f.estado_stock === estado).length; },

      claseEstado(e) { return { ok: 'ins-ok', bajo: 'ins-bajo', agotado: 'ins-agotado' }[e]; },
      textoEstado(e) { return { ok: 'En stock', bajo: 'Stock bajo', agotado: 'Agotado' }[e]; },

      async alternarActivo(f) {
        try {
          const r = await api('/inventario/' + f.id + '/activo', { method: 'PATCH', body: { activo: !f.activo } });
          const i = this.filas.findIndex((x) => x.id === f.id);
          this.filas.splice(i, 1, this.preparar(r.fila));
          toast(r.fila.activo ? 'Producto activado.' : 'Producto desactivado.');
        } catch (e) {
          toast(e.message, 'error');
        }
      },
    };
  });
});
