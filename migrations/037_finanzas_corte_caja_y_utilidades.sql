

BEGIN;

SET search_path TO traza;

CREATE TABLE IF NOT EXISTS corte_caja_rci07 (
    documento_id     bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo      text NOT NULL DEFAULT 'CACM-RCI-07'
                     CHECK (tipo_codigo = 'CACM-RCI-07'),
    sucursal_id      bigint NOT NULL REFERENCES sucursal(id),
    fecha_corte      date NOT NULL,
    turno            text,
    custodio_usuario_id bigint NOT NULL REFERENCES usuario(id),
    saldo_inicial    numeric(18,2) NOT NULL DEFAULT 0 CHECK (saldo_inicial >= 0),
    total_ingresos   numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_ingresos >= 0),
    total_egresos    numeric(18,2) NOT NULL DEFAULT 0 CHECK (total_egresos >= 0),
    saldo_calculado  numeric(18,2)
                     GENERATED ALWAYS AS (saldo_inicial + total_ingresos - total_egresos) STORED,
    efectivo_contado numeric(18,2) CHECK (efectivo_contado IS NULL OR efectivo_contado >= 0),
    diferencia       numeric(18,2)
                     GENERATED ALWAYS AS (
                        CASE WHEN efectivo_contado IS NULL THEN NULL
                             ELSE efectivo_contado - (saldo_inicial + total_ingresos - total_egresos)
                        END) STORED,
    explicacion_diferencia text,
    armado_en        timestamptz,
    UNIQUE (sucursal_id, fecha_corte, turno),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),
    FOREIGN KEY (documento_id, sucursal_id)
        REFERENCES documento_financiero (id, sucursal_id)
);

CREATE TABLE IF NOT EXISTS corte_caja_detalle (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    corte_documento_id  bigint NOT NULL REFERENCES corte_caja_rci07(documento_id),
    origen_documento_id bigint NOT NULL REFERENCES documento_financiero(id),
    naturaleza          text NOT NULL CHECK (naturaleza IN ('INGRESO','EGRESO')),
    concepto_grupo      text NOT NULL,
    importe             numeric(18,2) NOT NULL CHECK (importe > 0),
    UNIQUE (corte_documento_id, origen_documento_id)
);

CREATE TABLE IF NOT EXISTS deposito_corte_rci07 (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    corte_documento_id bigint NOT NULL REFERENCES corte_caja_rci07(documento_id),
    institucion        text NOT NULL CHECK (char_length(trim(institucion)) BETWEEN 2 AND 80),
    cuenta             text NOT NULL CHECK (char_length(trim(cuenta)) BETWEEN 4 AND 40),
    monto              numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha_deposito     date NOT NULL,
    comprobante_ref    text NOT NULL CHECK (char_length(trim(comprobante_ref)) BETWEEN 3 AND 60),
    registrado_por     bigint NOT NULL REFERENCES usuario(id),
    registrado_en      timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS resguardo_corte_rci07 (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    corte_documento_id bigint NOT NULL REFERENCES corte_caja_rci07(documento_id),
    tipo               text NOT NULL CHECK (tipo IN ('TRANSITO','OTRO')),
    monto              numeric(18,2) NOT NULL CHECK (monto > 0),
    detalle            text NOT NULL CHECK (char_length(trim(detalle)) >= 5)
);

CREATE TABLE IF NOT EXISTS alerta_finanzas (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo          text NOT NULL CHECK (tipo IN (
                    'FALTANTE_DE_CAJA','CUSTODIA_PENDIENTE',
                    'RETIRO_SOCIO_SIN_RESPALDO','DIFERENCIA_DE_CAJA')),
    severidad     text NOT NULL CHECK (severidad IN ('AVISO','GRAVE')),
    sucursal_id   bigint REFERENCES sucursal(id),
    documento_id  bigint REFERENCES documento_financiero(id),
    mensaje       text NOT NULL,
    creada_en     timestamptz NOT NULL DEFAULT clock_timestamp(),
    atendida_por  bigint REFERENCES usuario(id),
    atendida_en   timestamptz,
    nota_atencion text,
    CHECK ((atendida_por IS NULL) = (atendida_en IS NULL))
);
CREATE INDEX IF NOT EXISTS alerta_finanzas_abierta_idx
    ON alerta_finanzas (tipo, creada_en) WHERE atendida_en IS NULL;

CREATE TABLE IF NOT EXISTS reparto_utilidades (
    id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    ejercicio           text NOT NULL CHECK (ejercicio ~ '^[0-9]{4}(-[ST][1-4])?$'),
    fecha_balance       date NOT NULL,
    utilidad_repartible numeric(18,2) NOT NULL CHECK (utilidad_repartible >= 0),
    acta_referencia     text NOT NULL CHECK (char_length(trim(acta_referencia)) >= 3),
    autorizado_por      bigint NOT NULL REFERENCES usuario(id),
    creado_en           timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (ejercicio)
);

CREATE TABLE IF NOT EXISTS reparto_utilidades_socio (
    reparto_id       bigint NOT NULL REFERENCES reparto_utilidades(id),
    socio_usuario_id bigint NOT NULL REFERENCES usuario(id),
    monto_asignado   numeric(18,2) NOT NULL CHECK (monto_asignado >= 0),
    PRIMARY KEY (reparto_id, socio_usuario_id)
);

CREATE OR REPLACE FUNCTION bloquear_detalle_corte()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_corte  bigint;
    v_estado text;
BEGIN
    v_corte := CASE TG_OP WHEN 'DELETE' THEN OLD.corte_documento_id ELSE NEW.corte_documento_id END;
    v_estado := estado_documento_fin(v_corte);
    IF v_estado IS DISTINCT FROM 'BORRADOR' THEN
        RAISE EXCEPTION 'El corte ya fue cerrado; su detalle no admite cambios. Regresalo a borrador para rehacer el arqueo';
    END IF;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$
DECLARE v_tabla text;
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS reparto_utilidades_inmutable ON reparto_utilidades';
    EXECUTE 'DROP TRIGGER IF EXISTS reparto_utilidades_socio_inmutable ON reparto_utilidades_socio';
    
    EXECUTE 'CREATE TRIGGER reparto_utilidades_inmutable BEFORE UPDATE OR DELETE ON reparto_utilidades
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
    EXECUTE 'CREATE TRIGGER reparto_utilidades_socio_inmutable BEFORE UPDATE OR DELETE ON reparto_utilidades_socio
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';

    FOREACH v_tabla IN ARRAY ARRAY['corte_caja_detalle','deposito_corte_rci07','resguardo_corte_rci07'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_tabla || '_congelado', v_tabla);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION bloquear_detalle_corte()',
            v_tabla || '_congelado', v_tabla);
    END LOOP;

    
    EXECUTE 'DROP TRIGGER IF EXISTS corte_caja_rci07_congelado ON corte_caja_rci07';
    EXECUTE 'CREATE TRIGGER corte_caja_rci07_congelado BEFORE INSERT OR UPDATE OR DELETE ON corte_caja_rci07
             FOR EACH ROW EXECUTE FUNCTION bloquear_detalle_documento_fin()';
