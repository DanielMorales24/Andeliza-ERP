// Números de factura: fiscal = "CAI-00000123", interno = "INT-000123"
function partirNumero(numeroFactura) {
  const i = numeroFactura.lastIndexOf('-');
  return { prefijo: i === -1 ? '' : numeroFactura.slice(0, i), correlativo: i === -1 ? numeroFactura : numeroFactura.slice(i + 1) };
}

// Lo que se muestra en pantalla: en fiscales solo el correlativo (00000123), el CAI va aparte
function numeroCorto(numeroFactura, tipo) {
  return tipo === 'fiscal' ? partirNumero(numeroFactura).correlativo : numeroFactura;
}

module.exports = { partirNumero, numeroCorto };
