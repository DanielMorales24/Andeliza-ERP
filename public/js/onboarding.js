// Asistente de configuración inicial: lo que pasa en el navegador mientras se llena cada paso.
// Todo se vuelve a validar en el servidor al continuar; esto solo guía a la persona.
document.addEventListener('alpine:init', function () {
  // Paso 2: datos del negocio. El botón Continuar se habilita cuando los cuatro son válidos.
  Alpine.data('onbDatos', function () {
    return {
      rtn: '', direccion: '', telefono: '', correo: '',
      init() {
        ['rtn', 'direccion', 'telefono', 'correo'].forEach((c) => { const el = this.$root.querySelector('[name="' + c + '"]'); if (el) this[c] = el.value; });
      },
      get rtnOk() { return /^[\d\s-]+$/.test(this.rtn) && this.rtn.replace(/\D/g, '').length === 14; },
      get direccionOk() { return this.direccion.trim().length >= 5; },
      get telefonoOk() { return /^[0-9+()\s-]+$/.test(this.telefono.trim()) && this.telefono.replace(/\D/g, '').length >= 8; },
      get correoOk() { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.correo.trim()); },
      get valido() { return this.rtnOk && this.direccionOk && this.telefonoOk && this.correoOk; },
    };
  });

  // Paso 3: logo. Vista previa y comprobación del tipo, el peso y el tamaño antes de subirlo.
  Alpine.data('onbLogo', function () {
    return {
      vista: '', medidas: '', aviso: '', archivoValido: false, tieneGuardado: false, minimo: 200,
      init() {
        this.minimo = Number(this.$root.dataset.minimo) || 200;
        this.vista = this.$root.dataset.actual || '';
        this.tieneGuardado = Boolean(this.vista);
      },
      get listo() { return this.archivoValido || (this.tieneGuardado && !this.aviso); },
      rechazar(entrada, mensaje) {
        entrada.value = ''; this.archivoValido = false; this.medidas = ''; this.aviso = mensaje;
        this.vista = this.tieneGuardado ? (this.$root.dataset.actual || '') : '';
      },
      elegir(evento) {
        const entrada = evento.target; const archivo = entrada.files && entrada.files[0];
        this.aviso = ''; this.medidas = '';
        if (!archivo) { this.archivoValido = false; return; }
        if (!/^image\/(png|jpeg)$/.test(archivo.type)) return this.rechazar(entrada, 'El logo debe ser una imagen PNG o JPG.');
        if (archivo.size > 3 * 1024 * 1024) return this.rechazar(entrada, 'El logo no puede pesar más de 3 MB.');
        const lector = new FileReader();
        lector.onload = () => {
          const imagen = new Image();
          imagen.onload = () => {
            if (imagen.naturalWidth < this.minimo || imagen.naturalHeight < this.minimo) {
              return this.rechazar(entrada, 'Esta imagen mide ' + imagen.naturalWidth + ' × ' + imagen.naturalHeight + ' píxeles. Necesita al menos ' + this.minimo + ' × ' + this.minimo + '.');
            }
            this.vista = lector.result; this.archivoValido = true;
            this.medidas = '✓ ' + imagen.naturalWidth + ' × ' + imagen.naturalHeight + ' píxeles';
          };
          imagen.onerror = () => this.rechazar(entrada, 'No se pudo leer la imagen. Intenta con otra.');
          imagen.src = lector.result;
        };
        lector.readAsDataURL(archivo);
      },
    };
  });

  // Paso 4: paleta. Al elegir una, el encabezado, el avance y los botones de esta misma pantalla
  // cambian al instante (se mueven las variables CSS); se guarda al continuar.
  Alpine.data('onbPaleta', function () {
    return {
      paletas: [], elegida: '',
      init() {
        this.paletas = JSON.parse(document.getElementById('datos-paletas').textContent);
        this.elegida = this.$root.dataset.elegida || '';
        this.$watch('elegida', () => this.aplicar());
      },
      get actual() { return this.paletas.find((p) => p.id === this.elegida) || null; },
      aplicar() {
        const p = this.actual; if (!p) return;
        const raiz = document.documentElement.style;
        raiz.setProperty('--primario', p.primario); raiz.setProperty('--acento', p.acento); raiz.setProperty('--acento-fuerte', p.acentoFuerte);
      },
    };
  });

  // Paso 5: unidades, gastos e ingresos. Hace falta al menos uno de cada uno para guardar (o se salta el paso).
  Alpine.data('onbUnidades', function () {
    return {
      marcadas: 0, gastos: 0, ingresos: 0,
      init() { this.contar(); },
      contar() {
        const n = (nombre) => this.$root.querySelectorAll('input[name="' + nombre + '"]:checked').length;
        this.marcadas = n('unidades'); this.gastos = n('categorias_gasto'); this.ingresos = n('tipos_ingreso');
      },
    };
  });
});
