-- Excepción documental «legacy»: unidades adquiridas antes de que el sistema
-- existiera nunca tuvieron el paquete físico día 0 (contrato fuente, KYC,
-- inspección firmada). Sin esto un expediente así queda atorado para siempre
-- en EN_INSPECCION, porque cambiar_estado_unidad exige F-05 escaneado.
--
-- No es un interruptor: es un procedimiento con fricción real.
--   1) Un N3 emite un TOKEN de un solo uso, atado a un expediente + tipo de
--      documento puntual, con motivo obligatorio. Expira en 2 horas.
--   2) Otro usuario (nunca el mismo N3: regla de dos personas, CHECK en BD)
--      consume ese token para declarar la EXCEPCIÓN: «este documento no
--      existe por ser legacy». Append-only, una sola vez por expediente+tipo.
--   3) Solo entonces el candado real de cambiar_estado_unidad la acepta como
--      equivalente al escaneo que nunca pudo existir.
-- El tipo de documento está restringido por CHECK a la etapa de
-- Adquisición/Inspección (C-03, C-04, F-01..F-05): la tabla físicamente no
-- acepta F-06 en adelante, C-01, C-02 ni F-11 — nunca puede usarse para
-- saltarse un candado de venta, pago o entrega.
BEGIN;

CREATE TABLE traza.modo_riesgo_token (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id bigint NOT NULL REFERENCES traza.expediente(id),
    tipo_codigo   text NOT NULL CHECK (tipo_codigo IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05')),
    motivo        text NOT NULL CHECK (char_length(motivo) >= 40),
    emitido_por   bigint NOT NULL REFERENCES traza.usuario(id),
    emitido_en    timestamptz NOT NULL DEFAULT now(),
    expira_en     timestamptz NOT NULL,
    consumido_por bigint REFERENCES traza.usuario(id),
    consumido_en  timestamptz,
    CHECK (
        (consumido_por IS NULL AND consumido_en IS NULL)
        OR (consumido_por IS NOT NULL AND consumido_en IS NOT NULL)
    )
);
CREATE INDEX modo_riesgo_token_vigente_idx
    ON traza.modo_riesgo_token (expediente_id, tipo_codigo)
    WHERE consumido_en IS NULL;

-- No es un simple append-only: admite EXACTAMENTE una transición legítima
-- (consumir el token, una sola vez) y bloquea cualquier otra mutación,
-- incluida "desconsumir" o editar motivo/emisor/vigencia después de creado.
CREATE OR REPLACE FUNCTION traza.proteger_token_riesgo()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Tabla modo_riesgo_token es append-only';
    END IF;
    IF OLD.consumido_en IS NOT NULL THEN
        RAISE EXCEPTION 'El token de modo riesgo ya fue consumido: no admite más cambios';
    END IF;
    IF NEW.consumido_en IS NULL
        OR NEW.expediente_id IS DISTINCT FROM OLD.expediente_id
        OR NEW.tipo_codigo IS DISTINCT FROM OLD.tipo_codigo
        OR NEW.motivo IS DISTINCT FROM OLD.motivo
        OR NEW.emitido_por IS DISTINCT FROM OLD.emitido_por
        OR NEW.emitido_en IS DISTINCT FROM OLD.emitido_en
        OR NEW.expira_en IS DISTINCT FROM OLD.expira_en
    THEN
        RAISE EXCEPTION 'Solo se permite marcar el token de modo riesgo como consumido, ningún otro cambio';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER modo_riesgo_token_protegido
BEFORE UPDATE OR DELETE ON traza.modo_riesgo_token
FOR EACH ROW EXECUTE FUNCTION traza.proteger_token_riesgo();

CREATE TABLE traza.excepcion_documental (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id  bigint NOT NULL REFERENCES traza.expediente(id),
    tipo_codigo    text NOT NULL CHECK (tipo_codigo IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05')),
    motivo         text NOT NULL CHECK (char_length(motivo) >= 40),
    token_id       bigint NOT NULL UNIQUE REFERENCES traza.modo_riesgo_token(id),
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

-- Paso 1: un N3 autoriza. No puede autorizar dos veces el mismo par
-- expediente+tipo mientras haya un token vigente sin consumir.
CREATE OR REPLACE FUNCTION traza.emitir_token_riesgo(
    p_expediente bigint, p_tipo text, p_motivo text, p_usuario bigint
) RETURNS traza.modo_riesgo_token LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_nivel text; v_row modo_riesgo_token;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'Modo riesgo solo puede autorizarlo un administrador global (N3)';
    END IF;

    IF p_tipo NOT IN ('C-03','C-04','F-01','F-02','F-03','F-04','F-05') THEN
        RAISE EXCEPTION 'Modo riesgo no aplica a %: solo a documentos de Adquisición/Inspección',
            etiqueta_documento(p_tipo);
    END IF;

    IF char_length(p_motivo) < 40 THEN
        RAISE EXCEPTION 'El motivo de modo riesgo debe explicarse con al menos 40 caracteres';
    END IF;

    PERFORM 1 FROM modo_riesgo_token
     WHERE expediente_id = p_expediente AND tipo_codigo = p_tipo
       AND consumido_en IS NULL AND expira_en > now();
    IF FOUND THEN
        RAISE EXCEPTION 'Ya hay un token de modo riesgo vigente sin usar para % en este expediente',
            etiqueta_documento(p_tipo);
    END IF;

    INSERT INTO modo_riesgo_token (expediente_id, tipo_codigo, motivo, emitido_por, expira_en)
        VALUES (p_expediente, p_tipo, p_motivo, p_usuario, now() + interval '2 hours')
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

-- Paso 2: cualquier usuario declara la excepción, pero solo si existe un
-- token vigente que NO haya emitido él mismo (regla de dos personas).
CREATE OR REPLACE FUNCTION traza.declarar_excepcion_legacy(
    p_expediente bigint, p_tipo text, p_motivo text, p_usuario bigint
) RETURNS traza.excepcion_documental LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_token modo_riesgo_token; v_row excepcion_documental;
BEGIN
    IF char_length(p_motivo) < 40 THEN
        RAISE EXCEPTION 'El motivo de la excepción debe explicarse con al menos 40 caracteres';
    END IF;

    PERFORM 1 FROM excepcion_documental
     WHERE expediente_id = p_expediente AND tipo_codigo = p_tipo;
    IF FOUND THEN
        RAISE EXCEPTION 'Ya existe una excepción declarada para % en este expediente',
            etiqueta_documento(p_tipo);
    END IF;

    SELECT * INTO v_token FROM modo_riesgo_token
     WHERE expediente_id = p_expediente AND tipo_codigo = p_tipo
       AND consumido_en IS NULL AND expira_en > now()
       AND emitido_por <> p_usuario
     ORDER BY emitido_en DESC LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Se requiere autorización vigente de modo riesgo (N3, distinto de quien declara) para %',
            etiqueta_documento(p_tipo);
    END IF;

    UPDATE modo_riesgo_token SET consumido_por = p_usuario, consumido_en = now()
        WHERE id = v_token.id;

    INSERT INTO excepcion_documental
        (expediente_id, tipo_codigo, motivo, token_id, solicitado_por, autorizado_por)
        VALUES (p_expediente, p_tipo, p_motivo, v_token.id, p_usuario, v_token.emitido_por)
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

-- Engancha el único candado real que hoy bloquea a un expediente legacy:
-- F-05 escaneado para salir de inspección. Se acepta la excepción declarada
-- como equivalente al escaneo que nunca pudo existir.
CREATE OR REPLACE FUNCTION traza.cambiar_estado_unidad(p_vin text, p_hacia text, p_usuario bigint)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_desde text; v_exp bigint; v_nivel text;
BEGIN
    SELECT estado INTO v_desde FROM unidad_estado_hist
     WHERE vin = p_vin ORDER BY ocurrido_en DESC LIMIT 1;
    IF v_desde IS NULL THEN
        RAISE EXCEPTION 'La unidad no tiene ningún estatus registrado';
    END IF;
    PERFORM 1 FROM transicion_unidad WHERE desde = v_desde AND hacia = p_hacia;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El manual no permite pasar de «%» a «%»',
            etiqueta_estado(v_desde), etiqueta_estado(p_hacia);
    END IF;

    SELECT id INTO v_exp FROM expediente WHERE vin = p_vin;

    IF p_hacia = 'EN_INSPECCION' THEN
        -- Requiere F-05 y F-06 emitidos (día 0).
        PERFORM 1 FROM documento WHERE expediente_id = v_exp AND tipo_codigo = 'F-05';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido',
                etiqueta_documento('F-05');
        END IF;
        PERFORM 1 FROM documento WHERE expediente_id = v_exp AND tipo_codigo = 'F-06';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido',
                etiqueta_documento('F-06');
        END IF;
    ELSIF p_hacia = 'EXPEDIENTE_INCOMPLETO' THEN
        -- Sale de inspección al escanearse F-05 firmado, o con excepción legacy declarada.
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-05';
        IF NOT FOUND THEN
            PERFORM 1 FROM excepcion_documental
             WHERE expediente_id = v_exp AND tipo_codigo = 'F-05';
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Para salir de inspección se requiere % firmado y escaneado (o una excepción legacy declarada en modo riesgo)',
                    etiqueta_documento('F-05');
            END IF;
        END IF;
    ELSIF p_hacia = 'LISTO_PARA_VENTA' AND v_desde = 'EXPEDIENTE_INCOMPLETO' THEN
        -- F-06 en LISTO + F-07 y F-08 escaneados (limpios).
        PERFORM 1 FROM (SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = v_exp ORDER BY ocurrido_en DESC LIMIT 1) s
         WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La carátula del expediente % debe marcarse «Listo para venta» primero',
                etiqueta_documento('F-06');
        END IF;
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-07';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado',
                etiqueta_documento('F-07');
        END IF;
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-08';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado',
                etiqueta_documento('F-08');
        END IF;
    ELSIF p_hacia = 'APARTADA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'C-01'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para apartar la unidad se requiere % escaneado y vigente',
                etiqueta_documento('C-01');
        END IF;
    ELSIF p_hacia = 'VENDIDA_PEND_ENTREGA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN verificacion_pago vp ON vp.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para marcar la unidad como vendida se requiere % escaneado y con pago verificado',
                etiqueta_documento('C-02');
        END IF;
    ELSIF p_hacia = 'ENTREGADA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-11';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para marcar la unidad como entregada se requiere % firmado y escaneado',
                etiqueta_documento('F-11');
        END IF;
    ELSIF p_hacia = 'DEVUELTA_CONSIGNANTE' THEN
        PERFORM 1 FROM expediente WHERE id = v_exp AND origen = 'CONSIGNADA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Solo una unidad consignada puede devolverse al consignante';
        END IF;
    ELSIF p_hacia = 'BAJA' THEN
        SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
        IF v_nivel NOT IN ('N2','N3') THEN
            RAISE EXCEPTION 'Dar de baja una unidad requiere autorización de encargado (N2) o administración (N3)';
        END IF;
    END IF;

    INSERT INTO unidad_estado_hist (vin, estado, registrado_por) VALUES (p_vin, p_hacia, p_usuario);
END $$;

-- Lectura: quién declaró qué, quién autorizó y por qué — vista pública
-- de solo lectura para el detalle del expediente y el Data API.
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

DO $$
BEGIN
    GRANT SELECT ON public.excepciones_documentales TO authenticated;
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.excepciones_documentales FROM authenticated;
    REVOKE ALL ON public.excepciones_documentales FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; grants omitidos';
END $$;

COMMIT;
