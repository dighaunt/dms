-- Modulo Finanzas — sellos de tinta tokenizados.
--
-- En papel, cada accion sobre un formato se acredita con un sello de tinta:
-- RECIBIDO, AUTORIZADO, PAGADO. El sello vale porque el cuno esta bajo llave.
-- Un sello dibujado en una pantalla no tiene esa garantia: se copia con una
-- captura de pantalla. Por eso aqui cada estampado acuna un TOKEN unico e
-- irrepetible que se imprime dentro del sello y permite verificarlo contra la
-- base: quien lo recibe puede teclear el token y confirmar que ese sello
-- corresponde a ese folio, esa accion, esa persona y esa hora.
--
-- El token se escribe en base32 de Crockford (sin I, L, O ni U) para que nadie
-- confunda un uno con una ele al transcribirlo del papel, y lleva un digito
-- verificador que detecta el error de captura antes de ir a la base.
BEGIN;

SET search_path TO traza;

-- ===== CATALOGO DE ACCIONES SELLABLES =====
-- leyenda es el texto que va dentro del sello; forma y color describen el cuno
-- para que el PDF y la pantalla dibujen siempre el mismo sello para la misma
-- accion, igual que un cuno fisico no cambia de forma entre un dia y otro.
CREATE TABLE IF NOT EXISTS accion_sellable (
    codigo   text PRIMARY KEY CHECK (codigo ~ '^[A-Z_]{3,40}$'),
    leyenda  text NOT NULL CHECK (char_length(trim(leyenda)) BETWEEN 3 AND 40),
    forma    text NOT NULL DEFAULT 'CIRCULAR' CHECK (forma IN ('CIRCULAR','RECTANGULAR')),
    color    text NOT NULL DEFAULT 'AZUL' CHECK (color IN ('AZUL','ROJO','NEGRO','VERDE')),
    orden    smallint NOT NULL UNIQUE
);

INSERT INTO accion_sellable (codigo, leyenda, forma, color, orden) VALUES
 ('FOLIO_EMITIDO',       'FOLIO EMITIDO',       'RECTANGULAR','NEGRO', 1),
 ('ENTREGA_DECLARADA',   'ENTREGADO',           'CIRCULAR',   'AZUL',  2),
 ('CUSTODIA_CONFIRMADA', 'RECIBIDO EN CUSTODIA','CIRCULAR',   'AZUL',  3),
 ('AUTORIZADO',          'AUTORIZADO',          'CIRCULAR',   'VERDE', 4),
 ('PAGO_ENTREGADO',      'PAGADO',              'CIRCULAR',   'VERDE', 5),
 ('RECIBIDO_CONFORME',   'RECIBI CONFORME',     'CIRCULAR',   'AZUL',  6),
 ('INVENTARIO_RECIBIDO', 'RECIBIDO EN PISO',    'CIRCULAR',   'AZUL',  7),
 ('LIQUIDADO',           'LIQUIDADO',           'CIRCULAR',   'VERDE', 8),
 ('TESTIGO_PRESENCIAL',  'TESTIGO',             'RECTANGULAR','NEGRO', 9),
 ('DOCUMENTO_FIRMADO',   'FIRMADO',             'CIRCULAR',   'VERDE',10),
 ('CORTE_CERRADO',       'CORTE CERRADO',       'RECTANGULAR','AZUL', 11),
 ('FOLIO_CANCELADO',     'CANCELADO',           'RECTANGULAR','ROJO', 12),
 ('COMPLEMENTADO',       'COMPLEMENTADO',       'RECTANGULAR','ROJO', 13)
ON CONFLICT (codigo) DO NOTHING;

-- Cada rol firmante estampa el sello que le corresponde. Se guarda como dato y
-- no como if-else en la aplicacion: dar de alta un firmante nuevo no deberia
-- exigir tocar codigo.
ALTER TABLE rol_firmante
    ADD COLUMN IF NOT EXISTS accion_codigo text REFERENCES accion_sellable(codigo);

UPDATE rol_firmante SET accion_codigo = v.accion
  FROM (VALUES
    ('ENTREGO_VENDEDOR',    'ENTREGA_DECLARADA'),
    ('ENTREGO_ASESOR',      'ENTREGA_DECLARADA'),
    ('RECIBIO_CUSTODIO',    'CUSTODIA_CONFIRMADA'),
    ('ENTREGO_PROPIETARIO', 'ENTREGA_DECLARADA'),
    ('RECIBIO_INVENTARIO',  'INVENTARIO_RECIBIDO'),
    ('CONSIGNANTE_RECIBE',  'RECIBIDO_CONFORME'),
    ('CUSTODIO_CALCULO',    'LIQUIDADO'),
    ('AUTORIZO_GERENTE',    'AUTORIZADO'),
    ('ENTREGO_CUSTODIO',    'PAGO_ENTREGADO'),
    ('RECIBIO_BENEFICIARIO','RECIBIDO_CONFORME'),
    ('RECIBIO_TRABAJADOR',  'RECIBIDO_CONFORME'),
    ('ENTREGO_RH',          'PAGO_ENTREGADO'),
    ('ELABORO_CUSTODIO',    'CORTE_CERRADO'),
    ('REVISO_GERENTE',      'AUTORIZADO'),
    ('ENTERADO_SOCIO',      'RECIBIDO_CONFORME'),
    ('TESTIGO',             'TESTIGO_PRESENCIAL')
  ) AS v(rol, accion)
 WHERE rol_firmante.codigo = v.rol
   AND rol_firmante.accion_codigo IS DISTINCT FROM v.accion;

