-- Wizard documental normalizado. Separa cuatro hechos independientes:
-- 1) dato reusable del expediente, 2) estado de captura del documento,
-- 3) valor actual de cada campo PDF y 4) historial append-only de cambios.
-- No se usa JSONB: cada valor conserva su tipo SQL y una sola celda atómica.
BEGIN;

CREATE TYPE traza.tipo_dato_formulario AS ENUM (
    'TEXTO', 'NUMERO', 'FECHA', 'BOOLEANO', 'OPCION'
);

CREATE TYPE traza.estado_captura_documento AS ENUM (
    'BORRADOR', 'COMPLETA'
);

CREATE TYPE traza.origen_valor_formulario AS ENUM (
    'CAPTURA', 'REUTILIZADO', 'SISTEMA', 'DERIVADO', 'REGLA'
);

-- Un concepto reusable (p. ej. parte.comprador.rfc) existe una sola vez por
-- expediente. La clave expresa el concepto, no el nombre accidental del PDF.
CREATE TABLE traza.expediente_dato (
    expediente_id bigint NOT NULL REFERENCES traza.expediente(id),
    clave         text NOT NULL CHECK (clave ~ '^[a-z][a-z0-9_.]{2,79}$'),
    tipo          traza.tipo_dato_formulario NOT NULL,
    valor_texto   text,
    valor_numero  numeric(18,2),
    valor_fecha   date,
    valor_booleano boolean,
    actualizado_por bigint NOT NULL REFERENCES traza.usuario(id),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (expediente_id, clave),
    CHECK (
        (tipo IN ('TEXTO','OPCION') AND valor_texto IS NOT NULL
            AND valor_numero IS NULL AND valor_fecha IS NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'NUMERO' AND valor_texto IS NULL AND valor_numero IS NOT NULL
            AND valor_fecha IS NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'FECHA' AND valor_texto IS NULL AND valor_numero IS NULL
            AND valor_fecha IS NOT NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'BOOLEANO' AND valor_texto IS NULL AND valor_numero IS NULL
            AND valor_fecha IS NULL AND valor_booleano IS NOT NULL)
    )
);

