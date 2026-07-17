-- C-01 deja de aceptar un porcentaje de captura. La politica contractual
-- vigente aplica 50.00% al monto del apartado y conserva el tope OP.
BEGIN;

CREATE OR REPLACE FUNCTION traza.recalcular_pena_convencional(p_documento_id bigint)
RETURNS void
LANGUAGE plpgsql
SET search_path = traza
AS $$
DECLARE
    v_contrato   text;
    v_base       numeric(18,2);
    v_principal  numeric(18,2);
    v_porcentaje numeric(18,2) := 50.00;
    v_pena       numeric(18,2);
    v_devolver   numeric(18,2);
BEGIN
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
            WHERE campo_pdf = 'c01_precio_total' AND tipo = 'NUMERO'
        )
      INTO v_base, v_principal
      FROM documento_campo_valor
     WHERE documento_id = p_documento_id
       AND campo_pdf IN ('c01_monto_num', 'c01_precio_total');

    IF v_base IS NULL OR v_principal IS NULL OR v_base < 0 OR v_principal < 0 THEN
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

-- Sólo los importes fuente invalidan o regeneran el resultado. El campo PDF
-- del porcentaje es una salida derivada y no debe controlar el algoritmo.
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
       AND OLD.campo_pdf NOT IN ('c01_monto_num', 'c01_precio_total')
       AND NEW.campo_pdf NOT IN ('c01_monto_num', 'c01_precio_total') THEN
        RETURN NEW;
    END IF;

    IF TG_OP <> 'UPDATE' AND v_campo_pdf NOT IN ('c01_monto_num', 'c01_precio_total') THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        END IF;
        RETURN NEW;
    END IF;

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

SELECT traza.recalcular_pena_convencional(id)
  FROM traza.documento
 WHERE tipo_codigo = 'C-01';

COMMIT;
