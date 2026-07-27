-- Modulo Finanzas — cierre de huecos encontrados en revision adversarial.
--
-- Las migraciones 034-037 pusieron las reglas dentro de funciones plpgsql, pero
-- dejaron las TABLAS abiertas a escritura directa. Un intento deliberado de
-- romperlas —pensando como quien quiere sacar dinero de la caja sin que el
-- sistema lo note— logro siete de ocho ataques:
--
--   A1  Insertar en firma_documento_financiero firmo como el Custodio Financiero
--       SIN conocer su PIN. La verificacion vivia solo en la funcion.
--   A2  Insertar en documento_financiero_estado_hist dejo un vale de 999,999 en
--       estado FIRMADO con CERO firmas.
--   A3  Un RCI-01 con importe 50,000 y arqueo de 45,000 se firmo sin problema:
--       validar_arqueo_rci01 solo corria si alguien se acordaba de llamarla.
--   A4  El gerente autorizo un vale y cobro el mismo, declarandose "tercero"
--       por la via de firma presencial. La segregacion solo miraba usuario_id,
--       y una firma externa lo lleva en NULL.
--   A5  Un sello AUTORIZADO se fabrico a mano con un token inventado.
--   A6  Tras cerrar el corte con faltante, se borro la explicacion de la
--       diferencia mientras la alerta seguia viva: el documento se habria
--       firmado sin la explicacion que la regla exige.
--   A7  Un documento ya FIRMADO se paso a CANCELADO escribiendo el historial.
--
-- Solo A8 (subir el importe de un vale firmado) estaba cubierto.
--
-- La leccion es la del propio manual: un candado que depende de que alguien
-- recuerde invocarlo no es un candado. Se aplica aqui el patron que el
-- repositorio ya usaba para la certificacion de pago del C-02: la tabla solo
-- acepta escrituras cuando la funcion oficial encendio una bandera LOCAL a la
-- transaccion, que no sobrevive al request.
BEGIN;

SET search_path TO traza;

-- ===== BANDERAS DE ESCRITURA AUTORIZADA =====

