BEGIN;
CREATE SCHEMA IF NOT EXISTS traza;
SET search_path TO traza;

CREATE TABLE categoria_documento (
    codigo text PRIMARY KEY CHECK (codigo IN ('FORMATO','CONTRATO'))
);

CREATE TABLE etapa (
    codigo text PRIMARY KEY,
    orden  smallint NOT NULL UNIQUE CHECK (orden BETWEEN 1 AND 99)
);

CREATE TABLE tipo_documento (
    codigo    text PRIMARY KEY CHECK (codigo ~ '^[FC]-[0-9]{2}$'),
    nombre    text NOT NULL UNIQUE,
    categoria text NOT NULL REFERENCES categoria_documento(codigo),
    etapa     text NOT NULL REFERENCES etapa(codigo)
);

CREATE TABLE revision_documento (
    tipo_codigo       text NOT NULL REFERENCES tipo_documento(codigo),
    revision          text NOT NULL CHECK (revision ~ '^[0-9]+\.[0-9]+$'),
    fecha_publicacion date NOT NULL,
    PRIMARY KEY (tipo_codigo, revision),
    UNIQUE (tipo_codigo, fecha_publicacion)
);

CREATE TABLE nivel (codigo text PRIMARY KEY CHECK (codigo IN ('N1','N2','N3')));

CREATE TABLE usuario (
    id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email  text NOT NULL UNIQUE CHECK (email = lower(email)),
    nombre text NOT NULL,
    nivel  text NOT NULL REFERENCES nivel(codigo),
    activo boolean NOT NULL DEFAULT true
);

CREATE TABLE marca (
    id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre text NOT NULL UNIQUE
);

CREATE TABLE modelo (
    id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    marca_id bigint NOT NULL REFERENCES marca(id),
    nombre   text NOT NULL,
    UNIQUE (marca_id, nombre)
);

CREATE TABLE unidad (
    vin         text PRIMARY KEY CHECK (vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
    modelo_id   bigint NOT NULL REFERENCES modelo(id),
    anio_modelo smallint NOT NULL CHECK (anio_modelo BETWEEN 1980 AND 2100),
    color       text,
    num_motor   text,
    creado_por  bigint NOT NULL REFERENCES usuario(id),
    creado_en   timestamptz NOT NULL DEFAULT now()
);

-- PROPIA (contrato fuente C-03) / CONSIGNADA (C-04)
CREATE TABLE origen_unidad (
    codigo          text PRIMARY KEY CHECK (codigo IN ('PROPIA','CONSIGNADA')),
    contrato_fuente text NOT NULL UNIQUE REFERENCES tipo_documento(codigo)
);

-- «Un expediente = un VIN = un folio». Nomenclatura AAAA-### derivada en vista.
CREATE TABLE expediente (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    anio        smallint NOT NULL CHECK (anio BETWEEN 2020 AND 2100),
    consecutivo integer  NOT NULL CHECK (consecutivo >= 1),
    vin         text NOT NULL UNIQUE REFERENCES unidad(vin),
    origen      text NOT NULL REFERENCES origen_unidad(codigo),
    abierto_por bigint NOT NULL REFERENCES usuario(id),
    abierto_en  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (anio, consecutivo)
);

CREATE TABLE contador_expediente (
    anio   smallint PRIMARY KEY,
    ultimo integer NOT NULL DEFAULT 0 CHECK (ultimo >= 0)
);

CREATE TABLE contador_folio (
    tipo_codigo text NOT NULL REFERENCES tipo_documento(codigo),
    anio        smallint NOT NULL,
    ultimo      integer NOT NULL DEFAULT 0 CHECK (ultimo >= 0),
    PRIMARY KEY (tipo_codigo, anio)
);

-- FK compuesta (tipo_codigo, revision): impide revisión de otro tipo (BCNF).
CREATE TABLE documento (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo_codigo   text NOT NULL,
    revision      text NOT NULL,
    anio          smallint NOT NULL,
    consecutivo   integer  NOT NULL CHECK (consecutivo >= 1),
    expediente_id bigint NOT NULL REFERENCES expediente(id),
    emitido_por   bigint NOT NULL REFERENCES usuario(id),
    emitido_en    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tipo_codigo, anio, consecutivo),
    FOREIGN KEY (tipo_codigo, revision)
        REFERENCES revision_documento (tipo_codigo, revision)
);
CREATE INDEX documento_expediente_idx ON documento (expediente_id);

