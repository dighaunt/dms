-- Modulo Finanzas — base comun de los 7 formatos CACM-RCI-01..07.
--
-- Los formatos de papel comparten cuatro cosas: la sucursal que los emite, un
-- folio consecutivo sin huecos, un recorrido de estados que termina en firmado
-- e inalterable, y un juego de firmantes que no pueden ser la misma persona.
-- Esta migracion modela ESO y nada mas; el contenido propio de cada formato
-- vive en su tabla de detalle (migracion siguiente).
--
-- Decisiones que conviene no re-discutir al leer el codigo:
--  * El folio se entrega al CREAR el documento, no al firmarlo, porque quien
--    captura necesita citarlo. Para que no queden huecos, un borrador que se
--    abandona se CANCELA con motivo: el folio queda ocupado y explicado, igual
--    que una forma de papel inutilizada que se archiva en vez de tirarse.
--  * El estado no se guarda como columna mutable sino como historial
--    append-only, siguiendo el patron que ya usa unidad_estado_hist.
--  * El PIN se verifica DENTRO de la funcion SQL con pgcrypto. Si la
--    comprobacion viviera en la aplicacion, cualquier ruta que olvidara
--    llamarla podria dar por transferida una custodia que nadie confirmo.
BEGIN;

-- pgcrypto queda en public y sus llamadas se escriben calificadas: las
-- funciones de este modulo fijan search_path = traza, asi que un crypt() sin
-- esquema no seria visible desde dentro de ellas.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

SET search_path TO traza;

-- ===== SUCURSAL =====
-- Cada formato de papel abre con "Sucursal / Agencia". El folio es consecutivo
-- POR SUCURSAL Y POR TIPO, asi que la sucursal no es un adorno del encabezado:
-- es parte de la identidad del documento.
CREATE TABLE IF NOT EXISTS sucursal (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    clave      text NOT NULL UNIQUE CHECK (clave ~ '^[A-Z0-9]{2,8}$'),
    nombre     text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 3 AND 120),
    activa     boolean NOT NULL DEFAULT true,
    creada_por bigint NOT NULL REFERENCES usuario(id),
    creada_en  timestamptz NOT NULL DEFAULT now()
);

-- ===== EMPLEADO =====
-- El trabajador que cobra un recibo de nomina (RCI-06) no es necesariamente un
-- usuario del sistema, y el numero de empleado aparece en RCI-01 y RCI-04.
-- Por eso el catalogo de personal es independiente del de usuarios y solo se
-- enlaza a uno cuando esa persona ademas opera el sistema.
CREATE TABLE IF NOT EXISTS empleado (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    num_empleado  text NOT NULL CHECK (char_length(trim(num_empleado)) BETWEEN 1 AND 20),
    nombre        text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 3 AND 160),
    puesto        text,
    sucursal_id   bigint NOT NULL REFERENCES sucursal(id),
    usuario_id    bigint UNIQUE REFERENCES usuario(id),
    activo        boolean NOT NULL DEFAULT true,
    creado_por    bigint NOT NULL REFERENCES usuario(id),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sucursal_id, num_empleado)
);

-- ===== CATALOGO DE FORMATOS =====
CREATE TABLE IF NOT EXISTS tipo_documento_financiero (
    codigo       text PRIMARY KEY CHECK (codigo ~ '^CACM-RCI-0[1-7]$'),
    nombre       text NOT NULL UNIQUE,
    departamento text NOT NULL,
    revision     text NOT NULL
);

INSERT INTO tipo_documento_financiero (codigo, nombre, departamento, revision) VALUES
 ('CACM-RCI-01','Recibo de Caja Interno','Tesoreria / Control Interno','07/2026'),
 ('CACM-RCI-02','Ingreso de Vehiculo a Inventario','Inventario / Piso de Venta','07/2026'),
 ('CACM-RCI-03','Liquidacion de Venta en Consignacion','Tesoreria / Control Interno','07/2026'),
 ('CACM-RCI-04','Recibo de Ingreso por Servicio','Servicio / Taller','07/2026'),
 ('CACM-RCI-05','Vale de Egreso de Caja','Tesoreria / Control Interno','07/2026'),
 ('CACM-RCI-06','Recibo de Pago de Nomina','Recursos Humanos / Nomina','07/2026'),
 ('CACM-RCI-07','Corte de Caja Diario','Tesoreria / Control Interno','07/2026')
