-- Cierre operativo: cuando el ciclo terminó, el expediente conserva una
-- constancia inmutable. Solo N3 puede cerrarlo o editarlo después del cierre.
BEGIN;

-- La versión anterior representaba un "escaneo" como un único archivo. Un
-- documento firmado puede contener varias páginas/fotos; se conserva la tabla
-- original como histórico y se crea una colección de adjuntos con identidad
-- propia. La vista de compatibilidad mantiene los candados documentales.
ALTER TABLE traza.archivo_escaneado RENAME TO archivo_escaneado_legacy;

CREATE TABLE traza.documento_adjunto (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id   bigint NOT NULL REFERENCES traza.documento(id),
    nombre_archivo text NOT NULL CHECK (char_length(nombre_archivo) BETWEEN 1 AND 255),
    content_type   text NOT NULL CHECK (content_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
    sha256         text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    ruta_objeto    text NOT NULL UNIQUE,
    tamano_bytes   bigint NOT NULL CHECK (tamano_bytes > 0),
    subido_por     bigint NOT NULL REFERENCES traza.usuario(id),
    subido_en      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (documento_id, sha256)
);
CREATE INDEX documento_adjunto_documento_idx ON traza.documento_adjunto (documento_id, subido_en, id);

INSERT INTO traza.documento_adjunto
    (documento_id, nombre_archivo, content_type, sha256, ruta_objeto, tamano_bytes, subido_por, subido_en)
SELECT documento_id,
       split_part(ruta_objeto, '/', array_length(string_to_array(ruta_objeto, '/'), 1)),
       CASE
         WHEN ruta_objeto ~* '\.png$' THEN 'image/png'
         WHEN ruta_objeto ~* '\.(jpg|jpeg)$' THEN 'image/jpeg'
         WHEN ruta_objeto ~* '\.webp$' THEN 'image/webp'
         ELSE 'application/pdf'
       END,
       sha256, ruta_objeto, tamano_bytes, subido_por, subido_en
FROM traza.archivo_escaneado_legacy;

CREATE VIEW traza.archivo_escaneado AS
SELECT documento_id,
       row_number() OVER (PARTITION BY documento_id ORDER BY subido_en, id)::smallint AS version,
       sha256, ruta_objeto, tamano_bytes, subido_por, subido_en
FROM traza.documento_adjunto;

CREATE TABLE traza.expediente_cierre (
    expediente_id bigint PRIMARY KEY REFERENCES traza.expediente(id),
    cerrado_por   bigint NOT NULL REFERENCES traza.usuario(id),
    cerrado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER expediente_cierre_inmutable
BEFORE UPDATE OR DELETE ON traza.expediente_cierre
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE OR REPLACE FUNCTION traza.cerrar_expediente(
    p_expediente bigint, p_usuario bigint
) RETURNS traza.expediente_cierre LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_nivel text; v_origen text; v_estado text; v_row expediente_cierre;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'Cerrar un expediente requiere autorización N3';
    END IF;
    SELECT origen INTO v_origen FROM expediente WHERE id = p_expediente;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado'; END IF;
    PERFORM 1 FROM expediente_cierre WHERE expediente_id = p_expediente;
    IF FOUND THEN RAISE EXCEPTION 'El expediente ya fue cerrado'; END IF;
    SELECT h.estado INTO v_estado FROM unidad_estado_hist h
     JOIN expediente e ON e.vin = h.vin
     WHERE e.id = p_expediente ORDER BY h.ocurrido_en DESC LIMIT 1;
    IF v_estado IS DISTINCT FROM 'ENTREGADA' THEN
        RAISE EXCEPTION 'Para cerrar el expediente la unidad debe estar marcada como «Entregada»';
    END IF;
    PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
      JOIN verificacion_pago p ON p.documento_id = d.id
     WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'C-02'
       AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere C-02 escaneado y pago verificado'; END IF;
    PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
     WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'F-11'
       AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
    IF NOT FOUND THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere F-11 firmado y escaneado'; END IF;
    PERFORM 1 FROM anexo_expediente WHERE expediente_id = p_expediente AND clave = 'ine_partes';
    IF NOT FOUND THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Identificación de las partes»'; END IF;
    PERFORM 1 FROM anexo_expediente WHERE expediente_id = p_expediente AND clave = 'comprobante_pago';
    IF NOT FOUND THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Comprobantes de pago»'; END IF;
    IF v_origen = 'PROPIA' THEN
        PERFORM 1 FROM anexo_expediente WHERE expediente_id = p_expediente AND clave = 'factura_original';
        IF NOT FOUND THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Factura original (última)»'; END IF;
    END IF;
    INSERT INTO expediente_cierre (expediente_id, cerrado_por) VALUES (p_expediente, p_usuario)
      RETURNING * INTO v_row;
    RETURN v_row;
END $$;

CREATE OR REPLACE VIEW public.expedientes AS
SELECT ve.id::int AS id, ve.anio, ve.consecutivo, ve.numero_expediente, ve.vin,
       ma.nombre AS marca, mo.nombre AS modelo, u.anio_modelo, u.color, ve.origen,
       ve.abierto_en, eu.estado AS estado_unidad, eu.ocurrido_en AS estado_unidad_desde,
       ee.estado AS estado_f06, us.nombre AS abierto_por_nombre,
       (SELECT count(*) FROM traza.documento d
         WHERE d.expediente_id = ve.id
           AND NOT EXISTS (SELECT 1 FROM traza.documento_cancelacion c WHERE c.documento_id = d.id))::int AS documentos_total,
       (SELECT count(*) FROM traza.documento d
         WHERE d.expediente_id = ve.id
           AND NOT EXISTS (SELECT 1 FROM traza.documento_cancelacion c WHERE c.documento_id = d.id)
           AND EXISTS (SELECT 1 FROM traza.archivo_escaneado a WHERE a.documento_id = d.id))::int AS documentos_escaneados,
       (ec.expediente_id IS NOT NULL) AS cerrado, ec.cerrado_en
FROM traza.v_expediente ve
JOIN traza.unidad u ON u.vin = ve.vin
JOIN traza.modelo mo ON mo.id = u.modelo_id
JOIN traza.marca ma ON ma.id = mo.marca_id
JOIN traza.usuario us ON us.id = ve.abierto_por
LEFT JOIN traza.v_unidad_estado_actual eu ON eu.vin = ve.vin
LEFT JOIN traza.v_expediente_estado_actual ee ON ee.expediente_id = ve.id
LEFT JOIN traza.expediente_cierre ec ON ec.expediente_id = ve.id;

CREATE OR REPLACE VIEW public.documentos AS
SELECT vd.id::int AS id, vd.expediente_id::int AS expediente_id, vd.folio,
       vd.tipo_codigo, td.nombre AS nombre_tipo, vd.revision, vd.cancelado,
       vd.escaneado,
       (SELECT max(a.version) FROM traza.archivo_escaneado a WHERE a.documento_id = vd.id)::int AS version_maxima,
       EXISTS (SELECT 1 FROM traza.verificacion_pago vp WHERE vp.documento_id = vd.id) AS pago_verificado,
       (SELECT vs.folio FROM traza.documento_sustitucion ds JOIN traza.v_documento vs ON vs.id = ds.sustituto_id WHERE ds.cancelado_id = vd.id) AS sustituido_por_folio,
       us.nombre AS emitido_por_nombre, vd.emitido_en,
       EXISTS (SELECT 1 FROM traza.documento_captura dc WHERE dc.documento_id = vd.id AND dc.estado = 'COMPLETA') AS pdf_completado
FROM traza.v_documento vd
JOIN traza.tipo_documento td ON td.codigo = vd.tipo_codigo
JOIN traza.usuario us ON us.id = vd.emitido_por;

GRANT SELECT ON public.expedientes, public.documentos TO authenticated;
COMMIT;
