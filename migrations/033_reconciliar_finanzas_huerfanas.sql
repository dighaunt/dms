

BEGIN;

DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'traza' AND t.typname = 'medio_pago_c02'
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE n.nspname = 'traza' AND t.typname = 'forma_pago'
    ) THEN
        ALTER TYPE traza.medio_pago_c02 RENAME TO forma_pago;
    END IF;
END $$;

DO $$ BEGIN
    CREATE TYPE traza.forma_pago AS ENUM (
        'EFECTIVO',
        'SPEI',
        'TRANSFERENCIA',
        'TARJETA',
        'CHEQUE',
        'FINANCIAMIENTO',
        'OTRO'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE traza.tipo_movimiento_caja AS ENUM (
        'COBRO',
        'PAGO_COMPRA',
        'LIQUIDACION_CONSIGNANTE',
        'REEMBOLSO'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE traza.estatus_movimiento_caja AS ENUM (
        'REGISTRADO',
        'VERIFICADO',
        'CANCELADO'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS traza.umbral_pld (
    anio                  smallint PRIMARY KEY,

    
    uma_valor             numeric(10,2) NOT NULL CHECK (uma_valor > 0),
    umbral_identificacion numeric(18,2) NOT NULL CHECK (umbral_identificacion > 0),
    umbral_aviso          numeric(18,2) NOT NULL,
    actualizado_por       bigint NOT NULL REFERENCES traza.usuario(id),
    actualizado_en        timestamptz NOT NULL DEFAULT now(),

    
    CHECK (umbral_aviso > umbral_identificacion)
);

COMMENT ON TABLE traza.umbral_pld IS
    'Una fila por año (LFPIORPI art. 17-VIII: 3,210 UMA identificación, 6,420 UMA aviso). Única fuente del umbral PLD: ninguna otra tabla ni función lo guarda por su cuenta.';

CREATE TABLE IF NOT EXISTS traza.permiso (

    
    codigo       text PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z0-9_.]*$'),
    descripcion  text NOT NULL,
    modulo       text NOT NULL DEFAULT 'finanzas',

    nivel_minimo text NOT NULL CHECK (nivel_minimo = ANY (ARRAY['N1'::text, 'N2'::text, 'N3'::text, 'EXTERNO'::text]))
);

INSERT INTO traza.permiso (codigo, descripcion, modulo, nivel_minimo) VALUES
 ('caja.administrar_rbac',        'Crear o editar rol_sistema, asignar o revocar permisos',                                       'finanzas', 'N3'),
 ('caja.aprobar_reembolso_n2',    'Aprobar reembolsos con pena ya pactada o excepciones estándar',                                'finanzas', 'N2'),
 ('caja.aprobar_reembolso_n3',    'Aprobar pena espejo por incumplimiento del lote, o romper una reserva',                        'finanzas', 'N3'),
 ('caja.cancelar_movimiento',     'Cancelar un movimiento erróneo; deja traza, nunca borra',                                      'finanzas', 'N2'),
 ('caja.custodiar_efectivo',      'Recibir la custodia física del efectivo de manos de quien lo recibió',                         'finanzas', 'N1'),
 ('caja.emitir_rci',              'Emitir el recibo de caja interno (RCI)',                                                       'finanzas', 'N1'),
 ('caja.recibir_pago',            'Recibir el pago del cliente (efectivo o comprobante electrónico)',                             'finanzas', 'N1'),
 ('caja.registrar_deposito',      'Registrar el depósito bancario del efectivo',                                                  'finanzas', 'N1'),
 ('caja.resolver_cfdi_reembolso', 'Confirmar o coordinar la cancelación de CFDI antes de liberar un reembolso (Contabilidad)',    'finanzas', 'EXTERNO'),
 ('caja.verificar_movimiento',    'Contar o validar el monto, verificar acreditación bancaria',                                   'finanzas', 'N1')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS traza.permiso_conflicto (
    permiso_codigo_a text NOT NULL REFERENCES traza.permiso(codigo),
    permiso_codigo_b text NOT NULL REFERENCES traza.permiso(codigo),
    PRIMARY KEY (permiso_codigo_a, permiso_codigo_b),

    
    CHECK (permiso_codigo_a < permiso_codigo_b)
);

INSERT INTO traza.permiso_conflicto (permiso_codigo_a, permiso_codigo_b) VALUES
 ('caja.aprobar_reembolso_n2', 'caja.recibir_pago'),
 ('caja.aprobar_reembolso_n3', 'caja.recibir_pago'),
 ('caja.emitir_rci',           'caja.recibir_pago'),
 ('caja.emitir_rci',           'caja.registrar_deposito')
ON CONFLICT (permiso_codigo_a, permiso_codigo_b) DO NOTHING;

CREATE TABLE IF NOT EXISTS traza.rol_sistema (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                 text NOT NULL UNIQUE,
    descripcion            text,

    nivel_minimo_requerido text NOT NULL CHECK (nivel_minimo_requerido = ANY (ARRAY['N1'::text, 'N2'::text, 'N3'::text, 'EXTERNO'::text])),
    creado_por             bigint NOT NULL REFERENCES traza.usuario(id),
    creado_en              timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traza.rol_sistema_permiso (
    rol_sistema_id bigint NOT NULL REFERENCES traza.rol_sistema(id),
    permiso_codigo text NOT NULL REFERENCES traza.permiso(codigo),
    PRIMARY KEY (rol_sistema_id, permiso_codigo)
);

CREATE TABLE IF NOT EXISTS traza.empleado_rol_sistema (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empleado_id        bigint NOT NULL REFERENCES traza.usuario(id),
    rol_sistema_id     bigint NOT NULL REFERENCES traza.rol_sistema(id),
    fecha_inicio       timestamptz NOT NULL DEFAULT now(),
    fecha_fin          timestamptz,

    titular_o_suplente text NOT NULL DEFAULT 'titular' CHECK (titular_o_suplente = ANY (ARRAY['titular'::text, 'suplente'::text])),
    asignado_por_id    bigint NOT NULL REFERENCES traza.usuario(id),

    CHECK ((fecha_fin IS NULL) OR (fecha_fin > fecha_inicio))
);

CREATE UNIQUE INDEX IF NOT EXISTS empleado_rol_sistema_activo_unico
    ON traza.empleado_rol_sistema USING btree (empleado_id, rol_sistema_id)
    WHERE (fecha_fin IS NULL);

CREATE TABLE IF NOT EXISTS traza.bitacora_rbac (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empleado_rol_sistema_id bigint NOT NULL REFERENCES traza.empleado_rol_sistema(id),
    accion                  text NOT NULL CHECK (accion = ANY (ARRAY['asignado'::text, 'revocado'::text])),
    fecha_hora              timestamptz NOT NULL DEFAULT now(),

    realizado_por_id        bigint NOT NULL REFERENCES traza.usuario(id),
    motivo                  text
);

CREATE TABLE IF NOT EXISTS traza.operacion (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    documento_id   bigint NOT NULL UNIQUE REFERENCES traza.documento(id),
    asesor_id      bigint NOT NULL REFERENCES traza.usuario(id),

    precio_pactado numeric(18,2),
    creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traza.movimiento_caja (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operacion_id       bigint NOT NULL REFERENCES traza.operacion(id),
    forma_pago         traza.forma_pago NOT NULL,
    tipo_movimiento    traza.tipo_movimiento_caja NOT NULL,

    monto              numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha_hora         timestamptz NOT NULL DEFAULT now(),

    quien_recibio_id   bigint NOT NULL REFERENCES traza.usuario(id),
    referencia         text CHECK (char_length(TRIM(BOTH FROM COALESCE(referencia, ''::text))) <= 120),
    detalle            text CHECK (char_length(TRIM(BOTH FROM COALESCE(detalle, ''::text))) <= 240),
    estatus_movimiento traza.estatus_movimiento_caja NOT NULL DEFAULT 'REGISTRADO',
    cancelado_por_id   bigint REFERENCES traza.usuario(id),
    cancelado_en       timestamptz,
    motivo_cancelacion text,

    
    CHECK ((estatus_movimiento = 'CANCELADO'::traza.estatus_movimiento_caja) = ((cancelado_por_id IS NOT NULL) AND (cancelado_en IS NOT NULL)))
);

CREATE INDEX IF NOT EXISTS movimiento_caja_operacion_idx
    ON traza.movimiento_caja USING btree (operacion_id, fecha_hora, id);

CREATE TABLE IF NOT EXISTS traza.movimiento_caja_efectivo (
    movimiento_id       bigint PRIMARY KEY REFERENCES traza.movimiento_caja(id),

    
    testigo_id          bigint NOT NULL REFERENCES traza.usuario(id),
    custodio_id         bigint NOT NULL REFERENCES traza.usuario(id),
    fecha_hora_custodia timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS traza.movimiento_caja_electronico (
    movimiento_id                 bigint PRIMARY KEY REFERENCES traza.movimiento_caja(id),
    referencia_bancaria           text NOT NULL,
    cuenta_destino                text,
    fecha_acreditacion_verificada timestamptz,
    verificado_por_id             bigint REFERENCES traza.usuario(id)
);

CREATE SEQUENCE IF NOT EXISTS traza.folio_rci_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;

CREATE TABLE IF NOT EXISTS traza.recibo_caja_interno (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    movimiento_id  bigint NOT NULL UNIQUE REFERENCES traza.movimiento_caja(id),

    folio_rci      text NOT NULL UNIQUE,
    fecha_emision  timestamptz NOT NULL DEFAULT now(),
    emitido_por_id bigint NOT NULL REFERENCES traza.usuario(id),

    estatus        text NOT NULL DEFAULT 'emitido' CHECK (estatus = ANY (ARRAY['emitido'::text, 'cancelado'::text]))
);

CREATE TABLE IF NOT EXISTS traza.deposito_bancario (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recibo_id         bigint NOT NULL REFERENCES traza.recibo_caja_interno(id),
    monto_depositado  numeric(18,2) NOT NULL CHECK (monto_depositado > 0),
    fecha_deposito    date NOT NULL,
    cuenta_destino    text NOT NULL,

    comprobante_ref   text NOT NULL,
    registrado_por_id bigint NOT NULL REFERENCES traza.usuario(id),
    registrado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS deposito_bancario_recibo_unico
    ON traza.deposito_bancario USING btree (recibo_id);

CREATE TABLE IF NOT EXISTS traza.reembolso (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operacion_id         bigint NOT NULL REFERENCES traza.operacion(id),
    tipo_reembolso       text NOT NULL CHECK (tipo_reembolso = ANY (ARRAY['apartado'::text, 'compraventa'::text])),

    movimiento_id_origen bigint NOT NULL REFERENCES traza.movimiento_caja(id),
    formula_aplicada     text NOT NULL CHECK (formula_aplicada = ANY (ARRAY['P_C01'::text, 'D_vendedor'::text, 'P_C02'::text])),
    monto_base           numeric(18,2) NOT NULL CHECK (monto_base >= 0),
    monto_pena           numeric(18,2) NOT NULL CHECK (monto_pena >= 0),
    monto_reembolsado    numeric(18,2) NOT NULL CHECK (monto_reembolsado >= 0),
    aprobador_id         bigint NOT NULL REFERENCES traza.usuario(id),

    movimiento_id_salida bigint REFERENCES traza.movimiento_caja(id),

    cfdi_estatus         text NOT NULL DEFAULT 'no_aplica' CHECK (cfdi_estatus = ANY (ARRAY['no_aplica'::text, 'pendiente_cancelacion'::text, 'cancelado'::text])),
    creado_en            timestamptz NOT NULL DEFAULT now(),

    
    CHECK (round((monto_base - monto_pena), 2) = monto_reembolsado)
);

CREATE UNIQUE INDEX IF NOT EXISTS reembolso_movimiento_salida_unico
    ON traza.reembolso USING btree (movimiento_id_salida)
    WHERE (movimiento_id_salida IS NOT NULL);

CREATE OR REPLACE FUNCTION traza.tiene_permiso(p_usuario_id bigint, p_codigo text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'traza'
AS $function$
    SELECT EXISTS (
        SELECT 1
          FROM empleado_rol_sistema ers
          JOIN rol_sistema_permiso rsp ON rsp.rol_sistema_id = ers.rol_sistema_id
         WHERE ers.empleado_id = p_usuario_id
           AND rsp.permiso_codigo = p_codigo
           AND ers.fecha_fin IS NULL
    )
$function$;

CREATE OR REPLACE FUNCTION traza.validar_empleado_rol_sistema()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'traza'
AS $function$
DECLARE
    v_nivel_asignador     text;
    v_nivel_empleado      text;
    v_nivel_empleado_num  int;
    v_max_nivel_requerido int;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Una asignación de rol de sistema nunca se borra; se revoca con fecha_fin';
    END IF;

    IF current_setting('traza.rbac_interno', true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION 'Las asignaciones de rol de sistema solo se crean o revocan mediante traza.asignar_rol_sistema o traza.revocar_rol_sistema';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.asignado_por_id = NEW.empleado_id THEN
            RAISE EXCEPTION 'Nadie se autoasigna un rol de sistema';
        END IF;

        SELECT nivel INTO v_nivel_asignador FROM usuario WHERE id = NEW.asignado_por_id;
        IF v_nivel_asignador IS DISTINCT FROM 'N3' THEN
            RAISE EXCEPTION 'Solo un administrador global (N3) puede asignar un rol de sistema';
        END IF;

        SELECT nivel INTO v_nivel_empleado FROM usuario WHERE id = NEW.empleado_id;
        v_nivel_empleado_num := CASE v_nivel_empleado WHEN 'N1' THEN 1 WHEN 'N2' THEN 2 WHEN 'N3' THEN 3 ELSE 0 END;

        SELECT max(CASE p.nivel_minimo WHEN 'N1' THEN 1 WHEN 'N2' THEN 2 WHEN 'N3' THEN 3 ELSE 0 END)
          INTO v_max_nivel_requerido
          FROM rol_sistema_permiso rsp
          JOIN permiso p ON p.codigo = rsp.permiso_codigo
         WHERE rsp.rol_sistema_id = NEW.rol_sistema_id;

        IF v_max_nivel_requerido IS NOT NULL AND v_nivel_empleado_num < v_max_nivel_requerido THEN
            RAISE EXCEPTION 'El nivel del empleado no alcanza el mínimo que exige algún permiso de este rol de sistema; RBAC no es puerta trasera para dar autoridad mayor';
        END IF;
    END IF;

    RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION traza.asignar_rol_sistema(p_empleado_id bigint, p_rol_sistema_id bigint, p_asignado_por_id bigint, p_titular_o_suplente text DEFAULT 'titular'::text)
 RETURNS traza.empleado_rol_sistema
 LANGUAGE plpgsql
 SET search_path TO 'traza'
AS $function$
DECLARE
    v_fila empleado_rol_sistema;
BEGIN
    PERFORM set_config('traza.rbac_interno', 'si', true);
    INSERT INTO empleado_rol_sistema (empleado_id, rol_sistema_id, asignado_por_id, titular_o_suplente)
    VALUES (p_empleado_id, p_rol_sistema_id, p_asignado_por_id, p_titular_o_suplente)
    RETURNING * INTO v_fila;

    INSERT INTO bitacora_rbac (empleado_rol_sistema_id, accion, realizado_por_id)
    VALUES (v_fila.id, 'asignado', p_asignado_por_id);

    RETURN v_fila;
END $function$;

CREATE OR REPLACE FUNCTION traza.revocar_rol_sistema(p_empleado_rol_sistema_id bigint, p_revocado_por_id bigint, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'traza'
AS $function$
DECLARE
    v_nivel text;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = p_revocado_por_id;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'Solo un administrador global (N3) puede revocar un rol de sistema';
    END IF;

    PERFORM set_config('traza.rbac_interno', 'si', true);
    UPDATE empleado_rol_sistema
       SET fecha_fin = now()
     WHERE id = p_empleado_rol_sistema_id
       AND fecha_fin IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La asignación no existe o ya estaba revocada';
    END IF;

    INSERT INTO bitacora_rbac (empleado_rol_sistema_id, accion, realizado_por_id, motivo)
    VALUES (p_empleado_rol_sistema_id, 'revocado', p_revocado_por_id, p_motivo);
END $function$;

DROP TRIGGER IF EXISTS empleado_rol_sistema_validado ON traza.empleado_rol_sistema;
CREATE TRIGGER empleado_rol_sistema_validado BEFORE INSERT OR DELETE OR UPDATE ON traza.empleado_rol_sistema FOR EACH ROW EXECUTE FUNCTION traza.validar_empleado_rol_sistema();

DROP TRIGGER IF EXISTS bitacora_rbac_inmutable ON traza.bitacora_rbac;
CREATE TRIGGER bitacora_rbac_inmutable BEFORE DELETE OR UPDATE ON traza.bitacora_rbac FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

CREATE OR REPLACE FUNCTION traza.proteger_operacion()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza
AS $$
BEGIN
    IF current_setting('traza.caja_interno', true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION 'Una operación de caja solo se crea mediante traza.registrar_operacion';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION traza.sincronizar_precio_operacion(p_documento_id bigint)
RETURNS void
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_tipo   text;
    v_campo  text;
    v_precio numeric(18,2);
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento WHERE id = p_documento_id;
    v_campo := CASE v_tipo
        WHEN 'C-01' THEN 'c01_monto_num'
        WHEN 'C-02' THEN 'c02_precio_num'
        WHEN 'C-03' THEN 'c03_precio_num'
        ELSE NULL
    END;
    IF v_campo IS NULL THEN
        RETURN;
    END IF;

    SELECT valor_numero INTO v_precio
      FROM documento_campo_valor
     WHERE documento_id = p_documento_id AND campo_pdf = v_campo;

    PERFORM set_config('traza.caja_interno', 'si', true);
    UPDATE operacion SET precio_pactado = v_precio WHERE documento_id = p_documento_id;
END $$;

CREATE OR REPLACE FUNCTION traza.registrar_operacion(p_documento_id bigint, p_asesor_id bigint)
RETURNS traza.operacion
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_tipo text;
    v_fila operacion;
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento WHERE id = p_documento_id;
    IF v_tipo NOT IN ('C-01', 'C-02', 'C-03', 'C-04') THEN
        RAISE EXCEPTION 'Solo un C-01, C-02, C-03 o C-04 puede tener una operación de caja';
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO operacion (documento_id, asesor_id)
    VALUES (p_documento_id, p_asesor_id)
    ON CONFLICT (documento_id) DO NOTHING;

    PERFORM sincronizar_precio_operacion(p_documento_id);
    SELECT * INTO v_fila FROM operacion WHERE documento_id = p_documento_id;
    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.recalcular_precio_operacion_por_campo()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_documento_id bigint;
    v_campo_pdf    text;
BEGIN
    v_documento_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    v_campo_pdf := CASE WHEN TG_OP = 'DELETE' THEN OLD.campo_pdf ELSE NEW.campo_pdf END;

    IF v_campo_pdf IN ('c01_monto_num', 'c02_precio_num', 'c03_precio_num') THEN
        PERFORM sincronizar_precio_operacion(v_documento_id);
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION traza.proteger_ledger_caja()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza
AS $$
BEGIN
    IF current_setting('traza.caja_interno', true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION 'Los movimientos de caja solo se crean, verifican o cancelan mediante las funciones del módulo de Finanzas';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION traza.registrar_movimiento_caja(p_operacion_id bigint, p_forma_pago traza.forma_pago, p_tipo_movimiento traza.tipo_movimiento_caja, p_monto numeric, p_quien_recibio_id bigint, p_referencia text DEFAULT NULL::text, p_detalle text DEFAULT NULL::text)
RETURNS traza.movimiento_caja
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_fila movimiento_caja;
BEGIN
    IF NOT tiene_permiso(p_quien_recibio_id, 'caja.recibir_pago') THEN
        RAISE EXCEPTION 'La persona que recibe el pago no tiene el permiso caja.recibir_pago';
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO movimiento_caja (
        operacion_id, forma_pago, tipo_movimiento, monto, quien_recibio_id, referencia, detalle
    ) VALUES (
        p_operacion_id, p_forma_pago, p_tipo_movimiento, p_monto, p_quien_recibio_id, p_referencia, p_detalle
    ) RETURNING * INTO v_fila;

    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.validar_movimiento_caja_efectivo()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_receptor bigint;
    v_forma    traza.forma_pago;
BEGIN
    SELECT quien_recibio_id, forma_pago INTO v_receptor, v_forma
      FROM movimiento_caja WHERE id = NEW.movimiento_id;

    IF v_forma <> 'EFECTIVO' THEN
        RAISE EXCEPTION 'La custodia de efectivo solo aplica a movimientos con forma de pago EFECTIVO';
    END IF;
    IF NEW.testigo_id = v_receptor OR NEW.custodio_id = v_receptor THEN
        RAISE EXCEPTION 'El testigo y el custodio del efectivo deben ser distintos de quien lo recibió';
    END IF;
    IF NEW.testigo_id = NEW.custodio_id THEN
        RAISE EXCEPTION 'El testigo y el custodio deben ser dos personas distintas';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION traza.registrar_custodia_efectivo(p_movimiento_id bigint, p_testigo_id bigint, p_custodio_id bigint)
RETURNS traza.movimiento_caja_efectivo
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_fila movimiento_caja_efectivo;
BEGIN
    IF NOT tiene_permiso(p_custodio_id, 'caja.custodiar_efectivo') THEN
        RAISE EXCEPTION 'Quien recibe la custodia no tiene el permiso caja.custodiar_efectivo';
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO movimiento_caja_efectivo (movimiento_id, testigo_id, custodio_id)
    VALUES (p_movimiento_id, p_testigo_id, p_custodio_id)
    RETURNING * INTO v_fila;
    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.confirmar_acreditacion_electronica(p_movimiento_id bigint, p_referencia_bancaria text, p_cuenta_destino text, p_verificado_por_id bigint)
RETURNS traza.movimiento_caja_electronico
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_forma traza.forma_pago;
    v_fila  movimiento_caja_electronico;
BEGIN
    SELECT forma_pago INTO v_forma FROM movimiento_caja WHERE id = p_movimiento_id;
    IF v_forma = 'EFECTIVO' THEN
        RAISE EXCEPTION 'La acreditación electrónica no aplica a movimientos en efectivo';
    END IF;
    IF NOT tiene_permiso(p_verificado_por_id, 'caja.verificar_movimiento') THEN
        RAISE EXCEPTION 'No tiene el permiso caja.verificar_movimiento';
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO movimiento_caja_electronico (
        movimiento_id, referencia_bancaria, cuenta_destino, fecha_acreditacion_verificada, verificado_por_id
    ) VALUES (
        p_movimiento_id, p_referencia_bancaria, p_cuenta_destino, now(), p_verificado_por_id
    ) RETURNING * INTO v_fila;
    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.verificar_movimiento_caja(p_movimiento_id bigint, p_usuario_id bigint)
RETURNS traza.movimiento_caja
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_movimiento movimiento_caja;
BEGIN
    IF NOT tiene_permiso(p_usuario_id, 'caja.verificar_movimiento') THEN
        RAISE EXCEPTION 'No tiene el permiso caja.verificar_movimiento';
    END IF;

    SELECT * INTO v_movimiento FROM movimiento_caja WHERE id = p_movimiento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento de caja no encontrado';
    END IF;
    IF v_movimiento.estatus_movimiento <> 'REGISTRADO' THEN
        RAISE EXCEPTION 'Solo un movimiento registrado puede pasar a verificado';
    END IF;
    IF v_movimiento.quien_recibio_id = p_usuario_id THEN
        RAISE EXCEPTION 'Quien recibió el pago no puede verificarlo';
    END IF;

    IF v_movimiento.forma_pago = 'EFECTIVO' THEN
        IF NOT EXISTS (SELECT 1 FROM movimiento_caja_efectivo WHERE movimiento_id = p_movimiento_id) THEN
            RAISE EXCEPTION 'Falta registrar testigo y custodio antes de verificar un movimiento en efectivo';
        END IF;
        IF v_movimiento.monto >= umbral_efectivo_pld() THEN
            RAISE EXCEPTION 'El monto en efectivo alcanza o supera el umbral PLD; no se verifica ni se emite recibo';
        END IF;
    ELSE
        IF NOT EXISTS (
            SELECT 1 FROM movimiento_caja_electronico
             WHERE movimiento_id = p_movimiento_id AND fecha_acreditacion_verificada IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'Falta confirmar la acreditación bancaria antes de verificar un movimiento electrónico';
        END IF;
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    UPDATE movimiento_caja SET estatus_movimiento = 'VERIFICADO' WHERE id = p_movimiento_id
    RETURNING * INTO v_movimiento;
    RETURN v_movimiento;
END $$;

CREATE OR REPLACE FUNCTION traza.emitir_rci(p_movimiento_id bigint, p_emitido_por_id bigint, p_contraparte_documento_id bigint DEFAULT NULL::bigint)
RETURNS traza.recibo_caja_interno
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_movimiento movimiento_caja;
    v_documento_id bigint;
    v_expediente bigint;
    v_folio text;
    v_fila recibo_caja_interno;
BEGIN
    IF NOT tiene_permiso(p_emitido_por_id, 'caja.emitir_rci') THEN
        RAISE EXCEPTION 'No tiene el permiso caja.emitir_rci';
    END IF;

    SELECT * INTO v_movimiento FROM movimiento_caja WHERE id = p_movimiento_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimiento de caja no encontrado';
    END IF;
    IF v_movimiento.estatus_movimiento <> 'VERIFICADO' THEN
        RAISE EXCEPTION 'El movimiento debe estar verificado antes de emitir su RCI';
    END IF;
    IF p_emitido_por_id = v_movimiento.quien_recibio_id THEN
        RAISE EXCEPTION 'Quien recibió el pago no puede emitir su propio recibo de caja interno';
    END IF;
    IF EXISTS (SELECT 1 FROM recibo_caja_interno WHERE movimiento_id = p_movimiento_id) THEN
        RAISE EXCEPTION 'Este movimiento ya tiene un RCI emitido';
    END IF;

    IF p_contraparte_documento_id IS NOT NULL THEN
        SELECT o.documento_id INTO v_documento_id FROM operacion o WHERE o.id = v_movimiento.operacion_id;
        SELECT expediente_id INTO v_expediente FROM documento WHERE id = v_documento_id;
        IF NOT EXISTS (
            SELECT 1 FROM documento d
             WHERE d.id = p_contraparte_documento_id
               AND d.tipo_codigo = 'F-03'
               AND d.expediente_id = v_expediente
               AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id)
        ) THEN
            RAISE EXCEPTION 'El origen del pago no coincide con una identificación (F-03) vigente de este expediente';
        END IF;
    END IF;

    v_folio := 'RCI-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('folio_rci_seq')::text, 6, '0');

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO recibo_caja_interno (movimiento_id, folio_rci, emitido_por_id)
    VALUES (p_movimiento_id, v_folio, p_emitido_por_id)
    RETURNING * INTO v_fila;

    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.registrar_deposito(p_recibo_id bigint, p_monto_depositado numeric, p_fecha_deposito date, p_cuenta_destino text, p_comprobante_ref text, p_registrado_por_id bigint)
RETURNS traza.deposito_bancario
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_monto_movimiento numeric(18,2);
    v_forma traza.forma_pago;
    v_fila deposito_bancario;
BEGIN
    IF NOT tiene_permiso(p_registrado_por_id, 'caja.registrar_deposito') THEN
        RAISE EXCEPTION 'No tiene el permiso caja.registrar_deposito';
    END IF;

    SELECT mc.monto, mc.forma_pago INTO v_monto_movimiento, v_forma
      FROM recibo_caja_interno rci
      JOIN movimiento_caja mc ON mc.id = rci.movimiento_id
     WHERE rci.id = p_recibo_id;

    IF v_monto_movimiento IS NULL THEN
        RAISE EXCEPTION 'Recibo de caja interno no encontrado';
    END IF;
    IF v_forma <> 'EFECTIVO' THEN
        RAISE EXCEPTION 'Solo los movimientos en efectivo requieren depósito bancario';
    END IF;
    IF p_monto_depositado <> v_monto_movimiento THEN
        RAISE EXCEPTION 'El depósito debe ser íntegro: % contra un movimiento de %',
            to_char(p_monto_depositado, 'FM999,999,999,990.00'), to_char(v_monto_movimiento, 'FM999,999,999,990.00');
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    INSERT INTO deposito_bancario (
        recibo_id, monto_depositado, fecha_deposito, cuenta_destino, comprobante_ref, registrado_por_id
    ) VALUES (
        p_recibo_id, p_monto_depositado, p_fecha_deposito, p_cuenta_destino, p_comprobante_ref, p_registrado_por_id
    ) RETURNING * INTO v_fila;

    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.cancelar_movimiento_caja(p_movimiento_id bigint, p_cancelado_por_id bigint, p_motivo text)
RETURNS traza.movimiento_caja
LANGUAGE plpgsql SET search_path = traza
AS $$
DECLARE
    v_fila movimiento_caja;
BEGIN
    IF char_length(trim(coalesce(p_motivo, ''))) < 10 THEN
        RAISE EXCEPTION 'Describe el motivo de la cancelación (mínimo 10 caracteres)';
    END IF;
    IF NOT tiene_permiso(p_cancelado_por_id, 'caja.cancelar_movimiento') THEN
        RAISE EXCEPTION 'No tiene el permiso caja.cancelar_movimiento';
    END IF;

    PERFORM set_config('traza.caja_interno', 'si', true);
    UPDATE movimiento_caja
       SET estatus_movimiento = 'CANCELADO',
           cancelado_por_id = p_cancelado_por_id,
           cancelado_en = now(),
           motivo_cancelacion = p_motivo
     WHERE id = p_movimiento_id
       AND estatus_movimiento <> 'CANCELADO'
    RETURNING * INTO v_fila;

    IF v_fila.id IS NULL THEN
        RAISE EXCEPTION 'Movimiento no encontrado o ya cancelado';
    END IF;
    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.pago_verificado(p_operacion_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SET search_path = traza
AS $$
    SELECT COALESCE(
        (SELECT precio_pactado FROM operacion WHERE id = p_operacion_id) IS NOT NULL
        AND (SELECT precio_pactado FROM operacion WHERE id = p_operacion_id) > 0
        AND (SELECT precio_pactado FROM operacion WHERE id = p_operacion_id) = (
            SELECT COALESCE(sum(mc.monto), 0)
              FROM movimiento_caja mc
             WHERE mc.operacion_id = p_operacion_id
               AND mc.estatus_movimiento = 'VERIFICADO'
               AND mc.tipo_movimiento = 'COBRO'
        )
        AND NOT EXISTS (
            SELECT 1
              FROM movimiento_caja mc
             WHERE mc.operacion_id = p_operacion_id
               AND mc.estatus_movimiento = 'VERIFICADO'
               AND mc.tipo_movimiento = 'COBRO'
               AND mc.forma_pago = 'EFECTIVO'
               AND NOT EXISTS (
                   SELECT 1 FROM recibo_caja_interno r
                     JOIN deposito_bancario d ON d.recibo_id = r.id
                    WHERE r.movimiento_id = mc.id
               )
        ),
        false
    )
$$;

DROP TRIGGER IF EXISTS operacion_protegida ON traza.operacion;
CREATE TRIGGER operacion_protegida
    BEFORE INSERT OR DELETE OR UPDATE ON traza.operacion
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_operacion();

DROP TRIGGER IF EXISTS movimiento_caja_protegido ON traza.movimiento_caja;
CREATE TRIGGER movimiento_caja_protegido
    BEFORE INSERT OR DELETE OR UPDATE ON traza.movimiento_caja
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_ledger_caja();

DROP TRIGGER IF EXISTS movimiento_caja_efectivo_protegido ON traza.movimiento_caja_efectivo;
CREATE TRIGGER movimiento_caja_efectivo_protegido
    BEFORE INSERT OR DELETE OR UPDATE ON traza.movimiento_caja_efectivo
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_ledger_caja();

DROP TRIGGER IF EXISTS movimiento_caja_efectivo_validado ON traza.movimiento_caja_efectivo;
CREATE TRIGGER movimiento_caja_efectivo_validado
    BEFORE INSERT OR UPDATE ON traza.movimiento_caja_efectivo
    FOR EACH ROW EXECUTE FUNCTION traza.validar_movimiento_caja_efectivo();

DROP TRIGGER IF EXISTS movimiento_caja_electronico_protegido ON traza.movimiento_caja_electronico;
CREATE TRIGGER movimiento_caja_electronico_protegido
    BEFORE INSERT OR DELETE OR UPDATE ON traza.movimiento_caja_electronico
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_ledger_caja();

DROP TRIGGER IF EXISTS recibo_caja_interno_protegido ON traza.recibo_caja_interno;
CREATE TRIGGER recibo_caja_interno_protegido
    BEFORE INSERT OR DELETE OR UPDATE ON traza.recibo_caja_interno
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_ledger_caja();

DROP TRIGGER IF EXISTS deposito_bancario_protegido ON traza.deposito_bancario;
CREATE TRIGGER deposito_bancario_protegido
    BEFORE INSERT OR DELETE OR UPDATE ON traza.deposito_bancario
    FOR EACH ROW EXECUTE FUNCTION traza.proteger_ledger_caja();

DROP TRIGGER IF EXISTS documento_campo_valor_sincroniza_precio_operacion ON traza.documento_campo_valor;
CREATE TRIGGER documento_campo_valor_sincroniza_precio_operacion
    AFTER INSERT OR DELETE OR UPDATE ON traza.documento_campo_valor
    FOR EACH ROW EXECUTE FUNCTION traza.recalcular_precio_operacion_por_campo();

CREATE OR REPLACE FUNCTION traza.calcular_pena_espejo_c01(p_documento_id bigint)
RETURNS TABLE(monto_base numeric, monto_pena numeric, monto_reembolsado numeric)
LANGUAGE plpgsql STABLE SET search_path = traza
AS $$
DECLARE
    v_tipo   text;
    v_base   numeric(18,2);
    v_porcentaje CONSTANT numeric(18,2) := 50.00;
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento WHERE id = p_documento_id;
    IF v_tipo IS DISTINCT FROM 'C-01' THEN
        RAISE EXCEPTION 'La pena espejo solo aplica a un C-01';
    END IF;

    SELECT valor_numero INTO v_base
      FROM documento_campo_valor
     WHERE documento_id = p_documento_id AND campo_pdf = 'c01_monto_num' AND tipo = 'NUMERO';

    IF v_base IS NULL OR v_base < 0 THEN
        RAISE EXCEPTION 'Falta capturar el monto del apartado (c01_monto_num) antes de calcular la pena espejo';
    END IF;

    
    RETURN QUERY SELECT v_base, round((v_porcentaje / 100) * v_base, 2),
        v_base + round((v_porcentaje / 100) * v_base, 2);
END $$;

CREATE OR REPLACE FUNCTION traza.calcular_pena_rescision_c02(p_documento_id bigint)
RETURNS TABLE(monto_base numeric, monto_pena numeric, monto_reembolsado numeric)
LANGUAGE plpgsql STABLE SET search_path = traza
AS $$
DECLARE
    v_tipo    text;
    v_precio  numeric(18,2);
    v_operacion_id bigint;
    v_pagado  numeric(18,2);
    v_pena    numeric(18,2);
BEGIN
    SELECT tipo_codigo INTO v_tipo FROM documento WHERE id = p_documento_id;
    IF v_tipo IS DISTINCT FROM 'C-02' THEN
        RAISE EXCEPTION 'Esta fórmula de rescisión solo aplica a un C-02';
    END IF;

    SELECT valor_numero INTO v_precio
      FROM documento_campo_valor
     WHERE documento_id = p_documento_id AND campo_pdf = 'c02_precio_num' AND tipo = 'NUMERO';
    IF v_precio IS NULL OR v_precio <= 0 THEN
        RAISE EXCEPTION 'Falta capturar el precio pactado (c02_precio_num) antes de calcular la rescisión';
    END IF;

    SELECT id INTO v_operacion_id FROM operacion WHERE documento_id = p_documento_id;
    IF v_operacion_id IS NULL THEN
        RAISE EXCEPTION 'Este C-02 no tiene operación de caja registrada; no hay cobro que revertir';
    END IF;

    SELECT COALESCE(sum(mc.monto), 0) INTO v_pagado
      FROM movimiento_caja mc
     WHERE mc.operacion_id = v_operacion_id
       AND mc.estatus_movimiento = 'VERIFICADO'
       AND mc.tipo_movimiento = 'COBRO';
    IF v_pagado <= 0 THEN
        RAISE EXCEPTION 'No hay cobros verificados para este C-02; no hay nada que rescindir';
    END IF;

    v_pena := least(round(0.15 * v_precio, 2), v_precio);
    RETURN QUERY SELECT v_pagado, least(v_pena, v_pagado), greatest(v_pagado - v_pena, 0);
END $$;

CREATE OR REPLACE FUNCTION traza.umbral_efectivo_pld()
RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = traza AS $$
DECLARE
    v_umbral numeric(18,2);
BEGIN
    SELECT umbral_identificacion INTO v_umbral
      FROM umbral_pld
     WHERE anio = EXTRACT(YEAR FROM now())::smallint;
    IF v_umbral IS NULL THEN
        RAISE EXCEPTION 'No hay umbral PLD capturado para el año %; un administrador (N3) debe registrarlo en traza.umbral_pld antes de operar pagos en efectivo',
            EXTRACT(YEAR FROM now())::smallint;
    END IF;
    RETURN v_umbral;
END $$;

CREATE OR REPLACE FUNCTION traza.proteger_umbral_pld()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_nivel text;
BEGIN
    SELECT nivel INTO v_nivel FROM usuario WHERE id = NEW.actualizado_por;
    IF v_nivel IS DISTINCT FROM 'N3' THEN
        RAISE EXCEPTION 'Solo un administrador global (N3) puede registrar o corregir el umbral PLD';
    END IF;
    NEW.actualizado_en := now();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS umbral_pld_validado ON traza.umbral_pld;
CREATE TRIGGER umbral_pld_validado
BEFORE INSERT OR UPDATE ON traza.umbral_pld
FOR EACH ROW EXECUTE FUNCTION traza.proteger_umbral_pld();

INSERT INTO traza.umbral_pld (
    anio, uma_valor, umbral_identificacion, umbral_aviso, actualizado_por
)
SELECT 2026, 117.31, 376565.10, 753010.20, u.id
  FROM traza.usuario u
 WHERE u.nivel = 'N3'
 ORDER BY u.id
 LIMIT 1
ON CONFLICT (anio) DO NOTHING;

CREATE OR REPLACE FUNCTION traza.crear_reembolso(
    p_movimiento_id_origen bigint,
    p_formula_aplicada text,
    p_aprobador_id bigint
) RETURNS traza.reembolso
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_operacion_id bigint;
    v_documento_id bigint;
    v_receptor_origen bigint;
    v_tipo_reembolso text;
    v_base numeric(18,2);
    v_pena numeric(18,2);
    v_devuelto numeric(18,2);
    v_fila reembolso;
BEGIN
    IF p_formula_aplicada NOT IN ('P_C01', 'D_vendedor', 'P_C02') THEN
        RAISE EXCEPTION 'Fórmula de reembolso no reconocida: %', p_formula_aplicada;
    END IF;

    SELECT mc.operacion_id, mc.quien_recibio_id INTO v_operacion_id, v_receptor_origen
      FROM movimiento_caja mc WHERE mc.id = p_movimiento_id_origen;
    IF v_operacion_id IS NULL THEN
        RAISE EXCEPTION 'Movimiento de origen no encontrado';
    END IF;
    SELECT documento_id INTO v_documento_id FROM operacion WHERE id = v_operacion_id;

    
    IF p_aprobador_id = v_receptor_origen THEN
        RAISE EXCEPTION 'Quien recibió el cobro original no puede aprobar su reembolso';
    END IF;

    IF p_formula_aplicada = 'D_vendedor' THEN
        IF NOT tiene_permiso(p_aprobador_id, 'caja.aprobar_reembolso_n3') THEN
            RAISE EXCEPTION 'La pena espejo por incumplimiento del lote requiere aprobación N3 (caja.aprobar_reembolso_n3)';
        END IF;
        v_tipo_reembolso := 'apartado';
        SELECT monto_base, monto_pena, monto_reembolsado INTO v_base, v_pena, v_devuelto
          FROM calcular_pena_espejo_c01(v_documento_id);
    ELSIF p_formula_aplicada = 'P_C01' THEN
        IF NOT tiene_permiso(p_aprobador_id, 'caja.aprobar_reembolso_n2') THEN
            RAISE EXCEPTION 'El reembolso de apartado requiere aprobación caja.aprobar_reembolso_n2';
        END IF;
        v_tipo_reembolso := 'apartado';
        SELECT cpc.monto_base, cpc.monto_pena, cpc.monto_devolucion INTO v_base, v_pena, v_devuelto
          FROM calculo_pena_convencional cpc WHERE cpc.documento_id = v_documento_id;
        IF v_base IS NULL THEN
            RAISE EXCEPTION 'No hay pena convencional calculada para este C-01; captura monto y precio total primero';
        END IF;
    ELSE
        IF NOT tiene_permiso(p_aprobador_id, 'caja.aprobar_reembolso_n2') THEN
            RAISE EXCEPTION 'La rescisión de compraventa requiere aprobación caja.aprobar_reembolso_n2';
        END IF;
        v_tipo_reembolso := 'compraventa';
        SELECT monto_base, monto_pena, monto_reembolsado INTO v_base, v_pena, v_devuelto
          FROM calcular_pena_rescision_c02(v_documento_id);
    END IF;

    PERFORM set_config('traza.reembolso_interno', 'si', true);
    INSERT INTO reembolso (
        operacion_id, tipo_reembolso, movimiento_id_origen, formula_aplicada,
        monto_base, monto_pena, monto_reembolsado, aprobador_id
    ) VALUES (
        v_operacion_id, v_tipo_reembolso, p_movimiento_id_origen, p_formula_aplicada,
        v_base, v_pena, v_devuelto, p_aprobador_id
    ) RETURNING * INTO v_fila;

    RETURN v_fila;
END $$;

CREATE OR REPLACE FUNCTION traza.proteger_reembolso()
RETURNS trigger
LANGUAGE plpgsql SET search_path = traza AS $$
BEGIN
    IF current_setting('traza.reembolso_interno', true) IS DISTINCT FROM 'si' THEN
        RAISE EXCEPTION 'Un reembolso solo se crea o se vincula a su movimiento de salida mediante las funciones del módulo de Finanzas';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reembolso_protegido ON traza.reembolso;
CREATE TRIGGER reembolso_protegido
BEFORE INSERT OR UPDATE OR DELETE ON traza.reembolso
FOR EACH ROW EXECUTE FUNCTION traza.proteger_reembolso();

CREATE OR REPLACE FUNCTION traza.vincular_movimiento_salida_reembolso(
    p_reembolso_id bigint,
    p_movimiento_id_salida bigint,
    p_cfdi_estatus text DEFAULT NULL::text
) RETURNS traza.reembolso
LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_reembolso reembolso;
    v_operacion_salida bigint;
    v_monto_salida numeric(18,2);
    v_tipo_salida traza.tipo_movimiento_caja;
BEGIN
    SELECT * INTO v_reembolso FROM reembolso WHERE id = p_reembolso_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reembolso no encontrado';
    END IF;
    IF v_reembolso.movimiento_id_salida IS NOT NULL THEN
        RAISE EXCEPTION 'Este reembolso ya está vinculado a un movimiento de salida';
    END IF;

    SELECT mc.operacion_id, mc.monto, mc.tipo_movimiento
      INTO v_operacion_salida, v_monto_salida, v_tipo_salida
      FROM movimiento_caja mc WHERE mc.id = p_movimiento_id_salida;
    IF v_operacion_salida IS NULL THEN
        RAISE EXCEPTION 'Movimiento de salida no encontrado';
    END IF;
    IF v_operacion_salida <> v_reembolso.operacion_id THEN
        RAISE EXCEPTION 'El movimiento de salida debe pertenecer a la misma operación que el reembolso';
    END IF;
    IF v_tipo_salida <> 'REEMBOLSO' THEN
        RAISE EXCEPTION 'El movimiento de salida debe registrarse con tipo_movimiento REEMBOLSO';
    END IF;
    IF v_monto_salida <> v_reembolso.monto_reembolsado THEN
        RAISE EXCEPTION 'El movimiento de salida (%) no coincide con el monto reembolsado aprobado (%)',
            to_char(v_monto_salida, 'FM999,999,999,990.00'), to_char(v_reembolso.monto_reembolsado, 'FM999,999,999,990.00');
    END IF;

    IF v_reembolso.tipo_reembolso = 'compraventa' AND p_cfdi_estatus = 'pendiente_cancelacion' THEN
        RAISE EXCEPTION 'El CFDI de esta operación está pendiente de cancelar; el reembolso no se libera hasta que quede cancelado o Contabilidad confirme por escrito que no aplica cancelación';
    END IF;

    PERFORM set_config('traza.reembolso_interno', 'si', true);
    UPDATE reembolso
       SET movimiento_id_salida = p_movimiento_id_salida,
           cfdi_estatus = COALESCE(p_cfdi_estatus, cfdi_estatus)
     WHERE id = p_reembolso_id
    RETURNING * INTO v_reembolso;

    RETURN v_reembolso;
END $$;

CREATE OR REPLACE FUNCTION traza.emitir_folio(p_tipo text, p_expediente bigint, p_usuario bigint)
RETURNS traza.documento LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_anio smallint := EXTRACT(YEAR FROM now())::smallint;
    v_rev text; v_num integer; v_row documento;
    v_origen text; v_fuente text;
BEGIN
    SELECT e.origen, o.contrato_fuente INTO v_origen, v_fuente
      FROM expediente e JOIN origen_unidad o ON o.codigo = e.origen
     WHERE e.id = p_expediente;
    IF p_tipo IN ('C-03','C-04') AND p_tipo <> v_fuente THEN
        RAISE EXCEPTION 'No es posible emitir %: el contrato de origen de una unidad % es %',
            etiqueta_documento(p_tipo), lower(v_origen), etiqueta_documento(v_fuente);
    END IF;
    IF p_tipo IN ('C-01','C-02') THEN
        PERFORM 1 FROM (
            SELECT estado FROM expediente_estado_hist
            WHERE expediente_id = p_expediente
            ORDER BY ocurrido_en DESC LIMIT 1
        ) s WHERE s.estado = 'LISTO_PARA_VENTA';
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % el expediente debe estar marcado como «Listo para venta» en su carátula (F-06)',
                etiqueta_documento(p_tipo);
        END IF;
    END IF;
    IF p_tipo = 'F-11' THEN
        PERFORM 1 FROM documento d
          JOIN archivo_escaneado a ON a.documento_id = d.id
          JOIN operacion o ON o.documento_id = d.id
         WHERE d.expediente_id = p_expediente AND d.tipo_codigo = 'C-02'
           AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id = d.id)
           AND pago_verificado(o.id);
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Para emitir % se requiere % firmado, escaneado y con pago conciliado',
                etiqueta_documento('F-11'), etiqueta_documento('C-02');
        END IF;
    END IF;
    SELECT r.revision INTO v_rev FROM revision_documento r
     WHERE r.tipo_codigo = p_tipo ORDER BY r.fecha_publicacion DESC LIMIT 1;
    IF v_rev IS NULL THEN
        RAISE EXCEPTION 'El tipo documental % no tiene revisión publicada en el catálogo', p_tipo;
    END IF;
    INSERT INTO contador_folio (tipo_codigo, anio) VALUES (p_tipo, v_anio)
        ON CONFLICT (tipo_codigo, anio) DO NOTHING;
    UPDATE contador_folio SET ultimo = ultimo + 1
        WHERE tipo_codigo = p_tipo AND anio = v_anio RETURNING ultimo INTO v_num;
    INSERT INTO documento (tipo_codigo, revision, anio, consecutivo, expediente_id, emitido_por)
        VALUES (p_tipo, v_rev, v_anio, v_num, p_expediente, p_usuario)
        RETURNING * INTO v_row;
    RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION traza.cambiar_estado_unidad(p_vin text, p_hacia text, p_usuario bigint)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE v_desde text; v_exp bigint; v_nivel text;
BEGIN
 SELECT estado INTO v_desde FROM unidad_estado_hist WHERE vin=p_vin ORDER BY ocurrido_en DESC LIMIT 1;
 IF v_desde IS NULL THEN RAISE EXCEPTION 'La unidad no tiene ningún estatus registrado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM transicion_unidad WHERE desde=v_desde AND hacia=p_hacia) THEN RAISE EXCEPTION 'El manual no permite pasar de «%» a «%»', etiqueta_estado(v_desde), etiqueta_estado(p_hacia); END IF;
 SELECT id INTO v_exp FROM expediente WHERE vin=p_vin;
 IF p_hacia='EN_INSPECCION' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-05') AND NOT EXISTS (SELECT 1 FROM documento WHERE expediente_id=v_exp AND tipo_codigo='F-05') THEN RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido, o una anulación excepcional N3', etiqueta_documento('F-05'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-06') AND NOT EXISTS (SELECT 1 FROM documento WHERE expediente_id=v_exp AND tipo_codigo='F-06') THEN RAISE EXCEPTION 'Para iniciar la inspección se requiere el folio de % emitido, o una anulación excepcional N3', etiqueta_documento('F-06'); END IF;
 ELSIF p_hacia='EXPEDIENTE_INCOMPLETO' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-05') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-05') AND NOT EXISTS (SELECT 1 FROM excepcion_documental WHERE expediente_id=v_exp AND tipo_codigo='F-05') THEN RAISE EXCEPTION 'Para salir de inspección se requiere % firmado y escaneado, o una anulación autorizada', etiqueta_documento('F-05'); END IF;
 ELSIF p_hacia='LISTO_PARA_VENTA' AND v_desde='EXPEDIENTE_INCOMPLETO' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-06') AND NOT EXISTS (SELECT 1 FROM expediente_estado_hist WHERE expediente_id=v_exp AND estado='LISTO_PARA_VENTA' ORDER BY ocurrido_en DESC LIMIT 1) THEN RAISE EXCEPTION 'La carátula del expediente % debe marcarse «Listo para venta» primero, o tener una anulación excepcional N3', etiqueta_documento('F-06'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-07') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-07') THEN RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado, o una anulación excepcional N3', etiqueta_documento('F-07'); END IF;
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-08') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-08') THEN RAISE EXCEPTION 'Para marcar la unidad «Listo para venta» se requiere % escaneado, o una anulación excepcional N3', etiqueta_documento('F-08'); END IF;
 ELSIF p_hacia='APARTADA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'C-01') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='C-01' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para apartar la unidad se requiere % escaneado y vigente, o una anulación excepcional N3', etiqueta_documento('C-01'); END IF;
 ELSIF p_hacia='VENDIDA_PEND_ENTREGA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'C-02') AND NOT EXISTS (
       SELECT 1 FROM documento d
         JOIN archivo_escaneado a ON a.documento_id=d.id
         JOIN operacion o ON o.documento_id = d.id
        WHERE d.expediente_id=v_exp AND d.tipo_codigo='C-02'
          AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)
          AND pago_verificado(o.id)
   ) THEN RAISE EXCEPTION 'Para marcar la unidad como vendida se requiere % escaneado y con pago conciliado, o una anulación excepcional N3', etiqueta_documento('C-02'); END IF;
 ELSIF p_hacia='ENTREGADA' THEN
   IF NOT traza.requisito_anulado_excepcional(v_exp,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=v_exp AND d.tipo_codigo='F-11') THEN RAISE EXCEPTION 'Para marcar la unidad como entregada se requiere % firmado y escaneado, o una anulación excepcional N3', etiqueta_documento('F-11'); END IF;
 ELSIF p_hacia='DEVUELTA_CONSIGNANTE' THEN
   IF NOT EXISTS (SELECT 1 FROM expediente WHERE id=v_exp AND origen='CONSIGNADA') THEN RAISE EXCEPTION 'Solo una unidad consignada puede devolverse al consignante'; END IF;
 ELSIF p_hacia='BAJA' THEN
   SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel NOT IN ('N2','N3') THEN RAISE EXCEPTION 'Dar de baja una unidad requiere autorización de encargado (N2) o administración (N3)'; END IF;
 END IF;
 INSERT INTO unidad_estado_hist(vin,estado,registrado_por) VALUES(p_vin,p_hacia,p_usuario);
END $$;

CREATE OR REPLACE FUNCTION traza.cerrar_expediente(p_expediente bigint, p_usuario bigint)
RETURNS traza.expediente_cierre LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE v_nivel text; v_origen text; v_estado text; v_row expediente_cierre;
BEGIN
 SELECT nivel INTO v_nivel FROM usuario WHERE id=p_usuario; IF v_nivel IS DISTINCT FROM 'N3' THEN RAISE EXCEPTION 'Cerrar un expediente requiere autorización N3'; END IF;
 SELECT origen INTO v_origen FROM expediente WHERE id=p_expediente; IF NOT FOUND THEN RAISE EXCEPTION 'Expediente no encontrado'; END IF;
 IF EXISTS (SELECT 1 FROM expediente_cierre WHERE expediente_id=p_expediente) THEN RAISE EXCEPTION 'El expediente ya fue cerrado'; END IF;
 SELECT h.estado INTO v_estado FROM unidad_estado_hist h JOIN expediente e ON e.vin=h.vin WHERE e.id=p_expediente ORDER BY h.ocurrido_en DESC LIMIT 1;
 IF v_estado IS DISTINCT FROM 'ENTREGADA' THEN RAISE EXCEPTION 'Para cerrar el expediente la unidad debe estar marcada como «Entregada»'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'C-02') AND NOT EXISTS (
     SELECT 1 FROM documento d
       JOIN archivo_escaneado a ON a.documento_id=d.id
       JOIN operacion o ON o.documento_id = d.id
      WHERE d.expediente_id=p_expediente AND d.tipo_codigo='C-02'
        AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)
        AND pago_verificado(o.id)
 ) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere C-02 escaneado y pago conciliado, o una anulación excepcional N3'; END IF;
 IF NOT traza.requisito_anulado_excepcional(p_expediente,'F-11') AND NOT EXISTS (SELECT 1 FROM documento d JOIN archivo_escaneado a ON a.documento_id=d.id WHERE d.expediente_id=p_expediente AND d.tipo_codigo='F-11' AND NOT EXISTS (SELECT 1 FROM documento_cancelacion c WHERE c.documento_id=d.id)) THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere F-11 firmado y escaneado, o una anulación excepcional N3'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='ine_partes') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Identificación de las partes»'; END IF;
 IF NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='comprobante_pago') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Comprobantes de pago»'; END IF;
 IF v_origen='PROPIA' AND NOT EXISTS (SELECT 1 FROM anexo_expediente WHERE expediente_id=p_expediente AND clave='factura_original') THEN RAISE EXCEPTION 'Para cerrar el expediente se requiere el anexo «Factura original (última)»'; END IF;
 INSERT INTO expediente_cierre(expediente_id,cerrado_por) VALUES(p_expediente,p_usuario) RETURNING * INTO v_row; RETURN v_row;
END $$;

CREATE OR REPLACE VIEW public.documentos AS
SELECT vd.id::int AS id, vd.expediente_id::int AS expediente_id, vd.folio,
       vd.tipo_codigo, td.nombre AS nombre_tipo, vd.revision, vd.cancelado,
       vd.escaneado,
       (SELECT max(a.version) FROM traza.archivo_escaneado a WHERE a.documento_id = vd.id)::int AS version_maxima,
       EXISTS (
           SELECT 1 FROM traza.operacion op
            WHERE op.documento_id = vd.id AND traza.pago_verificado(op.id)
       ) AS pago_verificado,
       (SELECT vs.folio FROM traza.documento_sustitucion ds JOIN traza.v_documento vs ON vs.id = ds.sustituto_id WHERE ds.cancelado_id = vd.id) AS sustituido_por_folio,
       us.nombre AS emitido_por_nombre, vd.emitido_en,
       EXISTS (SELECT 1 FROM traza.documento_captura dc WHERE dc.documento_id = vd.id AND dc.estado = 'COMPLETA') AS pdf_completado
FROM traza.v_documento vd
JOIN traza.tipo_documento td ON td.codigo = vd.tipo_codigo
JOIN traza.usuario us ON us.id = vd.emitido_por;

DO $$
BEGIN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
        traza.umbral_pld, traza.permiso, traza.permiso_conflicto,
        traza.rol_sistema, traza.rol_sistema_permiso, traza.empleado_rol_sistema,
        traza.bitacora_rbac, traza.operacion, traza.movimiento_caja,
        traza.movimiento_caja_efectivo, traza.movimiento_caja_electronico,
        traza.recibo_caja_interno, traza.deposito_bancario, traza.reembolso
        FROM authenticated;
    REVOKE ALL ON
        traza.umbral_pld, traza.permiso, traza.permiso_conflicto,
        traza.rol_sistema, traza.rol_sistema_permiso, traza.empleado_rol_sistema,
        traza.bitacora_rbac, traza.operacion, traza.movimiento_caja,
        traza.movimiento_caja_efectivo, traza.movimiento_caja_electronico,
        traza.recibo_caja_interno, traza.deposito_bancario, traza.reembolso
        FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; revokes omitidos';
END $$;

COMMIT;
