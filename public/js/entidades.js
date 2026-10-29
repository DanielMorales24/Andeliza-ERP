// Pantalla de listado con vista lista/tarjetas, búsqueda en vivo y modal de crear/editar.
// La usan categorías, clientes y proveedores: lo que cambia entre ellas viene en el descriptor.
document.addEventListener('alpine:init', function () {
  Alpine.data('listadoEntidad', function () {
    return {
      d: { campos: [], columnas: [], vistas: ['lista'], busqueda: [], textos: {}, tarjeta: { lineas: [] } },
      filas: [],
      busqueda: '',
      mostrarInactivos: false,
      vista: 'lista',
      limite: 60,
      modal: false,
      editando: null,
      form: {},
      error: '',
      guardando: false,

      init() {
        const datos = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.d = datos.descriptor;
        this.filas = datos.filas.map((f) => this.preparar(f));

        const porDefecto = window.innerWidth < 768 && this.d.vistas.includes('tarjetas') ? 'tarjetas' : this.d.vistas[0];
        const guardada = preferencia.leer('vista:' + this.d.clave, porDefecto);
        this.vista = this.d.vistas.includes(guardada) ? guardada : this.d.vistas[0];

        this.$watch('busqueda', () => { this.limite = 60; });
        this.$watch('mostrarInactivos', () => { this.limite = 60; });
      },

      // Texto de búsqueda precalculado por fila (sin acentos ni mayúsculas)
      preparar(f) {
        f._h = normalizarTexto(this.d.busqueda.map((c) => f[c]).join(' '));
        return f;
      },

      cambiarVista(v) {
        this.vista = v;
        preferencia.guardar('vista:' + this.d.clave, v);
      },

      get filtradas() {
        const q = normalizarTexto(this.busqueda.trim());
        return this.filas.filter((f) => (this.mostrarInactivos || f.activo) && (!q || f._h.includes(q)));
      },
      get visibles() { return this.filtradas.slice(0, this.limite); },
      get hayInactivos() { return this.filas.some((f) => !f.activo); },
      get hayActivos() { return this.filas.some((f) => f.activo); },

      // ---- Cómo se muestra cada valor ----
      campoDe(nombre) { return this.d.campos.find((c) => c.nombre === nombre); },

      valor(f, col) {
        const v = f[col.campo];
        if (v === null || v === undefined || v === '') return col.vacio || '—';
        const campo = this.campoDe(col.campo);
        if (campo && campo.opciones) {
          const o = campo.opciones.find((x) => x.valor === v);
          return o ? o.etiqueta : v;
        }
        return v;
      },
      vacio(f, col) { const v = f[col.campo]; return v === null || v === undefined || v === ''; },

      // ---- Modal ----
      abrirNuevo() {
        this.editando = null;
        this.form = {};
        this.d.campos.forEach((c) => { this.form[c.nombre] = c.tipo === 'interruptor' ? true : (c.defecto !== undefined ? c.defecto : ''); });
        this.abrir();
      },
      abrirEditar(f) {
        this.editando = f.id;
        this.form = {};
        this.d.campos.forEach((c) => {
          const v = f[c.nombre];
          this.form[c.nombre] = c.tipo === 'interruptor' ? v !== false : (v === null || v === undefined ? '' : v);
        });
        this.abrir();
      },
      abrir() {
        this.error = '';
        this.modal = true;
        this.$nextTick(() => { const el = document.getElementById('campo-nombre'); if (el) el.focus(); });
      },
      cerrarModal() { if (!this.guardando) this.modal = false; },

      async guardar() {
        this.error = '';
        this.guardando = true;
        try {
          const url = this.editando ? this.d.ruta + '/' + this.editando : this.d.ruta;
          const r = await api(url, { method: this.editando ? 'PUT' : 'POST', body: this.form });
          this.aplicar(r.fila);
          toast(this.editando ? this.d.textos.actualizado : this.d.textos.creado);
          this.modal = false;
        } catch (e) {
          this.error = e.message;
        } finally {
          this.guardando = false;
        }
      },

      async alternarActivo(f) {
        try {
          const r = await api(this.d.ruta + '/' + f.id + '/activo', { method: 'PATCH', body: { activo: !f.activo } });
          this.aplicar(r.fila);
          toast(r.fila.activo ? this.d.textos.activado : this.d.textos.desactivado);
        } catch (e) {
          toast(e.message, 'error');
        }
      },

      // Pone la fila que devolvió el servidor en la lista (nueva o reemplazando la anterior)
      aplicar(fila) {
        fila = this.preparar(fila);
        const i = this.filas.findIndex((x) => x.id === fila.id);
        if (i === -1) this.filas.push(fila); else this.filas.splice(i, 1, fila);
        this.filas.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
      },
    };
  });
});
