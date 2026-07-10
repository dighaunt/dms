-- Por norma, el sistema muestra el NOMBRE COMPLETO de quien inició cada acto.
-- Se agrega quien abrió el expediente a la vista del Data API (columna nueva
-- al final: CREATE OR REPLACE VIEW lo permite sin recrear).
BEGIN;

CREATE OR REPLACE VIEW public.expedientes AS
SELECT ve.id::int            AS id,
       ve.anio,
       ve.consecutivo,
       ve.numero_expediente,
       ve.vin,
       ma.nombre              AS marca,
       mo.nombre              AS modelo,
       u.anio_modelo,
       u.color,
       ve.origen,
       ve.abierto_en,
       eu.estado              AS estado_unidad,
       eu.ocurrido_en         AS estado_unidad_desde,
       ee.estado              AS estado_f06,
       us.nombre              AS abierto_por_nombre
FROM traza.v_expediente ve
JOIN traza.unidad u   ON u.vin = ve.vin
JOIN traza.modelo mo  ON mo.id = u.modelo_id
JOIN traza.marca ma   ON ma.id = mo.marca_id
JOIN traza.usuario us ON us.id = ve.abierto_por
LEFT JOIN traza.v_unidad_estado_actual eu     ON eu.vin = ve.vin
LEFT JOIN traza.v_expediente_estado_actual ee ON ee.expediente_id = ve.id;

COMMIT;
