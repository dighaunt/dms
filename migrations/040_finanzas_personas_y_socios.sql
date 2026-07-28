-- Modulo Finanzas — catalogo de personas y registro formal de socios.
--
-- Dos huecos que sale a la vista en cuanto alguien intenta operar el modulo:
--
-- 1. QUIEN RECIBE EL DINERO era texto libre. El RCI-05 pide nombre e
--    identificacion oficial de quien cobra, y hasta hoy los tres campos se
--    tecleaban cada vez. A un proveedor al que se le paga cada semana se le
--    reescribe el nombre cincuenta veces al ano, y basta una letra distinta
--    —"Refaccionaria del Norte" contra "Refaccionaria del Nte."— para que
--    nadie pueda sumar cuanto se le ha pagado. El texto libre no se quita:
--    a veces se le paga a alguien una sola vez en la vida y darlo de alta
--    seria un estorbo. Lo que se agrega es la posibilidad de elegirlo.
--
-- 2. QUIEN ES SOCIO no estaba registrado en ningun lado. El selector del
--    retiro de utilidades se llenaba con
--        SELECT u.id, u.nombre FROM usuario WHERE activo
--    es decir, con TODOS los usuarios del sistema. Ser socio es una condicion
--    juridica —quien tiene parte del capital social— y no "tener cuenta en el
--    DMS": son conjuntos distintos y confundirlos tiene dos consecuencias.
--    Una, que elegir mal al accionista en un retiro es cuestion de un clic y
--    el anticipo se le carga a quien no era. Otra, que la caja podia entregar
--    un "retiro de utilidades" a alguien que no tiene derecho a utilidad
--    alguna, y el sistema lo asentaba sin una sola objecion.
--
-- Sobre el modelo. Un socio NO tiene por que tener cuenta de usuario: en una
-- agencia el accionista rara vez opera el DMS. Por eso el socio se registra
-- sobre la persona y no sobre el usuario, y el enlace con usuario queda
-- opcional, para cuando esa persona ademas trabaje en el sistema.
--
-- Sobre lo que se guarda en el vale. El documento conserva el nombre y la
-- identificacion COMO TEXTO, igual que hoy, y el enlace al catalogo es un
-- dato adicional. No es redundancia: un vale firmado es un hecho, y si solo
-- guardara la referencia, corregir manana el nombre en el catalogo cambiaria
-- en silencio lo que una persona ya firmo. El texto es la foto de lo que se
-- escribio; el enlace sirve para sumar y para no volver a teclear.
BEGIN;

SET search_path TO traza;

-- ===== CATALOGO DE PERSONAS =====