END $$;

CREATE OR REPLACE FUNCTION saldo_inicial_corte(p_sucursal bigint, p_fecha date)
RETURNS numeric LANGUAGE sql STABLE SET search_path = traza AS $$
    SELECT COALESCE(
      (SELECT c.efectivo_contado
         FROM corte_caja_rci07 c
         JOIN v_documento_financiero d ON d.id = c.documento_id
        WHERE c.sucursal_id = p_sucursal
          AND c.fecha_corte < p_fecha
          AND d.estado = 'FIRMADO'
          AND c.efectivo_contado IS NOT NULL
        ORDER BY c.fecha_corte DESC
        LIMIT 1), 0)
$$;

CREATE OR REPLACE FUNCTION folios_sin_firmar_del_dia(p_sucursal bigint, p_fecha date)
RETURNS TABLE (folio text, tipo_codigo text, estado text)
LANGUAGE sql STABLE SET search_path = traza AS $$
    SELECT d.folio, d.tipo_codigo, d.estado
      FROM v_documento_financiero d
     WHERE d.sucursal_id = p_sucursal
       AND d.tipo_codigo IN ('CACM-RCI-01','CACM-RCI-04','CACM-RCI-05')
       AND d.estado IN ('BORRADOR','PENDIENTE_DE_FIRMA')
       AND d.creado_en::date = p_fecha
     ORDER BY d.tipo_codigo, d.consecutivo
$$;

CREATE OR REPLACE FUNCTION armar_corte_caja(p_documento bigint, p_usuario bigint)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_sucursal bigint;
    v_fecha    date;
    v_ingresos numeric(18,2) := 0;
    v_egresos  numeric(18,2) := 0;