-- «CANCELADO se conserva»: 1:0..1, tabla propia.
CREATE TABLE documento_cancelacion (
    documento_id  bigint PRIMARY KEY REFERENCES documento(id),
    motivo        text NOT NULL,
    cancelado_por bigint NOT NULL REFERENCES usuario(id),
    cancelado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documento_sustitucion (
    cancelado_id bigint PRIMARY KEY REFERENCES documento_cancelacion(documento_id),
    sustituto_id bigint NOT NULL UNIQUE REFERENCES documento(id),
    CHECK (cancelado_id <> sustituto_id)
);

-- Reescaneo = nueva versión, nunca edición.
CREATE TABLE archivo_escaneado (
    documento_id bigint NOT NULL REFERENCES documento(id),
    version      smallint NOT NULL CHECK (version >= 1),
    sha256       text NOT NULL UNIQUE CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    ruta_objeto  text NOT NULL UNIQUE,
    tamano_bytes bigint NOT NULL CHECK (tamano_bytes > 0),
    subido_por   bigint NOT NULL REFERENCES usuario(id),
    subido_en    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (documento_id, version)
);

-- Verificación de pago (candado del C-02 → F-11). Hecho independiente: tabla propia.
CREATE TABLE verificacion_pago (
    documento_id  bigint PRIMARY KEY REFERENCES documento(id),
    referencia    text NOT NULL,
    verificado_por bigint NOT NULL REFERENCES usuario(id),
    verificado_en timestamptz NOT NULL DEFAULT now()
);

-- Estatus estándar de unidad (M-01, únicos válidos) + historial append-only.
CREATE TABLE estado_unidad (
    codigo text PRIMARY KEY,
    orden  smallint NOT NULL UNIQUE
);

-- Máquina de estados EN DATOS: transiciones permitidas.
CREATE TABLE transicion_unidad (
    desde text NOT NULL REFERENCES estado_unidad(codigo),
    hacia text NOT NULL REFERENCES estado_unidad(codigo),
    PRIMARY KEY (desde, hacia),
    CHECK (desde <> hacia)
);

CREATE TABLE unidad_estado_hist (
    vin            text NOT NULL REFERENCES unidad(vin),
    ocurrido_en    timestamptz NOT NULL DEFAULT now(),
    estado         text NOT NULL REFERENCES estado_unidad(codigo),
    registrado_por bigint NOT NULL REFERENCES usuario(id),
    PRIMARY KEY (vin, ocurrido_en)
);

CREATE TABLE estado_expediente (
    codigo text PRIMARY KEY CHECK (codigo IN ('INCOMPLETO','COMPLETO','LISTO_PARA_VENTA'))
);

CREATE TABLE expediente_estado_hist (
    expediente_id  bigint NOT NULL REFERENCES expediente(id),
    ocurrido_en    timestamptz NOT NULL DEFAULT now(),
    estado         text NOT NULL REFERENCES estado_expediente(codigo),
    registrado_por bigint NOT NULL REFERENCES usuario(id),
    PRIMARY KEY (expediente_id, ocurrido_en)
);

-- ===== FUNCIONES TRANSACCIONALES =====

CREATE OR REPLACE FUNCTION abrir_expediente(p_vin text, p_origen text, p_usuario bigint)
RETURNS expediente LANGUAGE plpgsql AS $$
DECLARE
    v_anio smallint := EXTRACT(YEAR FROM now())::smallint;
    v_num  integer; v_row expediente;
BEGIN
    INSERT INTO contador_expediente (anio) VALUES (v_anio) ON CONFLICT (anio) DO NOTHING;
    UPDATE contador_expediente SET ultimo = ultimo + 1 WHERE anio = v_anio RETURNING ultimo INTO v_num;
    INSERT INTO expediente (anio, consecutivo, vin, origen, abierto_por)
        VALUES (v_anio, v_num, p_vin, p_origen, p_usuario) RETURNING * INTO v_row;
    INSERT INTO unidad_estado_hist (vin, estado, registrado_por)
        VALUES (p_vin, 'EN_RECEPCION', p_usuario);
    INSERT INTO expediente_estado_hist (expediente_id, estado, registrado_por)
        VALUES (v_row.id, 'INCOMPLETO', p_usuario);
    RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION emitir_folio(p_tipo text, p_expediente bigint, p_usuario bigint)
RETURNS documento LANGUAGE plpgsql AS $$
DECLARE
    v_anio smallint := EXTRACT(YEAR FROM now())::smallint;
    v_rev text; v_num integer; v_row documento;
    v_origen text; v_fuente text;
BEGIN
    -- Candado de contrato fuente: a una PROPIA no se le emite C-04 ni viceversa.
    SELECT e.origen, o.contrato_fuente INTO v_origen, v_fuente
      FROM expediente e JOIN origen_unidad o ON o.codigo = e.origen
     WHERE e.id = p_expediente;
    IF p_tipo IN ('C-03','C-04') AND p_tipo <> v_fuente THEN
        RAISE EXCEPTION 'El contrato fuente de un expediente % es %', v_origen, v_fuente;
    END IF;
    -- Candado regla de oro: C-01/C-02 solo con F-06 en LISTO_PARA_VENTA.
    IF p_tipo IN ('C-01','C-02') THEN
        PERFORM 1 FROM (
            SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = p_expediente
            ORDER BY ocurrido_en DESC LIMIT 1) s
        WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Regla de oro: % requiere F-06 en LISTO_PARA_VENTA', p_tipo;
        END IF;
    END IF;
    -- Candado F-11: requiere C-02 escaneado + pago verificado.
    IF p_tipo = 'F-11' THEN
        PERFORM 1 FROM documento d
          JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN verificacion_pago vp ON vp.documento_id = d.id
         WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'F-11 requiere C-02 escaneado y pago verificado';
        END IF;
    END IF;

    SELECT r.revision INTO v_rev FROM revision_documento r
     WHERE r.tipo_codigo = p_tipo ORDER BY r.fecha_publicacion DESC LIMIT 1;
    IF v_rev IS NULL THEN RAISE EXCEPTION 'Tipo % sin revisión publicada', p_tipo; END IF;

    INSERT INTO contador_folio (tipo_codigo, anio) VALUES (p_tipo, v_anio)
        ON CONFLICT (tipo_codigo, anio) DO NOTHING;
    UPDATE contador_folio SET ultimo = ultimo + 1
        WHERE tipo_codigo = p_tipo AND anio = v_anio RETURNING ultimo INTO v_num;

    INSERT INTO documento (tipo_codigo, revision, anio, consecutivo, expediente_id, emitido_por)
        VALUES (p_tipo, v_rev, v_anio, v_num, p_expediente, p_usuario)
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

-- Cambio de estado de unidad con validación de transición + candados del manual.
CREATE OR REPLACE FUNCTION cambiar_estado_unidad(p_vin text, p_hacia text, p_usuario bigint)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_desde text; v_exp bigint; v_nivel text;
BEGIN
    SELECT estado INTO v_desde FROM unidad_estado_hist
     WHERE vin = p_vin ORDER BY ocurrido_en DESC LIMIT 1;
    IF v_desde IS NULL THEN RAISE EXCEPTION 'Unidad sin estado inicial'; END IF;
    PERFORM 1 FROM transicion_unidad WHERE desde = v_desde AND hacia = p_hacia;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transición % -> % no permitida', v_desde, p_hacia; END IF;

    SELECT id INTO v_exp FROM expediente WHERE vin = p_vin;

    IF p_hacia = 'EN_INSPECCION' THEN
        -- Requiere F-05 y F-06 emitidos (día 0).
        PERFORM 1 FROM documento WHERE expediente_id = v_exp AND tipo_codigo = 'F-05';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere folio F-05 emitido'; END IF;
        PERFORM 1 FROM documento WHERE expediente_id = v_exp AND tipo_codigo = 'F-06';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere folio F-06 emitido'; END IF;
    ELSIF p_hacia = 'EXPEDIENTE_INCOMPLETO' THEN
        -- Sale de inspección al escanearse F-05 firmado.
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-05';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere F-05 firmado y escaneado'; END IF;
    ELSIF p_hacia = 'LISTO_PARA_VENTA' AND v_desde = 'EXPEDIENTE_INCOMPLETO' THEN
        -- F-06 en LISTO + F-07 y F-08 escaneados (limpios).
        PERFORM 1 FROM (SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = v_exp ORDER BY ocurrido_en DESC LIMIT 1) s
         WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN RAISE EXCEPTION 'F-06 debe estar en LISTO_PARA_VENTA primero'; END IF;
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-07';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere F-07 escaneado'; END IF;
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-08';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere F-08 escaneado'; END IF;
    ELSIF p_hacia = 'APARTADA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'C-01'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere C-01 escaneado vigente'; END IF;
    ELSIF p_hacia = 'VENDIDA_PEND_ENTREGA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN verificacion_pago vp ON vp.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id);
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere C-02 escaneado y pago verificado'; END IF;
    ELSIF p_hacia = 'ENTREGADA' THEN
        PERFORM 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id = d.id
         WHERE d.expediente_id = v_exp AND d.tipo_codigo = 'F-11';
        IF NOT FOUND THEN RAISE EXCEPTION 'Requiere F-11 firmado y escaneado'; END IF;
    ELSIF p_hacia = 'DEVUELTA_CONSIGNANTE' THEN
        PERFORM 1 FROM expediente WHERE id = v_exp AND origen = 'CONSIGNADA';
        IF NOT FOUND THEN RAISE EXCEPTION 'Solo consignadas se devuelven al consignante'; END IF;
    ELSIF p_hacia = 'BAJA' THEN
        SELECT nivel INTO v_nivel FROM usuario WHERE id = p_usuario;
        IF v_nivel NOT IN ('N2','N3') THEN RAISE EXCEPTION 'BAJA requiere N2/N3'; END IF;
    END IF;

    INSERT INTO unidad_estado_hist (vin, estado, registrado_por) VALUES (p_vin, p_hacia, p_usuario);
END $$;

-- ===== VISTAS (derivados) =====
CREATE OR REPLACE VIEW v_expediente AS
SELECT e.id, e.anio, e.consecutivo,
       e.anio::text || '-' || lpad(e.consecutivo::text,3,'0') AS numero_expediente,
       e.vin, e.origen, e.abierto_por, e.abierto_en
FROM expediente e;

CREATE OR REPLACE VIEW v_documento AS
SELECT d.id,
       d.tipo_codigo || '-' || d.anio::text || '-' || lpad(d.consecutivo::text,4,'0') AS folio,
       d.tipo_codigo, d.revision, d.anio, d.consecutivo,
       ve.numero_expediente, d.expediente_id, ve.vin,
       (dc.documento_id IS NOT NULL) AS cancelado,
       EXISTS (SELECT 1 FROM archivo_escaneado a WHERE a.documento_id = d.id) AS escaneado,
       d.emitido_por, d.emitido_en
FROM documento d
JOIN v_expediente ve ON ve.id = d.expediente_id
LEFT JOIN documento_cancelacion dc ON dc.documento_id = d.id;

CREATE OR REPLACE VIEW v_unidad_estado_actual AS
SELECT DISTINCT ON (vin) vin, estado, ocurrido_en
FROM unidad_estado_hist ORDER BY vin, ocurrido_en DESC;

CREATE OR REPLACE VIEW v_expediente_estado_actual AS
SELECT DISTINCT ON (expediente_id) expediente_id, estado, ocurrido_en
FROM expediente_estado_hist ORDER BY expediente_id, ocurrido_en DESC;

-- ===== INMUTABILIDAD =====
CREATE OR REPLACE FUNCTION bloquear_mutacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Tabla % es append-only', TG_TABLE_NAME; END $$;

CREATE TRIGGER t1 BEFORE UPDATE OR DELETE ON documento FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER t2 BEFORE UPDATE OR DELETE ON documento_cancelacion FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER t3 BEFORE UPDATE OR DELETE ON archivo_escaneado FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER t4 BEFORE UPDATE OR DELETE ON unidad_estado_hist FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER t5 BEFORE UPDATE OR DELETE ON expediente_estado_hist FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER t6 BEFORE UPDATE OR DELETE ON verificacion_pago FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();

-- ===== SEMILLA =====
INSERT INTO categoria_documento VALUES ('FORMATO'),('CONTRATO');
INSERT INTO etapa (codigo,orden) VALUES
 ('ADQUISICION',1),('INSPECCION',2),('EXPEDIENTE',3),('TRAMITES',4),('VENTA',5);
INSERT INTO nivel VALUES ('N1'),('N2'),('N3');

INSERT INTO tipo_documento (codigo,nombre,categoria,etapa) VALUES
 ('F-01','Ingreso / compra directa de unidad','FORMATO','ADQUISICION'),
 ('F-02','Acuerdo de consignación','FORMATO','ADQUISICION'),
 ('F-03','Identificación de contraparte (KYC)','FORMATO','ADQUISICION'),
 ('F-04','Recibo de compraventa','FORMATO','ADQUISICION'),
 ('F-05','Checklist de inspección física','FORMATO','INSPECCION'),
 ('F-06','Carátula y checklist maestro','FORMATO','EXPEDIENTE'),
 ('F-07','Verificación de adeudos y situación','FORMATO','EXPEDIENTE'),
 ('F-08','Validación de factura y endosos','FORMATO','EXPEDIENTE'),
 ('F-09','Control de trámites vehiculares','FORMATO','TRAMITES'),
 ('F-10','Vale de resguardo de documentos y llaves','FORMATO','TRAMITES'),
 ('F-11','Acta de entrega de unidad al cliente','FORMATO','VENTA'),
 ('C-01','Apartado de vehículo','CONTRATO','VENTA'),
 ('C-02','Compraventa — el lote vende','CONTRATO','VENTA'),
 ('C-03','Compraventa — el lote compra','CONTRATO','ADQUISICION'),
 ('C-04','Consignación mercantil','CONTRATO','ADQUISICION');

INSERT INTO revision_documento (tipo_codigo,revision,fecha_publicacion)
SELECT codigo,'1.3',DATE '2026-07-01' FROM tipo_documento;

INSERT INTO origen_unidad VALUES ('PROPIA','C-03'),('CONSIGNADA','C-04');

-- Estatus estándar M-01 (los ÚNICOS válidos)
INSERT INTO estado_unidad (codigo,orden) VALUES
 ('EN_RECEPCION',1),('EN_INSPECCION',2),('EXPEDIENTE_INCOMPLETO',3),
 ('LISTO_PARA_VENTA',4),('APARTADA',5),('VENDIDA_PEND_ENTREGA',6),
 ('ENTREGADA',7),('DEVUELTA_CONSIGNANTE',8),('BAJA',9);

INSERT INTO estado_expediente VALUES ('INCOMPLETO'),('COMPLETO'),('LISTO_PARA_VENTA');

-- Transiciones permitidas (M-01, entra/sale)
INSERT INTO transicion_unidad (desde,hacia) VALUES
 ('EN_RECEPCION','EN_INSPECCION'),
 ('EN_INSPECCION','EXPEDIENTE_INCOMPLETO'),
 ('EXPEDIENTE_INCOMPLETO','LISTO_PARA_VENTA'),
 ('LISTO_PARA_VENTA','EXPEDIENTE_INCOMPLETO'),      -- hallazgo regresa la unidad
 ('LISTO_PARA_VENTA','APARTADA'),
 ('APARTADA','LISTO_PARA_VENTA'),                    -- liberación de apartado
 ('APARTADA','VENDIDA_PEND_ENTREGA'),
 ('LISTO_PARA_VENTA','VENDIDA_PEND_ENTREGA'),
 ('VENDIDA_PEND_ENTREGA','ENTREGADA'),
 ('EXPEDIENTE_INCOMPLETO','DEVUELTA_CONSIGNANTE'),
 ('LISTO_PARA_VENTA','DEVUELTA_CONSIGNANTE'),
 ('EN_RECEPCION','BAJA'),('EN_INSPECCION','BAJA'),
 ('EXPEDIENTE_INCOMPLETO','BAJA'),('LISTO_PARA_VENTA','BAJA');

COMMIT;
