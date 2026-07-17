-- Pago C-02: el candado de venta no puede depender de una referencia libre ni
-- de cualquier anexo del expediente. Cada medio queda trazado contra un
-- comprobante concreto y la certificacion final concilia contra el precio del
-- contrato firmado.
BEGIN;

CREATE TYPE traza.medio_pago_c02 AS ENUM (
    'EFECTIVO',
    'SPEI',
    'TRANSFERENCIA',
    'TARJETA',
    'CHEQUE',
    'FINANCIAMIENTO',
    'OTRO'
);

CREATE TABLE traza.pago_c02 (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id        bigint NOT NULL REFERENCES traza.documento(id),
    expediente_id       bigint NOT NULL REFERENCES traza.expediente(id),
    medio               traza.medio_pago_c02 NOT NULL,
    monto               numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha_pago          date NOT NULL,
    referencia          text,
    detalle             text,
    comprobante_clave   text NOT NULL DEFAULT 'comprobante_pago'
                        CHECK (comprobante_clave = 'comprobante_pago'),
    comprobante_version smallint NOT NULL CHECK (comprobante_version >= 1),
    registrado_por      bigint NOT NULL REFERENCES traza.usuario(id),
    registrado_en       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (documento_id, medio, referencia),
    FOREIGN KEY (expediente_id, comprobante_clave, comprobante_version)
        REFERENCES traza.anexo_expediente(expediente_id, clave, version),
    CHECK (
        (medio = 'OTRO' AND char_length(trim(COALESCE(detalle, ''))) >= 10)
        OR
        (medio <> 'OTRO' AND char_length(trim(COALESCE(referencia, ''))) BETWEEN 3 AND 120)
    ),
    CHECK (char_length(trim(COALESCE(referencia, ''))) <= 120),
    CHECK (char_length(trim(COALESCE(detalle, ''))) <= 240)
);
CREATE INDEX pago_c02_documento_idx
    ON traza.pago_c02 (documento_id, registrado_en, id);

-- Se separa de la verificación legacy para conservarla intacta. Una fila
-- anterior sólo contiene referencia libre: no puede bloquear ni liberar la
-- conciliación multimedio.
CREATE TABLE traza.certificacion_pago_c02 (
    documento_id    bigint PRIMARY KEY REFERENCES traza.documento(id),
    certificado_por bigint NOT NULL REFERENCES traza.usuario(id),
    certificado_en  timestamptz NOT NULL DEFAULT now()
);

-- Cada renglón debe pertenecer al mismo expediente que su C-02 y no puede
-- agregarse después de que la conciliacion ya cerró el pago.
CREATE OR REPLACE FUNCTION traza.validar_pago_c02()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_expediente bigint;
    v_tipo text;
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
    RETURN NEW;
END $$;

CREATE TRIGGER pago_c02_validado
BEFORE INSERT ON traza.pago_c02
FOR EACH ROW EXECUTE FUNCTION traza.validar_pago_c02();

CREATE TRIGGER pago_c02_inmutable
BEFORE UPDATE OR DELETE ON traza.pago_c02
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

