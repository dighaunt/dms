

BEGIN;

CREATE VIEW public.anexos_todos AS
SELECT a.expediente_id::int AS expediente_id,
       a.clave,
       a.version,
       a.content_type,
       a.tamano_bytes,
       a.subido_en,
       us.nombre AS subido_por_nombre
FROM traza.anexo_expediente a
JOIN traza.usuario us ON us.id = a.subido_por
ORDER BY a.expediente_id, a.clave, a.version DESC;

DO $$
BEGIN
    GRANT SELECT ON public.anexos_todos TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.anexos_todos FROM authenticated;
    REVOKE ALL ON public.anexos_todos FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
