// Punto de venta. Todo el carrito vive en el navegador y se valida contra el stock del catálogo
// que ya está cargado; el servidor vuelve a validar y recalcula al cobrar (es quien manda).

// ---- Totales: misma fórmula que utils/totales.js (enteros en centavos, igual que Postgres) ----
function centavosPos(n) { return Math.round(Number(n) * 100 + 1e-9); }
function importeLineaPos(precio, cantidad) { return Math.floor((centavosPos(precio) * centavosPos(cantidad) + 50) / 100); }
function calcularTotalesPos(lineas, tasa, incluido) {
  const bps = Math.round(Number(tasa) * 10000);
  const importes = lineas.map(function (l) { return importeLineaPos(l.precio, l.cantidad); });
  const suma = importes.reduce(function (s, c) { return s + c; }, 0);
  let subtotal; let impuesto; let total;
  if (incluido) {
    total = suma;
    const d = 10000 + bps;
    subtotal = Math.floor((2 * total * 10000 + d) / (2 * d));
    impuesto = total - subtotal;
  } else {
    subtotal = suma;
    impuesto = Math.floor((subtotal * bps + 5000) / 10000);
    total = subtotal + impuesto;
  }
  const m = function (c) { return Number((c / 100).toFixed(2)); };
  return { subtotal: m(subtotal), impuesto: m(impuesto), total: m(total), importes: importes.map(m) };
}
window.calcularTotalesPos = calcularTotalesPos;

const redondear2 = function (n) { return Math.round((Number(n) + 1e-9) * 100) / 100; };

