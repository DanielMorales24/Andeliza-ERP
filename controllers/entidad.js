// Fábrica de controladores CRUD para las pantallas de listado + modal
// (categorías, clientes y proveedores). Los errores van a next(): el manejador
// final los devuelve como JSON con su mensaje.
const V = require('../utils/validar');

function crearControlador({ modelo, descriptor, normalizar }) {
  async function verificarNombre(datos, id) {
    if (modelo.existeNombre && (await modelo.existeNombre(datos.nombre, id))) {
      throw new V.ErrorValidacion(descriptor.mensajeDuplicado);
    }
  }

  const traducir = (err) => (
    err && err.code === '23505' && descriptor.mensajeDuplicado
      ? new V.ErrorValidacion(descriptor.mensajeDuplicado)
      : err
  );

  const noEncontrado = (res) => res.status(404).json({ error: `No se encontró ${descriptor.articulo} ${descriptor.singular}.` });

  return {
    async index(req, res, next) {
      try {
        const filas = await modelo.listar();
        res.render('entidades/index', { titulo: descriptor.plural, descriptor, filas });
      } catch (err) {
        next(err);
      }
    },

    async crear(req, res, next) {
      try {
        const datos = normalizar(req.body);
        await verificarNombre(datos, null);
        const id = await modelo.crear(datos);
        res.status(201).json({ ok: true, fila: await modelo.obtener(id) });
      } catch (err) {
        next(traducir(err));
      }
    },

    async actualizar(req, res, next) {
      try {
        const id = Number(req.params.id);
        const datos = normalizar(req.body);
        await verificarNombre(datos, id);
        if (!(await modelo.actualizar(id, datos))) return noEncontrado(res);
        res.json({ ok: true, fila: await modelo.obtener(id) });
      } catch (err) {
        next(traducir(err));
      }
    },

    async cambiarActivo(req, res, next) {
      try {
        const id = Number(req.params.id);
        if (!(await modelo.cambiarActivo(id, V.booleano(req.body.activo)))) return noEncontrado(res);
        res.json({ ok: true, fila: await modelo.obtener(id) });
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = { crearControlador };
