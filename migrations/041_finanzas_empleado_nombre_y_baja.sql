-- Modulo Finanzas — el nombre del personal en partes, y la baja que faltaba.
--
-- Dos cosas que la operacion real destapo el primer dia que alguien intento
-- capturar la plantilla.
--
-- 1. EL NOMBRE ERA UN SOLO CAMPO. La plantilla se lleva con nombre, apellido
--    paterno y apellido materno separados —asi la entrega Recursos Humanos y
--    asi la pide el IMSS—, y guardarla en una sola cadena obliga a partirla a
--    ojo cada vez que hace falta ordenar por apellido o buscar a "los Garcia".
--    En esta agencia hay tres Garcia distintos y dos se llaman Ricardo; con el
--    nombre pegado, distinguirlos depende de leer con cuidado.
--    Se conserva `nombre` como columna GENERADA para que todo lo que ya lo
--    imprime —recibos, vales, nomina, PDF— siga funcionando sin cambio alguno,
--    y para que no pueda existir un nombre completo que contradiga a sus
--    partes: no hay dos lugares donde escribirlo.
--
-- 2. NO HABIA MANERA DE DAR DE BAJA A NADIE. La columna `activo` existe desde
--    la 034 y ninguna funcion la cambiaba: se podia dar de alta y ya. Y dar de
--    baja NO es borrar, es inhabilitar: el vendedor que renuncio sigue citado
--    por su nombre en cada RCI-01 que cobro, y su ficha tiene que seguir ahi
--    para poder leer esos folios anos despues. Lo unico que cambia al darlo de
--    baja es que deja de poder elegirse en una captura nueva.
--    Borrarlo, ademas, seria imposible: lo referencian los recibos y la nomina.
--
-- Se agrega tambien `departamento`, que la plantilla trae y no tenia donde
-- vivir.
BEGIN;

SET search_path TO traza;

-- ===== EL NOMBRE, EN PARTES =====

ALTER TABLE empleado
    ADD COLUMN IF NOT EXISTS nombres          text,
    ADD COLUMN IF NOT EXISTS apellido_paterno text,
    ADD COLUMN IF NOT EXISTS apellido_materno text,
    ADD COLUMN IF NOT EXISTS departamento     text;

-- Reparto de lo que ya estaba escrito en una sola cadena. Es un mejor esfuerzo
-- —"DIEGO FERNANDO GARCIA RAMOS" se parte bien, "DE LA TORRE" no— y por eso
-- corre UNA sola vez, sobre las filas que existen hoy. De aqui en adelante el
-- alta captura las tres partes por separado y no hay nada que adivinar; lo que
-- esta migracion parta mal se corrige desde la pantalla de personal.
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
            -- Un solo token: no hay como saber que parte es. Se deja entero
            -- como nombre y el apellido se marca para que salte a la vista en
            -- la pantalla de personal, en vez de inventarlo.
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

-- `nombre` pasa de columna capturada a columna derivada. Todo lo que la lee
-- —y son diez sitios entre servicios, PDF y pantallas— sigue leyendo lo mismo:
-- el nombre completo. Lo que ya no puede pasar es que alguien corrija el
-- apellido y el nombre impreso siga diciendo lo de antes.
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

-- ===== LA BAJA =====

-- Cuando y quien dio la baja. Va en la propia ficha y no en alerta_finanzas:
-- una baja de personal no es una alerta de caja, y meterla ahi llenaria de
-- ruido de RH el tablero que sirve para ver faltantes de dinero.
ALTER TABLE empleado
    ADD COLUMN IF NOT EXISTS baja_en  timestamptz,
    ADD COLUMN IF NOT EXISTS baja_por bigint REFERENCES usuario(id);

COMMENT ON COLUMN empleado.baja_en IS
    'Cuando se inhabilito. Se limpia al reactivar: lo que importa es la baja vigente, no el historial de idas y venidas.';

-- Dar de baja no borra: inhabilita. La ficha sigue existiendo porque los
-- folios ya emitidos la citan, y leer un RCI-01 de hace tres anos exige poder
-- resolver quien era el vendedor. Lo unico que cambia es que deja de ofrecerse
-- en una captura nueva.
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