-- ===== SELLOS ESTAMPADOS =====
CREATE TABLE IF NOT EXISTS sello_accion (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id   bigint NOT NULL REFERENCES documento_financiero(id),
    accion_codigo  text NOT NULL REFERENCES accion_sellable(codigo),
    rol_firmante   text REFERENCES rol_firmante(codigo),
    token          text NOT NULL UNIQUE
                   CHECK (token ~ '^CACM-[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}-[0-9A-HJ-KMNP-TV-Z]{4}$'),
    hash_contenido char(64) NOT NULL CHECK (hash_contenido ~ '^[0-9a-f]{64}$'),
    estampado_por  bigint NOT NULL REFERENCES usuario(id),
    estampado_en   timestamptz NOT NULL DEFAULT clock_timestamp(),
    -- Un mismo cuno no se estampa dos veces por la misma via en el mismo folio.
    -- NULLS NOT DISTINCT hace que la accion sin rol firmante (por ejemplo
    -- FOLIO_CANCELADO) tambien quede limitada a una sola ocurrencia.
    UNIQUE NULLS NOT DISTINCT (documento_id, accion_codigo, rol_firmante)
);
CREATE INDEX IF NOT EXISTS sello_accion_documento_idx ON sello_accion (documento_id, estampado_en);

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS sello_accion_inmutable ON sello_accion';
    EXECUTE 'CREATE TRIGGER sello_accion_inmutable BEFORE UPDATE OR DELETE ON sello_accion
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
END $$;

-- ===== ACUNADO DEL TOKEN =====
-- 11 caracteres aleatorios de 55 bits de entropia mas un digito verificador.
-- No es un secreto: es un identificador irrepetible y transcribible.
CREATE OR REPLACE FUNCTION acunar_token_sello()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = traza AS $$
DECLARE
    v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    v_cuerpo text := '';
    v_suma   integer := 0;
    v_pos    integer;
    i        integer;
BEGIN
    FOR i IN 1..11 LOOP
        -- get_byte devuelve 0..255; el modulo 32 sesgaria muy levemente el
        -- reparto, irrelevante para un identificador que no es una llave.
        v_pos := (get_byte(public.gen_random_bytes(1), 0) % 32);
        v_cuerpo := v_cuerpo || substr(v_alfabeto, v_pos + 1, 1);
        -- Ponderar por posicion hace que un par de caracteres transpuestos
        -- —el error de transcripcion mas comun— cambie el verificador.
        v_suma := v_suma + v_pos * i;
    END LOOP;
    v_cuerpo := v_cuerpo || substr(v_alfabeto, (v_suma % 32) + 1, 1);
    RETURN 'CACM-' || substr(v_cuerpo,1,4) || '-' || substr(v_cuerpo,5,4) || '-' || substr(v_cuerpo,9,4);
END $$;