ON CONFLICT (codigo) DO NOTHING;

-- ===== MAQUINA DE ESTADOS =====
-- borrador -> pendiente_de_firma -> firmado (inmutable)
-- Cualquiera de los dos primeros puede terminar en cancelado; firmado no.
CREATE TABLE IF NOT EXISTS estado_documento_financiero (
    codigo text PRIMARY KEY,
    orden  smallint NOT NULL UNIQUE
);
INSERT INTO estado_documento_financiero (codigo, orden) VALUES
 ('BORRADOR',1),('PENDIENTE_DE_FIRMA',2),('FIRMADO',3),('CANCELADO',4)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS transicion_documento_financiero (
    desde text NOT NULL REFERENCES estado_documento_financiero(codigo),
    hacia text NOT NULL REFERENCES estado_documento_financiero(codigo),
    PRIMARY KEY (desde, hacia),
    CHECK (desde <> hacia)
);
INSERT INTO transicion_documento_financiero (desde, hacia) VALUES
 ('BORRADOR','PENDIENTE_DE_FIRMA'),
 ('PENDIENTE_DE_FIRMA','BORRADOR'),     -- se detecta un error antes de firmar
 ('PENDIENTE_DE_FIRMA','FIRMADO'),
 ('BORRADOR','CANCELADO'),
 ('PENDIENTE_DE_FIRMA','CANCELADO')
ON CONFLICT (desde, hacia) DO NOTHING;

-- ===== DOCUMENTO FINANCIERO =====
-- Fila append-only: ni el folio ni la sucursal ni el tipo cambian jamas.
-- "complementa_a" implementa la correccion sin tachaduras: un documento nuevo,
-- con su propio folio, que apunta al original firmado.
CREATE TABLE IF NOT EXISTS documento_financiero (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_codigo   text NOT NULL REFERENCES tipo_documento_financiero(codigo),
    sucursal_id   bigint NOT NULL REFERENCES sucursal(id),
    consecutivo   integer NOT NULL CHECK (consecutivo >= 1),
    complementa_a bigint REFERENCES documento_financiero(id),
    creado_por    bigint NOT NULL REFERENCES usuario(id),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tipo_codigo, sucursal_id, consecutivo),
    -- Un original se complementa una sola vez. Una correccion de la correccion
    -- encadena (C -> B -> A); lo que se impide es abrir dos ramas sobre A.
    UNIQUE (complementa_a),
    -- Clave candidata redundante a proposito: permite que cada tabla de detalle
    -- referencie (documento_id, tipo_codigo) y quede impedido, por la propia
    -- llave foranea, colgar un detalle de RCI-05 de un documento RCI-01.
    UNIQUE (id, tipo_codigo),
    -- Misma tecnica para la sucursal: el corte de caja necesita declararla para
    -- poder exigir "un solo corte por sucursal y fecha", y esta llave impide
    -- que la sucursal del detalle se separe de la del folio.
    UNIQUE (id, sucursal_id)
);
CREATE INDEX IF NOT EXISTS documento_financiero_sucursal_idx
    ON documento_financiero (sucursal_id, tipo_codigo, creado_en);

CREATE TABLE IF NOT EXISTS documento_financiero_estado_hist (
    documento_id   bigint NOT NULL REFERENCES documento_financiero(id),
    -- clock_timestamp(), no now(): now() devuelve la hora de INICIO de la
    -- transaccion, asi que emitir el folio y mandarlo a firma en una sola
    -- transaccion produciria dos filas con el mismo instante y chocarian en la
    -- llave primaria. El reloj de pared tambien describe mejor un hecho.
    ocurrido_en    timestamptz NOT NULL DEFAULT clock_timestamp(),
    estado         text NOT NULL REFERENCES estado_documento_financiero(codigo),
    motivo         text,
    registrado_por bigint NOT NULL REFERENCES usuario(id),
    PRIMARY KEY (documento_id, ocurrido_en)
);

CREATE TABLE IF NOT EXISTS contador_folio_financiero (
    tipo_codigo text NOT NULL REFERENCES tipo_documento_financiero(codigo),
    sucursal_id bigint NOT NULL REFERENCES sucursal(id),
    ultimo      integer NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
    PRIMARY KEY (tipo_codigo, sucursal_id)
);

