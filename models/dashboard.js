const db = require('../db');

// Inicio del día y del mes en la zona horaria del negocio ($1), no en UTC
const INICIO_DIA = "date_trunc('day', NOW() AT TIME ZONE $1) AT TIME ZONE $1";
const INICIO_MES = "date_trunc('month', NOW() AT TIME ZONE $1) AT TIME ZONE $1";

async function ventas(zona) {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(total) FILTER (WHERE creado_en >= ${INICIO_DIA}), 0) AS ventas_dia,
       COUNT(*)            FILTER (WHERE creado_en >= ${INICIO_DIA})     AS cantidad_dia,
       COALESCE(SUM(total), 0)                                           AS ventas_mes,
       COUNT(*)                                                          AS cantidad_mes
     FROM ventas
     WHERE creado_en >= ${INICIO_MES}`,
    [zona]
  );
  return rows[0];
}

// Productos simples con stock <= mínimo, más variantes con stock <= mínimo
async function stockBajo() {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM productos p
         WHERE p.activo AND NOT p.es_compuesto
           AND NOT EXISTS (SELECT 1 FROM variantes_producto v WHERE v.producto_id = p.id AND v.activo)
           AND p.stock <= p.stock_minimo)
       +
       (SELECT COUNT(*) FROM variantes_producto v
          JOIN productos p ON p.id = v.producto_id
         WHERE v.activo AND p.activo AND v.stock <= v.stock_minimo)
       AS total`
  );
  return rows[0].total;
}

async function facturasPendientes() {
  const { rows } = await db.query("SELECT COUNT(*) AS total FROM ventas WHERE estado = 'P'");
  return rows[0].total;
}

// Modo de facturación: SAR (hay CAI activo) o interno (sin CAI, números INT-000001)
async function facturacion() {
  try {
    const { rows } = await db.query(
      `SELECT cai, fecha_limite, rango_fin - numero_actual AS restantes,
              (fecha_limite - CURRENT_DATE) AS dias
         FROM configuracion_fiscal WHERE activo`
    );
    if (rows[0]) {
      return { modo: 'sar', restantes: rows[0].restantes, fechaLimite: rows[0].fecha_limite, dias: rows[0].dias };
    }
    const interno = await db.query(
      `SELECT prefijo_factura_interna || '-' || LPAD((numero_factura_interna + 1)::TEXT, 6, '0') AS siguiente
         FROM configuracion_negocio WHERE id = 1`
    );
    return { modo: 'interno', siguiente: interno.rows[0] ? interno.rows[0].siguiente : null };
  } catch (err) {
    // Si falta correr migracion_fase2.sql, el resto del dashboard debe seguir funcionando
    console.error('[dashboard] no se pudo leer el modo de facturación:', err.message);
    return null;
  }
}

async function resumen(zona) {
  const [v, bajo, pendientes, fact] = await Promise.all([ventas(zona), stockBajo(), facturasPendientes(), facturacion()]);
  return {
    facturacion: fact,
    ventasDia: v.ventas_dia,
    cantidadDia: v.cantidad_dia,
    ventasMes: v.ventas_mes,
    cantidadMes: v.cantidad_mes,
    ticketPromedio: v.cantidad_mes > 0 ? v.ventas_mes / v.cantidad_mes : 0,
    stockBajo: bajo,
    facturasPendientes: pendientes,
  };
}

module.exports = { resumen };
