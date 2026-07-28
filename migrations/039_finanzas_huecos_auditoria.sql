-- Modulo Finanzas — cierre de los huecos de la auditoria de completitud.
--
-- La migracion 038 cerro los atajos: escribir directo en las tablas saltandose
-- las funciones. Esta cierra algo distinto y mas incomodo, porque no son
-- atajos sino agujeros en la regla misma. Los encontro la auditoria del
-- 2026-07-28 (docs/finanzas-completitud.md) y aqui se atienden los que viven
-- en la base:
--
--   H3+H4  La ventana entre la primera firma y la ultima admitia editar el
--          contenido. Alguien capturaba 100,000 al consignante, este firmaba,
--          se bajaba a 60,000 y firmaban custodio y gerente. Cada firma
--          guardaba su hash_contenido y NADIE los comparaba nunca, asi que la
--          huella que debia delatarlo se quedaba en el cajon. Es el unico
--          punto del modulo donde se podia cambiar una cifra ya consentida
--          sin dejar rastro.
--   H10    Un folio llegaba a FIRMADO sin una sola fila de detalle: folio
--          consumido, sellado, y cero contenido. Todos los campos que el
--          manual marca con (*) ausentes, y nada protestaba.
--   H9     Dos cortes del mismo dia y sucursal convivian si el turno iba
--          vacio, porque en SQL un NULL no es igual a otro NULL. Dos
--          rendiciones de cuentas del mismo dia, y el encadenado de
--          saldo_inicial_corte tomaba una arbitrariamente.
--   H8     folios_sin_firmar_del_dia ignoraba el RCI-03: una liquidacion de
--          consigna sin firmar no impedia cerrar el dia y su utilidad nunca
--          entraba al corte. Ademas filtraba por creado_en mientras el corte
--          suma por la fecha del hecho, de modo que un recibo creado ayer con
--          cobro de hoy sumaba al corte de hoy pero no lo bloqueaba.
--   H7     "Otros ingresos" de la Parte I del RCI-07 no existia:
--          origen_documento_id era NOT NULL y un ingreso sin folio resultaba
--          inexpresable. El custodio lo declararia como "sobrante" o no lo
--          declararia.
--   H6     La frontera del dia se calculaba en UTC. Un cobro de las 19:00 en
--          Monterrey cae en el corte del dia siguiente: el efectivo esta en el
--          cajon hoy y el corte de hoy no lo cuenta.
--
-- Sobre H6 hay una decision que conviene dejar escrita. Se fija la zona en la
-- SUCURSAL y no en la conexion. Una conexion puede venir de un servidor en
-- otra region, de una tarea programada o de un respaldo restaurado, y el dia
-- de un corte no puede depender de donde estaba corriendo el proceso: depende
-- de donde esta el cajon. Guardarla ademas en el corte permite releer un corte
-- de hace tres anos con la zona con la que efectivamente se calculo, aunque la
-- sucursal se haya mudado despues.
BEGIN;

SET search_path TO traza;

-- ===== H6: el dia es el de la sucursal, no el del servidor =====

ALTER TABLE sucursal
    ADD COLUMN IF NOT EXISTS zona_horaria text NOT NULL DEFAULT 'America/Mexico_City';

-- Que la zona exista de verdad. Un nombre mal escrito no falla al guardarse:
-- falla despues, al calcular un corte, y para entonces el error ya se parece a
-- un descuadre de caja. Va como trigger y no como CHECK porque la lista de
-- zonas es un catalogo del servidor, y un CHECK no admite consultarlo.
CREATE OR REPLACE FUNCTION validar_zona_horaria_sucursal()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.zona_horaria) THEN
        RAISE EXCEPTION 'La zona horaria "%" no existe; usa una de la lista IANA, por ejemplo America/Mexico_City o America/Tijuana',
                        NEW.zona_horaria;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sucursal_zona_horaria_valida ON sucursal;
CREATE TRIGGER sucursal_zona_horaria_valida
    BEFORE INSERT OR UPDATE OF zona_horaria ON sucursal
    FOR EACH ROW EXECUTE FUNCTION validar_zona_horaria_sucursal();

COMMENT ON COLUMN sucursal.zona_horaria IS
    'Zona con la que se decide a que dia pertenece un cobro. Es la del cajon, no la del servidor.';

ALTER TABLE corte_caja_rci07
    ADD COLUMN IF NOT EXISTS zona_horaria text;

COMMENT ON COLUMN corte_caja_rci07.zona_horaria IS
    'Zona con la que se armo ESTE corte. Se copia de la sucursal al armar para poder releerlo anos despues aunque la sucursal se mude.';

