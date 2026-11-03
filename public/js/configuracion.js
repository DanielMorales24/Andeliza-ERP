// Configuración: negocio y facturación, usuarios, roles con su matriz de permisos y auditoría.
// La interfaz solo ofrece lo que el servidor permite, pero quien decide es siempre el servidor.
document.addEventListener('alpine:init', function () {
  const leer = function () { return JSON.parse(document.getElementById('datos-pagina').textContent); };
  const aviso = function (m, t) { if (window.toast) window.toast(m, t); };

  // =============== NEGOCIO ===============
  Alpine.data('configNegocio', function () {
    return {
      d: { negocio: {}, fiscal: null, modo: null, tasaPorDefecto: 15, hoy: '' },
      n: { nombre: '', rtn: '', direccion: '', telefono: '', correo: '', logoPropio: false },
      logoVista: '',
      logoArchivo: null,
      quitarLogo: false,
      guardandoN: false,
      errN: '',
      sar: false,
      f: { cai: '', rango_inicio: '', rango_fin: '', fecha_limite: '', tasa: '15', pie_legal: '' },
      guardandoF: false,
      errF: '',

      init() {
        this.d = leer();
        const b = this.d.negocio;
        this.n = { nombre: b.nombre || '', rtn: b.rtn || '', direccion: b.direccion || '', telefono: b.telefono || '', correo: b.correo || '', logoPropio: Boolean(b.logoPropio) };
        this.logoVista = b.logoUrl || '';
        const fi = this.d.fiscal;
        this.sar = Boolean(fi && fi.activo);
        this.f = {
          cai: fi ? fi.cai : '', rango_inicio: fi ? String(fi.rangoInicio) : '', rango_fin: fi ? String(fi.rangoFin) : '',
          fecha_limite: fi ? fi.fechaLimite : '', tasa: String(fi ? fi.tasaPct : this.d.tasaPorDefecto), pie_legal: fi ? fi.pieLegal : '',
        };
      },

      get modoTexto() {
        const m = this.d.modo;
        if (!m) return '';
        if (m.modo === 'sar') return 'Modo actual: facturación con CAI del SAR. Quedan ' + m.restantes + ' números y vence el ' + (window.fechaTexto ? window.fechaTexto(m.fechaLimite) : m.fechaLimite) + '.';
        return 'Modo actual: comprobantes internos' + (m.siguiente ? ' (el siguiente es ' + m.siguiente + ')' : '') + '.';
      },

      elegirLogo(ev) {
        const a = ev.target.files && ev.target.files[0];
        this.errN = '';
        if (!a) return;
        if (['image/png', 'image/jpeg'].indexOf(a.type) === -1) { this.errN = 'El logo debe ser PNG o JPG.'; ev.target.value = ''; return; }
        if (a.size > 3 * 1024 * 1024) { this.errN = 'El logo no puede pesar más de 3 MB.'; ev.target.value = ''; return; }
        this.logoArchivo = a;
        this.quitarLogo = false;
        this.logoVista = URL.createObjectURL(a);
      },
      quitarLogoActual() {
        this.logoArchivo = null;
        this.quitarLogo = true;
        this.logoVista = '';
      },

      async guardarNegocio() {
        this.errN = '';
        this.guardandoN = true;
        try {
          const fd = new FormData();
          ['nombre', 'rtn', 'direccion', 'telefono', 'correo'].forEach((k) => fd.append(k, this.n[k] || ''));
          if (this.logoArchivo) fd.append('logo', this.logoArchivo);
          if (this.quitarLogo) fd.append('quitar_logo', 'true');
          const r = await api('/configuracion/negocio', { method: 'PUT', formData: fd });
          this.n.logoPropio = Boolean(r.negocio.logoPropio);
          this.logoArchivo = null;
          this.quitarLogo = false;
          this.logoVista = r.negocio.logoUrl || '';
          aviso('Datos del negocio guardados');
        } catch (e) {
          this.errN = e.message;
        } finally {
          this.guardandoN = false;
        }
      },

      async guardarFacturacion() {
        this.errF = '';
        this.guardandoF = true;
        try {
          const r = await api('/configuracion/facturacion', { method: 'PUT', body: Object.assign({ sar: this.sar }, this.sar ? this.f : {}) });
          this.d.modo = r.modo;
          this.d.fiscal = r.fiscal;
          aviso(this.sar ? 'Facturación con CAI del SAR activada' : 'Facturación interna activada');
        } catch (e) {
          this.errF = e.message;
        } finally {
          this.guardandoF = false;
        }
      },
    };
  });

  // =============== USUARIOS ===============
  Alpine.data('configUsuarios', function () {
    return {
      d: { usuarios: [], roles: [], yo: 0 },
      lista: [],
      busqueda: '',
      m: false,
      f: {},
      ver: false,
      err: '',
      guardando: false,
      codigo: null,
      copiado: false,
      desactivar: null,

      init() {
        this.d = leer();
        this.lista = this.d.usuarios;
      },

      get rolesElegibles() {
        const actual = this.f && this.f.rol_id;
        return this.d.roles.filter((r) => r.activo || String(r.id) === String(actual));
      },
      get filtrados() {
        const q = normalizarTexto(this.busqueda);
        if (!q) return this.lista;
        return this.lista.filter((u) => normalizarTexto([u.nombre, u.usuario, u.rol].join(' ')).indexOf(q) !== -1);
      },

      nuevo() {
        const porDefecto = this.d.roles.find((r) => r.nombre === 'vendedor' && r.activo) || this.d.roles.find((r) => r.activo);
        this.f = { id: null, nombre: '', usuario: '', contrasena: '', rol_id: porDefecto ? porDefecto.id : '', debe_cambiar: true };
        this.err = ''; this.ver = false; this.m = true;
        this.$nextTick(() => { const el = document.getElementById('u-nombre'); if (el) el.focus(); });
      },
      editar(u) {
        this.f = { id: u.id, nombre: u.nombre, usuario: u.usuario, rol_id: u.rol_id };
        this.err = ''; this.m = true;
      },
      cerrarTodo() {
        if (this.guardando) return;
        this.m = false; this.codigo = null; this.desactivar = null; this.err = '';
      },

      reemplazar(u) {
        const i = this.lista.findIndex((x) => x.id === u.id);
        if (i === -1) this.lista.push(u); else this.lista.splice(i, 1, u);
        this.lista.sort((a, b) => (Number(b.activo) - Number(a.activo)) || String(a.nombre).localeCompare(String(b.nombre), 'es', { sensitivity: 'base' }));
      },

      async guardar() {
        this.err = '';
        this.guardando = true;
        try {
          const cuerpo = { nombre: this.f.nombre, rol_id: Number(this.f.rol_id) };
          let r;
          if (this.f.id) {
            r = await api('/configuracion/usuarios/' + this.f.id, { method: 'PUT', body: cuerpo });
          } else {
            Object.assign(cuerpo, { usuario: this.f.usuario, contrasena: this.f.contrasena, debe_cambiar: Boolean(this.f.debe_cambiar) });
            r = await api('/configuracion/usuarios', { method: 'POST', body: cuerpo });
          }
          this.reemplazar(r.usuario);
          this.guardando = false;
          this.m = false;
          aviso(this.f.id ? 'Usuario actualizado' : 'Usuario creado');
        } catch (e) {
          this.err = e.message;
        } finally {
          this.guardando = false;
        }
      },

      async generarCodigo(u) {
        try {
          const r = await api('/configuracion/usuarios/' + u.id + '/codigo', { method: 'POST', body: {} });
          this.copiado = false;
          this.codigo = r;
        } catch (e) {
          aviso(e.message, 'error');
        }
      },
      async copiarCodigo() {
        try { await navigator.clipboard.writeText(this.codigo.codigo); this.copiado = true; } catch (e) { aviso('Copia el código a mano.', 'error'); }
      },

      pedirEstado(u) {
        if (u.activo) { this.err = ''; this.desactivar = u; } else { this.aplicarEstado(u, true); }
      },
      async confirmarDesactivar() {
        this.guardando = true;
        try {
          await this.aplicarEstado(this.desactivar, false);
          this.guardando = false;
          this.desactivar = null;
        } catch (e) {
          this.err = e.message;
        } finally {
          this.guardando = false;
        }
      },
      async aplicarEstado(u, activo) {
        const r = await api('/configuracion/usuarios/' + u.id + '/activo', { method: 'PATCH', body: { activo: activo } });
        this.reemplazar(r.usuario);
        aviso(activo ? 'Usuario activado' : 'Usuario desactivado: su sesión se cerró');
      },
    };
  });

  // =============== ROLES Y PERMISOS ===============
  Alpine.data('configRoles', function () {
    return {
      roles: [],
      catalogo: [],
      acciones: [],
      sel: null,
      marcados: {},
      original: {},
      guardando: false,
      err: '',
      mr: false,
      fr: {},
      errRol: '',
      guardandoRol: false,
      borrar: false,

      init() {
        const d = leer();
        this.roles = d.roles; this.catalogo = d.catalogo; this.acciones = d.acciones;
        if (this.roles.length) this.seleccionar(this.roles[0].id);
      },

      get esAdmin() { return Boolean(this.sel && this.sel.es_sistema && this.sel.nombre === 'admin'); },
      get sucio() { return JSON.stringify(Object.keys(this.marcados).sort()) !== JSON.stringify(Object.keys(this.original).sort()); },

      permisoId(fila, accion) { return fila.permisos[accion] ? fila.permisos[accion].id : null; },
      tiene(fila, accion) {
        if (this.esAdmin) return true;
        const id = this.permisoId(fila, accion);
        return id !== null && Boolean(this.marcados[id]);
      },
      // Configuración es solo del administrador; el admin entero está fijo
      bloqueado(fila, accion) { return this.esAdmin || fila.modulo === 'configuracion'; },

      alternar(fila, accion) {
        if (this.bloqueado(fila, accion)) return;
        const id = this.permisoId(fila, accion);
        if (id === null) return;
        const nuevo = Object.assign({}, this.marcados);
        if (nuevo[id]) {
          delete nuevo[id];
          // Quitar "ver" quita también crear, editar y eliminar de ese módulo
          if (accion === 'ver') ['crear', 'editar', 'eliminar'].forEach((a) => { const o = this.permisoId(fila, a); if (o !== null) delete nuevo[o]; });
        } else {
          nuevo[id] = true;
          // Crear, editar o eliminar piden también "ver"
          if (['crear', 'editar', 'eliminar'].indexOf(accion) !== -1) { const v = this.permisoId(fila, 'ver'); if (v !== null) nuevo[v] = true; }
        }
        this.marcados = nuevo;
      },

      async seleccionar(id) {
        if (this.sel && this.sel.id !== id && this.sucio && !window.confirm('Tienes cambios sin guardar en este rol. ¿Descartarlos?')) return;
        this.err = '';
        try {
          const r = await api('/configuracion/roles/' + id + '/permisos');
          this.sel = this.roles.find((x) => x.id === id) || r.rol;
          const mapa = {};
          r.ids.forEach((p) => { mapa[p] = true; });
          this.marcados = mapa;
          this.original = Object.assign({}, mapa);
        } catch (e) {
          this.err = e.message;
        }
      },
      descartar() { this.marcados = Object.assign({}, this.original); },

      async guardarPermisos() {
        this.err = '';
        this.guardando = true;
        try {
          const r = await api('/configuracion/roles/' + this.sel.id + '/permisos', { method: 'PUT', body: { permisos: Object.keys(this.marcados).map(Number) } });
          this.roles = r.roles;
          this.sel = this.roles.find((x) => x.id === this.sel.id);
          const mapa = {};
          r.ids.forEach((p) => { mapa[p] = true; });
          this.marcados = mapa;
          this.original = Object.assign({}, mapa);
          aviso('Permisos guardados. Se aplican de inmediato.');
        } catch (e) {
          this.err = e.message;
        } finally {
          this.guardando = false;
        }
      },

      // ----- crear / editar / eliminar el rol en sí -----
      nuevoRol() { this.fr = { id: null, nombre: '', descripcion: '', copiar_de: '', es_sistema: false, activo: true }; this.errRol = ''; this.mr = true; },
      editarRol() {
        this.fr = { id: this.sel.id, nombre: this.sel.nombre, descripcion: this.sel.descripcion || '', es_sistema: this.sel.es_sistema, activo: this.sel.activo };
        this.errRol = ''; this.mr = true;
      },
      pedirBorrar() { this.errRol = ''; this.borrar = true; },
      cerrarModales() { if (this.guardandoRol) return; this.mr = false; this.borrar = false; this.errRol = ''; },

      async guardarRol() {
        this.errRol = '';
        this.guardandoRol = true;
        try {
          let r;
          if (this.fr.id) {
            r = await api('/configuracion/roles/' + this.fr.id, { method: 'PUT', body: { nombre: this.fr.nombre, descripcion: this.fr.descripcion, activo: Boolean(this.fr.activo) } });
          } else {
            r = await api('/configuracion/roles', { method: 'POST', body: { nombre: this.fr.nombre, descripcion: this.fr.descripcion, copiar_de: this.fr.copiar_de || null } });
          }
          this.roles = r.roles;
          this.guardandoRol = false;
          this.mr = false;
          aviso(this.fr.id ? 'Rol actualizado' : 'Rol creado');
          await this.seleccionar(this.fr.id || r.id);
        } catch (e) {
          this.errRol = e.message;
        } finally {
          this.guardandoRol = false;
        }
      },
      async confirmarBorrar() {
        this.errRol = '';
        this.guardandoRol = true;
        try {
          const r = await api('/configuracion/roles/' + this.sel.id, { method: 'DELETE' });
          this.roles = r.roles;
          this.guardandoRol = false;
          this.borrar = false;
          this.sel = null; this.marcados = {}; this.original = {};
          aviso('Rol eliminado');
          if (this.roles.length) await this.seleccionar(this.roles[0].id);
        } catch (e) {
          this.errRol = e.message;
        } finally {
          this.guardandoRol = false;
        }
      },
    };
  });

  // =============== AUDITORÍA ===============
  Alpine.data('configAuditoria', function () {
    return {
      filas: [],
      busqueda: '',
      cargando: false,
      init() { this.filas = leer().filas; },
      get filtradas() {
        const q = normalizarTexto(this.busqueda);
        if (!q) return this.filas;
        return this.filas.filter((a) => normalizarTexto([a.descripcion, a.usuario_nombre, a.accion, a.ip].join(' ')).indexOf(q) !== -1);
      },
      async actualizar() {
        this.cargando = true;
        try { this.filas = (await api('/configuracion/auditoria/datos')).filas; } catch (e) { aviso(e.message, 'error'); } finally { this.cargando = false; }
      },
    };
  });
});