document.addEventListener('alpine:init', function () {
  Alpine.data('pos', function () {
    return {
      d: { productos: [], clientes: [], tasa: 0.15, impuestoIncluido: false, tiposVariante: [], unidadesDecimales: [], facturacion: null, usuarioId: 0, permisos: {} },
      productos: [],
      clientes: [],
      stockP: {},
      stockV: {},
      porId: {},

      // catálogo
      busqueda: '',
      categoria: '',
      vista: 'tarjetas',
      limite: 48,
      ultimaCarga: 0,

      // carrito
      carrito: [],
      cliente: null,
      pendiente: false,
      clave: null,
      consumo: {},
      totales: { subtotal: 0, impuesto: 0, total: 0, importes: [] },
      confirmarVaciar: false,
      uid: 1,

      // pantallas
      escritorio: true,
      drawer: false,
      mv: null,
      mc: false,
      fc: { nombre: '', telefono: '', rtn: '', correo: '' },
      errorCliente: '',
      guardandoCliente: false,

      // cliente (autocompletado)
      qCliente: '',
      listaCliente: false,
      idxCliente: -1,

      // cobro
      cobrando: false,
      errorCobro: '',
      exito: null,

      init() {
        this.d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.clientes = this.d.clientes.map((c) => this.prepararCliente(c));
        this.cargarProductos(this.d.productos);

        const guardada = preferencia.leer('vista:pos', 'tarjetas');
        this.vista = guardada === 'lista' ? 'lista' : 'tarjetas';

        // En escritorio el carrito es una columna; en móvil es un panel que sube desde abajo
        if (window.matchMedia) {
          const mq = window.matchMedia('(min-width: 1024px)');
          this.escritorio = mq.matches;
          const cambio = (e) => { this.escritorio = e.matches; if (e.matches) this.drawer = false; };
          if (mq.addEventListener) mq.addEventListener('change', cambio); else if (mq.addListener) mq.addListener(cambio);
        }

        this.$watch('busqueda', () => { this.limite = 48; });
        this.$watch('categoria', () => { this.limite = 48; });
        this.restaurar();
        this.recalcular();
      },

      // =============== Catálogo ===============
      cargarProductos(lista) {
        this.productos = lista.map((p) => {
          p._h = normalizarTexto([p.nombre, p.sku, p.categoria, p.variantes.map((v) => v.sku + ' ' + v.nombre).join(' ')].join(' '));
          return p;
        });
        this.stockP = {};
        this.stockV = {};
        this.porId = {};
        this.productos.forEach((p) => {
          this.porId[p.id] = p;
          if (!p.es_compuesto) this.stockP[p.id] = Number(p.stock);
          p.variantes.forEach((v) => { this.stockV[v.id] = Number(v.stock); });
        });
        // Un componente de kit que no está en el catálogo (inactivo) también se descuenta: usa el stock que trae el kit
        this.productos.forEach((p) => p.componentes.forEach((c) => {
          if (this.stockP[c.producto_id] === undefined) this.stockP[c.producto_id] = Number(c.stock);
        }));
        this.ultimaCarga = Date.now();
      },

      get categorias() {
        return [...new Set(this.productos.map((p) => p.categoria).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
      },
      get filtrados() {
        const q = normalizarTexto(this.busqueda.trim());
        return this.productos.filter((p) => (!this.categoria || p.categoria === this.categoria) && (!q || p._h.includes(q)));
      },
      get visibles() { return this.filtrados.slice(0, this.limite); },

      cambiarVista(v) { this.vista = v; preferencia.guardar('vista:pos', v); },

      // Enter en el buscador (lector de códigos): SKU exacto de variante o producto lo agrega directo
      buscarEnter() {
        const q = this.busqueda.trim().toLowerCase();
        if (!q) return;
        for (const p of this.productos) {
          const v = p.variantes.find((x) => (x.sku || '').toLowerCase() === q);
          if (v) { this.agregarVariante(p, v, 1); this.busqueda = ''; return; }
        }
        const exacto = this.productos.find((p) => (p.sku || '').toLowerCase() === q);
        const unico = this.filtrados.length === 1 ? this.filtrados[0] : null;
        const elegido = exacto || unico;
        if (elegido) { this.tocar(elegido); this.busqueda = ''; return; }
        toast(this.filtrados.length ? 'Hay varios resultados: toca el producto que buscas.' : 'No se encontró «' + this.busqueda.trim() + '».', 'error');
      },

      // =============== Stock ===============
      permiteDecimales(unidad) { return (this.d.unidadesDecimales || []).includes(String(unidad || '').toLowerCase()); },

      // Qué stock consume una unidad de este producto (kit = sus componentes, variante = su stock propio)
      necesidades(p, varianteId) {
        if (p.es_compuesto) {
          return p.componentes.map((c) => ({ clave: 'p:' + c.producto_id, stock: this.stockP[c.producto_id], por: Number(c.cantidad) }));
        }
        if (p.variantes.length) return [{ clave: 'v:' + varianteId, stock: this.stockV[varianteId], por: 1 }];
        return [{ clave: 'p:' + p.id, stock: this.stockP[p.id], por: 1 }];
      },

      // Cuántas unidades más se pueden agregar, descontando lo que ya está en el carrito
      disponible(p, varianteId) {
        if (!p.es_compuesto && p.variantes.length && !varianteId) {
          return p.variantes.reduce((s, v) => s + this.disponible(p, v.id), 0);
        }
        const nec = this.necesidades(p, varianteId);
        if (!nec.length) return 0;
        let min = Infinity;
        nec.forEach((n) => {
          const libre = (Number(n.stock) || 0) - (this.consumo[n.clave] || 0);
          min = Math.min(min, n.por > 0 ? libre / n.por : 0);
        });
        if (!isFinite(min)) return 0;
        return Math.max(0, this.permiteDecimales(p.unidad) ? Math.floor(min * 100 + 1e-6) / 100 : Math.floor(min + 1e-6));
      },
      disponibleLinea(l) { return this.disponible(this.porId[l.producto_id], l.variante_id); },

      enCarrito(p) {
        return this.carrito.filter((l) => l.producto_id === p.id).reduce((s, l) => s + l.cantidad, 0);
      },
      agotado(p) { return this.disponible(p) <= 0; },

      estadoStock(p) {
        const d = this.disponible(p);
        const enc = this.enCarrito(p);
        if (d <= 0) return { texto: enc > 0 ? 'Todo en el carrito' : 'Agotado', clase: enc > 0 ? 'ins-marca' : 'ins-agotado' };
        const poco = p.es_compuesto || p.variantes.length ? d <= 3 : d <= Math.max(Number(p.stock_minimo) || 0, 0);
        return { texto: (poco ? 'Quedan ' : '') + cantidad(d) + (poco ? '' : ' disponibles'), clase: poco ? 'ins-bajo' : 'ins-ok' };
      },

      // =============== Agregar al carrito ===============
      tocar(p) {
        if (this.exito) this.nuevaVenta(false);
        if (p.variantes.length) { this.abrirVariante(p); return; }
        if (this.disponible(p) < 1) { toast('«' + p.nombre + '»: no hay más stock disponible.', 'error'); return; }
        this.agregarLinea(p, null, 1);
      },

      agregarVariante(p, v, cant) {
        if (this.exito) this.nuevaVenta(false);
        if (this.disponible(p, v.id) < cant) { toast('«' + p.nombre + '» (' + v.nombre + '): no hay más stock disponible.', 'error'); return false; }
        this.agregarLinea(p, v, cant);
        return true;
      },

      agregarLinea(p, v, cant) {
        const clave = p.id + ':' + (v ? v.id : 0);
        const existente = this.carrito.find((l) => l.clave === clave);
        if (existente) {
          existente.cantidad = redondear2(existente.cantidad + cant);
        } else {
          this.carrito.push({
            uid: this.uid++, clave: clave, producto_id: p.id, variante_id: v ? v.id : null,
            nombre: p.nombre, detalle: v ? v.nombre : '', sku: v && v.sku ? v.sku : p.sku,
            precio: Number(p.precio_venta), cantidad: cant, unidad: p.unidad, esKit: p.es_compuesto,
            decimales: this.permiteDecimales(p.unidad),
          });
        }
        this.cambioCarrito();
      },

      // =============== Modal de variantes ===============
      tiposDe(p) {
        const tipos = (this.d.tiposVariante || []).filter((t) => p.variantes.some((v) => v.atributos && v.atributos[t]));
        return tipos;
      },
      valoresDe(p, tipo) {
        const vistos = [];
        p.variantes.forEach((v) => { const x = v.atributos && v.atributos[tipo]; if (x && !vistos.includes(x)) vistos.push(x); });
        return vistos;
      },
      abrirVariante(p) {
        const sel = {};
        this.tiposDe(p).forEach((t) => {
          // Si solo hay un valor posible (ej. una sola talla) ya viene elegido
          const valores = this.valoresDe(p, t);
          sel[t] = valores.length === 1 ? valores[0] : '';
        });
        // directa: productos cuyas variantes no tienen atributos (talla, equipo...), solo nombre
        this.mv = { p: p, sel: sel, cantidad: 1, error: '', directa: p.variantes.length === 1 ? p.variantes[0].id : null };
      },
      elegirDirecta(v) {
        this.mv.directa = this.mv.directa === v.id ? null : v.id;
        this.mv.error = '';
        this.ajustarCantidadVariante();
      },
      cerrarVariante() { this.mv = null; },

      // Variantes que cumplen lo ya elegido (ignorando el tipo que se está evaluando)
      variantesCon(sel, ignorar) {
        const p = this.mv.p;
        return p.variantes.filter((v) => Object.keys(sel).every((t) => t === ignorar || !sel[t] || (v.atributos && v.atributos[t]) === sel[t]));
      },
      // ¿Queda stock de este valor en alguna combinación? (si no, el chip no se puede tocar)
      valorExiste(tipo, valor) {
        const p = this.mv.p;
        return p.variantes.some((v) => v.atributos && v.atributos[tipo] === valor && this.disponible(p, v.id) > 0);
      },
      // ¿Hay stock de este valor combinado con lo demás que se eligió? (si no, el chip se ve atenuado,
      // pero se puede tocar: al hacerlo se suelta la opción que no combina)
      valorDisponible(tipo, valor) {
        const p = this.mv.p;
        const sel = Object.assign({}, this.mv.sel);
        sel[tipo] = valor;
        return this.variantesCon(sel).some((v) => this.disponible(p, v.id) > 0);
      },
      elegirValor(tipo, valor) {
        const sel = this.mv.sel;
        sel[tipo] = sel[tipo] === valor ? '' : valor;
        // Si lo que ya estaba elegido en otro tipo no existe con este valor, se suelta
        Object.keys(sel).forEach((t) => {
          if (t !== tipo && sel[t] && !this.valorDisponible(t, sel[t])) sel[t] = '';
        });
        this.mv.error = '';
        this.ajustarCantidadVariante();
      },
      // La variante concreta, cuando ya se eligieron todos los tipos
      get varianteElegida() {
        if (!this.mv) return null;
        const tipos = Object.keys(this.mv.sel);
        if (!tipos.length) return this.mv.directa ? this.mv.p.variantes.find((v) => v.id === this.mv.directa) || null : null;
        if (tipos.some((t) => !this.mv.sel[t])) return null;
        const c = this.variantesCon(this.mv.sel);
        return c.length === 1 ? c[0] : null;
      },
      get disponibleVariante() {
        const v = this.varianteElegida;
        return v ? this.disponible(this.mv.p, v.id) : 0;
      },
      ajustarCantidadVariante() {
        const max = this.disponibleVariante;
        if (max > 0 && this.mv.cantidad > max) this.mv.cantidad = max;
        if (this.mv.cantidad < 1) this.mv.cantidad = 1;
      },
      cambiarCantidadVariante(delta) {
        const max = this.disponibleVariante;
        const nueva = Math.floor(Number(this.mv.cantidad) || 1) + delta;
        if (nueva < 1) return;
        if (nueva > max) { this.mv.error = max > 0 ? 'Solo hay ' + cantidad(max) + ' disponibles.' : ''; return; }
        this.mv.error = '';
        this.mv.cantidad = nueva;
      },
      escribirCantidadVariante(valor) {
        const n = Math.floor(Number(String(valor).replace(',', '.')));
        const max = this.disponibleVariante;
        if (!(n >= 1)) { this.mv.cantidad = 1; return; }
        if (max > 0 && n > max) { this.mv.cantidad = max; this.mv.error = 'Solo hay ' + cantidad(max) + ' disponibles.'; return; }
        this.mv.error = '';
        this.mv.cantidad = n;
      },
      confirmarVariante() {
        const v = this.varianteElegida;
        if (!v) {
          const faltan = Object.keys(this.mv.sel).filter((t) => !this.mv.sel[t]);
          this.mv.error = faltan.length ? 'Elige ' + faltan.join(' y ') + '.' : 'Elige una opción.';
          return;
        }
        const cant = Math.floor(Number(this.mv.cantidad)) || 1;
        if (cant > this.disponibleVariante) { this.mv.error = 'Solo hay ' + cantidad(this.disponibleVariante) + ' disponibles.'; return; }
        if (this.agregarVariante(this.mv.p, v, cant)) this.mv = null;
      },

      // =============== Carrito ===============
      get unidades() { return this.carrito.reduce((s, l) => s + l.cantidad, 0); },
      get etiquetaFacturacion() {
        const f = this.d.facturacion;
        if (!f) return '';
        if (f.modo === 'interno') return 'Comprobante interno' + (f.siguiente ? ' ' + f.siguiente : '');
        return f.restantes <= 5 ? 'Factura con CAI (quedan ' + f.restantes + ')' : 'Factura con CAI';
      },
      get avisoFacturacion() {
        const f = this.d.facturacion;
        return !!f && f.modo === 'sar' && (f.restantes <= 5 || f.dias < 0);
      },
      get tasaPorcentaje() { return +(this.d.tasa * 100).toFixed(2); },

      // Se llama después de CUALQUIER cambio al carrito
      cambioCarrito() {
        this.clave = null; // un carrito distinto es un cobro distinto
        this.errorCobro = '';
        this.confirmarVaciar = false;
        this.recalcular();
        this.guardar();
      },

      recalcular() {
        const consumo = {};
        this.carrito.forEach((l) => {
          const p = this.porId[l.producto_id];
          if (!p) return;
          this.necesidades(p, l.variante_id).forEach((n) => {
            consumo[n.clave] = redondear2((consumo[n.clave] || 0) + n.por * l.cantidad);
          });
        });
        this.consumo = consumo;
        this.totales = calcularTotalesPos(
          this.carrito.map((l) => ({ precio: l.precio, cantidad: l.cantidad })), this.d.tasa, this.d.impuestoIncluido
        );
      },

      sumar(l) {
        const paso = 1;
        if (this.disponibleLinea(l) < paso) { toast('No hay más stock de «' + l.nombre + '».', 'error'); return; }
        l.cantidad = redondear2(l.cantidad + paso);
        this.cambioCarrito();
      },
      restar(l) {
        if (l.cantidad <= 1) return;
        l.cantidad = redondear2(l.cantidad - 1);
        this.cambioCarrito();
      },
      // Cantidad escrita a mano: se ajusta a lo posible
      fijarCantidad(l, valor, el) {
        let n = Number(String(valor).replace(',', '.'));
        const max = redondear2(l.cantidad + this.disponibleLinea(l));
        if (!(n > 0)) { if (el) el.value = l.cantidad; return; }
        n = l.decimales ? redondear2(n) : Math.floor(n);
        if (n < (l.decimales ? 0.01 : 1)) n = l.decimales ? 0.01 : 1;
        if (n > max) { n = max; toast('Solo hay ' + cantidad(max) + ' disponibles de «' + l.nombre + '».', 'error'); }
        l.cantidad = n;
        if (el) el.value = n;
        this.cambioCarrito();
      },
      quitar(l) {
        this.carrito = this.carrito.filter((x) => x.uid !== l.uid);
        this.cambioCarrito();
      },
      vaciar() {
        if (!this.carrito.length) return;
        if (!this.confirmarVaciar) {
          this.confirmarVaciar = true;
          setTimeout(() => { this.confirmarVaciar = false; }, 3500);
          return;
        }
        this.carrito = [];
        this.cliente = null;
        this.pendiente = false;
        this.cambioCarrito();
      },

      // =============== Cliente ===============
      prepararCliente(c) {
        c._h = normalizarTexto([c.nombre, c.telefono, c.rtn].join(' '));
        c._d = String((c.telefono || '') + (c.rtn || '')).replace(/\D/g, '');
        return c;
      },
      get resultadosCliente() {
        const q = normalizarTexto(this.qCliente.trim());
        if (!q) return [];
        const digitos = q.replace(/\D/g, '');
        return this.clientes
          .filter((c) => c._h.includes(q) || (digitos.length >= 3 && c._d.includes(digitos)))
          .slice(0, 8);
      },
      moverCliente(delta) {
        const n = this.resultadosCliente.length;
        if (!n) return;
        this.listaCliente = true;
        this.idxCliente = (this.idxCliente + delta + n) % n;
      },
      enterCliente() {
        const r = this.resultadosCliente;
        if (!r.length) return;
        this.elegirCliente(r[this.idxCliente >= 0 ? this.idxCliente : 0]);
      },
      elegirCliente(c) {
        this.cliente = c;
        this.qCliente = '';
        this.listaCliente = false;
        this.idxCliente = -1;
        this.cambioCarrito();
      },
      quitarCliente() { this.cliente = null; this.cambioCarrito(); },

      abrirNuevoCliente() {
        const q = this.qCliente.trim();
        const soloDigitos = /^[\d\s-]+$/.test(q);
        this.fc = { nombre: q && !soloDigitos ? q : '', telefono: q && soloDigitos ? q : '', rtn: '', correo: '' };
        this.errorCliente = '';
        this.listaCliente = false;
        this.mc = true;
        this.$nextTick(() => { const el = document.getElementById('nc-nombre'); if (el) el.focus(); });
      },
      cerrarNuevoCliente() { if (!this.guardandoCliente) this.mc = false; },
      async guardarCliente() {
        this.errorCliente = '';
        this.guardandoCliente = true;
        try {
          const r = await api('/pos/clientes', { method: 'POST', body: this.fc });
          const c = this.prepararCliente(r.cliente);
          this.clientes.push(c);
          this.clientes.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
          this.mc = false;
          this.elegirCliente(c);
          toast('Cliente creado y agregado a la venta.');
        } catch (e) {
          this.errorCliente = e.message;
        } finally {
          this.guardandoCliente = false;
        }
      },

      // =============== Cobrar ===============
      generarClave() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
      },

      datosVenta() {
        return {
          cliente_id: this.cliente ? this.cliente.id : null,
          items: this.carrito.map((l) => ({ producto_id: l.producto_id, variante_id: l.variante_id, cantidad: l.cantidad })),
        };
      },

      async cobrar() {
        if (this.cobrando || !this.carrito.length) return;
        this.errorCobro = '';
        this.cobrando = true;
        if (!this.clave) this.clave = this.generarClave(); // mismo cobro reintentado = misma clave: no se duplica
        try {
          const r = await api('/pos/cobrar', {
            method: 'POST',
            body: Object.assign(this.datosVenta(), { pendiente: this.pendiente, clave: this.clave }),
          });
          this.exito = r.venta;
          this.carrito = [];
          this.cliente = null;
          this.pendiente = false;
          this.clave = null;
          this.recalcular();
          this.guardar();
          this.refrescarCatalogo();
        } catch (e) {
          this.errorCobro = e.red
            ? 'No se pudo confirmar la venta por la conexión. Revisa tu internet y vuelve a tocar Cobrar: no se duplicará.'
            : e.message;
          if (!e.red) this.refrescarCatalogo(true);
        } finally {
          this.cobrando = false;
        }
      },

      nuevaVenta(enfocar) {
        this.exito = null;
        this.errorCobro = '';
        if (!this.escritorio) this.drawer = false;
        if (enfocar !== false) this.$nextTick(() => { const el = document.getElementById('pos-buscar'); if (el) el.focus(); });
      },

      cotizar() {
        if (!this.carrito.length) { toast('Agrega productos para cotizar.', 'error'); return; }
        this.$refs.datosCot.value = JSON.stringify(this.datosVenta());
        this.$refs.formCot.submit();
      },

      // =============== Stock al día ===============
      async refrescarCatalogo(conAviso) {
        try {
          const r = await api('/pos/catalogo');
          this.cargarProductos(r.productos);
          this.reconciliar(conAviso);
        } catch (e) { /* si no hay red se sigue con lo que hay cargado */ }
      },

      // Ajusta el carrito a un catálogo nuevo: precios, productos que ya no están y cantidades que ya no alcanzan
      reconciliar(avisar) {
        const avisos = [];
        const consumo = {};
        const nuevas = [];
        this.carrito.forEach((l) => {
          const p = this.porId[l.producto_id];
          const v = p && l.variante_id ? p.variantes.find((x) => x.id === l.variante_id) : null;
          if (!p || (l.variante_id && !v)) { avisos.push('«' + l.nombre + '» ya no está disponible y se quitó.'); return; }

          const nec = this.necesidades(p, l.variante_id);
          let max = Infinity;
          nec.forEach((n) => {
            max = Math.min(max, n.por > 0 ? ((Number(n.stock) || 0) - (consumo[n.clave] || 0)) / n.por : 0);
          });
          max = !isFinite(max) ? 0 : (l.decimales ? Math.floor(max * 100 + 1e-6) / 100 : Math.floor(max + 1e-6));

          if (max <= 0) { avisos.push('«' + l.nombre + '» se agotó y se quitó del carrito.'); return; }
          if (l.cantidad > max) { avisos.push('«' + l.nombre + '»: solo quedan ' + cantidad(max) + '.'); l.cantidad = max; }
          if (redondear2(l.precio) !== redondear2(p.precio_venta)) avisos.push('«' + l.nombre + '» cambió de precio.');

          l.precio = Number(p.precio_venta);
          l.nombre = p.nombre;
          nec.forEach((n) => { consumo[n.clave] = redondear2((consumo[n.clave] || 0) + n.por * l.cantidad); });
          nuevas.push(l);
        });
        const cambio = avisos.length > 0;
        this.carrito = nuevas;
        this.recalcular();
        if (cambio) {
          this.clave = null;
          this.guardar();
          if (avisar !== false) toast('Se actualizó el carrito: ' + avisos[0] + (avisos.length > 1 ? ' (y ' + (avisos.length - 1) + ' más)' : ''), 'error');
        }
        return avisos;
      },

      // Al volver a la pestaña después de un rato, el stock puede haber cambiado
      alVolver() {
        if (document.visibilityState === 'visible' && Date.now() - this.ultimaCarga > 2 * 60 * 1000) this.refrescarCatalogo(true);
      },

      // =============== Carrito guardado (sobrevive a recargar la página) ===============
      llave() { return 'pos:carrito:' + this.d.usuarioId; },
      guardar() {
        try {
          if (!this.carrito.length) { window.localStorage.removeItem(this.llave()); return; }
          window.localStorage.setItem(this.llave(), JSON.stringify({
            t: Date.now(),
            cliente_id: this.cliente ? this.cliente.id : null,
            pendiente: this.pendiente,
            lineas: this.carrito.map((l) => ({ producto_id: l.producto_id, variante_id: l.variante_id, cantidad: l.cantidad })),
          }));
        } catch (e) { /* almacenamiento bloqueado: no pasa nada */ }
      },
      restaurar() {
        try {
          const crudo = window.localStorage.getItem(this.llave());
          if (!crudo) return;
          const g = JSON.parse(crudo);
          if (!g || !Array.isArray(g.lineas) || Date.now() - g.t > 12 * 60 * 60 * 1000) { window.localStorage.removeItem(this.llave()); return; }

          g.lineas.forEach((x) => {
            const p = this.porId[x.producto_id];
            const v = p && x.variante_id ? p.variantes.find((y) => y.id === x.variante_id) : null;
            if (!p || (x.variante_id && !v) || !(Number(x.cantidad) > 0)) return;
            this.carrito.push({
              uid: this.uid++, clave: p.id + ':' + (v ? v.id : 0), producto_id: p.id, variante_id: v ? v.id : null,
              nombre: p.nombre, detalle: v ? v.nombre : '', sku: v && v.sku ? v.sku : p.sku, precio: Number(p.precio_venta),
              cantidad: Number(x.cantidad), unidad: p.unidad, esKit: p.es_compuesto, decimales: this.permiteDecimales(p.unidad),
            });
          });
          this.cliente = g.cliente_id ? this.clientes.find((c) => c.id === g.cliente_id) || null : null;
          this.pendiente = !!g.pendiente;

          const avisos = this.reconciliar(false);
          if (this.carrito.length) {
            // Si algo cambió mientras tanto (stock, precio), se dice qué fue
            const detalle = avisos.length ? ' ' + avisos[0] + (avisos.length > 1 ? ' (y ' + (avisos.length - 1) + ' más)' : '') : '';
            toast('Recuperé la venta que tenías en curso.' + detalle, avisos.length ? 'error' : 'ok');
          } else {
            this.guardar();
          }
        } catch (e) { /* un carrito guardado dañado se ignora */ }
      },
    };
  });
});
