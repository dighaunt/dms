-- Historial del ciclo de vida para el timeline del expediente.
BEGIN;

CREATE VIEW public.historial_unidad AS
SELECT h.vin,
       e.id::int      AS expediente_id,
       h.estado,
       h.ocurrido_en,
       us.nombre      AS registrado_por_nombre
FROM traza.unidad_estado_hist h
JOIN traza.expediente e ON e.vin = h.vin
JOIN traza.usuario us   ON us.id = h.registrado_por;

CREATE VIEW public.historial_f06 AS
SELECT h.expediente_id::int AS expediente_id,
       h.estado,
       h.ocurrido_en,
       us.nombre            AS registrado_por_nombre
FROM traza.expediente_estado_hist h
JOIN traza.usuario us ON us.id = h.registrado_por;

DO $$
BEGIN
    GRANT SELECT ON public.historial_unidad, public.historial_f06 TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE
        ON public.historial_unidad, public.historial_f06 FROM authenticated;
    REVOKE ALL ON public.historial_unidad, public.historial_f06 FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
