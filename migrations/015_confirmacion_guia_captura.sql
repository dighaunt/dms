-- Confirmación previa de la guía M-01. No es un checkbox efímero: cada
-- capturista deja su propia constancia antes de editar un formato.
BEGIN;

CREATE TABLE traza.documento_guia_confirmacion (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id   bigint NOT NULL REFERENCES traza.documento(id),
    guia_revision  text NOT NULL CHECK (guia_revision = 'M-01 Rev. 3.0'),
    confirmado_por bigint NOT NULL REFERENCES traza.usuario(id),
    confirmado_en  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (documento_id, guia_revision, confirmado_por)
);

CREATE INDEX documento_guia_confirmacion_busqueda_idx
    ON traza.documento_guia_confirmacion (documento_id, confirmado_por, confirmado_en DESC);

CREATE TRIGGER documento_guia_confirmacion_inmutable
BEFORE UPDATE OR DELETE ON traza.documento_guia_confirmacion
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

COMMIT;