BEGIN
    SELECT sucursal_id, fecha_corte INTO v_sucursal, v_fecha
      FROM corte_caja_rci07 WHERE documento_id = p_documento;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El corte de caja no existe';
    END IF;
    IF estado_documento_fin(p_documento) <> 'BORRADOR' THEN
        RAISE EXCEPTION 'Solo se arma un corte que sigue en borrador';
    END IF;

    DELETE FROM corte_caja_detalle WHERE corte_documento_id = p_documento;

    
    
    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'VENTAS_CONTADO', r.importe_total
      FROM recibo_caja_rci01 r
      JOIN v_documento_financiero d ON d.id = r.documento_id
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND r.fecha_hora_cobro::date = v_fecha;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'UTILIDAD_CONSIGNA', l.utilidad_neta
      FROM liquidacion_consigna_rci03 l
      JOIN v_documento_financiero d ON d.id = l.documento_id
      JOIN forma_pago_fin f ON f.codigo = l.forma_ingreso_tesoreria
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND f.afecta_caja_fisica AND l.utilidad_neta > 0
       AND d.creado_en::date = v_fecha;

    INSERT INTO corte_caja_detalle (corte_documento_id, origen_documento_id, naturaleza, concepto_grupo, importe)
    SELECT p_documento, d.id, 'INGRESO', 'SERVICIO', s.importe_total
      FROM ingreso_servicio_rci04 s
      JOIN v_documento_financiero d ON d.id = s.documento_id
      JOIN forma_pago_fin f ON f.codigo = s.forma_pago
     WHERE d.sucursal_id = v_sucursal AND d.estado = 'FIRMADO'
       AND f.afecta_caja_fisica
       AND s.fecha_hora_cobro::date = v_fecha;

    
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
       AND v.fecha_hora::date = v_fecha;

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
           armado_en      = clock_timestamp()
     WHERE documento_id = p_documento;
END $$;