CREATE OR REPLACE VIEW v_documento_financiero_estado_actual AS
SELECT DISTINCT ON (documento_id) documento_id, estado, ocurrido_en, motivo
  FROM documento_financiero_estado_hist
 ORDER BY documento_id, ocurrido_en DESC;

-- El folio impreso es el del papel (CACM-RCI-01-0001). Como el consecutivo
-- corre por sucursal, dos agencias pueden tener el mismo numero impreso; para
-- citarlo sin ambiguedad entre sucursales se expone ademas folio_completo.
CREATE OR REPLACE VIEW v_documento_financiero AS
SELECT d.id,
       d.tipo_codigo || '-' || lpad(d.consecutivo::text, 4, '0') AS folio,
       d.tipo_codigo || '-' || s.clave || '-' || lpad(d.consecutivo::text, 4, '0') AS folio_completo,
       d.tipo_codigo,
       t.nombre AS nombre_tipo,
       t.revision,
       d.sucursal_id,
       s.clave  AS sucursal_clave,
       s.nombre AS sucursal_nombre,
       d.consecutivo,
       e.estado,
       e.ocurrido_en AS estado_desde,
       e.motivo      AS estado_motivo,
       d.complementa_a,
       (SELECT c.id FROM documento_financiero c WHERE c.complementa_a = d.id) AS complementado_por,
       d.creado_por,
       d.creado_en
  FROM documento_financiero d
  JOIN tipo_documento_financiero t ON t.codigo = d.tipo_codigo
  JOIN sucursal s ON s.id = d.sucursal_id
  LEFT JOIN v_documento_financiero_estado_actual e ON e.documento_id = d.id;

-- ===== FIRMAS =====
-- Cada formato declara sus firmantes. El catalogo permite validar "estan todas
-- las firmas obligatorias" sin codificar los roles en la aplicacion.
-- exige_usuario_interno separa dos mundos que el papel no distingue porque
-- ahi todos firman con pluma. En digital si importa: el custodio, el gerente o
-- el responsable de inventario son personal de la empresa y firman con su
-- usuario y su PIN; el consignante, el trabajador o el proveedor que cobra son
-- terceros que no tienen —ni deben tener— cuenta en el sistema. Para ellos la
-- firma se levanta de forma presencial y queda atestiguada por un usuario
-- interno, que si pone su PIN. Sin esta distincion no habria manera de pagarle
-- a un proveedor.
CREATE TABLE IF NOT EXISTS rol_firmante (
    codigo                text PRIMARY KEY,
    etiqueta              text NOT NULL,
    exige_usuario_interno boolean NOT NULL DEFAULT true
);
INSERT INTO rol_firmante (codigo, etiqueta, exige_usuario_interno) VALUES
 ('ENTREGO_VENDEDOR',    'Entrego — Vendedor',                      true),
 ('ENTREGO_ASESOR',      'Entrego — Asesor / Cajero de servicio',    true),
 ('RECIBIO_CUSTODIO',    'Recibio — Custodio Financiero',            true),
 ('ENTREGO_PROPIETARIO', 'Entrego — Propietario / Consignante',      false),
 ('RECIBIO_INVENTARIO',  'Recibio — Responsable de inventario',      true),
 ('CONSIGNANTE_RECIBE',  'Consignante — Recibe liquidacion',         false),
 ('CUSTODIO_CALCULO',    'Custodio Financiero — Calculo y entrego',  true),
 ('AUTORIZO_GERENTE',    'Autorizo — Gerente General / Socio',       true),
 ('ENTREGO_CUSTODIO',    'Entrego — Custodio Financiero',            true),
 ('RECIBIO_BENEFICIARIO','Recibio — Beneficiario del pago',          false),
 ('RECIBIO_TRABAJADOR',  'Recibi conforme — Trabajador',             false),
 ('ENTREGO_RH',          'Entrego — Custodio Financiero / RH',       true),
 ('ELABORO_CUSTODIO',    'Elaboro — Custodio Financiero',            true),
 ('REVISO_GERENTE',      'Reviso y autorizo — Gerente General',      true),
 ('ENTERADO_SOCIO',      'Socio / Propietario — Enterado',           true),
 ('TESTIGO',             'Testigo',                                  false)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS firma_requerida (
    tipo_codigo   text NOT NULL REFERENCES tipo_documento_financiero(codigo),
    rol_firmante  text NOT NULL REFERENCES rol_firmante(codigo),
    obligatoria   boolean NOT NULL DEFAULT true,
    orden         smallint NOT NULL,
    PRIMARY KEY (tipo_codigo, rol_firmante),
    UNIQUE (tipo_codigo, orden)
);

