-- Anulación excepcional de documentos opcionales. No reutiliza la excepción
-- legacy: esa figura solo cubre faltantes históricos de Adquisición e
-- Inspección y puede abrir candados reales del ciclo de vida. F-09/F-10 no
-- son candados; aquí se deja constancia de que no aplican a una operación
-- concreta, decidida directamente por un N3 y sin borrar trazabilidad.
BEGIN;

CREATE TABLE traza.anulacion_documental_excepcional (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id  bigint NOT NULL REFERENCES traza.expediente(id),
    tipo_codigo    text NOT NULL CHECK (tipo_codigo IN ('F-09', 'F-10')),
    motivo         text NOT NULL CHECK (char_length(motivo) >= 20),
    anulado_por    bigint NOT NULL REFERENCES traza.usuario(id),
    anulado_en     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (expediente_id, tipo_codigo)
);

CREATE TRIGGER anulacion_documental_excepcional_inmutable
BEFORE UPDATE OR DELETE ON traza.anulacion_documental_excepcional
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE OR REPLACE FUNCTION traza.anular_documento_opcional_excepcional(
    p_expediente bigint, p_tipo text, p_motivo text, p_usuario bigint
) RETURNS traza.anulacion_documental_excepcional
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_nivel text;
    v_row anulacion_documental_excepcional;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'La anulación excepcional solo puede realizarla un administrador N3';
    END IF;

    IF p_tipo NOT IN ('F-09', 'F-10') THEN
        RAISE EXCEPTION 'La anulación excepcional solo aplica a F-09 y F-10';
    END IF;
    IF char_length(trim(p_motivo)) < 20 THEN
        RAISE EXCEPTION 'La anulación excepcional requiere un motivo de al menos 20 caracteres';
    END IF;

    PERFORM 1
      FROM documento d
     WHERE d.expediente_id = p_expediente
       AND d.tipo_codigo = p_tipo
       AND NOT EXISTS (
           SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id
       );
    IF FOUND THEN
        RAISE EXCEPTION 'No se puede anular % como opcional: tiene un folio vigente que debe cancelarse por su propio procedimiento',
            etiqueta_documento(p_tipo);
    END IF;

    INSERT INTO anulacion_documental_excepcional
        (expediente_id, tipo_codigo, motivo, anulado_por)
    VALUES (p_expediente, p_tipo, trim(p_motivo), p_usuario)
    RETURNING * INTO v_row;
    RETURN v_row;
END $$;

CREATE VIEW public.anulaciones_documentales_excepcionales AS
SELECT a.id,
       a.expediente_id::int AS expediente_id,
       a.tipo_codigo,
       a.motivo,
       a.anulado_en,
       u.nombre AS anulado_por_nombre
  FROM traza.anulacion_documental_excepcional a
  JOIN traza.usuario u ON u.id = a.anulado_por;

DO $$
BEGIN
    GRANT SELECT ON public.anulaciones_documentales_excepcionales TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.anulaciones_documentales_excepcionales FROM authenticated;
    REVOKE ALL ON public.anulaciones_documentales_excepcionales FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
