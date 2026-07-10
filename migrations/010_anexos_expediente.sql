-- Anexos del expediente: escaneos de documentos externos (factura, INE,
-- tarjeta de circulación…) que el checklist maestro F-06 exige o sugiere.
-- El catálogo de claves y su exigencia por origen vive en src/lib/anexos.ts;
-- aquí solo el hecho inmutable de cada carga (re-subir = nueva versión).
BEGIN;

CREATE TABLE traza.anexo_expediente (
    expediente_id bigint NOT NULL REFERENCES traza.expediente(id),
    clave         text NOT NULL CHECK (clave ~ '^[a-z0-9_]+$'),
    version       smallint NOT NULL CHECK (version >= 1),
    sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    ruta_objeto   text NOT NULL UNIQUE,
    content_type  text NOT NULL,
    tamano_bytes  bigint NOT NULL CHECK (tamano_bytes > 0),
    subido_por    bigint NOT NULL REFERENCES traza.usuario(id),
    subido_en     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (expediente_id, clave, version)
);

CREATE TRIGGER t7 BEFORE UPDATE OR DELETE ON traza.anexo_expediente
    FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

-- Última versión por clave, para el checklist del detalle.
CREATE VIEW public.anexos AS
SELECT DISTINCT ON (a.expediente_id, a.clave)
       a.expediente_id::int AS expediente_id,
       a.clave,
       a.version            AS version_maxima,
       a.content_type,
       a.subido_en,
       us.nombre            AS subido_por_nombre
FROM traza.anexo_expediente a
JOIN traza.usuario us ON us.id = a.subido_por
ORDER BY a.expediente_id, a.clave, a.version DESC;

DO $$
BEGIN
    GRANT SELECT ON public.anexos TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.anexos FROM authenticated;
    REVOKE ALL ON public.anexos FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
