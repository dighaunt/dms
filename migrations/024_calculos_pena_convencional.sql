-- Los importes de pena son un resultado canónico y reproducible de la
-- captura contractual. Nunca se capturan ni se aceptan como valor de cliente.
-- Se eliminan cuando faltan los insumos para no conservar una cifra obsoleta.
BEGIN;

CREATE TABLE traza.calculo_pena_convencional (
    documento_id       bigint PRIMARY KEY REFERENCES traza.documento(id),
    algoritmo_version  text NOT NULL DEFAULT 'PENA_CONVENCIONAL_V1'
        CHECK (algoritmo_version = 'PENA_CONVENCIONAL_V1'),
    monto_base         numeric(18,2) NOT NULL CHECK (monto_base >= 0),
    obligacion_principal numeric(18,2) NOT NULL
        CHECK (obligacion_principal >= 0),
    porcentaje          numeric(18,2) NOT NULL CHECK (porcentaje >= 0),
    monto_pena         numeric(18,2) NOT NULL
        CHECK (monto_pena >= 0 AND monto_pena <= obligacion_principal),
    monto_devolucion   numeric(18,2) NOT NULL,
    calculado_en       timestamptz NOT NULL DEFAULT now(),
    CHECK (
        monto_devolucion = round(monto_base - monto_pena, 2)
    )
);

COMMENT ON TABLE traza.calculo_pena_convencional IS
    'Resultado calculado por la base de datos para penas convencionales; no admite captura manual.';
COMMENT ON COLUMN traza.calculo_pena_convencional.monto_base IS
    'C-01: monto del apartado.';
COMMENT ON COLUMN traza.calculo_pena_convencional.obligacion_principal IS
    'C-01: precio total pactado, usado como límite de la pena.';
COMMENT ON COLUMN traza.calculo_pena_convencional.monto_devolucion IS
    'Sólo C-01: apartado menos la pena convencional calculada.';

-- Esta marca de sesión sólo puede ser activada por la función de recálculo
-- durante la transacción que modifica la captura fuente.
CREATE OR REPLACE FUNCTION traza.proteger_calculo_pena_convencional()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = traza
AS $$
BEGIN
    IF current_setting('traza.calculo_pena_convencional_interno', true)
        IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION
            'El monto de pena no se captura: se calcula con los datos del contrato';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER calculo_pena_convencional_protegido
BEFORE INSERT OR UPDATE OR DELETE ON traza.calculo_pena_convencional
FOR EACH ROW EXECUTE FUNCTION traza.proteger_calculo_pena_convencional();

CREATE OR REPLACE FUNCTION traza.recalcular_pena_convencional(p_documento_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = traza
AS $$
DECLARE
    v_contrato   text;
    v_base       numeric(18,2);
    v_principal  numeric(18,2);
    v_porcentaje numeric(18,2);
    v_pena       numeric(18,2);
    v_devolver   numeric(18,2);
BEGIN
    -- Borra primero para que un borrado, cambio de tipo o valor no numérico
    -- de un insumo nunca deje un cálculo anterior vigente.
    PERFORM set_config('traza.calculo_pena_convencional_interno', 'on', true);
    DELETE FROM calculo_pena_convencional
     WHERE documento_id = p_documento_id;

    SELECT tipo_codigo
      INTO v_contrato
      FROM documento
     WHERE id = p_documento_id;

    IF v_contrato IS DISTINCT FROM 'C-01' THEN
        RETURN;
    END IF;

    SELECT
        max(valor_numero) FILTER (
            WHERE campo_pdf = 'c01_monto_num' AND tipo = 'NUMERO'
        ),
        max(valor_numero) FILTER (
            WHERE campo_pdf = 'C01_inl_30' AND tipo = 'NUMERO'
        ),
        max(valor_numero) FILTER (
            WHERE campo_pdf = 'c01_precio_total' AND tipo = 'NUMERO'
        )
      INTO v_base, v_porcentaje, v_principal
      FROM documento_campo_valor
     WHERE documento_id = p_documento_id
       AND campo_pdf IN ('c01_monto_num', 'C01_inl_30', 'c01_precio_total');

    IF v_base IS NULL OR v_porcentaje IS NULL OR v_principal IS NULL
       OR v_base < 0 OR v_principal < 0
       OR v_porcentaje < 0 THEN
        RETURN;
    END IF;

    v_pena := least(round((v_porcentaje / 100) * v_base, 2), v_principal);
    v_devolver := round(v_base - v_pena, 2);

    INSERT INTO calculo_pena_convencional (
        documento_id, monto_base, obligacion_principal,
        porcentaje, monto_pena, monto_devolucion
    ) VALUES (
        p_documento_id, v_base, v_principal,
        v_porcentaje, v_pena, v_devolver
    );
END;
$$;

CREATE OR REPLACE FUNCTION traza.recalcular_pena_por_campo_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = traza
AS $$
DECLARE
    v_documento_id bigint;
    v_campo_pdf    text;
BEGIN
    v_documento_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    v_campo_pdf := CASE WHEN TG_OP = 'DELETE' THEN OLD.campo_pdf ELSE NEW.campo_pdf END;

    IF TG_OP = 'UPDATE'
       AND OLD.campo_pdf NOT IN (
           'c01_monto_num', 'C01_inl_30', 'c01_precio_total'
       )
       AND NEW.campo_pdf NOT IN (
           'c01_monto_num', 'C01_inl_30', 'c01_precio_total'
       ) THEN
        RETURN NEW;
    END IF;

    IF TG_OP <> 'UPDATE' AND v_campo_pdf NOT IN (
        'c01_monto_num', 'C01_inl_30', 'c01_precio_total'
    ) THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

    -- documento_id participa en la clave primaria y normalmente es inmutable,
    -- pero este caso preserva la consistencia si una corrección administrativa
    -- llegara a mover un valor fuente entre documentos.
    IF TG_OP = 'UPDATE' AND NEW.documento_id IS DISTINCT FROM OLD.documento_id THEN
        PERFORM recalcular_pena_convencional(OLD.documento_id);
        PERFORM recalcular_pena_convencional(NEW.documento_id);
    ELSE
        PERFORM recalcular_pena_convencional(v_documento_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER documento_campo_valor_recalcular_pena_convencional
AFTER INSERT OR UPDATE OR DELETE ON traza.documento_campo_valor
FOR EACH ROW EXECUTE FUNCTION traza.recalcular_pena_por_campo_documento();

-- Evita conservar una pena de otro contrato si una corrección excepcional
-- cambia el tipo del documento después de que ya había campos capturados.
CREATE OR REPLACE FUNCTION traza.recalcular_pena_por_tipo_documento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = traza
AS $$
BEGIN
    PERFORM recalcular_pena_convencional(NEW.id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER documento_tipo_recalcular_pena_convencional
AFTER UPDATE OF tipo_codigo ON traza.documento
FOR EACH ROW EXECUTE FUNCTION traza.recalcular_pena_por_tipo_documento();

-- Calcula también los contratos ya capturados antes de aplicar esta migración.
SELECT traza.recalcular_pena_convencional(id)
  FROM traza.documento
 WHERE tipo_codigo = 'C-01';

DO $$
BEGIN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE
        ON traza.calculo_pena_convencional FROM authenticated;
    REVOKE ALL ON traza.calculo_pena_convencional FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; revokes omitidos';
END $$;

COMMIT;