CREATE TABLE traza.expediente_dato_hist (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    expediente_id bigint NOT NULL REFERENCES traza.expediente(id),
    clave         text NOT NULL,
    tipo          traza.tipo_dato_formulario NOT NULL,
    valor_texto   text,
    valor_numero  numeric(18,2),
    valor_fecha   date,
    valor_booleano boolean,
    registrado_por bigint NOT NULL REFERENCES traza.usuario(id),
    registrado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expediente_dato_hist_busqueda_idx
    ON traza.expediente_dato_hist (expediente_id, clave, registrado_en DESC);

CREATE TABLE traza.documento_captura (
    documento_id  bigint PRIMARY KEY REFERENCES traza.documento(id),
    estado        traza.estado_captura_documento NOT NULL DEFAULT 'BORRADOR',
    iniciado_por  bigint NOT NULL REFERENCES traza.usuario(id),
    iniciado_en   timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint NOT NULL REFERENCES traza.usuario(id),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    completado_por bigint REFERENCES traza.usuario(id),
    completado_en timestamptz,
    CHECK (
        (estado = 'BORRADOR' AND completado_por IS NULL AND completado_en IS NULL)
        OR
        (estado = 'COMPLETA' AND completado_por IS NOT NULL AND completado_en IS NOT NULL)
    )
);

-- Snapshot por campo: preserva exactamente qué valor produjo el PDF, incluso
-- si después cambia el dato reusable del expediente.
CREATE TABLE traza.documento_campo_valor (
    documento_id bigint NOT NULL REFERENCES traza.documento(id),
    campo_pdf     text NOT NULL CHECK (length(campo_pdf) BETWEEN 1 AND 120),
    tipo          traza.tipo_dato_formulario NOT NULL,
    origen        traza.origen_valor_formulario NOT NULL,
    valor_texto   text,
    valor_numero  numeric(18,2),
    valor_fecha   date,
    valor_booleano boolean,
    actualizado_por bigint NOT NULL REFERENCES traza.usuario(id),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (documento_id, campo_pdf),
    CHECK (
        (tipo IN ('TEXTO','OPCION') AND valor_texto IS NOT NULL
            AND valor_numero IS NULL AND valor_fecha IS NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'NUMERO' AND valor_texto IS NULL AND valor_numero IS NOT NULL
            AND valor_fecha IS NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'FECHA' AND valor_texto IS NULL AND valor_numero IS NULL
            AND valor_fecha IS NOT NULL AND valor_booleano IS NULL)
        OR
        (tipo = 'BOOLEANO' AND valor_texto IS NULL AND valor_numero IS NULL
            AND valor_fecha IS NULL AND valor_booleano IS NOT NULL)
    )
);

CREATE TABLE traza.documento_campo_valor_hist (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id  bigint NOT NULL REFERENCES traza.documento(id),
    campo_pdf      text NOT NULL,
    tipo           traza.tipo_dato_formulario NOT NULL,
    origen         traza.origen_valor_formulario NOT NULL,
    valor_texto    text,
    valor_numero   numeric(18,2),
    valor_fecha    date,
    valor_booleano boolean,
    registrado_por bigint NOT NULL REFERENCES traza.usuario(id),
    registrado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documento_campo_hist_busqueda_idx
    ON traza.documento_campo_valor_hist (documento_id, campo_pdf, registrado_en DESC);

CREATE OR REPLACE FUNCTION traza.auditar_expediente_dato()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    INSERT INTO expediente_dato_hist (
        expediente_id, clave, tipo, valor_texto, valor_numero, valor_fecha,
        valor_booleano, registrado_por, registrado_en
    ) VALUES (
        NEW.expediente_id, NEW.clave, NEW.tipo, NEW.valor_texto,
        NEW.valor_numero, NEW.valor_fecha, NEW.valor_booleano,
        NEW.actualizado_por, NEW.actualizado_en
    );
    RETURN NEW;
END $$;

CREATE TRIGGER expediente_dato_auditoria
AFTER INSERT OR UPDATE ON traza.expediente_dato
FOR EACH ROW EXECUTE FUNCTION traza.auditar_expediente_dato();

CREATE OR REPLACE FUNCTION traza.proteger_y_auditar_campo_documento()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_documento bigint;
BEGIN
    v_documento := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    IF EXISTS (SELECT 1 FROM archivo_escaneado WHERE documento_id = v_documento) THEN
        RAISE EXCEPTION 'El documento ya tiene un escaneo: su captura quedó cerrada para preservar la trazabilidad';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER documento_campo_protegido
BEFORE INSERT OR UPDATE OR DELETE ON traza.documento_campo_valor
FOR EACH ROW EXECUTE FUNCTION traza.proteger_y_auditar_campo_documento();

CREATE TRIGGER documento_captura_protegida
BEFORE INSERT OR UPDATE OR DELETE ON traza.documento_captura
FOR EACH ROW EXECUTE FUNCTION traza.proteger_y_auditar_campo_documento();

CREATE OR REPLACE FUNCTION traza.auditar_campo_documento()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    INSERT INTO documento_campo_valor_hist (
        documento_id, campo_pdf, tipo, origen, valor_texto, valor_numero,
        valor_fecha, valor_booleano, registrado_por, registrado_en
    ) VALUES (
        NEW.documento_id, NEW.campo_pdf, NEW.tipo, NEW.origen,
        NEW.valor_texto, NEW.valor_numero, NEW.valor_fecha,
        NEW.valor_booleano, NEW.actualizado_por, NEW.actualizado_en
    );
    RETURN NEW;
END $$;

CREATE TRIGGER documento_campo_auditoria
AFTER INSERT OR UPDATE ON traza.documento_campo_valor
FOR EACH ROW EXECUTE FUNCTION traza.auditar_campo_documento();

CREATE TRIGGER expediente_dato_hist_inmutable
BEFORE UPDATE OR DELETE ON traza.expediente_dato_hist
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE TRIGGER documento_campo_hist_inmutable
BEFORE UPDATE OR DELETE ON traza.documento_campo_valor_hist
FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

COMMIT;
