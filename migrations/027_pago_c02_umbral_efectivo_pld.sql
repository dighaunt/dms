-- El M-01 Anexo A (sección E.9) fija la línea roja de LFPIORPI art. 32-II:
-- ningún renglón en EFECTIVO es válido cuando el precio pactado del C-02
-- alcanza o supera el umbral de 3,210 UMA (valor UMA 2026 $117.31). El
-- umbral vive en una sola función para no duplicar el número mágico entre
-- el candado de captura y el candado de certificación.
BEGIN;

CREATE OR REPLACE FUNCTION traza.umbral_efectivo_pld()
RETURNS numeric(18,2)
LANGUAGE sql IMMUTABLE SET search_path = traza AS $$
    -- 3,210 UMA x $117.31 (UMA 2026). Revisar cada año contra el valor de
    -- UMA que publica el INEGI y contra la asesoría legal del lote.
    SELECT 376565.10::numeric(18,2)
$$;

-- Candado de captura: valida contra el precio ya asentado en el C-02. Si el
-- precio todavía no se captura, no bloquea aquí (queda el candado de
-- certificación como respaldo final).
CREATE OR REPLACE FUNCTION traza.validar_pago_c02()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_expediente bigint;
    v_tipo text;
    v_precio numeric(18,2);
BEGIN
    SELECT expediente_id, tipo_codigo INTO v_expediente, v_tipo
      FROM documento
     WHERE id = NEW.documento_id
     FOR UPDATE;

    IF NOT FOUND OR v_tipo <> 'C-02' THEN
        RAISE EXCEPTION 'Los renglones de pago solo aplican a un contrato C-02 vigente';
    END IF;
    IF v_expediente <> NEW.expediente_id THEN
        RAISE EXCEPTION 'El comprobante de pago debe pertenecer al expediente del C-02';
    END IF;
    IF EXISTS (
        SELECT 1 FROM documento_cancelacion WHERE documento_id = NEW.documento_id
    ) THEN
        RAISE EXCEPTION 'El C-02 está cancelado; no admite pagos';
    END IF;
    IF EXISTS (
        SELECT 1 FROM certificacion_pago_c02
         WHERE documento_id = NEW.documento_id
    ) THEN
        RAISE EXCEPTION 'El pago ya fue certificado; no admite nuevos renglones';
    END IF;
    IF NEW.medio = 'EFECTIVO' THEN
        SELECT valor_numero INTO v_precio
          FROM documento_campo_valor
         WHERE documento_id = NEW.documento_id AND campo_pdf = 'c02_precio_num';
        IF v_precio IS NOT NULL AND v_precio >= traza.umbral_efectivo_pld() THEN
            RAISE EXCEPTION 'El precio pactado del C-02 alcanza o supera el umbral PLD de efectivo (% pesos); usa un medio de pago trazable: SPEI, transferencia, tarjeta, cheque o financiamiento',
                to_char(traza.umbral_efectivo_pld(), 'FM999,999,999,990.00');
        END IF;
    END IF;
    RETURN NEW;
END $$;

-- Candado de certificación: revalida contra el precio total ya definitivo,
-- por si el precio se capturó o corrigió después de registrar un renglón en
-- efectivo que en su momento pasó el candado de captura.
CREATE OR REPLACE FUNCTION traza.certificar_pago_c02(
    p_documento bigint,
    p_usuario bigint
) RETURNS traza.certificacion_pago_c02
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_expediente bigint;
    v_tipo text;
    v_captura text;
    v_escaneado boolean;
    v_total numeric(18,2);
    v_forma_contrato text;
    v_pagado numeric(18,2);
    v_renglones integer;
    v_medio traza.medio_pago_c02;
    v_token text;
    v_resultado certificacion_pago_c02;