-- ===== H9: un solo corte por dia, turno o no turno =====

-- El turno vacio dejaba de colisionar consigo mismo. Se normaliza a cadena
-- vacia —que si es igual a otra cadena vacia— y se reconstruye la UNIQUE.
UPDATE corte_caja_rci07 SET turno = '' WHERE turno IS NULL;

ALTER TABLE corte_caja_rci07 ALTER COLUMN turno SET DEFAULT '';

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM corte_caja_rci07 WHERE turno IS NULL) THEN
        RAISE EXCEPTION 'Quedan cortes con turno nulo; revisalos antes de continuar';
    END IF;
    ALTER TABLE corte_caja_rci07 ALTER COLUMN turno SET NOT NULL;
EXCEPTION WHEN others THEN
    -- Ya era NOT NULL en una corrida previa.
    NULL;
END $$;

ALTER TABLE corte_caja_rci07 DROP CONSTRAINT IF EXISTS corte_caja_rci07_sucursal_id_fecha_corte_turno_key;

CREATE UNIQUE INDEX IF NOT EXISTS corte_caja_rci07_un_corte_por_turno
    ON corte_caja_rci07 (sucursal_id, fecha_corte, turno);

-- ===== H7: "Otros ingresos" de la Parte I =====

-- Un ingreso sin folio SI puede existir —el papel le dedica un renglon— pero
-- no puede entrar mudo: si no hay documento que lo explique, lo explica una
-- persona por escrito y con nombre.
ALTER TABLE corte_caja_detalle ALTER COLUMN origen_documento_id DROP NOT NULL;

ALTER TABLE corte_caja_detalle
    ADD COLUMN IF NOT EXISTS concepto text,
    ADD COLUMN IF NOT EXISTS capturado_por bigint REFERENCES usuario(id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'corte_detalle_sin_folio_se_explica') THEN
        ALTER TABLE corte_caja_detalle ADD CONSTRAINT corte_detalle_sin_folio_se_explica CHECK (
            origen_documento_id IS NOT NULL
            OR (concepto IS NOT NULL AND char_length(trim(concepto)) >= 10
                AND capturado_por IS NOT NULL)
        );
    END IF;
END $$;

COMMENT ON COLUMN corte_caja_detalle.concepto IS
    'Obligatorio cuando el renglon no proviene de un folio: es lo unico que sostiene un ingreso sin documento.';

-- La UNIQUE anterior no impedia dos renglones sueltos identicos, pero tampoco
-- debe: dos ingresos sin folio del mismo monto pueden ser dos hechos
-- distintos. Se conserva la unicidad solo donde hay folio.
ALTER TABLE corte_caja_detalle
    DROP CONSTRAINT IF EXISTS corte_caja_detalle_corte_documento_id_origen_documento_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS corte_detalle_un_renglon_por_folio
    ON corte_caja_detalle (corte_documento_id, origen_documento_id)
    WHERE origen_documento_id IS NOT NULL;

-- Un renglon suelto lo captura el custodio y armar_corte_caja NO debe borrarlo
-- al rehacer el snapshot: no tiene de donde volver a leerlo.
CREATE OR REPLACE FUNCTION agregar_otro_ingreso_corte(
    p_corte bigint, p_concepto text, p_importe numeric, p_usuario bigint
) RETURNS bigint LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_id bigint;
BEGIN
    IF estado_documento_fin(p_corte) <> 'BORRADOR' THEN
        RAISE EXCEPTION 'Solo se agregan ingresos a un corte que sigue en borrador';
    END IF;
    IF char_length(trim(coalesce(p_concepto, ''))) < 10 THEN
        RAISE EXCEPTION 'Un ingreso sin folio exige explicar de donde salio; es lo unico que lo sostiene';
    END IF;
    IF coalesce(p_importe, 0) <= 0 THEN
        RAISE EXCEPTION 'El importe de un ingreso debe ser mayor que cero';
    END IF;

    INSERT INTO corte_caja_detalle
        (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo,
         importe, concepto, capturado_por)
    VALUES (p_corte, NULL, 'INGRESO', 'OTROS_INGRESOS', p_importe, trim(p_concepto), p_usuario)
    RETURNING id INTO v_id;

    PERFORM armar_corte_caja(p_corte, p_usuario);
    RETURN v_id;
END $$;

-- ===== H8 y H6: el barrido de folios sin firmar =====

