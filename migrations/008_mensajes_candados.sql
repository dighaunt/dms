-- Los candados hablan el lenguaje del negocio: nombre del documento y
-- estatus legible en lugar de claves internas («Regla de oro: C-02 requiere
-- F-06 en LISTO_PARA_VENTA»). La API pasa estos mensajes tal cual (409) y la
-- UI los muestra al usuario, así que aquí se redactan completos.
BEGIN;

-- «Nombre del documento» (código), leído del catálogo tipo_documento.
CREATE OR REPLACE FUNCTION traza.etiqueta_documento(p_codigo text)
RETURNS text LANGUAGE sql STABLE SET search_path = traza AS $$
    SELECT '«' || nombre || '» (' || codigo || ')'
      FROM tipo_documento WHERE codigo = p_codigo;
$$;

-- Estatus de unidad en su forma legible (mismas etiquetas que la UI).
CREATE OR REPLACE FUNCTION traza.etiqueta_estado(p_estado text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE p_estado
        WHEN 'EN_RECEPCION'          THEN 'En recepción'
        WHEN 'EN_INSPECCION'         THEN 'En inspección'
        WHEN 'EXPEDIENTE_INCOMPLETO' THEN 'Expediente incompleto'
        WHEN 'LISTO_PARA_VENTA'      THEN 'Listo para venta'
        WHEN 'APARTADA'              THEN 'Apartada'
        WHEN 'VENDIDA_PEND_ENTREGA'  THEN 'Vendida, pendiente de entrega'
        WHEN 'ENTREGADA'             THEN 'Entregada'
        WHEN 'DEVUELTA_CONSIGNANTE'  THEN 'Devuelta al consignante'
        WHEN 'BAJA'                  THEN 'Baja'
        ELSE p_estado
    END;
$$;

CREATE OR REPLACE FUNCTION traza.emitir_folio(p_tipo text, p_expediente bigint, p_usuario bigint)
RETURNS traza.documento LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_anio smallint := EXTRACT(YEAR FROM now())::smallint;
    v_rev text; v_num integer; v_row documento;
    v_origen text; v_fuente text;
BEGIN
    -- Candado de contrato fuente: a una PROPIA no se le emite C-04 ni viceversa.
    SELECT e.origen, o.contrato_fuente INTO v_origen, v_fuente
      FROM expediente e JOIN origen_unidad o ON o.codigo = e.origen
     WHERE e.id = p_expediente;
    IF p_tipo IN ('C-03','C-04') AND p_tipo <> v_fuente THEN
        RAISE EXCEPTION 'No es posible emitir %: el contrato de origen de una unidad % es %',
            etiqueta_documento(p_tipo), lower(v_origen), etiqueta_documento(v_fuente);
    END IF;
    -- Candado de venta: C-01/C-02 solo con la carátula en «Listo para venta».
    IF p_tipo IN ('C-01','C-02') THEN
        PERFORM 1 FROM (
            SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = p_expediente
            ORDER BY ocurrido_en DESC LIMIT 1) s
        WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % el expediente debe estar marcado como «Listo para venta» en su carátula (F-06)',
                etiqueta_documento(p_tipo);
        END IF;
    END IF;
    -- Candado F-11: requiere C-02 escaneado + pago verificado.
    IF p_tipo = 'F-11' THEN
        PERFORM 1 FROM documento d
          JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN verificacion_pago vp ON vp.documento_id = d.id
         WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % se requiere % con escaneo cargado y pago verificado',
                etiqueta_documento('F-11'), etiqueta_documento('C-02');
        END IF;
    END IF;

    SELECT r.revision INTO v_rev FROM revision_documento r
     WHERE r.tipo_codigo = p_tipo ORDER BY r.fecha_publicacion DESC LIMIT 1;
    IF v_rev IS NULL THEN
        RAISE EXCEPTION 'El tipo documental % no tiene revisión publicada en el catálogo', p_tipo;
    END IF;

    INSERT INTO contador_folio (tipo_codigo, anio) VALUES (p_tipo, v_anio)
        ON CONFLICT (tipo_codigo, anio) DO NOTHING;
    UPDATE contador_folio SET ultimo = ultimo + 1
        WHERE tipo_codigo = p_tipo AND anio = v_anio RETURNING ultimo INTO v_num;

    INSERT INTO documento (tipo_codigo, revision, anio, consecutivo, expediente_id, emitido_por)
        VALUES (p_tipo, v_rev, v_anio, v_num, p_expediente, p_usuario)
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

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
        -- Sale de inspección al escanearse F-05 firmado.
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-05';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para salir de inspección se requiere % firmado y escaneado',
                etiqueta_documento('F-05');
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

COMMIT;