-- Evita que una ruta, script o Data API inserte un certificado por fuera de
-- la funcion de conciliacion. El flag es local a la transaccion y no sobrevive
-- al request.
CREATE OR REPLACE FUNCTION traza.proteger_certificacion_pago_c02()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF current_setting('traza.certificacion_pago_c02', true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION 'La verificación de pago C-02 solo se genera tras conciliar sus renglones y comprobantes';
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER certificacion_pago_c02_protegida
BEFORE INSERT ON traza.certificacion_pago_c02
FOR EACH ROW EXECUTE FUNCTION traza.proteger_certificacion_pago_c02();

CREATE TRIGGER certificacion_pago_c02_inmutable
BEFORE UPDATE OR DELETE ON traza.certificacion_pago_c02
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

-- El modelo anterior sólo aceptaba una referencia libre. Se conserva para
-- consulta histórica, pero ninguna ruta puede seguir creando verificaciones
-- que aparenten cumplir el candado sin importar ni evidencia exacta.
CREATE OR REPLACE FUNCTION traza.bloquear_verificacion_pago_legacy()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    RAISE EXCEPTION 'La verificación anterior ya no admite registros: concilia los medios de pago del C-02 con sus comprobantes';
END $$;

CREATE TRIGGER verificacion_pago_legacy_bloqueada
BEFORE INSERT ON traza.verificacion_pago
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_verificacion_pago_legacy();

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

-- F-11, cambio a VENDIDA y cierre consultan una certificacion multimedio, no
-- la fila legacy que solo contenía una referencia libre.
CREATE OR REPLACE FUNCTION traza.emitir_folio(p_tipo text, p_expediente bigint, p_usuario bigint)
RETURNS traza.documento LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_anio smallint := EXTRACT(YEAR FROM now())::smallint;
    v_rev text; v_num integer; v_row documento;
    v_origen text; v_fuente text;
BEGIN
    SELECT e.origen, o.contrato_fuente INTO v_origen, v_fuente
      FROM expediente e JOIN origen_unidad o ON o.codigo = e.origen
     WHERE e.id = p_expediente;
    IF p_tipo IN ('C-03','C-04') AND p_tipo <> v_fuente THEN
        RAISE EXCEPTION 'No es posible emitir %: el contrato de origen de una unidad % es %',
            etiqueta_documento(p_tipo), lower(v_origen), etiqueta_documento(v_fuente);
    END IF;
    IF p_tipo IN ('C-01','C-02') THEN
        PERFORM 1 FROM (
            SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = p_expediente
            ORDER BY ocurrido_en DESC LIMIT 1
        ) s WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % el expediente debe estar marcado como «Listo para venta» en su carátula (F-06)',
                etiqueta_documento(p_tipo);
        END IF;
    END IF;
    IF p_tipo = 'F-11' THEN
        PERFORM 1 FROM documento d
          JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN certificacion_pago_c02 cp ON cp.documento_id = d.id
         WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % se requiere % firmado, escaneado y con pago conciliado',
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
DECLARE v_desde text; v_exp bigint; v_nivel text;
BEGIN
 SELECT estado INTO v_desde FROM unidad_estado_hist WHERE vin=p_vin ORDER BY ocurrido_en DESC LIMIT 1;
 IF v_desde IS NULL THEN RAISE EXCEPTION 'La unidad no tiene ningún estatus registrado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM transicion_unidad WHERE desde=v_desde AND hacia=p_hacia) THEN RAISE EXCEPTION 'El manual no permite pasar de «%» a «%»', etiqueta_estado(v_desde), etiqueta_estado(p_hacia); END IF;
 SELECT id INTO v_exp FROM expediente WHERE vin=p_vin;
 IF p_hacia='EN_INSPECCION' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-05') AND NOT EXISTS (SELECT 1 FROM documento WHERE expediente_id=v_exp AND tipo_codigo='F-05') THEN RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido, o una anulación excepcional N3', etiqueta_documento('F-05'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-06') AND NOT EXISTS (SELECT 1 FROM documento WHERE expediente_id=v_exp AND tipo_codigo='F-06') THEN RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido, o una anulación excepcional N3', etiqueta_documento('F-06'); END IF;
 ELSIF p_hacia='EXPEDIENTE_INCOMPLETO' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-05') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-05') AND NOT EXISTS (SELECT 1 FROM excepcion_documental WHERE expediente_id=v_exp AND tipo_codigo='F-05') THEN RAISE EXCEPTION 'Para salir de inspección se requiere % firmado y escaneado, o una anulación autorizada', etiqueta_documento('F-05'); END IF;
 ELSIF p_hacia='LISTO_PARA_VENTA' AND v_desde='EXPEDIENTE_INCOMPLETO' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-06') AND NOT EXISTS (SELECT 1 FROM expediente_estado_hist WHERE expediente_id=v_exp AND estado='LISTO_PARA_VENTA' ORDER BY ocurrido_en DESC LIMIT 1) THEN RAISE EXCEPTION 'La carátula del expediente % debe marcarse «Listo para venta» primero, o tener una anulación excepcional N3', etiqueta_documento('F-06'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-07') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-07') THEN RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado, o una anulación excepcional N3', etiqueta_documento('F-07'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-08') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-08') THEN RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado, o una anulación excepcional N3', etiqueta_documento('F-08'); END IF;
 ELSIF p_hacia='APARTADA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'C-01') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='C-01' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para apartar la unidad se requiere % escaneado y vigente, o una anulación excepcional N3', etiqueta_documento('C-01'); END IF;
 ELSIF p_hacia='VENDIDA_PEND_ENTREGA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'C-02') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id JOIN certificacion_pago_c02 cp ON cp.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='C-02' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para marcar la unidad como vendida se requiere % escaneado y con pago conciliado, o una anulación excepcional N3', etiqueta_documento('C-02'); END IF;
 ELSIF p_hacia='ENTREGADA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-11') THEN RAISE EXCEPTION 'Para marcar la unidad como entregada se requiere % firmado y escaneado, o una anulación excepcional N3', etiqueta_documento('F-11'); END IF;
 ELSIF p_hacia='DEVUELTA_CONSIGNANTE' THEN
   IF NOT EXISTS (SELECT 1 FROM expediente WHERE id=v_exp AND origen='CONSIGNADA') THEN RAISE EXCEPTION 'Solo una unidad consignada puede devolverse al consignante'; END IF;
 ELSIF p_hacia='BAJA' THEN
   SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel NOT IN ('N2','N3') THEN RAISE EXCEPTION 'Dar de baja una unidad requiere autorización de encargado (N2) o administración (N3)'; END IF;
 END IF;
 INSERT INTO unidad_estado_hist(vin,estado,registrado_por) VALUES(p_vin,p_hacia,p_usuario);