-- Dos correcciones. Primera: entra el RCI-03, cuya utilidad neta es ingreso
-- del corte y cuya ausencia de firma por tanto tambien debe frenar el cierre.
-- Segunda: el dia se mide por la fecha del HECHO —cuando se cobro, cuando se
-- pago— y no por cuando alguien abrio el folio en la pantalla, que es como lo
-- mide armar_corte_caja. Que las dos consultas usaran criterios distintos era
-- lo que dejaba pasar un recibo creado ayer con cobro de hoy.
CREATE OR REPLACE FUNCTION folios_sin_firmar_del_dia(p_sucursal bigint, p_fecha date)
RETURNS TABLE (folio text, tipo_codigo text, estado text)
LANGUAGE sql STABLE SET search_path = traza AS $$
    WITH zona AS (
        SELECT coalesce(s.zona_horaria, 'America/Mexico_City') AS tz
          FROM sucursal s WHERE s.id = p_sucursal
    ),
    fecha_del_hecho AS (
        SELECT d.id, d.folio, d.tipo_codigo, d.estado,
               CASE d.tipo_codigo
                 WHEN 'CACM-RCI-01' THEN (SELECT (r.fecha_hora_cobro AT TIME ZONE z.tz)::date
                                            FROM recibo_caja_rci01 r WHERE r.documento_id = d.id)
                 WHEN 'CACM-RCI-04' THEN (SELECT (s4.fecha_hora_cobro AT TIME ZONE z.tz)::date
                                            FROM ingreso_servicio_rci04 s4 WHERE s4.documento_id = d.id)
                 WHEN 'CACM-RCI-05' THEN (SELECT (v.fecha_hora AT TIME ZONE z.tz)::date
                                            FROM vale_egreso_rci05 v WHERE v.documento_id = d.id)
                 ELSE NULL
               END AS fecha_hecho,
               d.consecutivo
          FROM v_documento_financiero d CROSS JOIN zona z
         WHERE d.sucursal_id = p_sucursal
           AND d.tipo_codigo IN ('CACM-RCI-01','CACM-RCI-03','CACM-RCI-04','CACM-RCI-05')
           AND d.estado IN ('BORRADOR','PENDIENTE_DE_FIRMA')
    )
    SELECT f.folio, f.tipo_codigo, f.estado
      FROM fecha_del_hecho f CROSS JOIN zona z
     -- Un borrador sin detalle todavia no tiene fecha del hecho. Se cae de
     -- vuelta a creado_en para que no se escape: un folio abierto hoy y
     -- olvidado vacio tambien impide cerrar el dia.
     WHERE coalesce(f.fecha_hecho,
                    ((SELECT d2.creado_en FROM documento_financiero d2 WHERE d2.id = f.id)
                       AT TIME ZONE z.tz)::date) = p_fecha
     ORDER BY f.tipo_codigo, f.consecutivo
$$;

COMMENT ON FUNCTION folios_sin_firmar_del_dia(bigint, date) IS
    'Folios del dia que impiden cerrar el corte. Mide por la fecha del hecho y en la zona de la sucursal, igual que armar_corte_caja.';

-- ===== H3 y H4: las firmas de un folio firman lo mismo =====

-- El corazon de la auditoria. hash_contenido se guardaba por firma y jamas se
-- comparaba, asi que la huella no probaba nada: bastaba con editar el detalle
-- entre una firma y la siguiente. Ahora la segunda firma se niega si lo que
-- tiene delante no es lo que firmo la primera.
--
-- Va como trigger y no dentro de firmar_documento_*, a proposito: el candado
-- que solo vive en la funcion protege a quien la llama, y el dinero lo protege
-- el que tambien detiene a quien no la llama.
-- Etiqueta legible del rol, para que el mensaje diga "el Consignante" y no
-- "RECIBIO_CONSIGNANTE". Quien lee el error esta operando, no depurando.
CREATE OR REPLACE FUNCTION etiqueta_rol_firmante(p_rol text)
RETURNS text LANGUAGE sql STABLE SET search_path = traza AS $$
    SELECT etiqueta FROM rol_firmante WHERE codigo = p_rol
$$;

CREATE OR REPLACE FUNCTION exigir_mismo_contenido_firmado()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_previo char(64);
    v_rol_previo text;