CREATE OR REPLACE FUNCTION cerrar_corte_caja(
    p_documento bigint,
    p_efectivo_contado numeric,
    p_usuario bigint,
    p_explicacion text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_sucursal   bigint;
    v_fecha      date;
    v_pendientes text;
    v_diferencia numeric(18,2);
BEGIN
    SELECT sucursal_id, fecha_corte INTO v_sucursal, v_fecha
      FROM corte_caja_rci07 WHERE documento_id = p_documento;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El corte de caja no existe';
    END IF;

    
    CASE estado_documento_fin(p_documento)
        WHEN 'BORRADOR' THEN NULL;
        WHEN 'PENDIENTE_DE_FIRMA' THEN
            RAISE EXCEPTION 'Este corte ya fue cerrado y esta esperando firmas; para rehacer el arqueo regresalo a borrador';
        WHEN 'FIRMADO' THEN
            RAISE EXCEPTION 'El corte del dia ya esta firmado; una correccion exige un corte complementario';
        ELSE
            RAISE EXCEPTION 'El corte esta cancelado y ya no puede cerrarse';
    END CASE;

    SELECT string_agg(folio, ', ' ORDER BY folio) INTO v_pendientes
      FROM folios_sin_firmar_del_dia(v_sucursal, v_fecha);
    IF v_pendientes IS NOT NULL THEN
        RAISE EXCEPTION 'No se puede cerrar el corte: quedan folios del dia sin firmar (%)', v_pendientes;
    END IF;

    PERFORM armar_corte_caja(p_documento, p_usuario);

    UPDATE corte_caja_rci07
       SET efectivo_contado = p_efectivo_contado,
           explicacion_diferencia = p_explicacion
     WHERE documento_id = p_documento;

    SELECT diferencia INTO v_diferencia FROM corte_caja_rci07 WHERE documento_id = p_documento;

    IF v_diferencia <> 0 AND char_length(trim(coalesce(p_explicacion, ''))) < 10 THEN
        RAISE EXCEPTION 'El arqueo no coincide con el saldo calculado (diferencia de %); explica la diferencia para poder cerrar el dia',
            to_char(v_diferencia, 'FM999,999,999.00');
    END IF;

    IF v_diferencia < 0 THEN
        INSERT INTO alerta_finanzas (tipo, severidad, sucursal_id, documento_id, mensaje)
        VALUES ('FALTANTE_DE_CAJA','GRAVE', v_sucursal, p_documento,
                format('Faltante de %s en el corte del %s. Explicacion del custodio: %s',
                       to_char(abs(v_diferencia), 'FM999,999,999.00'), v_fecha, coalesce(p_explicacion,'(sin explicacion)')));
    ELSIF v_diferencia > 0 THEN
        INSERT INTO alerta_finanzas (tipo, severidad, sucursal_id, documento_id, mensaje)
        VALUES ('DIFERENCIA_DE_CAJA','AVISO', v_sucursal, p_documento,
                format('Sobrante de %s en el corte del %s.',
                       to_char(v_diferencia, 'FM999,999,999.00'), v_fecha));
    END IF;

    PERFORM cambiar_estado_documento_fin(p_documento, 'PENDIENTE_DE_FIRMA', p_usuario);
END $$;

CREATE OR REPLACE VIEW v_corte_ubicacion_efectivo AS
SELECT c.documento_id, 'CAJA_FISICA'::text AS ubicacion, NULL::text AS institucion,
       NULL::text AS cuenta, NULL::date AS fecha, c.efectivo_contado AS monto, NULL::text AS detalle
  FROM corte_caja_rci07 c WHERE c.efectivo_contado IS NOT NULL
UNION ALL
SELECT d.corte_documento_id, 'BANCO', d.institucion, d.cuenta, d.fecha_deposito, d.monto, d.comprobante_ref
  FROM deposito_corte_rci07 d
UNION ALL
SELECT r.corte_documento_id, r.tipo, NULL, NULL, NULL, r.monto, r.detalle
  FROM resguardo_corte_rci07 r;

CREATE OR REPLACE VIEW v_anticipo_utilidades_socio AS
WITH anticipos AS (
    SELECT v.socio_usuario_id AS socio_usuario_id, sum(v.importe) AS total_anticipos
      FROM vale_egreso_rci05 v
      JOIN v_documento_financiero d ON d.id = v.documento_id
     WHERE v.concepto_codigo = 'RETIRO_UTILIDADES_SOCIO'
       AND d.estado = 'FIRMADO'
     GROUP BY v.socio_usuario_id
), repartido AS (
    SELECT rs.socio_usuario_id, sum(rs.monto_asignado) AS total_repartido
      FROM reparto_utilidades_socio rs
     GROUP BY rs.socio_usuario_id
)
SELECT u.id AS socio_usuario_id,
       u.nombre AS socio_nombre,
       COALESCE(a.total_anticipos, 0) AS total_anticipos,
       COALESCE(r.total_repartido, 0) AS total_repartido,
       COALESCE(a.total_anticipos, 0) - COALESCE(r.total_repartido, 0) AS saldo_por_comprobar
  FROM usuario u
  LEFT JOIN anticipos a ON a.socio_usuario_id = u.id
  LEFT JOIN repartido r ON r.socio_usuario_id = u.id
 WHERE a.total_anticipos IS NOT NULL OR r.total_repartido IS NOT NULL;

CREATE OR REPLACE FUNCTION avisar_retiro_socio_sin_respaldo()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_saldo numeric(18,2);
BEGIN
    IF NEW.concepto_codigo <> 'RETIRO_UTILIDADES_SOCIO' THEN
        RETURN NEW;
    END IF;
    SELECT COALESCE(total_repartido, 0) - COALESCE(total_anticipos, 0)
      INTO v_saldo
      FROM v_anticipo_utilidades_socio WHERE socio_usuario_id = NEW.socio_usuario_id;

    IF COALESCE(v_saldo, 0) < NEW.importe THEN
        INSERT INTO alerta_finanzas (tipo, severidad, documento_id, mensaje,
                                     sucursal_id)
        SELECT 'RETIRO_SOCIO_SIN_RESPALDO','AVISO', NEW.documento_id,
               format('El retiro de %s queda registrado como anticipo a cuenta de utilidades: no hay un reparto formal que lo respalde.',
                      to_char(NEW.importe, 'FM999,999,999.00')),
               d.sucursal_id
          FROM documento_financiero d WHERE d.id = NEW.documento_id;
    END IF;
    RETURN NEW;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS vale_egreso_avisa_retiro ON vale_egreso_rci05';
    EXECUTE 'CREATE TRIGGER vale_egreso_avisa_retiro AFTER INSERT ON vale_egreso_rci05
             FOR EACH ROW EXECUTE FUNCTION avisar_retiro_socio_sin_respaldo()';
END $$;

CREATE OR REPLACE VIEW v_custodia_pendiente AS
SELECT d.id AS documento_id, d.folio, d.folio_completo, d.tipo_codigo,
       d.sucursal_id, d.sucursal_clave, d.estado,
       COALESCE(r.importe_total, s.importe_total) AS importe,
       COALESCE(r.fecha_hora_cobro, s.fecha_hora_cobro) AS fecha_hora_cobro,
       EXISTS (SELECT 1 FROM firma_documento_financiero f
                WHERE f.documento_id = d.id AND f.rol_firmante = 'RECIBIO_CUSTODIO') AS custodia_confirmada,
       round(extract(epoch FROM (now() - COALESCE(r.fecha_hora_cobro, s.fecha_hora_cobro))) / 3600, 1) AS horas_en_transito
  FROM v_documento_financiero d
  LEFT JOIN recibo_caja_rci01 r ON r.documento_id = d.id
  LEFT JOIN ingreso_servicio_rci04 s ON s.documento_id = d.id
 WHERE d.tipo_codigo IN ('CACM-RCI-01','CACM-RCI-04')
   AND d.estado <> 'CANCELADO'
   AND NOT EXISTS (SELECT 1 FROM firma_documento_financiero f
                    WHERE f.documento_id = d.id AND f.rol_firmante = 'RECIBIO_CUSTODIO');

COMMIT;
