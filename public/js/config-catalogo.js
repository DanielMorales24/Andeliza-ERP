// Configuración > Negocio (Fase 6.5): paleta, formato regional y catálogo del negocio.
// El catálogo maestro (lo que existe) llega del servidor; aquí se marca lo que este negocio usa.
// El servidor vuelve a comprobar que todo exista en el catálogo antes de guardar.
document.addEventListener('alpine:init', function () {
  const aviso = function (m, t) { if (window.toast) window.toast(m, t); };

  Alpine.data('configCatalogo', function () {
    return {
      d: { negocio: {}, maestro: { paletas: [], unidades: [], tiposVariante: [], categoriasGasto: [], tiposIngreso: [], monedas: [], formatosFecha: [], zonasHorarias: [], tasasImpuesto: [] }, usoUnidades: {} },
      paleta: '', paletaGuardada: '',
      r: { moneda: '', formatoFecha: '', zonaHoraria: '', tasaImpuesto: 15 },
      c: { unidades: [], tiposVariante: [], opcionesVariante: {}, categoriasGasto: [], tiposIngreso: [] },
      guardandoP: false, guardandoR: false, guardandoC: false, errP: '', errR: '', errC: '',

      init() {
        const d = JSON.parse(document.getElementById('datos-pagina').textContent);
        this.d = d;
        this.paleta = this.paletaGuardada = d.paletaId;
        this.r = Object.assign({}, d.regional);
        this.c = JSON.parse(JSON.stringify(d.catalogo));
      },

      // ----- listas planas (unidades, tipos de variante, categorías de gasto, tipos de ingreso) -----
      tiene(lista, valor) { return this.c[lista].includes(valor); },
      alternar(lista, valor) {
        const i = this.c[lista].indexOf(valor);
        if (i >= 0) this.c[lista].splice(i, 1); else this.c[lista].push(valor);
      },
      // ----- opciones sugeridas por tipo de variante -----
      tieneOpcion(tipo, valor) { return (this.c.opcionesVariante[tipo] || []).includes(valor); },
      alternarOpcion(tipo, valor) {
        const lista = (this.c.opcionesVariante[tipo] || []).slice();
        const i = lista.indexOf(valor);
        if (i >= 0) lista.splice(i, 1); else lista.push(valor);
        this.c.opcionesVariante[tipo] = lista;
      },
      marcarGrupo(tipo, valores, activar) {
        const resto = (this.c.opcionesVariante[tipo] || []).filter((v) => !valores.includes(v));
        this.c.opcionesVariante[tipo] = activar ? resto.concat(valores) : resto;
      },
      // Unidades que se están desactivando aunque haya productos que las usan (se avisa; no se pierde nada)
      get enUsoApagadas() {
        return this.d.maestro.unidades.filter((u) => (this.d.usoUnidades[u.clave] || 0) > 0 && !this.c.unidades.includes(u.clave)).map((u) => u.nombre.toLowerCase());
      },

      get paletaActual() { return this.d.maestro.paletas.find((p) => p.id === this.paleta) || null; },

      async guardarPaleta() {
        this.errP = ''; this.guardandoP = true;
        try {
          await api('/configuracion/apariencia', { method: 'PUT', body: { paleta_id: this.paleta } });
          this.paletaGuardada = this.paleta;
          // Los colores se aplican al cargar cada página: se recarga para verlos en todo el sistema
          if (window.toastDiferido) window.toastDiferido('Colores guardados');
          window.location.reload();
        } catch (e) { this.errP = e.message; this.guardandoP = false; }
      },

      async guardarRegional() {
        this.errR = ''; this.guardandoR = true;
        try {
          await api('/configuracion/regional', { method: 'PUT', body: this.r });
          if (window.toastDiferido) window.toastDiferido('Formato guardado');
          window.location.reload();
        } catch (e) { this.errR = e.message; this.guardandoR = false; }
      },

      async guardarCatalogo() {
        this.errC = '';
        if (!this.c.unidades.length) { this.errC = 'Deja activa al menos una unidad de venta.'; return; }
        if (!this.c.categoriasGasto.length || !this.c.tiposIngreso.length) { this.errC = 'Deja activa al menos una categoría de gasto y un tipo de ingreso.'; return; }
        this.guardandoC = true;
        try {
          const r = await api('/configuracion/catalogo', { method: 'PUT', body: this.c });
          this.c = JSON.parse(JSON.stringify(r.catalogo));
          aviso('Catálogo guardado');
        } catch (e) { this.errC = e.message; } finally { this.guardandoC = false; }
      },
    };
  });
});