INSERT INTO firma_requerida (tipo_codigo, rol_firmante, obligatoria, orden) VALUES
 ('CACM-RCI-01','ENTREGO_VENDEDOR',    true, 1),
 ('CACM-RCI-01','RECIBIO_CUSTODIO',    true, 2),
 ('CACM-RCI-01','TESTIGO',             false,3),
 ('CACM-RCI-02','ENTREGO_PROPIETARIO', true, 1),
 ('CACM-RCI-02','RECIBIO_INVENTARIO',  true, 2),
 ('CACM-RCI-02','AUTORIZO_GERENTE',    true, 3),
 ('CACM-RCI-03','CONSIGNANTE_RECIBE',  true, 1),
 ('CACM-RCI-03','CUSTODIO_CALCULO',    true, 2),
 ('CACM-RCI-03','AUTORIZO_GERENTE',    true, 3),
 ('CACM-RCI-04','ENTREGO_ASESOR',      true, 1),
 ('CACM-RCI-04','RECIBIO_CUSTODIO',    true, 2),
 ('CACM-RCI-04','TESTIGO',             false,3),
 -- Los tres firmantes del vale son la regla 4: autorizo + entrego + recibio.
 ('CACM-RCI-05','AUTORIZO_GERENTE',    true, 1),
 ('CACM-RCI-05','ENTREGO_CUSTODIO',    true, 2),
 ('CACM-RCI-05','RECIBIO_BENEFICIARIO',true, 3),
 ('CACM-RCI-06','RECIBIO_TRABAJADOR',  true, 1),
 ('CACM-RCI-06','ENTREGO_RH',          true, 2),
 ('CACM-RCI-06','TESTIGO',             false,3),
 ('CACM-RCI-07','ELABORO_CUSTODIO',    true, 1),
 ('CACM-RCI-07','REVISO_GERENTE',      true, 2),
 ('CACM-RCI-07','ENTERADO_SOCIO',      false,3)
ON CONFLICT (tipo_codigo, rol_firmante) DO NOTHING;

-- PIN de firma. Se guarda solo el hash bcrypt; el PIN en claro no toca la base.
CREATE TABLE IF NOT EXISTS usuario_pin (
    usuario_id     bigint PRIMARY KEY REFERENCES usuario(id),
    pin_hash       text NOT NULL,
    actualizado_en timestamptz NOT NULL DEFAULT now()
);