BEGIN
    SELECT f.hash_contenido, f.rol_firmante INTO v_previo, v_rol_previo
      FROM firma_documento_financiero f
     WHERE f.documento_id = NEW.documento_id
     ORDER BY f.firmado_en
     LIMIT 1;

    IF v_previo IS NOT NULL AND v_previo <> NEW.hash_contenido THEN
        RAISE EXCEPTION
            'El contenido cambio desde que firmo %; lo que estas por firmar no es lo que esa persona consintio. Cancela el folio y emite uno complementario',
            coalesce(etiqueta_rol_firmante(v_rol_previo), v_rol_previo);
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS firma_exige_mismo_contenido ON firma_documento_financiero;
CREATE TRIGGER firma_exige_mismo_contenido
    BEFORE INSERT ON firma_documento_financiero
    FOR EACH ROW EXECUTE FUNCTION exigir_mismo_contenido_firmado();

-- Segunda mitad de H4: que se pueda VER. Un folio cuyas firmas no coincidan no
-- deberia poder existir tras el trigger anterior, pero los que ya existan —o
-- los que entren por una restauracion— tienen que ser visibles sin auditoria
-- manual.
CREATE OR REPLACE VIEW v_firma_discrepante AS
SELECT d.id            AS documento_id,
       d.folio_completo,
       d.tipo_codigo,
       d.sucursal_id,
       count(DISTINCT f.hash_contenido) AS huellas_distintas,
       array_agg(DISTINCT f.rol_firmante ORDER BY f.rol_firmante) AS roles
  FROM v_documento_financiero d
  JOIN firma_documento_financiero f ON f.documento_id = d.id
 GROUP BY d.id, d.folio_completo, d.tipo_codigo, d.sucursal_id
HAVING count(DISTINCT f.hash_contenido) > 1;

COMMENT ON VIEW v_firma_discrepante IS
    'Folios cuyas firmas no firmaron el mismo contenido. Tras la migracion 039 deberia estar siempre vacia; si trae filas, hay un documento consentido en dos versiones distintas.';

-- ===== H10: no se firma un folio vacio =====

