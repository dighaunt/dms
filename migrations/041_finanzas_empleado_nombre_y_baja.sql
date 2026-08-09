

BEGIN;

SET search_path TO traza;

ALTER TABLE empleado
    ADD COLUMN IF NOT EXISTS nombres          text,
    ADD COLUMN IF NOT EXISTS apellido_paterno text,
    ADD COLUMN IF NOT EXISTS apellido_materno text,
    ADD COLUMN IF NOT EXISTS departamento     text;

DO $$
DECLARE
    v_fila record;
    v_tok  text[];
BEGIN
    FOR v_fila IN SELECT id, nombre FROM empleado WHERE apellido_paterno IS NULL LOOP
        v_tok := regexp_split_to_array(trim(regexp_replace(v_fila.nombre, '\s+', ' ', 'g')), ' ');

        IF array_length(v_tok, 1) >= 3 THEN
            UPDATE empleado
               SET nombres          = array_to_string(v_tok[1:array_length(v_tok,1)-2], ' '),
                   apellido_paterno = v_tok[array_length(v_tok,1)-1],
                   apellido_materno = v_tok[array_length(v_tok,1)]
             WHERE id = v_fila.id;
        ELSIF array_length(v_tok, 1) = 2 THEN
            UPDATE empleado
               SET nombres = v_tok[1], apellido_paterno = v_tok[2], apellido_materno = NULL
             WHERE id = v_fila.id;
        ELSE

            
            UPDATE empleado
               SET nombres = v_fila.nombre, apellido_paterno = '(por capturar)', apellido_materno = NULL
             WHERE id = v_fila.id;
        END IF;
    END LOOP;
END $$;

ALTER TABLE empleado ALTER COLUMN nombres SET NOT NULL;
ALTER TABLE empleado ALTER COLUMN apellido_paterno SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empleado_nombres_no_vacio') THEN
        ALTER TABLE empleado ADD CONSTRAINT empleado_nombres_no_vacio CHECK (
            char_length(trim(nombres)) BETWEEN 2 AND 80
            AND char_length(trim(apellido_paterno)) BETWEEN 2 AND 80
            AND (apellido_materno IS NULL OR char_length(trim(apellido_materno)) BETWEEN 2 AND 80)
        );
    END IF;
END $$;

ALTER TABLE empleado DROP COLUMN nombre;
ALTER TABLE empleado ADD COLUMN nombre text
    GENERATED ALWAYS AS (
        trim(both ' ' FROM nombres || ' ' || apellido_paterno || ' ' || coalesce(apellido_materno, ''))
    ) STORED;

COMMENT ON COLUMN empleado.nombre IS
    'Derivada de las tres partes. No se captura: asi no puede haber un nombre completo que contradiga a sus apellidos.';
COMMENT ON COLUMN empleado.apellido_materno IS
    'Opcional: no todo el mundo lleva dos apellidos, y exigirlo obliga a inventarlo.';

CREATE INDEX IF NOT EXISTS empleado_por_apellido
    ON empleado (upper(apellido_paterno), upper(coalesce(apellido_materno,'')), upper(nombres));

CREATE INDEX IF NOT EXISTS empleado_por_departamento ON empleado (departamento) WHERE activo;

ALTER TABLE empleado
    ADD COLUMN IF NOT EXISTS baja_en  timestamptz,
    ADD COLUMN IF NOT EXISTS baja_por bigint REFERENCES usuario(id);

COMMENT ON COLUMN empleado.baja_en IS
    'Cuando se inhabilito. Se limpia al reactivar: lo que importa es la baja vigente, no el historial de idas y venidas.';

CREATE OR REPLACE FUNCTION cambiar_alta_empleado(
    p_empleado bigint, p_activo boolean, p_usuario bigint
) RETURNS empleado LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_fila empleado;
BEGIN
    SELECT * INTO v_fila FROM empleado WHERE id = p_empleado;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ese registro de personal no existe';
    END IF;
    IF v_fila.activo = p_activo THEN
        RETURN v_fila;
    END IF;

    UPDATE empleado
       SET activo      = p_activo,
           baja_en     = CASE WHEN p_activo THEN NULL ELSE now() END,
           baja_por    = CASE WHEN p_activo THEN NULL ELSE p_usuario END
     WHERE id = p_empleado
    RETURNING * INTO v_fila;

    RETURN v_fila;
END $$;

COMMENT ON FUNCTION cambiar_alta_empleado(bigint, boolean, bigint) IS
    'Inhabilita o reactiva a un empleado. Nunca borra: los folios emitidos citan su nombre y tienen que poder leerse.';

COMMIT;
