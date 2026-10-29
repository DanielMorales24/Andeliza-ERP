// Formulario de producto: datos generales, imagen, variantes y kits.
// Todo el estado vive aquí; al guardar se manda en un solo envío (multipart).
document.addEventListener('alpine:init', function () {
  Alpine.data('formProducto', function () {
    return {
      d: { tiposVariante: [], opcionesVariante: {}, funcionalidades: {}, categorias: [], proveedores: [], unidades: [], candidatosKit: [], producto: {}, variantes: [], componentes: [] },
      f: {},
      variantes: [],
      componentes: [],
      conVariantes: false,
      esKit: false,
      generador: { seleccion: {}, stockMinimo: 2 },
      busquedaKit: '',
      listaKit: false,
      imagen: { vista: null, blob: null, quitar: false, info: '' },
      errores: [],
      guardando: false,
      contadorUid: 1,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        const p = this.d.producto;

        this.f = {
          nombre: p.nombre, sku: p.sku || '', categoria_id: p.categoria_id || '', proveedor_id: p.proveedor_id || '',
          unidad: p.unidad, precio_compra: p.precio_compra, precio_venta: p.precio_venta,
          stock: p.stock, stock_minimo: p.stock_minimo, descripcion: p.descripcion || '', activo: p.activo,
        };
        this.d.tiposVariante.forEach((t) => { this.generador.seleccion[t] = []; });

        this.conVariantes = this.d.funcionalidades.variantes && this.d.variantes.length > 0;
        this.esKit = this.d.funcionalidades.kits && !!p.es_compuesto;
        this.variantes = this.d.variantes.map((v) => this.nuevaVariante(v.atributos || {}, v));
        this.componentes = this.d.componentes.map((c) => Object.assign({}, c, { cantidad: Number(c.cantidad) }));
        this.imagen.vista = p.imagen_url || null;
      },

      // ---------- Precios ----------
      get ganancia() { return (Number(this.f.precio_venta) || 0) - (Number(this.f.precio_compra) || 0); },
      get margen() {
        const venta = Number(this.f.precio_venta);
        return venta > 0 ? Math.round((this.ganancia / venta) * 1000) / 10 : null;
      },

      // ---------- Variantes ----------
      mayus(t) { return t.charAt(0).toUpperCase() + t.slice(1); },
      opciones(tipo) { return this.d.opcionesVariante[tipo] || []; },
      get hayOpciones() { return this.d.tiposVariante.some((t) => this.opciones(t).length > 0); },

      nombreVariante(attrs) { return this.d.tiposVariante.map((t) => attrs[t]).filter(Boolean).join(' / '); },

      nuevaVariante(atributos, base) {
        base = base || {};
        const attrs = {};
        this.d.tiposVariante.forEach((t) => { attrs[t] = atributos[t] || ''; });
        return {
          uid: this.contadorUid++,
          id: base.id || null,
          atributos: attrs,
          sku: base.sku || '',
          stock: base.stock !== undefined ? Number(base.stock) : 0,
          stock_minimo: base.stock_minimo !== undefined ? Number(base.stock_minimo) : Number(this.generador.stockMinimo) || 0,
        };
      },

      // SKU que se asignará si se deja vacío (ej. CAM-RMA-M-LOC)
      skuAuto(v) {
        if (!this.f.sku.trim()) return '';
        const abrev = (x) => (x.length <= 3 ? x : x.slice(0, 3)).toUpperCase().replace(/\s+/g, '');
        return [this.f.sku.trim()].concat(this.d.tiposVariante.map((t) => v.atributos[t]).filter(Boolean).map(abrev)).join('-');
      },

      alternarOpcion(tipo, valor) {
        const sel = this.generador.seleccion[tipo];
        const i = sel.indexOf(valor);
        if (i === -1) sel.push(valor); else sel.splice(i, 1);
        const orden = this.opciones(tipo);
        sel.sort((a, b) => orden.indexOf(a) - orden.indexOf(b));
      },

      // Todas las combinaciones entre lo elegido en cada tipo (talla x equipo...)
      get combinaciones() {
        const tipos = this.d.tiposVariante.filter((t) => (this.generador.seleccion[t] || []).length > 0);
        if (!tipos.length) return [];
        let combos = [{}];
        tipos.forEach((t) => {
          const siguiente = [];
          combos.forEach((c) => this.generador.seleccion[t].forEach((val) => { const n = Object.assign({}, c); n[t] = val; siguiente.push(n); }));
          combos = siguiente;
        });
        return combos;
      },
      get combinacionesNuevas() {
        const existentes = new Set(this.variantes.map((v) => this.nombreVariante(v.atributos).toLowerCase()));
        return this.combinaciones.filter((c) => !existentes.has(this.nombreVariante(c).toLowerCase()));
      },

      agregarCombinaciones() {
        const nuevas = this.combinacionesNuevas;
        if (this.variantes.length + nuevas.length > 300) { toast('Un producto no puede tener más de 300 variantes.', 'error'); return; }
        nuevas.forEach((c) => this.variantes.push(this.nuevaVariante(c)));
        toast(nuevas.length === 1 ? 'Se agregó 1 variante.' : 'Se agregaron ' + nuevas.length + ' variantes.');
        this.d.tiposVariante.forEach((t) => { this.generador.seleccion[t] = []; });
      },
      agregarVariante() { this.variantes.push(this.nuevaVariante({})); },
      quitarVariante(i) { this.variantes.splice(i, 1); },
      get stockTotalVariantes() { return this.variantes.reduce((s, v) => s + (Number(v.stock) || 0), 0); },

      // Al encender variantes se apaga el kit (no pueden convivir) y empieza con una fila lista
      alCambiarVariantes() {
        if (this.conVariantes) {
          this.esKit = false;
          if (!this.variantes.length && !this.hayOpciones) this.agregarVariante();
        }
      },
      alCambiarKit() {
        if (this.esKit) this.conVariantes = false;
      },

      // ---------- Kit ----------
      get resultadosKit() {
        const q = normalizarTexto(this.busquedaKit.trim());
        const usados = new Set(this.componentes.map((c) => c.producto_id));
        return this.d.candidatosKit
          .filter((p) => !usados.has(p.id) && (!q || normalizarTexto(p.nombre + ' ' + (p.sku || '')).includes(q)))
          .slice(0, 8);
      },
      agregarComponente(p) {
        this.componentes.push({ producto_id: p.id, nombre: p.nombre, sku: p.sku, unidad: p.unidad, stock: p.stock, precio_compra: p.precio_compra, cantidad: 1 });
        this.busquedaKit = '';
        this.listaKit = false;
      },
      quitarComponente(i) { this.componentes.splice(i, 1); },
      get costoComponentes() { return this.componentes.reduce((s, c) => s + (Number(c.precio_compra) || 0) * (Number(c.cantidad) || 0), 0); },
      usarCostoComponentes() { this.f.precio_compra = Math.round(this.costoComponentes * 100) / 100; },
      get kitsPosibles() {
        if (!this.componentes.length) return 0;
        return Math.min.apply(null, this.componentes.map((c) => (Number(c.cantidad) > 0 ? Math.floor((Number(c.stock) || 0) / Number(c.cantidad)) : 0)));
      },

      // ---------- Imagen ----------
      async elegirImagen(evento) {
        const archivo = evento.target.files && evento.target.files[0];
        evento.target.value = '';
        if (!archivo) return;
        if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) { this.imagen.info = 'Usa una imagen JPG, PNG o WebP.'; return; }
        try {
          const blob = await this.comprimir(archivo);
          if (this.imagen.vista && this.imagen.vista.indexOf('blob:') === 0) URL.revokeObjectURL(this.imagen.vista);
          this.imagen.blob = blob;
          this.imagen.quitar = false;
          this.imagen.vista = URL.createObjectURL(blob);
          this.imagen.info = 'Se subirá como JPG de ' + Math.max(1, Math.round(blob.size / 1024)) + ' KB.';
        } catch (e) {
          this.imagen.info = e.message;
        }
      },
      // Las fotos del celular pesan varios MB: se reducen a 1200 px antes de subirlas
      comprimir(archivo) {
        return new Promise((resolve, reject) => {
          const url = URL.createObjectURL(archivo);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * escala));
            canvas.height = Math.max(1, Math.round(img.height * escala));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85);
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen. Prueba con otra.')); };
          img.src = url;
        });
      },
      quitarImagen() {
        if (this.imagen.vista && this.imagen.vista.indexOf('blob:') === 0) URL.revokeObjectURL(this.imagen.vista);
        this.imagen.quitar = Boolean(this.d.producto.imagen_url); // solo hay que borrar en el servidor si ya tenía una
        this.imagen.blob = null;
        this.imagen.vista = null;
        this.imagen.info = '';
      },

      // ---------- Guardar ----------
      validar() {
        const e = [];
        if (!String(this.f.nombre).trim()) e.push('Escribe el nombre del producto.');
        if (Number(this.f.precio_compra) < 0 || Number(this.f.precio_venta) < 0) e.push('Los precios no pueden ser negativos.');

        if (this.conVariantes && !this.esKit) {
          if (!this.variantes.length) e.push('Agrega al menos una variante, o apaga el interruptor de variantes.');
          const vistos = new Set();
          this.variantes.forEach((v, i) => {
            const nombre = this.nombreVariante(v.atributos);
            if (!nombre) { e.push('La variante ' + (i + 1) + ' no tiene ' + this.d.tiposVariante.join(' ni ') + '.'); return; }
            if (vistos.has(nombre.toLowerCase())) e.push('La variante «' + nombre + '» está repetida.');
            vistos.add(nombre.toLowerCase());
            if (Number(v.stock) < 0 || Number(v.stock_minimo) < 0) e.push('El stock de «' + nombre + '» no puede ser negativo.');
          });
        } else if (!this.esKit && (Number(this.f.stock) < 0 || Number(this.f.stock_minimo) < 0)) {
          e.push('El stock no puede ser negativo.');
        }

        if (this.esKit) {
          if (!this.componentes.length) e.push('Agrega al menos un componente al kit.');
          this.componentes.forEach((c) => { if (!(Number(c.cantidad) > 0)) e.push('La cantidad de «' + c.nombre + '» debe ser mayor que cero.'); });
        }
        return e;
      },

      mostrarErrores() {
        this.$nextTick(() => { const el = document.getElementById('resumen-errores'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      },

      async guardar() {
        this.errores = this.validar();
        if (this.errores.length) { this.mostrarErrores(); return; }

        this.guardando = true;
        try {
          const fd = new FormData();
          Object.keys(this.f).forEach((k) => fd.append(k, this.f[k] === null || this.f[k] === undefined ? '' : this.f[k]));
          fd.append('es_compuesto', this.esKit ? 'true' : 'false');
          fd.append('variantes', JSON.stringify(this.conVariantes && !this.esKit
            ? this.variantes.map((v) => ({ id: v.id, atributos: v.atributos, sku: v.sku, stock: v.stock, stock_minimo: v.stock_minimo }))
            : []));
          fd.append('componentes', JSON.stringify(this.esKit
            ? this.componentes.map((c) => ({ producto_id: c.producto_id, cantidad: c.cantidad }))
            : []));
          if (this.imagen.blob) fd.append('imagen', this.imagen.blob, 'imagen.jpg');
          if (this.imagen.quitar) fd.append('quitar_imagen', 'true');

          await api(this.d.id ? '/inventario/' + this.d.id : '/inventario', { method: 'POST', formData: fd });
          toastDiferido(this.d.id ? 'Producto actualizado.' : 'Producto creado.');
          window.location.href = '/inventario';
        } catch (e) {
          this.errores = [e.message];
          this.mostrarErrores();
        } finally {
          this.guardando = false;
        }
      },
    };
  });
});