-- Recalcula el verificador de un token tecleado. Devuelve false si el formato
-- no cuadra, sin tocar la base: filtra el error de captura antes de consultar.
CREATE OR REPLACE FUNCTION token_sello_bien_formado(p_token text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = traza AS $$
DECLARE
    v_alfabeto constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    v_limpio text;
    v_suma   integer := 0;
    v_pos    integer;
    i        integer;
BEGIN
    IF p_token IS NULL THEN RETURN false; END IF;
    v_limpio := upper(replace(replace(p_token, '-', ''), ' ', ''));
    IF v_limpio !~ '^CACM[0-9A-HJ-KMNP-TV-Z]{12}$' THEN RETURN false; END IF;
    v_limpio := substr(v_limpio, 5);
    FOR i IN 1..11 LOOP
        v_pos := position(substr(v_limpio, i, 1) IN v_alfabeto) - 1;
        IF v_pos < 0 THEN RETURN false; END IF;
        v_suma := v_suma + v_pos * i;
    END LOOP;
    RETURN substr(v_limpio, 12, 1) = substr(v_alfabeto, (v_suma % 32) + 1, 1);
END $$;

-- ===== ESTAMPADO =====
-- El sello no se inserta a mano desde ninguna ruta: se acuna aqui, junto al
-- hecho que acredita, y queda inmutable.
CREATE OR REPLACE FUNCTION estampar_sello(
    p_documento bigint,
    p_accion text,
    p_usuario bigint,
    p_hash_contenido text,
    p_rol_firmante text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_token text;
    v_intento integer := 0;
BEGIN
    LOOP
        v_intento := v_intento + 1;
        v_token := acunar_token_sello();
        BEGIN
            INSERT INTO sello_accion
                (documento_id, accion_codigo, rol_firmante, token, hash_contenido, estampado_por)
            VALUES (p_documento, p_accion, p_rol_firmante, v_token, lower(p_hash_contenido), p_usuario);
            RETURN v_token;
        EXCEPTION WHEN unique_violation THEN
            -- Puede ser choque de token (astronomicamente raro) o intento de
            -- repetir el mismo cuno en el mismo folio (un error real).
            IF EXISTS (SELECT 1 FROM sello_accion
                        WHERE documento_id = p_documento
                          AND accion_codigo = p_accion
                          AND rol_firmante IS NOT DISTINCT FROM p_rol_firmante) THEN
                RAISE EXCEPTION 'Ese sello ya fue estampado en este folio';
            END IF;
            IF v_intento >= 5 THEN
                RAISE EXCEPTION 'No fue posible acunar un token de sello; reintenta la operacion';
            END IF;
        END;
    END LOOP;
END $$;

-- ===== VERIFICACION PUBLICA =====
-- Lo que devuelve es deliberadamente escueto: acredita el hecho sin exponer
-- importes ni datos personales a quien solo tecleo un token.
CREATE OR REPLACE VIEW v_sello_verificacion AS
SELECT s.token,
       s.accion_codigo,
       a.leyenda,
       a.forma,
       a.color,
       s.rol_firmante,
       rf.etiqueta      AS rol_etiqueta,
       d.folio,
       d.folio_completo,
       d.tipo_codigo,
       d.nombre_tipo,
       d.sucursal_clave,
       d.estado         AS estado_documento,
       u.nombre         AS estampado_por_nombre,
       s.estampado_en,
       s.hash_contenido
  FROM sello_accion s
  JOIN accion_sellable a ON a.codigo = s.accion_codigo
  JOIN v_documento_financiero d ON d.id = s.documento_id
  JOIN usuario u ON u.id = s.estampado_por
  LEFT JOIN rol_firmante rf ON rf.codigo = s.rol_firmante;

-- ===== LA FIRMA ESTAMPA SU SELLO =====
-- Se resuelve con un disparador sobre la tabla de firmas y no dentro de cada
-- funcion de firma: asi da igual si la rubrica fue de un usuario interno con
-- PIN o de un tercero atestiguado, y no puede existir una firma sin su cuno.
-- Para una firma presencial, quien queda asentado como estampador es el
-- usuario interno que la atestiguo, que es quien responde por el acto.
CREATE OR REPLACE FUNCTION estampar_sello_por_firma()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_accion text;
BEGIN
    SELECT accion_codigo INTO v_accion FROM rol_firmante WHERE codigo = NEW.rol_firmante;
    IF v_accion IS NOT NULL THEN
        PERFORM estampar_sello(
            NEW.documento_id, v_accion,
            COALESCE(NEW.usuario_id, NEW.atestiguado_por),
            NEW.hash_contenido, NEW.rol_firmante);
    END IF;
    RETURN NEW;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS firma_estampa_sello ON firma_documento_financiero';
    EXECUTE 'CREATE TRIGGER firma_estampa_sello AFTER INSERT ON firma_documento_financiero
             FOR EACH ROW EXECUTE FUNCTION estampar_sello_por_firma()';
END $$;

-- El cierre del documento agrega el cuno de FIRMADO sobre el conjunto.
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
        INSERT INTO documento_financiero_estado_hist (documento_id, estado, registrado_por)
            VALUES (p_documento, 'FIRMADO', p_usuario);
        PERFORM estampar_sello(p_documento, 'DOCUMENTO_FIRMADO', p_usuario, p_hash_contenido);
        RETURN 'FIRMADO';
    END IF;
    RETURN 'PENDIENTE_DE_FIRMA';
END $$;

-- La cancelacion de un folio tambien deja su cuno: un folio anulado tiene que
-- verse anulado, no simplemente desaparecer de los listados.
CREATE OR REPLACE FUNCTION cambiar_estado_documento_fin(
    p_documento bigint,
    p_hacia text,
    p_usuario bigint,
    p_motivo text DEFAULT NULL
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

    INSERT INTO documento_financiero_estado_hist (documento_id, estado, motivo, registrado_por)
        VALUES (p_documento, p_hacia, p_motivo, p_usuario);

    IF p_hacia = 'CANCELADO' THEN
        PERFORM estampar_sello(p_documento, 'FOLIO_CANCELADO', p_usuario,
                               encode(public.digest(coalesce(p_motivo,''), 'sha256'), 'hex'));
    END IF;
END $$;

COMMIT;
