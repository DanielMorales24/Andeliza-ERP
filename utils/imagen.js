// Tipo y tamaño de una imagen PNG o JPEG leyendo solo su cabecera (sin librerías).
// Se usa para exigir un logo de al menos 200 x 200 píxeles.
function dimensiones(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
  // PNG: firma de 8 bytes y, en el bloque IHDR, ancho y alto de 4 bytes cada uno
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { tipo: 'png', ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
  }
  // JPEG: se recorren los segmentos hasta el que describe la imagen (SOF0 a SOF15, salvo DHT, JPG y DAC)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buffer.length) {
      if (buffer[i] !== 0xff) { i += 1; continue; }
      const marca = buffer[i + 1];
      if (marca === 0xff) { i += 1; continue; }
      if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
        return { tipo: 'jpeg', ancho: buffer.readUInt16BE(i + 7), alto: buffer.readUInt16BE(i + 5) };
      }
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue; }   // marcas sin longitud
      i += 2 + buffer.readUInt16BE(i + 2);
    }
  }
  return null;
}

module.exports = { dimensiones };