BEGIN
    SELECT d.expediente_id,
           d.tipo_codigo,
           dc.estado::text,
           EXISTS (SELECT 1 FROM archivo_escaneado a WHERE a.documento_id = d.id),
           precio.valor_numero,
           COALESCE(forma.valor_texto, '')
      INTO v_expediente, v_tipo, v_captura, v_escaneado, v_total, v_forma_contrato
      FROM documento d
      LEFT JOIN documento_captura dc ON dc.documento_id = d.id
      LEFT JOIN documento_campo_valor precio
        ON precio.documento_id = d.id AND precio.campo_pdf = 'c02_precio_num'
      LEFT JOIN documento_campo_valor forma
        ON forma.documento_id = d.id AND forma.campo_pdf = 'C02_f_58'
     WHERE d.id = p_documento
     FOR UPDATE OF d;

    IF NOT FOUND OR v_tipo <> 'C-02' THEN
        RAISE EXCEPTION 'La verificación de pago solo aplica al contrato C-02';
    END IF;
    IF EXISTS (SELECT 1 FROM documento_cancelacion WHERE documento_id = p_documento) THEN
        RAISE EXCEPTION 'El C-02 está cancelado; no se puede certificar su pago';
    END IF;
    IF v_captura IS DISTINCT FROM 'COMPLETA' OR v_total IS NULL OR v_total <= 0 THEN
        RAISE EXCEPTION 'Completa el C-02 y captura su precio total antes de conciliar el pago';
    END IF;
    IF NOT v_escaneado THEN
        RAISE EXCEPTION 'Primero carga el C-02 firmado y escaneado; después certifica el pago';
    END IF;
    IF EXISTS (
        SELECT 1 FROM certificacion_pago_c02
         WHERE documento_id = p_documento
    ) THEN
        RAISE EXCEPTION 'El pago de este C-02 ya fue certificado';
    END IF;

    PERFORM 1 FROM pago_c02 WHERE documento_id = p_documento FOR UPDATE;
    SELECT count(*)::int, COALESCE(sum(monto), 0)
      INTO v_renglones, v_pagado
      FROM pago_c02
     WHERE documento_id = p_documento;
    IF v_renglones = 0 THEN
        RAISE EXCEPTION 'Registra al menos un medio de pago con su comprobante antes de certificar';
    END IF;
    IF v_pagado <> v_total THEN
        RAISE EXCEPTION 'Los pagos registrados suman % y el precio total del C-02 es %; concilia el importe antes de certificar',
            to_char(v_pagado, 'FM999,999,999,999,990.00'),
            to_char(v_total, 'FM999,999,999,999,990.00');
    END IF;
    IF v_total >= traza.umbral_efectivo_pld() AND EXISTS (
        SELECT 1 FROM pago_c02 WHERE documento_id = p_documento AND medio = 'EFECTIVO'
    ) THEN
        RAISE EXCEPTION 'El precio total del C-02 (%) alcanza o supera el umbral PLD de efectivo (%); sustituye el renglón en efectivo por un medio trazable antes de certificar',
            to_char(v_total, 'FM999,999,999,999,990.00'),
            to_char(traza.umbral_efectivo_pld(), 'FM999,999,999,999,990.00');
    END IF;

    FOR v_medio IN
        SELECT DISTINCT medio FROM pago_c02 WHERE documento_id = p_documento
    LOOP
        v_token := CASE v_medio
            WHEN 'EFECTIVO' THEN 'EFECTIVO'
            WHEN 'SPEI' THEN 'SPEI'
            WHEN 'TRANSFERENCIA' THEN 'TRANSFER'
            WHEN 'TARJETA' THEN 'TARJETA'
            WHEN 'CHEQUE' THEN 'CHEQUE'
            WHEN 'FINANCIAMIENTO' THEN 'FINANCI'
            WHEN 'OTRO' THEN 'OTRO'
        END;
        IF upper(v_forma_contrato) NOT LIKE '%' || v_token || '%' THEN
            RAISE EXCEPTION 'El medio % no coincide con la FORMA DE PAGO asentada en el C-02; corrige el contrato antes de certificar',
                replace(v_medio::text, '_', ' ');
        END IF;
    END LOOP;

    PERFORM set_config('traza.certificacion_pago_c02', 'si', true);
    INSERT INTO certificacion_pago_c02 (documento_id, certificado_por)
    VALUES (p_documento, p_usuario)
    RETURNING * INTO v_resultado;
    RETURN v_resultado;
END $$;

COMMIT;
