-- Anexos multi-archivo: toda clave admite una COLECCIÓN de archivos, no un
-- slot único con reemplazo. `traza.anexo_expediente` ya guarda cada carga
-- como una versión propia por clave (migración 010); lo único que cambiaba
-- de semántica era la lectura, que solo exponía la última (DISTINCT ON).
-- Esta vista expone TODAS las versiones, para el wizard/galería del detalle.
-- No hay cambio de esquema: cada versión sigue siendo inmutable.
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
