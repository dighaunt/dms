-- Vistas de solo lectura en `public` para el Neon Data API (PostgREST expone
-- `public` por defecto). Las escrituras NO pasan por aquí: siguen en las
-- funciones transaccionales de traza, donde viven los candados del manual.
BEGIN;

CREATE VIEW public.expedientes AS
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
       ee.estado              AS estado_f06
FROM traza.v_expediente ve
JOIN traza.unidad u   ON u.vin = ve.vin
JOIN traza.modelo mo  ON mo.id = u.modelo_id
JOIN traza.marca ma   ON ma.id = mo.marca_id
LEFT JOIN traza.v_unidad_estado_actual eu     ON eu.vin = ve.vin
LEFT JOIN traza.v_expediente_estado_actual ee ON ee.expediente_id = ve.id;

CREATE VIEW public.documentos AS
SELECT vd.id::int             AS id,
       vd.expediente_id::int  AS expediente_id,
       vd.folio,
       vd.tipo_codigo,
       td.nombre              AS nombre_tipo,
       vd.revision,
       vd.cancelado,
       vd.escaneado,
       (SELECT max(a.version) FROM traza.archivo_escaneado a
         WHERE a.documento_id = vd.id)::int AS version_maxima,
       EXISTS (SELECT 1 FROM traza.verificacion_pago vp
                WHERE vp.documento_id = vd.id) AS pago_verificado,
       (SELECT vs.folio FROM traza.documento_sustitucion ds
          JOIN traza.v_documento vs ON vs.id = ds.sustituto_id
         WHERE ds.cancelado_id = vd.id) AS sustituido_por_folio,
       us.nombre              AS emitido_por_nombre,
       vd.emitido_en
FROM traza.v_documento vd
JOIN traza.tipo_documento td ON td.codigo = vd.tipo_codigo
JOIN traza.usuario us        ON us.id = vd.emitido_por;

CREATE VIEW public.transiciones AS
SELECT eu.vin, t.hacia, e.orden
FROM traza.v_unidad_estado_actual eu
JOIN traza.transicion_unidad t ON t.desde = eu.estado
JOIN traza.estado_unidad e     ON e.codigo = t.hacia;

-- Rol `authenticated` (JWT de Neon Auth). En entornos sin Data API (p. ej.
-- Postgres local) el rol no existe: se omiten los grants sin fallar.
DO $$
BEGIN
    GRANT USAGE ON SCHEMA public TO authenticated;
    GRANT SELECT ON public.expedientes, public.documentos, public.transiciones
        TO authenticated;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'rol authenticated no existe en este entorno; grants omitidos';
END $$;

COMMIT;