CREATE TABLE IF NOT EXISTS persona (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      text NOT NULL CHECK (char_length(trim(nombre)) BETWEEN 3 AND 200),
    -- La identificacion es opcional AQUI y obligatoria en el vale. Se puede dar
    -- de alta a un proveedor con lo que se sabe hoy y completarlo despues; lo
    -- que no se puede es pagarle sin identificarlo, y de eso responde el
    -- NOT NULL que el RCI-05 ya tiene.
    id_tipo     text CHECK (id_tipo IS NULL OR char_length(trim(id_tipo)) BETWEEN 2 AND 40),
    id_numero   text CHECK (id_numero IS NULL OR char_length(trim(id_numero)) BETWEEN 3 AND 60),
    rfc         text CHECK (rfc IS NULL OR rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
    telefono    text CHECK (telefono IS NULL OR telefono ~ '^[0-9]{10}$'),
    domicilio   text,
    -- Pista para filtrar el selector, no una verdad juridica. Quien es socio lo
    -- dice la tabla socio y solo ella; alguien puede estar aqui como PROVEEDOR
    -- y ser ademas socio, y el sistema debe seguir tratandolo como socio.
    categoria   text NOT NULL DEFAULT 'OTRO'
                CHECK (categoria IN ('PROVEEDOR','EMPLEADO','SOCIO','CLIENTE','OTRO')),
    notas       text,
    -- Solo cuando esa persona ademas opera el sistema.
    usuario_id  bigint REFERENCES usuario(id),
    activa      boolean NOT NULL DEFAULT true,
    creada_por  bigint NOT NULL REFERENCES usuario(id),
    creada_en   timestamptz NOT NULL DEFAULT now(),
    CHECK ((id_tipo IS NULL) = (id_numero IS NULL))
);

-- Una identificacion oficial designa a una sola persona. Sin esto el catalogo
-- se llena de duplicados y deja de servir justo para lo que se creo: saber
-- cuanto se le ha pagado a alguien.
CREATE UNIQUE INDEX IF NOT EXISTS persona_identificacion_unica
    ON persona (upper(trim(id_tipo)), upper(trim(id_numero)))
    WHERE id_tipo IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS persona_un_registro_por_usuario
    ON persona (usuario_id) WHERE usuario_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS persona_por_nombre ON persona (lower(nombre));

COMMENT ON TABLE persona IS
    'Gente a la que la empresa paga o de la que recibe de forma recurrente. El vale guarda ademas el nombre como texto: el enlace sirve para sumar, el texto es lo que se firmo.';
COMMENT ON COLUMN persona.categoria IS
    'Pista para filtrar selectores. La condicion de socio la dice la tabla socio, nunca esta columna.';

-- ===== REGISTRO DE SOCIOS =====

CREATE TABLE IF NOT EXISTS socio (
    persona_id       bigint PRIMARY KEY REFERENCES persona(id),
    participacion_pct numeric(5,2)
                     CHECK (participacion_pct IS NULL
                            OR (participacion_pct > 0 AND participacion_pct <= 100)),
    -- El documento que lo acredita. Un socio que nadie puede acreditar con un
    -- acta no deberia poder retirar utilidades a cuenta de nada.
    acta_referencia  text NOT NULL CHECK (char_length(trim(acta_referencia)) >= 3),
    fecha_alta       date NOT NULL DEFAULT current_date,
    fecha_baja       date,
    activo           boolean GENERATED ALWAYS AS (fecha_baja IS NULL) STORED,
    creado_por       bigint NOT NULL REFERENCES usuario(id),
    creado_en        timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_baja IS NULL OR fecha_baja >= fecha_alta)
);

COMMENT ON TABLE socio IS
    'Quien tiene parte del capital social. No se deriva de usuario: un accionista rara vez opera el DMS.';

-- La suma de participaciones de los socios vigentes no puede pasar de 100.
-- Es aritmetica elemental, y precisamente por eso nadie la revisa: un reparto
-- calculado sobre porcentajes que suman 130 reparte dinero que no existe.
CREATE OR REPLACE FUNCTION validar_participacion_socios()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_total numeric(6,2);
BEGIN
    SELECT COALESCE(sum(s.participacion_pct), 0) INTO v_total
      FROM socio s
     WHERE s.fecha_baja IS NULL
       AND s.persona_id <> NEW.persona_id;

    IF v_total + COALESCE(NEW.participacion_pct, 0) > 100 THEN
        RAISE EXCEPTION
            'Las participaciones de los socios vigentes sumarian % por ciento; el capital social no puede repartirse mas de una vez',
            to_char(v_total + COALESCE(NEW.participacion_pct, 0), 'FM999.00');
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS socio_participacion_coherente ON socio;
CREATE TRIGGER socio_participacion_coherente
    BEFORE INSERT OR UPDATE OF participacion_pct, fecha_baja ON socio
    FOR EACH ROW EXECUTE FUNCTION validar_participacion_socios();

-- ===== EL VALE APUNTA AL CATALOGO =====

-- La vista se suelta primero: depende de socio_usuario_id y sin esto el
-- DROP COLUMN de mas abajo se estrella contra ella. Se reconstruye al final,
-- ya sobre el registro de socios.
DROP VIEW IF EXISTS v_anticipo_utilidades_socio;

ALTER TABLE vale_egreso_rci05
    ADD COLUMN IF NOT EXISTS beneficiario_persona_id bigint REFERENCES persona(id),
    ADD COLUMN IF NOT EXISTS socio_persona_id bigint REFERENCES socio(persona_id);

COMMENT ON COLUMN vale_egreso_rci05.beneficiario_persona_id IS
    'Enlace opcional al catalogo. El nombre y la identificacion siguen guardandose como texto: eso es lo que se firmo.';