-- Una firma por rol. La segregacion de funciones —un usuario no ocupa dos
-- roles del mismo documento— se impone con un indice unico PARCIAL, porque
-- solo aplica a los firmantes internos: dos terceros distintos si pueden
-- firmar el mismo documento sin tener cuenta.
CREATE TABLE IF NOT EXISTS firma_documento_financiero (
    documento_id    bigint NOT NULL REFERENCES documento_financiero(id),
    rol_firmante    text NOT NULL REFERENCES rol_firmante(codigo),
    metodo          text NOT NULL DEFAULT 'PIN_USUARIO'
                    CHECK (metodo IN ('PIN_USUARIO','AUTOGRAFA_PRESENCIAL')),
    -- Firmante interno: su propio usuario, validado con su PIN.
    usuario_id      bigint REFERENCES usuario(id),
    -- Firmante externo: se identifica con documento oficial y su rubrica queda
    -- levantada de forma presencial por un usuario interno que la atestigua.
    firmante_nombre     text,
    firmante_id_tipo    text,
    firmante_id_numero  text,
    atestiguado_por     bigint REFERENCES usuario(id),
    trazo_ruta          text,
    firmado_en      timestamptz NOT NULL DEFAULT clock_timestamp(),
    hash_contenido  char(64) NOT NULL CHECK (hash_contenido ~ '^[0-9a-f]{64}$'),
    origen_sesion   text,
    PRIMARY KEY (documento_id, rol_firmante),
    CHECK (
        (metodo = 'PIN_USUARIO'
         AND usuario_id IS NOT NULL
         AND atestiguado_por IS NULL AND firmante_nombre IS NULL)
        OR
        (metodo = 'AUTOGRAFA_PRESENCIAL'
         AND usuario_id IS NULL
         AND atestiguado_por IS NOT NULL
         AND char_length(trim(coalesce(firmante_nombre,''))) BETWEEN 3 AND 200
         AND char_length(trim(coalesce(firmante_id_tipo,''))) >= 2
         AND char_length(trim(coalesce(firmante_id_numero,''))) >= 3)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS firma_documento_financiero_un_rol_por_usuario
    ON firma_documento_financiero (documento_id, usuario_id)
    WHERE usuario_id IS NOT NULL;

-- ===== INMUTABILIDAD =====
DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS documento_financiero_inmutable ON documento_financiero';
    EXECUTE 'CREATE TRIGGER documento_financiero_inmutable BEFORE UPDATE OR DELETE ON documento_financiero
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
    EXECUTE 'DROP TRIGGER IF EXISTS documento_financiero_estado_hist_inmutable ON documento_financiero_estado_hist';
    EXECUTE 'CREATE TRIGGER documento_financiero_estado_hist_inmutable BEFORE UPDATE OR DELETE ON documento_financiero_estado_hist
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
    EXECUTE 'DROP TRIGGER IF EXISTS firma_documento_financiero_inmutable ON firma_documento_financiero';
    EXECUTE 'CREATE TRIGGER firma_documento_financiero_inmutable BEFORE UPDATE OR DELETE ON firma_documento_financiero
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
END $$;

-- ===== FUNCIONES TRANSACCIONALES =====

-- Estado vigente de un documento financiero. Se usa en todos los candados.
CREATE OR REPLACE FUNCTION estado_documento_fin(p_documento bigint)
RETURNS text LANGUAGE sql STABLE SET search_path = traza AS $$
    SELECT estado FROM documento_financiero_estado_hist
     WHERE documento_id = p_documento
     ORDER BY ocurrido_en DESC LIMIT 1
$$;

-- Emite el folio consecutivo por (tipo, sucursal). El UPDATE del contador
-- serializa a los emisores simultaneos: dos capturas a la vez no pueden
-- obtener el mismo numero ni saltarse uno.
CREATE OR REPLACE FUNCTION emitir_folio_financiero(
    p_tipo text,
    p_sucursal bigint,
    p_usuario bigint,
    p_complementa_a bigint DEFAULT NULL
) RETURNS documento_financiero LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_num integer;
    v_row documento_financiero;
    v_orig documento_financiero;
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

    INSERT INTO documento_financiero_estado_hist (documento_id, estado, registrado_por)
        VALUES (v_row.id, 'BORRADOR', p_usuario);

    RETURN v_row;
END $$;

-- Cambio de estado con validacion de transicion. El paso a FIRMADO no se pide
-- desde fuera: lo decide firmar_documento_financiero cuando ya no falta firma.
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
END $$;

-- Alta o cambio de PIN. El PIN nunca se guarda en claro.
CREATE OR REPLACE FUNCTION establecer_pin_firma(p_usuario bigint, p_pin text)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF p_pin !~ '^[0-9]{6,12}$' THEN
        RAISE EXCEPTION 'El PIN de firma debe tener entre 6 y 12 digitos';
    END IF;
    INSERT INTO usuario_pin (usuario_id, pin_hash)
        VALUES (p_usuario, public.crypt(p_pin, public.gen_salt('bf')))
    ON CONFLICT (usuario_id) DO UPDATE
        SET pin_hash = EXCLUDED.pin_hash, actualizado_en = now();
END $$;

-- Comprobaciones comunes a cualquier firma: que el documento admita firmas y
-- que el rol pertenezca a este formato. Devuelve el tipo del documento.
CREATE OR REPLACE FUNCTION validar_firma_admisible(p_documento bigint, p_rol text)
RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_estado text;
    v_tipo   text;
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

    RETURN v_tipo;
END $$;

-- El PIN se comprueba contra el hash del propio firmante: no basta con tener
-- la sesion abierta. Es lo que impide que el vendedor de por confirmada, desde
-- su propio dispositivo, una custodia que el custodio nunca acepto.
CREATE OR REPLACE FUNCTION verificar_pin(p_usuario bigint, p_pin text)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_hash text;
BEGIN
    SELECT pin_hash INTO v_hash FROM usuario_pin WHERE usuario_id = p_usuario;
    IF v_hash IS NULL THEN
        RAISE EXCEPTION 'Quien firma debe tener un PIN de firma dado de alta';
    END IF;
    IF public.crypt(coalesce(p_pin, ''), v_hash) <> v_hash THEN
        RAISE EXCEPTION 'El PIN de firma no coincide';
    END IF;
END $$;

-- Cierra el documento cuando ya no falta ninguna firma obligatoria. A partir
-- de ese punto el contenido es solo lectura.
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
        RETURN 'FIRMADO';
    END IF;
    RETURN 'PENDIENTE_DE_FIRMA';
END $$;

-- Firma de un integrante de la empresa, con su usuario y su PIN.
CREATE OR REPLACE FUNCTION firmar_documento_financiero(
    p_documento bigint,
    p_rol text,
    p_usuario bigint,
    p_pin text,
    p_hash_contenido text,
    p_origen_sesion text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_tipo text;
BEGIN
    v_tipo := validar_firma_admisible(p_documento, p_rol);
    PERFORM verificar_pin(p_usuario, p_pin);

    INSERT INTO firma_documento_financiero
        (documento_id, rol_firmante, metodo, usuario_id, hash_contenido, origen_sesion)
        VALUES (p_documento, p_rol, 'PIN_USUARIO', p_usuario, lower(p_hash_contenido), p_origen_sesion);

    RETURN cerrar_si_firmas_completas(p_documento, v_tipo, p_usuario, p_hash_contenido);
END $$;

-- Firma de un tercero (consignante, trabajador, beneficiario de un pago). El
-- tercero se identifica con documento oficial y su rubrica queda levantada de
-- forma presencial; quien responde por ese acto es el usuario interno que lo
-- atestigua, y por eso es SU PIN el que se verifica.
CREATE OR REPLACE FUNCTION firmar_documento_externo(
    p_documento bigint,
    p_rol text,
    p_firmante_nombre text,
    p_firmante_id_tipo text,
    p_firmante_id_numero text,
    p_atestigua_usuario bigint,
    p_pin_atestigua text,
    p_hash_contenido text,
    p_trazo_ruta text DEFAULT NULL,
    p_origen_sesion text DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_tipo text;
    v_exige_interno boolean;
BEGIN
    v_tipo := validar_firma_admisible(p_documento, p_rol);

    SELECT exige_usuario_interno INTO v_exige_interno FROM rol_firmante WHERE codigo = p_rol;
    IF v_exige_interno THEN
        RAISE EXCEPTION 'El rol % corresponde a personal de la empresa y debe firmarse con usuario y PIN', p_rol;
    END IF;

    PERFORM verificar_pin(p_atestigua_usuario, p_pin_atestigua);

    INSERT INTO firma_documento_financiero
        (documento_id, rol_firmante, metodo, firmante_nombre, firmante_id_tipo,
         firmante_id_numero, atestiguado_por, trazo_ruta, hash_contenido, origen_sesion)
        VALUES (p_documento, p_rol, 'AUTOGRAFA_PRESENCIAL', p_firmante_nombre, p_firmante_id_tipo,
                p_firmante_id_numero, p_atestigua_usuario, p_trazo_ruta,
                lower(p_hash_contenido), p_origen_sesion);

    RETURN cerrar_si_firmas_completas(p_documento, v_tipo, p_atestigua_usuario, p_hash_contenido);
END $$;

-- Guardia reutilizable para las tablas de detalle de cada formato: una vez
-- firmado el documento, su contenido no admite un solo cambio mas.
CREATE OR REPLACE FUNCTION bloquear_detalle_documento_fin()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_documento bigint;
    v_estado text;
BEGIN
    v_documento := CASE TG_OP WHEN 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    v_estado := estado_documento_fin(v_documento);
    IF v_estado IN ('FIRMADO', 'CANCELADO') THEN
        RAISE EXCEPTION 'El documento % ya no admite cambios; para corregirlo emite un recibo complementario',
            (SELECT folio FROM v_documento_financiero WHERE id = v_documento);
    END IF;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

COMMIT;