-- Que fila de detalle sostiene a cada formato. El RCI-07 se excluye
-- deliberadamente: su detalle lo arma cerrar_corte_caja, que corre despues.
CREATE OR REPLACE FUNCTION documento_fin_tiene_detalle(p_documento bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = traza AS $$
DECLARE
    v_tipo text;
    v_hay  boolean;
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento_financiero WHERE id = p_documento;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    CASE v_tipo
        WHEN 'CACM-RCI-01' THEN SELECT EXISTS(SELECT 1 FROM recibo_caja_rci01 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-02' THEN SELECT EXISTS(SELECT 1 FROM ingreso_vehiculo_rci02 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-03' THEN SELECT EXISTS(SELECT 1 FROM liquidacion_consigna_rci03 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-04' THEN SELECT EXISTS(SELECT 1 FROM ingreso_servicio_rci04 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-05' THEN SELECT EXISTS(SELECT 1 FROM vale_egreso_rci05 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-06' THEN SELECT EXISTS(SELECT 1 FROM recibo_nomina_rci06 WHERE documento_id = p_documento) INTO v_hay;
        WHEN 'CACM-RCI-07' THEN SELECT EXISTS(SELECT 1 FROM corte_caja_rci07 WHERE documento_id = p_documento) INTO v_hay;
        ELSE v_hay := true;
    END CASE;

    RETURN coalesce(v_hay, false);
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

    -- H10: mandar a firma un folio sin contenido consume el numero y produce un
    -- documento sellado que no dice nada. Todos los campos que el manual marca
    -- con (*) estarian ausentes y hasta hoy nada protestaba.
    IF p_hacia = 'PENDIENTE_DE_FIRMA' AND NOT documento_fin_tiene_detalle(p_documento) THEN
        RAISE EXCEPTION 'El folio no tiene contenido capturado; no se manda a firma un formato en blanco';
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

-- Cinturon y tirantes: cerrar_si_firmas_completas tampoco cierra un folio sin
-- detalle. Si alguien alcanzara PENDIENTE_DE_FIRMA por otra via, el documento
-- no llega a FIRMADO vacio.
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
        IF NOT documento_fin_tiene_detalle(p_documento) THEN
            RAISE EXCEPTION 'El folio no tiene contenido capturado; no puede quedar firmado en blanco';
        END IF;

        PERFORM set_config('traza.estado_doc_fin', 'si', true);
        INSERT INTO documento_financiero_estado_hist (documento_id, estado, registrado_por)
            VALUES (p_documento, 'FIRMADO', p_usuario);
        PERFORM set_config('traza.estado_doc_fin', 'no', true);
        PERFORM estampar_sello(p_documento, 'DOCUMENTO_FIRMADO', p_usuario, p_hash_contenido);
        RETURN 'FIRMADO';
    END IF;
    RETURN 'PENDIENTE_DE_FIRMA';
END $$;

-- ===== H6 aplicado: armar_corte_caja mide el dia en la zona de la sucursal =====

CREATE OR REPLACE FUNCTION armar_corte_caja(p_documento bigint, p_usuario bigint)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_sucursal bigint;
    v_fecha    date;
    v_tz       text;
    v_ingresos numeric(18,2) := 0;
    v_egresos  numeric(18,2) := 0;
BEGIN
    SELECT c.sucursal_id, c.fecha_corte, coalesce(s.zona_horaria, 'America/Mexico_City')
      INTO v_sucursal, v_fecha, v_tz
      FROM corte_caja_rci07 c
      JOIN sucursal s ON s.id = c.sucursal_id
     WHERE c.documento_id = p_documento;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El corte de caja no existe';
    END IF;
    IF estado_documento_fin(p_documento) <> 'BORRADOR' THEN
        RAISE EXCEPTION 'Solo se arma un corte que sigue en borrador';
    END IF;

    -- Se rehace el snapshot de lo que se lee de otros folios, pero NO los
    -- renglones sin folio: esos los tecleo una persona y no hay de donde
    -- volver a leerlos.
    DELETE FROM corte_caja_detalle
     WHERE corte_documento_id = p_documento AND origen_documento_id IS NOT NULL;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'VENTAS_CONTADO', r.importe_total
      FROM recibo_caja_rci01 r
      JOIN v_documento_financiero d ON d.id = r.documento_id
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND (r.fecha_hora_cobro AT TIME ZONE v_tz)::date = v_fecha;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'UTILIDAD_CONSIGNA', l.utilidad_neta
      FROM liquidacion_consigna_rci03 l
      JOIN v_documento_financiero d ON d.id = l.documento_id
      JOIN forma_pago_fin f ON f.codigo = l.forma_ingreso_tesoreria
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND f.afecta_caja_fisica AND l.utilidad_neta > 0
       AND (d.creado_en AT TIME ZONE v_tz)::date = v_fecha;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'SERVICIO', s.importe_total
      FROM ingreso_servicio_rci04 s
      JOIN v_documento_financiero d ON d.id = s.documento_id
      JOIN forma_pago_fin f ON f.codigo = s.forma_pago
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND f.afecta_caja_fisica
       AND (s.fecha_hora_cobro AT TIME ZONE v_tz)::date = v_fecha;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'EGRESO',
           CASE v.concepto_codigo
             WHEN 'PAGO_NOMINA'             THEN 'NOMINA_Y_COMISIONES'
             WHEN 'COMISION_VENDEDOR'       THEN 'NOMINA_Y_COMISIONES'
             WHEN 'RETIRO_UTILIDADES_SOCIO' THEN 'RETIRO_SOCIOS'
             ELSE 'PROVEEDORES_Y_GASTOS'
           END,
           v.importe
      FROM vale_egreso_rci05 v
      JOIN v_documento_financiero d ON d.id = v.documento_id
      JOIN forma_pago_fin f ON f.codigo = v.forma_pago
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND f.afecta_caja_fisica
       AND (v.fecha_hora AT TIME ZONE v_tz)::date = v_fecha;

    SELECT COALESCE(sum(importe) FILTER (WHERE naturaleza = 'INGRESO'), 0),
           COALESCE(sum(importe) FILTER (WHERE naturaleza = 'EGRESO'), 0)
      INTO v_ingresos, v_egresos
      FROM corte_caja_detalle WHERE corte_documento_id = p_documento;

    v_egresos := v_egresos + COALESCE(
        (SELECT sum(monto) FROM deposito_corte_rci07 WHERE corte_documento_id = p_documento), 0);
    v_egresos := v_egresos + COALESCE(
        (SELECT sum(monto) FROM resguardo_corte_rci07 WHERE corte_documento_id = p_documento), 0);

    UPDATE corte_caja_rci07
       SET saldo_inicial  = saldo_inicial_corte(v_sucursal, v_fecha),
           total_ingresos = v_ingresos,
           total_egresos  = v_egresos,
           zona_horaria   = v_tz,
           armado_en      = clock_timestamp()
     WHERE documento_id = p_documento;
END $$;

-- El detalle sin folio tambien queda bajo el candado de estado que ya protege
-- al resto: mientras el corte este en BORRADOR se puede corregir, despues no.
-- bloquear_detalle_corte ya lo hace por corte_documento_id, de modo que los
-- renglones nuevos heredan la proteccion sin tocar nada.

COMMIT;