-- Se sustituye socio_usuario_id. La condicion de socio dejo de vivir en usuario,
-- asi que mantener las dos columnas seria conservar dos respuestas para la
-- misma pregunta. Se migra lo que hubiera antes de soltar la columna.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'traza' AND table_name = 'vale_egreso_rci05'
                  AND column_name = 'socio_usuario_id') THEN

        UPDATE vale_egreso_rci05 v
           SET socio_persona_id = p.id
          FROM persona p
         WHERE p.usuario_id = v.socio_usuario_id
           AND v.socio_usuario_id IS NOT NULL
           AND v.socio_persona_id IS NULL;

        IF EXISTS (SELECT 1 FROM vale_egreso_rci05
                    WHERE socio_usuario_id IS NOT NULL AND socio_persona_id IS NULL) THEN
            RAISE EXCEPTION 'Hay vales con socio que no tiene persona equivalente; da de alta esas personas antes de migrar';
        END IF;

        ALTER TABLE vale_egreso_rci05 DROP CONSTRAINT IF EXISTS vale_egreso_rci05_check3;
        ALTER TABLE vale_egreso_rci05 DROP COLUMN socio_usuario_id;
    END IF;
END $$;

-- El candado del inciso b) vuelve a quedar puesto, ahora sobre la columna
-- nueva: un retiro de socio que no dice QUE socio no se puede cargar a nadie
-- cuando llegue el reparto.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vale_retiro_socio_exige_socio') THEN
        ALTER TABLE vale_egreso_rci05 ADD CONSTRAINT vale_retiro_socio_exige_socio CHECK (
            concepto_codigo <> 'RETIRO_UTILIDADES_SOCIO' OR socio_persona_id IS NOT NULL
        );
    END IF;
END $$;

-- ===== EL REPARTO SE ASIGNA A SOCIOS, NO A USUARIOS =====

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'traza' AND table_name = 'reparto_utilidades_socio'
                  AND column_name = 'socio_usuario_id') THEN

        ALTER TABLE reparto_utilidades_socio
            ADD COLUMN IF NOT EXISTS socio_persona_id bigint REFERENCES socio(persona_id);

        UPDATE reparto_utilidades_socio rs
           SET socio_persona_id = p.id
          FROM persona p
         WHERE p.usuario_id = rs.socio_usuario_id AND rs.socio_persona_id IS NULL;

        IF EXISTS (SELECT 1 FROM reparto_utilidades_socio WHERE socio_persona_id IS NULL) THEN
            RAISE EXCEPTION 'Hay repartos asignados a usuarios sin persona equivalente; da de alta esas personas antes de migrar';
        END IF;

        ALTER TABLE reparto_utilidades_socio DROP CONSTRAINT reparto_utilidades_socio_pkey;
        ALTER TABLE reparto_utilidades_socio DROP COLUMN socio_usuario_id;
        ALTER TABLE reparto_utilidades_socio ALTER COLUMN socio_persona_id SET NOT NULL;
        ALTER TABLE reparto_utilidades_socio
            ADD CONSTRAINT reparto_utilidades_socio_pkey PRIMARY KEY (reparto_id, socio_persona_id);
    END IF;
END $$;

-- ===== LA POSICION DE CADA SOCIO =====

-- Cambia algo mas que el nombre de una columna. Antes la vista partia de
-- usuario y solo mostraba a quien YA tenia movimiento, de modo que un socio
-- recien dado de alta no existia para el sistema hasta que retiraba dinero.
-- Ahora parte del registro de socios: TODOS aparecen, los de saldo cero
-- tambien. Un tablero que solo enumera a los que deben no permite ver que
-- alguien no ha recibido nada.
CREATE OR REPLACE VIEW v_anticipo_utilidades_socio AS
WITH anticipos AS (
    SELECT v.socio_persona_id, sum(v.importe) AS total_anticipos
      FROM vale_egreso_rci05 v
      JOIN v_documento_financiero d ON d.id = v.documento_id
     WHERE v.concepto_codigo = 'RETIRO_UTILIDADES_SOCIO'
       AND d.estado = 'FIRMADO'
     GROUP BY v.socio_persona_id
), repartido AS (
    SELECT rs.socio_persona_id, sum(rs.monto_asignado) AS total_repartido
      FROM reparto_utilidades_socio rs
     GROUP BY rs.socio_persona_id
)
SELECT s.persona_id            AS socio_persona_id,
       p.nombre                AS socio_nombre,
       p.usuario_id            AS socio_usuario_id,
       s.participacion_pct,
       s.activo,
       COALESCE(a.total_anticipos, 0) AS total_anticipos,
       COALESCE(r.total_repartido, 0) AS total_repartido,
       COALESCE(a.total_anticipos, 0) - COALESCE(r.total_repartido, 0) AS saldo_por_comprobar
  FROM socio s
  JOIN persona p ON p.id = s.persona_id
  LEFT JOIN anticipos a ON a.socio_persona_id = s.persona_id
  LEFT JOIN repartido r ON r.socio_persona_id = s.persona_id;

