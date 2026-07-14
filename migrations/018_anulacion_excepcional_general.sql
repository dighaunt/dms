-- Una anulación excepcional se relaciona con el requisito documental
-- (expediente + tipo), no con una pantalla ni una lista de casos. Ese par es
-- la clave de negocio: un requisito solo puede anularse una vez y la fila es
-- inmutable. Las anulaciones por folio emitido siguen en documento_cancelacion.
BEGIN;

ALTER TABLE traza.anulacion_documental_excepcional
  DROP CONSTRAINT anulacion_documental_excepcional_tipo_codigo_check;
ALTER TABLE traza.anulacion_documental_excepcional
  ADD CONSTRAINT anulacion_documental_excepcional_tipo_fk
  FOREIGN KEY (tipo_codigo) REFERENCES traza.tipo_documento(codigo);

CREATE OR REPLACE FUNCTION traza.anular_documento_excepcional(
    p_expediente bigint, p_tipo text, p_motivo text, p_usuario bigint
) RETURNS traza.anulacion_documental_excepcional
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE v_nivel text; v_row anulacion_documental_excepcional;
BEGIN
  SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
  IF v_nivel IS DISTINCT FROM 'N3' THEN RAISE EXCEPTION 'La anulación excepcional solo puede realizarla un administrador N3'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tipo_documento WHERE codigo = p_tipo) THEN RAISE EXCEPTION 'Tipo documental no reconocido'; END IF;
  IF char_length(trim(p_motivo)) < 40 THEN RAISE EXCEPTION 'La anulación excepcional requiere un motivo de al menos 40 caracteres'; END IF;
  INSERT INTO anulacion_documental_excepcional (expediente_id,tipo_codigo,motivo,anulado_por)
  VALUES (p_expediente,p_tipo,trim(p_motivo),p_usuario) RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION traza.requisito_anulado_excepcional(p_expediente bigint, p_tipo text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = traza AS $$
  SELECT EXISTS (SELECT 1 FROM anulacion_documental_excepcional WHERE expediente_id=p_expediente AND tipo_codigo=p_tipo)
$$;

CREATE OR REPLACE FUNCTION traza.cerrar_expediente(p_expediente bigint, p_usuario bigint)
RETURNS traza.expediente_cierre LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE v_nivel text; v_origen text; v_estado text; v_row expediente_cierre;
BEGIN
 SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel IS DISTINCT FROM 'N3' THEN RAISE EXCEPTION 'Cerrar un expediente requiere autorización N3'; END IF;
 SELECT origen INTO v_origen FROM expediente WHERE id=p_expediente; IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado'; END IF;
 IF EXISTS (SELECT 1 FROM expediente_cierre WHERE expediente_id=p_expediente) THEN RAISE EXCEPTION 'El expediente ya fue cerrado'; END IF;
 SELECT h.estado INTO v_estado FROM unidad_estado_hist h JOIN expediente e ON e.vin=h.vin WHERE e.id=p_expediente ORDER BY h.ocurrido_en DESC LIMIT 1;
 IF v_estado IS DISTINCT FROM 'ENTREGADA' THEN RAISE EXCEPTION 'Para cerrar el expediente la unidad debe estar marcada como «Entregada»'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'C-02') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id JOIN verificacion_pago p ON p.documento_id=d.id WHERE d.expediente_id=p_expediente AND d.tipo_codigo='C-02' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere C-02 escaneado y pago verificado, o una anulación excepcional N3'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=p_expediente AND d.tipo_codigo='F-11' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere F-11 firmado y escaneado, o una anulación excepcional N3'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='ine_partes') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Identificación de las partes»'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='comprobante_pago') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Comprobantes de pago»'; END IF;
 IF v_origen='PROPIA' AND NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='factura_original') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Factura original (última)»'; END IF;
 INSERT INTO expediente_cierre(expediente_id,cerrado_por) VALUES(p_expediente,p_usuario) RETURNING * INTO v_row; RETURN v_row;
END $$;
COMMIT;