CREATE OR REPLACE FUNCTION exigir_bandera(p_bandera text, p_mensaje text)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF current_setting(p_bandera, true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION '%', p_mensaje;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION proteger_estado_documento_fin()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    PERFORM exigir_bandera('traza.estado_doc_fin',
      'El estado de un documento financiero solo cambia por las funciones de emision, firma o cancelacion');
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION proteger_firma_documento_fin()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    PERFORM exigir_bandera('traza.firma_doc_fin',
      'Una firma solo se registra por la funcion de firma, que verifica el PIN de quien firma');
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION proteger_sello_accion()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    PERFORM exigir_bandera('traza.sello_accion',
      'Un sello solo se acuna junto al hecho que acredita; no se estampa por separado');
    RETURN NEW;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS estado_doc_fin_protegido ON documento_financiero_estado_hist';
    EXECUTE 'CREATE TRIGGER estado_doc_fin_protegido BEFORE INSERT ON documento_financiero_estado_hist
             FOR EACH ROW EXECUTE FUNCTION proteger_estado_documento_fin()';
    EXECUTE 'DROP TRIGGER IF EXISTS firma_doc_fin_protegida ON firma_documento_financiero';
    EXECUTE 'CREATE TRIGGER firma_doc_fin_protegida BEFORE INSERT ON firma_documento_financiero
             FOR EACH ROW EXECUTE FUNCTION proteger_firma_documento_fin()';
    EXECUTE 'DROP TRIGGER IF EXISTS sello_accion_protegido ON sello_accion';
    EXECUTE 'CREATE TRIGGER sello_accion_protegido BEFORE INSERT ON sello_accion
             FOR EACH ROW EXECUTE FUNCTION proteger_sello_accion()';
END $$;

-- ===== A6: el corte se congela al cerrarse, no al firmarse =====
-- Entre cerrar y firmar habia una ventana en la que el custodio podia rehacer
-- el arqueo o borrar la explicacion del faltante. Si se necesita corregir, la
-- via es regresar el corte a BORRADOR, lo cual queda registrado en su historial.
CREATE OR REPLACE FUNCTION bloquear_cabecera_corte()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_estado text;
BEGIN
    v_estado := estado_documento_fin(CASE TG_OP WHEN 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END);
    IF v_estado IS NOT NULL AND v_estado <> 'BORRADOR' THEN
        RAISE EXCEPTION 'El corte ya fue cerrado; para rehacer el arqueo regresalo a borrador y vuelve a cerrarlo';
    END IF;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS corte_caja_rci07_congelado ON corte_caja_rci07';
    EXECUTE 'CREATE TRIGGER corte_caja_rci07_congelado BEFORE INSERT OR UPDATE OR DELETE ON corte_caja_rci07
             FOR EACH ROW EXECUTE FUNCTION bloquear_cabecera_corte()';
END $$;

-- ===== FUNCIONES OFICIALES: ahora encienden su bandera =====

CREATE OR REPLACE FUNCTION emitir_folio_financiero(
    p_tipo text, p_sucursal bigint, p_usuario bigint, p_complementa_a bigint DEFAULT NULL
) RETURNS documento_financiero LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_num integer; v_row documento_financiero; v_orig documento_financiero;
BEGIN
    PERFORM 1 FROM sucursal WHERE id = p_sucursal AND activa;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La sucursal indicada no existe o esta dada de baja';
    END IF;

    IF p_complementa_a IS NOT NULL THEN
        SELECT * INTO v_orig FROM documento_financiero WHERE id = p_complementa_a;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El documento que se pretende complementar no existe';
        END IF;
        IF v_orig.tipo_codigo <> p_tipo THEN
            RAISE EXCEPTION 'Un documento complementario debe ser del mismo tipo que el original';
        END IF;
        IF v_orig.sucursal_id <> p_sucursal THEN
            RAISE EXCEPTION 'Un documento complementario debe emitirse en la misma sucursal que el original';
        END IF;
        IF estado_documento_fin(p_complementa_a) <> 'FIRMADO' THEN
            RAISE EXCEPTION 'Solo se complementa un documento ya firmado; si aun no se firma, corrigelo antes de firmarlo';
        END IF;
    END IF;

    INSERT INTO contador_folio_financiero (tipo_codigo, sucursal_id)
        VALUES (p_tipo, p_sucursal) ON CONFLICT DO NOTHING;
    UPDATE contador_folio_financiero SET ultimo = ultimo + 1
     WHERE tipo_codigo = p_tipo AND sucursal_id = p_sucursal
     RETURNING ultimo INTO v_num;

    INSERT INTO documento_financiero (tipo_codigo, sucursal_id, consecutivo, complementa_a, creado_por)
        VALUES (p_tipo, p_sucursal, v_num, p_complementa_a, p_usuario)
        RETURNING * INTO v_row;

    PERFORM set_config('traza.estado_doc_fin', 'si', true);
    INSERT INTO documento_financiero_estado_hist (documento_id, estado, registrado_por)
        VALUES (v_row.id, 'BORRADOR', p_usuario);
    PERFORM set_config('traza.estado_doc_fin', 'no', true);

    RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION cambiar_estado_documento_fin(
    p_documento bigint, p_hacia text, p_usuario bigint, p_motivo text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_desde text;
BEGIN
    SELECT estado_documento_fin(p_documento) INTO v_desde;
    IF v_desde IS NULL THEN
        RAISE EXCEPTION 'El documento no existe o no tiene estado inicial';
    END IF;
    PERFORM 1 FROM transicion_documento_financiero WHERE desde = v_desde AND hacia = p_hacia;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Un documento % no puede pasar a %', v_desde, p_hacia;
    END IF;
    IF p_hacia = 'CANCELADO' AND char_length(trim(coalesce(p_motivo, ''))) < 10 THEN
        RAISE EXCEPTION 'Cancelar un folio exige explicar por que; el folio queda ocupado y esa explicacion es su descargo';
    END IF;

    PERFORM set_config('traza.estado_doc_fin', 'si', true);
    INSERT INTO documento_financiero_estado_hist (documento_id, estado, motivo, registrado_por)
        VALUES (p_documento, p_hacia, p_motivo, p_usuario);
    PERFORM set_config('traza.estado_doc_fin', 'no', true);

    IF p_hacia = 'CANCELADO' THEN
        PERFORM estampar_sello(p_documento, 'FOLIO_CANCELADO', p_usuario,
                               encode(public.digest(coalesce(p_motivo,''), 'sha256'), 'hex'));
    END IF;
END $$;

CREATE OR REPLACE FUNCTION cerrar_si_firmas_completas(
    p_documento bigint, p_tipo text, p_usuario bigint, p_hash_contenido text
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_faltan integer;
BEGIN
    SELECT count(*) INTO v_faltan
      FROM firma_requerida fr
     WHERE fr.tipo_codigo = p_tipo AND fr.obligatoria
       AND NOT EXISTS (SELECT 1 FROM firma_documento_financiero f
                        WHERE f.documento_id = p_documento
                          AND f.rol_firmante = fr.rol_firmante);

    IF v_faltan = 0 THEN
        PERFORM set_config('traza.estado_doc_fin', 'si', true);
        INSERT INTO documento_financiero_estado_hist (documento_id, estado, registrado_por)
            VALUES (p_documento, 'FIRMADO', p_usuario);
        PERFORM set_config('traza.estado_doc_fin', 'no', true);
        PERFORM estampar_sello(p_documento, 'DOCUMENTO_FIRMADO', p_usuario, p_hash_contenido);
        RETURN 'FIRMADO';
    END IF;
    RETURN 'PENDIENTE_DE_FIRMA';
END $$;

CREATE OR REPLACE FUNCTION estampar_sello(
    p_documento bigint, p_accion text, p_usuario bigint,
    p_hash_contenido text, p_rol_firmante text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_token text; v_intento integer := 0;
BEGIN
    LOOP
        v_intento := v_intento + 1;
        v_token := acunar_token_sello();
        BEGIN
            PERFORM set_config('traza.sello_accion', 'si', true);
            INSERT INTO sello_accion
                (documento_id, accion_codigo, rol_firmante, token, hash_contenido, estampado_por)
            VALUES (p_documento, p_accion, p_rol_firmante, v_token, lower(p_hash_contenido), p_usuario);
            PERFORM set_config('traza.sello_accion', 'no', true);
            RETURN v_token;
        EXCEPTION WHEN unique_violation THEN
            PERFORM set_config('traza.sello_accion', 'no', true);
            IF EXISTS (SELECT 1 FROM sello_accion
                        WHERE documento_id = p_documento AND accion_codigo = p_accion
                          AND rol_firmante IS NOT DISTINCT FROM p_rol_firmante) THEN
                RAISE EXCEPTION 'Ese sello ya fue estampado en este folio';
            END IF;
            IF v_intento >= 5 THEN
                RAISE EXCEPTION 'No fue posible acunar un token de sello; reintenta la operacion';
            END IF;
        END;
    END LOOP;
END $$;

-- ===== A3: el arqueo se comprueba AL FIRMAR, no cuando alguien se acuerda =====
CREATE OR REPLACE FUNCTION validar_firma_admisible(p_documento bigint, p_rol text)
RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_estado text; v_tipo text;
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento_financiero WHERE id = p_documento;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El documento que intentas firmar no existe';
    END IF;

    v_estado := estado_documento_fin(p_documento);
    IF v_estado <> 'PENDIENTE_DE_FIRMA' THEN
        IF v_estado = 'FIRMADO' THEN
            RAISE EXCEPTION 'El documento ya esta firmado; para corregirlo emite un recibo complementario';
        END IF;
        RAISE EXCEPTION 'El documento debe estar pendiente de firma para poder firmarse';
    END IF;

    PERFORM 1 FROM firma_requerida WHERE tipo_codigo = v_tipo AND rol_firmante = p_rol;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese rol de firma no corresponde a este formato';
    END IF;

    -- El desglose de billetes es la Parte II del recibo: si no cuadra con el
    -- importe declarado, lo que se firmaria es una entrega que no ocurrio.
    IF v_tipo = 'CACM-RCI-01' THEN
        PERFORM validar_arqueo_rci01(p_documento);
    END IF;

    RETURN v_tipo;
END $$;

-- ===== A1 y A4: firmas =====

CREATE OR REPLACE FUNCTION firmar_documento_financiero(
    p_documento bigint, p_rol text, p_usuario bigint, p_pin text,
    p_hash_contenido text, p_origen_sesion text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_tipo text;
BEGIN
    v_tipo := validar_firma_admisible(p_documento, p_rol);
    PERFORM verificar_pin(p_usuario, p_pin);

    -- Nadie puede firmar como interno un documento donde ya "firmo" un tercero
    -- con su mismo nombre: seria la misma persona ocupando dos roles.
    IF EXISTS (
        SELECT 1 FROM firma_documento_financiero f
         WHERE f.documento_id = p_documento
           AND f.metodo = 'AUTOGRAFA_PRESENCIAL'
           AND lower(regexp_replace(trim(f.firmante_nombre), '\s+', ' ', 'g'))
             = (SELECT lower(regexp_replace(trim(u.nombre), '\s+', ' ', 'g'))
                  FROM usuario u WHERE u.id = p_usuario)
    ) THEN
        RAISE EXCEPTION 'Esa persona ya firmo este documento como tercero; una sola persona no puede ocupar dos roles';
    END IF;

    PERFORM set_config('traza.firma_doc_fin', 'si', true);
    INSERT INTO firma_documento_financiero
        (documento_id, rol_firmante, metodo, usuario_id, hash_contenido, origen_sesion)
        VALUES (p_documento, p_rol, 'PIN_USUARIO', p_usuario, lower(p_hash_contenido), p_origen_sesion);
    PERFORM set_config('traza.firma_doc_fin', 'no', true);

    RETURN cerrar_si_firmas_completas(p_documento, v_tipo, p_usuario, p_hash_contenido);
END $$;

CREATE OR REPLACE FUNCTION firmar_documento_externo(
    p_documento bigint, p_rol text, p_firmante_nombre text, p_firmante_id_tipo text,
    p_firmante_id_numero text, p_atestigua_usuario bigint, p_pin_atestigua text,
    p_hash_contenido text, p_trazo_ruta text DEFAULT NULL, p_origen_sesion text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_tipo text; v_exige_interno boolean; v_normalizado text;
BEGIN
    v_tipo := validar_firma_admisible(p_documento, p_rol);

    SELECT exige_usuario_interno INTO v_exige_interno FROM rol_firmante WHERE codigo = p_rol;
    IF v_exige_interno THEN
        RAISE EXCEPTION 'El rol % corresponde a personal de la empresa y debe firmarse con usuario y PIN', p_rol;
    END IF;

    PERFORM verificar_pin(p_atestigua_usuario, p_pin_atestigua);

    -- La segregacion de funciones no puede evadirse declarandose "tercero":
    -- si el nombre coincide con el de alguien que ya firmo con su usuario, es
    -- la misma persona ocupando dos roles del mismo documento.
    v_normalizado := lower(regexp_replace(trim(p_firmante_nombre), '\s+', ' ', 'g'));
    IF EXISTS (
        SELECT 1 FROM firma_documento_financiero f
          JOIN usuario u ON u.id = f.usuario_id
         WHERE f.documento_id = p_documento
           AND lower(regexp_replace(trim(u.nombre), '\s+', ' ', 'g')) = v_normalizado
    ) THEN
        RAISE EXCEPTION 'Esa persona ya firmo este documento con su usuario; no puede figurar ademas como tercero';
    END IF;
    IF EXISTS (
        SELECT 1 FROM firma_documento_financiero f
         WHERE f.documento_id = p_documento
           AND f.metodo = 'AUTOGRAFA_PRESENCIAL'
           AND lower(regexp_replace(trim(f.firmante_nombre), '\s+', ' ', 'g')) = v_normalizado
    ) THEN
        RAISE EXCEPTION 'Ese tercero ya firmo este documento en otro rol';
    END IF;

    PERFORM set_config('traza.firma_doc_fin', 'si', true);
    INSERT INTO firma_documento_financiero
        (documento_id, rol_firmante, metodo, firmante_nombre, firmante_id_tipo,
         firmante_id_numero, atestiguado_por, trazo_ruta, hash_contenido, origen_sesion)
        VALUES (p_documento, p_rol, 'AUTOGRAFA_PRESENCIAL', p_firmante_nombre, p_firmante_id_tipo,
                p_firmante_id_numero, p_atestigua_usuario, p_trazo_ruta,
                lower(p_hash_contenido), p_origen_sesion);
    PERFORM set_config('traza.firma_doc_fin', 'no', true);

    RETURN cerrar_si_firmas_completas(p_documento, v_tipo, p_atestigua_usuario, p_hash_contenido);
END $$;

COMMIT;
