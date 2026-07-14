-- Rediseño del procedimiento de excepción legacy: de "un N3 empuja un
-- token abierto que cualquiera puede agarrar" a "el operador solicita
-- primero -- queda su identidad y motivo desde el día 1 -- y un N3 decide
-- sobre ESA solicitud puntual (aprobar o rechazar; ambos quedan en el
-- historial, no solo las aprobaciones)". El feature se acababa de
-- desplegar sin uso real relevante (0 excepciones declaradas en prod; el
-- único token emitido en prod, para el expediente 4 / C-03, queda
-- invalidado por este cambio y debe volver a solicitarse bajo el modelo
-- nuevo): se reemplaza limpio, sin migrar datos del modelo de token.
BEGIN;

DROP VIEW IF EXISTS public.excepciones_documentales;
DROP FUNCTION IF EXISTS traza.declarar_excepcion_legacy(bigint, text, text, bigint);
DROP FUNCTION IF EXISTS traza.emitir_token_riesgo(bigint, text, text, bigint);
DROP TABLE IF EXISTS traza.excepcion_documental;
DROP TABLE IF EXISTS traza.modo_riesgo_token;

CREATE TABLE traza.solicitud_riesgo (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id  bigint NOT NULL REFERENCES traza.expediente(id),
    tipo_codigo    text NOT NULL CHECK (tipo_codigo IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05')),
    motivo         text NOT NULL CHECK (char_length(motivo) >= 40),
    solicitado_por bigint NOT NULL REFERENCES traza.usuario(id),
    solicitado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER solicitud_riesgo_inmutable
BEFORE UPDATE OR DELETE ON traza.solicitud_riesgo
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE TABLE traza.decision_riesgo (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    solicitud_id   bigint NOT NULL UNIQUE REFERENCES traza.solicitud_riesgo(id),
    autorizada     boolean NOT NULL,
    motivo_rechazo text,
    decidido_por   bigint NOT NULL REFERENCES traza.usuario(id),
    decidido_en    timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (autorizada AND motivo_rechazo IS NULL)
        OR (NOT autorizada AND motivo_rechazo IS NOT NULL)
    )
);
CREATE TRIGGER decision_riesgo_inmutable
BEFORE UPDATE OR DELETE ON traza.decision_riesgo
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE TABLE traza.excepcion_documental (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id  bigint NOT NULL REFERENCES traza.expediente(id),
    tipo_codigo    text NOT NULL CHECK (tipo_codigo IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05')),
    motivo         text NOT NULL CHECK (char_length(motivo) >= 40),
    decision_id    bigint NOT NULL UNIQUE REFERENCES traza.decision_riesgo(id),
    solicitado_por bigint NOT NULL REFERENCES traza.usuario(id),
    solicitado_en  timestamptz NOT NULL DEFAULT now(),
    autorizado_por bigint NOT NULL REFERENCES traza.usuario(id),
    autorizado_en  timestamptz NOT NULL DEFAULT now(),
    CHECK (solicitado_por <> autorizado_por),
    UNIQUE (expediente_id, tipo_codigo)
);
CREATE TRIGGER excepcion_documental_inmutable
BEFORE UPDATE OR DELETE ON traza.excepcion_documental
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

-- Paso 1: el operador solicita. El candado de nivel vive en la decisión,
-- no aquí -- cualquier usuario autenticado puede pedirlo. Una sola
-- solicitud sin decidir a la vez por expediente+tipo.
CREATE OR REPLACE FUNCTION traza.solicitar_excepcion_legacy(
    p_expediente bigint, p_tipo text, p_motivo text, p_usuario bigint
) RETURNS traza.solicitud_riesgo LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_row solicitud_riesgo;
BEGIN
    IF p_tipo NOT IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05') THEN
        RAISE EXCEPTION 'Modo riesgo no aplica a %: solo a documentos de Adquisición/Inspección',
            etiqueta_documento(p_tipo);
    END IF;
    IF char_length(p_motivo) < 40 THEN
        RAISE EXCEPTION 'El motivo de la solicitud debe explicarse con al menos 40 caracteres';
    END IF;

    PERFORM 1 FROM excepcion_documental
     WHERE expediente_id = p_expediente AND tipo_codigo = p_tipo;
    IF FOUND THEN
        RAISE EXCEPTION 'Ya existe una excepción declarada para % en este expediente',
            etiqueta_documento(p_tipo);
    END IF;

    PERFORM 1 FROM solicitud_riesgo s
     WHERE s.expediente_id = p_expediente AND s.tipo_codigo = p_tipo
       AND NOT EXISTS (SELECT 1 FROM decision_riesgo d WHERE d.solicitud_id = s.id);
    IF FOUND THEN
        RAISE EXCEPTION 'Ya hay una solicitud de modo riesgo pendiente de decisión para %',
            etiqueta_documento(p_tipo);
    END IF;

    INSERT INTO solicitud_riesgo (expediente_id, tipo_codigo, motivo, solicitado_por)
        VALUES (p_expediente, p_tipo, p_motivo, p_usuario)
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

-- Paso 2: un N3 distinto del solicitante decide. Si autoriza, la excepción
-- queda declarada en el mismo movimiento; si rechaza, el motivo es
-- obligatorio y también queda en el historial.
CREATE OR REPLACE FUNCTION traza.decidir_solicitud_riesgo(
    p_solicitud bigint, p_autorizar boolean, p_motivo_rechazo text, p_usuario bigint
) RETURNS traza.decision_riesgo LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_nivel text; v_sol solicitud_riesgo; v_row decision_riesgo;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'Modo riesgo solo puede decidirlo un administrador global (N3)';
    END IF;

    SELECT * INTO v_sol FROM solicitud_riesgo WHERE id = p_solicitud;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Solicitud de modo riesgo no encontrada';
    END IF;
    IF v_sol.solicitado_por = p_usuario THEN
        RAISE EXCEPTION 'Quien solicita no puede autorizar su propia solicitud (regla de dos personas)';
    END IF;

    PERFORM 1 FROM decision_riesgo WHERE solicitud_id = p_solicitud;
    IF FOUND THEN
        RAISE EXCEPTION 'Esta solicitud ya fue decidida';
    END IF;

    IF NOT p_autorizar AND (p_motivo_rechazo IS NULL OR char_length(p_motivo_rechazo) < 10) THEN
        RAISE EXCEPTION 'El rechazo requiere un motivo de al menos 10 caracteres';
    END IF;

    INSERT INTO decision_riesgo (solicitud_id, autorizada, motivo_rechazo, decidido_por)
        VALUES (p_solicitud, p_autorizar, CASE WHEN p_autorizar THEN NULL ELSE p_motivo_rechazo END, p_usuario)
        RETURNING * INTO v_row;

    IF p_autorizar THEN
        INSERT INTO excepcion_documental
            (expediente_id, tipo_codigo, motivo, decision_id, solicitado_por, autorizado_por)
            VALUES (v_sol.expediente_id, v_sol.tipo_codigo, v_sol.motivo, v_row.id, v_sol.solicitado_por, p_usuario);
    END IF;

    RETURN v_row;
END $$;

-- Misma forma que antes: la UI y las lecturas de excepciones ya declaradas
-- no cambian, solo cómo se llega a crearlas.
CREATE VIEW public.excepciones_documentales AS
SELECT e.id,
       e.expediente_id::int AS expediente_id,
       e.tipo_codigo,
       e.motivo,
       e.solicitado_en,
       us.nombre  AS solicitado_por_nombre,
       e.autorizado_en,
       ua.nombre  AS autorizado_por_nombre
FROM traza.excepcion_documental e
JOIN traza.usuario us ON us.id = e.solicitado_por
JOIN traza.usuario ua ON ua.id = e.autorizado_por;

-- Cola de solicitudes para el panel N3: pendientes y decididas, con su
-- expediente ya resuelto a número/VIN.
CREATE VIEW public.solicitudes_riesgo AS
SELECT s.id,
       s.expediente_id::int AS expediente_id,
       ve.numero_expediente,
       ve.vin,
       s.tipo_codigo,
       s.motivo,
       s.solicitado_en,
       us.nombre AS solicitado_por_nombre,
       d.id AS decision_id,
       d.autorizada,
       d.motivo_rechazo,
       d.decidido_en,
       ud.nombre AS decidido_por_nombre
FROM traza.solicitud_riesgo s
JOIN traza.usuario us ON us.id = s.solicitado_por
JOIN traza.v_expediente ve ON ve.id = s.expediente_id
LEFT JOIN traza.decision_riesgo d ON d.solicitud_id = s.id
LEFT JOIN traza.usuario ud ON ud.id = d.decidido_por
ORDER BY s.solicitado_en DESC;

DO $$
BEGIN
    GRANT SELECT ON public.excepciones_documentales TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.excepciones_documentales FROM authenticated;
    REVOKE ALL ON public.excepciones_documentales FROM anonymous;

    GRANT SELECT ON public.solicitudes_riesgo TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.solicitudes_riesgo FROM authenticated;
    REVOKE ALL ON public.solicitudes_riesgo FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