COMMENT ON VIEW v_anticipo_utilidades_socio IS
    'Posicion de cada socio registrado. Incluye a los de saldo cero: un tablero que solo enumera a los que deben no deja ver a quien no ha recibido nada.';

-- ===== EL AVISO DE RETIRO SIN RESPALDO =====

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
      FROM v_anticipo_utilidades_socio WHERE socio_persona_id = NEW.socio_persona_id;

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

-- ===== UN SOCIO DADO DE BAJA NO RETIRA UTILIDADES =====

-- Distingue dos casos que NO son el mismo, aunque ambos impidan el retiro:
-- quien nunca fue socio, y quien lo fue y ya no. El disparador corre BEFORE
-- INSERT, o sea antes que la llave foranea, asi que es el unico que llega a
-- hablar: si dijera "ya no figura" de alguien que jamas figuro, mandaria a
-- buscar en el registro una baja que no existe.
CREATE OR REPLACE FUNCTION exigir_socio_vigente()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_activo boolean;
    v_nombre text;
BEGIN
    IF NEW.socio_persona_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT s.activo, p.nombre INTO v_activo, v_nombre
      FROM socio s JOIN persona p ON p.id = s.persona_id
     WHERE s.persona_id = NEW.socio_persona_id;

    IF NOT FOUND THEN
        SELECT p.nombre INTO v_nombre FROM persona p WHERE p.id = NEW.socio_persona_id;
        RAISE EXCEPTION
            '% no esta registrada como socio; da de alta su participacion con el acta que la acredita antes de entregarle un retiro de utilidades',
            COALESCE(v_nombre, 'La persona indicada');
    END IF;

    IF NOT v_activo THEN
        RAISE EXCEPTION
            '% ya no figura como socio vigente; un retiro de utilidades a su nombre no tiene en que sostenerse',
            v_nombre;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS vale_exige_socio_vigente ON vale_egreso_rci05;
CREATE TRIGGER vale_exige_socio_vigente
    BEFORE INSERT ON vale_egreso_rci05
    FOR EACH ROW EXECUTE FUNCTION exigir_socio_vigente();

-- ===== LO QUE SE LE HA PAGADO A CADA PERSONA =====

-- La razon de ser del catalogo: poder sumar. Solo cuenta vales FIRMADOS, que
-- son los unicos que movieron dinero.
--
-- El filtro de estado va en los agregados y NO en un WHERE. Con un WHERE, una
-- persona cuyo unico vale sigue en borrador se queda sin renglones, y sin
-- renglones no hay grupo: desaparecia entera del catalogo, mientras que otra
-- sin vale alguno si aparecia en ceros. Dos personas igual de "sin pagos" y
-- una visible y la otra no.
CREATE OR REPLACE VIEW v_pagos_por_persona AS
SELECT p.id            AS persona_id,
       p.nombre,
       p.categoria,
       p.activa,
       count(v.documento_id) FILTER (WHERE d.id IS NOT NULL)          AS vales,
       COALESCE(sum(v.importe) FILTER (WHERE d.id IS NOT NULL), 0)    AS total_pagado,
       max(v.fecha_hora) FILTER (WHERE d.id IS NOT NULL)              AS ultimo_pago
  FROM persona p
  LEFT JOIN vale_egreso_rci05 v ON v.beneficiario_persona_id = p.id
  LEFT JOIN v_documento_financiero d
         ON d.id = v.documento_id AND d.estado = 'FIRMADO'
 GROUP BY p.id, p.nombre, p.categoria, p.activa;

COMMENT ON VIEW v_pagos_por_persona IS
    'Cuanto se le ha pagado a cada persona del catalogo. Solo vales firmados: son los unicos que movieron dinero.';

COMMIT;
