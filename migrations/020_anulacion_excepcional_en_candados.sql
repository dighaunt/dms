-- La decisión N3 debe ser consumida por la misma máquina de estados, no por
-- una condición de UI. Cada requisito se satisface por evidencia vigente o
-- por una anulación excepcional inmutable del mismo expediente + tipo.
BEGIN;
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
   IF NOT traza.requisito_anulado_excepcional(v_exp,'C-02') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id JOIN verificacion_pago vp ON vp.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='C-02' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para marcar la unidad como vendida se requiere % escaneado y con pago verificado, o una anulación excepcional N3', etiqueta_documento('C-02'); END IF;
 ELSIF p_hacia='ENTREGADA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-11') THEN RAISE EXCEPTION 'Para marcar la unidad como entregada se requiere % firmado y escaneado, o una anulación excepcional N3', etiqueta_documento('F-11'); END IF;
 ELSIF p_hacia='DEVUELTA_CONSIGNANTE' THEN
   IF NOT EXISTS (SELECT 1 FROM expediente WHERE id=v_exp AND origen='CONSIGNADA') THEN RAISE EXCEPTION 'Solo una unidad consignada puede devolverse al consignante'; END IF;
 ELSIF p_hacia='BAJA' THEN
   SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel NOT IN ('N2','N3') THEN RAISE EXCEPTION 'Dar de baja una unidad requiere autorización de encargado (N2) o administración (N3)'; END IF;
 END IF;
 INSERT INTO unidad_estado_hist(vin,estado,registrado_por) VALUES(p_vin,p_hacia,p_usuario);
END $$;
COMMIT;
