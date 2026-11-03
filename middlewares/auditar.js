// Anota en la auditoría una acción que salió bien (respuesta menor a 400).
// Espera a que la anotación termine ANTES de responder: en Vercel la función se congela
// al responder y una anotación pendiente se perdería.
//
// Uso: router.post('/ingresos', ..., auditar('crear_ingreso', 'ingresos', (req, cuerpo) => 'Registró un ingreso'), handler)
const Auditoria = require('../models/auditoria');

function auditar(accion, entidad, describir) {
  return (req, res, next) => {
    const enviar = res.json.bind(res);
    res.json = (cuerpo) => {
      if (res.statusCode >= 400 || !req.user) return enviar(cuerpo);
      let descripcion = accion;
      try { descripcion = typeof describir === 'function' ? describir(req, cuerpo) : (describir || accion); } catch (_) { /* usa la acción */ }
      const entidadId = cuerpo && Number.isInteger(Number(cuerpo.id || cuerpo.ingreso_id || cuerpo.gasto_id || cuerpo.compra_id || cuerpo.partida_id)) ? Number(cuerpo.id || cuerpo.ingreso_id || cuerpo.gasto_id || cuerpo.compra_id || cuerpo.partida_id) : (Number(req.params.id) || null);
      Auditoria.registrar({ usuarioId: req.user.id, accion, entidad, entidadId, descripcion, ip: req.ip })
        .catch((err) => console.error('[auditoria] no se pudo registrar:', err.message))
        .finally(() => enviar(cuerpo));
      return res;
    };
    next();
  };
}

module.exports = { auditar };