END $$;

CREATE OR REPLACE FUNCTION traza.cerrar_expediente(p_expediente bigint, p_usuario bigint)
RETURNS traza.expediente_cierre LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE v_nivel text; v_origen text; v_estado text; v_row expediente_cierre;
BEGIN
 SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel IS DISTINCT FROM 'N3' THEN RAISE EXCEPTION 'Cerrar un expediente requiere autorización N3'; END IF;
 SELECT origen INTO v_origen FROM expediente WHERE id=p_expediente; IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado'; END IF;
 IF EXISTS (SELECT 1 FROM expediente_cierre WHERE expediente_id=p_expediente) THEN RAISE EXCEPTION 'El expediente ya fue cerrado'; END IF;
 SELECT h.estado INTO v_estado FROM unidad_estado_hist h JOIN expediente e ON e.vin=h.vin WHERE e.id=p_expediente ORDER BY h.ocurrido_en DESC LIMIT 1;
 IF v_estado IS DISTINCT FROM 'ENTREGADA' THEN RAISE EXCEPTION 'Para cerrar el expediente la unidad debe estar marcada como «Entregada»'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'C-02') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id JOIN certificacion_pago_c02 p ON p.documento_id=d.id WHERE d.expediente_id=p_expediente AND d.tipo_codigo='C-02' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere C-02 escaneado y pago conciliado, o una anulación excepcional N3'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=p_expediente AND d.tipo_codigo='F-11' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere F-11 firmado y escaneado, o una anulación excepcional N3'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='ine_partes') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Identificación de las partes»'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='comprobante_pago') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Comprobantes de pago»'; END IF;
 IF v_origen='PROPIA' AND NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='factura_original') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Factura original (última)»'; END IF;
 INSERT INTO expediente_cierre(expediente_id,cerrado_por) VALUES(p_expediente,p_usuario) RETURNING * INTO v_row; RETURN v_row;
END $$;

CREATE OR REPLACE VIEW public.documentos AS
SELECT vd.id::int AS id, vd.expediente_id::int AS expediente_id, vd.folio,
       vd.tipo_codigo, td.nombre AS nombre_tipo, vd.revision, vd.cancelado,
       vd.escaneado,
       (SELECT max(a.version) FROM traza.archivo_escaneado a WHERE a.documento_id = vd.id)::int AS version_maxima,
       EXISTS (
           SELECT 1 FROM traza.certificacion_pago_c02 cp
            WHERE cp.documento_id = vd.id
       ) AS pago_verificado,
       (SELECT vs.folio FROM traza.documento_sustitucion ds JOIN traza.v_documento vs ON vs.id = ds.sustituto_id WHERE ds.cancelado_id = vd.id) AS sustituido_por_folio,
       us.nombre AS emitido_por_nombre, vd.emitido_en,
       EXISTS (SELECT 1 FROM traza.documento_captura dc WHERE dc.documento_id = vd.id AND dc.estado = 'COMPLETA') AS pdf_completado
FROM traza.v_documento vd
JOIN traza.tipo_documento td ON td.codigo = vd.tipo_codigo
JOIN traza.usuario us ON us.id = vd.emitido_por;

GRANT SELECT ON public.documentos TO authenticated;
COMMIT;
