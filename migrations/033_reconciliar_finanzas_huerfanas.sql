-- ============================================================================
-- 033 — Reconciliacion de las finanzas huerfanas (caja, RBAC, reembolsos, PLD).
--
-- QUE ES ESTO
-- La base de produccion tiene aplicadas cinco migraciones —028 a 032— cuyos
-- archivos .sql se perdieron. Sus objetos viven en la base y el codigo de la
-- aplicacion los usa, pero el repositorio no sabe como se construyeron: quien
-- clone este proyecto y levante una base limpia se quedaria sin el modulo de
-- caja entero. Esta migracion cierra ese hueco. Su contenido se reconstruyo
-- leyendo el catalogo de Postgres de produccion (pg_get_functiondef,
-- pg_get_constraintdef, pg_get_triggerdef, pg_get_viewdef) y se verifico
-- comparando huellas md5 objeto por objeto contra una base recien construida
-- solo con las migraciones del repositorio. A partir de aqui el repositorio
-- vuelve a ser la fuente de verdad del esquema.
--
-- POR QUE NO SE LLAMA 028..032
-- El ledger public._migrations ya tiene asentadas esas cinco migraciones con el
-- checksum SHA-256 del texto original, que es justamente lo que se perdio.
-- Cualquier archivo que volvieramos a llamar 028_… tendria un checksum distinto
-- del asentado y db:migrate abortaria el despliegue por integridad —que es
-- exactamente lo que debe hacer—. Ocupar un numero libre, 033, deja el ledger
-- historico intacto y agrega un renglon nuevo que si cuadra consigo mismo.
--
-- POR QUE ES SEGURA EN PRODUCCION
-- Todo el archivo es idempotente: CREATE TABLE / SEQUENCE / INDEX IF NOT EXISTS,
-- CREATE OR REPLACE FUNCTION y VIEW, DO … EXCEPTION WHEN duplicate_object para
-- los tipos, DROP TRIGGER IF EXISTS antes de cada CREATE TRIGGER e
-- INSERT … ON CONFLICT DO NOTHING en las semillas. Sobre produccion no altera
-- ni una fila: reescribe definiciones que ya son identicas a las que hay.
-- Sobre una base limpia construye el modulo completo. No hay ningun DROP de
-- tabla, columna ni dato. La unica operacion que no es puro «crear si falta»
-- es el ALTER TYPE … RENAME del principio de la seccion 1, que va detras de su
-- propia guarda y sobre produccion no dispara porque el cambio ya esta hecho.
--
-- ORDEN DEL ARCHIVO
--   1. Tipos enumerados, secuencia de folios y tablas (era 028/029/030/031/032).
--   2. RBAC de finanzas: funciones, triggers y semillas (era 029).
--   3. Ledger de caja: funciones y triggers (era 030).
--   4. Reembolsos y umbral PLD (era 028/031).
--   5. Objetos preexistentes que las migraciones perdidas MODIFICARON.
--   6. Privilegios del Data API sobre las tablas nuevas.
--
-- LO QUE ESTA MIGRACION NO TRAE
-- 032 se llamaba «migrar_pago_c02_a_caja» y, ademas del cambio de esquema que
-- si esta recogido aqui (seccion 1), movio los pagos historicos de pago_c02 al
-- ledger. Ese traspaso fue un backfill de datos de produccion, ya ejecutado y
-- sin sentido sobre una base vacia, asi que no se reproduce.
-- ============================================================================

BEGIN;


-- ############################################################################
-- 1. TIPOS ENUMERADOS, SECUENCIA Y TABLAS
-- ############################################################################

-- ============================================================================
-- Modulo Finanzas / Caja — tipos enumerados y tablas.
--
-- Reconstruccion del DDL leido del catalogo de Postgres para los objetos que
-- entraron en produccion con las migraciones 028..032, cuyos archivos se
-- perdieron. Todo es idempotente: este fragmento se aplica tanto a una base
-- recien creada desde el repositorio (donde nada de esto existe) como a la
-- base de produccion (donde ya existe y NO debe alterarse ni perder datos).
--
-- Los nombres de restriccion se reproducen tal cual estan en la base: los que
-- Postgres genera solos (tabla_columna_check, tabla_columna_fkey, tabla_pkey,
-- tabla_columna_key) se declaran en linea para que se regeneren identicos.
-- ============================================================================


-- ===== TIPOS ENUMERADOS =====
-- Un enum, y no un CHECK sobre text, porque el conjunto de formas de pago y de
-- estatus es cerrado por decision de negocio: agregar un valor nuevo debe ser
-- una migracion revisada, no un string que se cuela desde la aplicacion.

-- El tipo NO nacio nuevo: 032 renombro el enum traza.medio_pago_c02 que creo la
-- migracion 026. En produccion medio_pago_c02 ya no existe, forma_pago tiene sus
-- mismas siete etiquetas en el mismo orden, y pago_c02.medio quedo apuntando a
-- forma_pago (Postgres reescribe solo la columna y el CHECK pago_c02_check al
-- renombrar). Reproducirlo como «CREATE TYPE forma_pago» a secas dejaria una
-- base nueva con DOS enums identicos y pago_c02 colgando del viejo: mismo
-- catalogo en apariencia, esquema distinto en realidad. Por eso el rename va
-- primero, con guarda para que sea idempotente, y el CREATE TYPE de abajo queda
-- solo como red por si alguna base no trajera ninguno de los dos.
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

-- El tipo de movimiento distingue el sentido del dinero. No se deduce del signo
-- del monto: el monto siempre es positivo (ver CHECK en movimiento_caja) para
-- que ningun renglon pueda "compensarse" con otro y desaparecer del corte.
DO $$ BEGIN
    CREATE TYPE traza.tipo_movimiento_caja AS ENUM (
        'COBRO',
        'PAGO_COMPRA',
        'LIQUIDACION_CONSIGNANTE',
        'REEMBOLSO'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REGISTRADO -> VERIFICADO es el conteo o la conciliacion bancaria; CANCELADO
-- es el unico final alternativo. No hay estado "borrado": un movimiento erroneo
-- se cancela dejando traza, nunca se elimina.
DO $$ BEGIN
    CREATE TYPE traza.estatus_movimiento_caja AS ENUM (
        'REGISTRADO',
        'VERIFICADO',
        'CANCELADO'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ===== UMBRAL PLD =====
-- Una fila por anio. La migracion 027 dejaba el umbral incrustado en una
-- funcion; aqui pasa a ser un dato versionado por ejercicio, porque el valor de
-- la UMA cambia cada anio y una operacion vieja debe seguir midiendose contra
-- el umbral que regia cuando ocurrio, no contra el actual.
CREATE TABLE IF NOT EXISTS traza.umbral_pld (
    anio                  smallint PRIMARY KEY,
    -- Los tres montos se guardan juntos y ya calculados: si solo se guardara la
    -- UMA, cada consulta tendria que reproducir la multiplicacion por 3,210 y
    -- 6,420 y una de ellas acabaria redondeando distinto.
    uma_valor             numeric(10,2) NOT NULL CHECK (uma_valor > 0),
    umbral_identificacion numeric(18,2) NOT NULL CHECK (umbral_identificacion > 0),
    umbral_aviso          numeric(18,2) NOT NULL,
    actualizado_por       bigint NOT NULL REFERENCES traza.usuario(id),
    actualizado_en        timestamptz NOT NULL DEFAULT now(),
    -- El aviso siempre esta por encima de la identificacion (6,420 vs 3,210
    -- UMA). Invertirlos volveria obligatorio avisar de operaciones que ni
    -- siquiera exigen identificar al cliente: candado contra la captura al reves.
    CHECK (umbral_aviso > umbral_identificacion)
);

COMMENT ON TABLE traza.umbral_pld IS
    'Una fila por año (LFPIORPI art. 17-VIII: 3,210 UMA identificación, 6,420 UMA aviso). Única fuente del umbral PLD: ninguna otra tabla ni función lo guarda por su cuenta.';

-- La semilla del umbral 2026 se siembra en la seccion 4, ya con el trigger
-- umbral_pld_validado en pie, para que la escriba un administrador N3 real y
-- no el usuario id 1 a ciegas.



-- ===== CATALOGO DE PERMISOS =====
-- El permiso es el atomo del RBAC de caja. Se identifica por codigo legible y
-- no por id numerico para que las funciones y la UI lo citen literal y un
-- renumerado accidental no cambie silenciosamente quien puede hacer que.
CREATE TABLE IF NOT EXISTS traza.permiso (
    -- El regex obliga a la convencion modulo.accion en minusculas: sin el, un
    -- 'Caja.Recibir_Pago' escrito distinto crearia un permiso gemelo que nadie
    -- tiene asignado y que en la practica bloquearia la operacion.
    codigo       text PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z0-9_.]*$'),
    descripcion  text NOT NULL,
    modulo       text NOT NULL DEFAULT 'finanzas',
    -- Nivel jerarquico minimo del empleado que puede portarlo. EXTERNO cubre a
    -- quien no pertenece a la estructura N1..N3 (por ejemplo Contabilidad).
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


-- ===== INCOMPATIBILIDADES ENTRE PERMISOS =====
-- Segregacion de funciones declarada como dato, no escondida en codigo: quien
-- recibe el dinero no puede ademas emitir el recibo que lo comprueba, ni
-- autorizar su devolucion. Es el control clasico contra el jinete solitario.
CREATE TABLE IF NOT EXISTS traza.permiso_conflicto (
    permiso_codigo_a text NOT NULL REFERENCES traza.permiso(codigo),
    permiso_codigo_b text NOT NULL REFERENCES traza.permiso(codigo),
    PRIMARY KEY (permiso_codigo_a, permiso_codigo_b),
    -- El par se guarda ordenado alfabeticamente. Esto hace la relacion simetrica
    -- sin duplicar filas: impide que (A,B) y (B,A) convivan y, de paso, que un
    -- permiso entre en conflicto consigo mismo.
    CHECK (permiso_codigo_a < permiso_codigo_b)
);

INSERT INTO traza.permiso_conflicto (permiso_codigo_a, permiso_codigo_b) VALUES
 ('caja.aprobar_reembolso_n2', 'caja.recibir_pago'),
 ('caja.aprobar_reembolso_n3', 'caja.recibir_pago'),
 ('caja.emitir_rci',           'caja.recibir_pago'),
 ('caja.emitir_rci',           'caja.registrar_deposito')
ON CONFLICT (permiso_codigo_a, permiso_codigo_b) DO NOTHING;


-- ===== ROLES DEL SISTEMA =====
-- El rol es un paquete de permisos con nombre de negocio. Se administra desde
-- la aplicacion (no es catalogo fijo), por eso lleva autoria y fecha: un cambio
-- de alcance de un rol tiene que poder atribuirse a alguien.
CREATE TABLE IF NOT EXISTS traza.rol_sistema (
    id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre                 text NOT NULL UNIQUE,
    descripcion            text,
    -- Techo de seguridad del rol completo: aunque alguien le cuelgue un permiso
    -- suelto, el rol no puede asignarse a quien no alcance este nivel.
    nivel_minimo_requerido text NOT NULL CHECK (nivel_minimo_requerido = ANY (ARRAY['N1'::text, 'N2'::text, 'N3'::text, 'EXTERNO'::text])),
    creado_por             bigint NOT NULL REFERENCES traza.usuario(id),
    creado_en              timestamptz NOT NULL DEFAULT now()
);


-- ===== PERMISOS DE CADA ROL =====
-- Llave primaria compuesta: el mismo permiso no puede colgarse dos veces del
-- mismo rol, de modo que revocarlo una vez lo revoca de verdad.
CREATE TABLE IF NOT EXISTS traza.rol_sistema_permiso (
    rol_sistema_id bigint NOT NULL REFERENCES traza.rol_sistema(id),
    permiso_codigo text NOT NULL REFERENCES traza.permiso(codigo),
    PRIMARY KEY (rol_sistema_id, permiso_codigo)
);


-- ===== ASIGNACION DE ROLES A EMPLEADOS =====
-- La asignacion es un intervalo, no una bandera: se cierra con fecha_fin en vez
-- de borrarse, porque para auditar un movimiento de hace seis meses hay que
-- poder saber quien tenia el rol ESE dia, no quien lo tiene hoy.
CREATE TABLE IF NOT EXISTS traza.empleado_rol_sistema (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empleado_id        bigint NOT NULL REFERENCES traza.usuario(id),
    rol_sistema_id     bigint NOT NULL REFERENCES traza.rol_sistema(id),
    fecha_inicio       timestamptz NOT NULL DEFAULT now(),
    fecha_fin          timestamptz,
    -- El suplente cubre ausencias sin desplazar al titular; ambos pueden estar
    -- vigentes a la vez y por eso la distincion se guarda en la asignacion.
    titular_o_suplente text NOT NULL DEFAULT 'titular' CHECK (titular_o_suplente = ANY (ARRAY['titular'::text, 'suplente'::text])),
    asignado_por_id    bigint NOT NULL REFERENCES traza.usuario(id),
    -- Un intervalo que termina antes de empezar volveria imposible decidir si el
    -- rol estaba vigente en cualquier instante consultado.
    CHECK ((fecha_fin IS NULL) OR (fecha_fin > fecha_inicio))
);

-- Indice unico parcial: solo puede haber UNA asignacion abierta del mismo rol
-- al mismo empleado. El historial cerrado (fecha_fin NOT NULL) queda fuera del
-- indice, asi que reasignar el rol despues de revocarlo sigue siendo posible.
CREATE UNIQUE INDEX IF NOT EXISTS empleado_rol_sistema_activo_unico
    ON traza.empleado_rol_sistema USING btree (empleado_id, rol_sistema_id)
    WHERE (fecha_fin IS NULL);


-- ===== BITACORA DEL RBAC =====
-- Append-only. Otorgar y quitar poder sobre el dinero es justamente lo que un
-- auditor va a querer revisar, y la fila viva de empleado_rol_sistema solo
-- cuenta el estado final: aqui queda el recorrido, con motivo.
CREATE TABLE IF NOT EXISTS traza.bitacora_rbac (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empleado_rol_sistema_id bigint NOT NULL REFERENCES traza.empleado_rol_sistema(id),
    accion                  text NOT NULL CHECK (accion = ANY (ARRAY['asignado'::text, 'revocado'::text])),
    fecha_hora              timestamptz NOT NULL DEFAULT now(),
    -- Quien ejecuto el cambio, que casi nunca es el empleado afectado: sin esta
    -- columna la bitacora no serviria para fincar responsabilidad.
    realizado_por_id        bigint NOT NULL REFERENCES traza.usuario(id),
    motivo                  text
);


-- ===== OPERACION =====
-- Cabecera economica de un documento. Existe para que la caja tenga un ancla
-- propia: los movimientos cuelgan de la operacion y no del documento suelto,
-- de modo que precio pactado y asesor responsable se fijan una sola vez.
CREATE TABLE IF NOT EXISTS traza.operacion (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- UNIQUE: un documento abre a lo sumo una operacion. Dos operaciones sobre
    -- el mismo contrato permitirian cobrarlo dos veces sin que nada chille.
    documento_id   bigint NOT NULL UNIQUE REFERENCES traza.documento(id),
    asesor_id      bigint NOT NULL REFERENCES traza.usuario(id),
    -- Nulo mientras el precio no esta pactado; la conciliacion contra los
    -- movimientos solo puede exigirse cuando ya tiene valor.
    precio_pactado numeric(18,2),
    creado_en      timestamptz NOT NULL DEFAULT now()
);


-- ===== MOVIMIENTO DE CAJA =====
-- Renglon inmutable del dinero. Cada entrada o salida se registra una vez y
-- solo puede cambiar de estatus; corregir significa cancelar y volver a
-- registrar, nunca editar el monto de una fila ya emitida.
CREATE TABLE IF NOT EXISTS traza.movimiento_caja (
    id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operacion_id       bigint NOT NULL REFERENCES traza.operacion(id),
    forma_pago         traza.forma_pago NOT NULL,
    tipo_movimiento    traza.tipo_movimiento_caja NOT NULL,
    -- Siempre positivo: el sentido lo da tipo_movimiento. Permitir negativos
    -- abriria la puerta a "arreglar" un corte con un renglon que resta.
    monto              numeric(18,2) NOT NULL CHECK (monto > 0),
    fecha_hora         timestamptz NOT NULL DEFAULT now(),
    -- Persona fisica que recibio o entrego. Es la contraparte del testigo y del
    -- custodio en efectivo, y del verificador en electronico.
    quien_recibio_id   bigint NOT NULL REFERENCES traza.usuario(id),
    referencia         text CHECK (char_length(TRIM(BOTH FROM COALESCE(referencia, ''::text))) <= 120),
    detalle            text CHECK (char_length(TRIM(BOTH FROM COALESCE(detalle, ''::text))) <= 240),
    estatus_movimiento traza.estatus_movimiento_caja NOT NULL DEFAULT 'REGISTRADO',
    cancelado_por_id   bigint REFERENCES traza.usuario(id),
    cancelado_en       timestamptz,
    motivo_cancelacion text,
    -- Equivalencia estricta en los dos sentidos: no hay cancelado sin autor ni
    -- fecha, y tampoco autor o fecha de cancelacion en un movimiento que sigue
    -- vivo. Evita el renglon "medio cancelado" que ningun corte sabe sumar.
    CHECK ((estatus_movimiento = 'CANCELADO'::traza.estatus_movimiento_caja) = ((cancelado_por_id IS NOT NULL) AND (cancelado_en IS NOT NULL)))
);

-- Orden natural del corte de caja: todo lo de una operacion, cronologico y con
-- id como desempate estable cuando dos renglones comparten instante.
CREATE INDEX IF NOT EXISTS movimiento_caja_operacion_idx
    ON traza.movimiento_caja USING btree (operacion_id, fecha_hora, id);


-- ===== DETALLE DE EFECTIVO =====
-- Extension 1-a-1 (la PK es la FK) que solo existe cuando la forma de pago es
-- efectivo. El billete no deja rastro bancario, asi que el rastro lo pone la
-- cadena de custodia: quien lo recibio, quien atestiguo y quien lo resguarda.
CREATE TABLE IF NOT EXISTS traza.movimiento_caja_efectivo (
    movimiento_id       bigint PRIMARY KEY REFERENCES traza.movimiento_caja(id),
    -- Testigo y custodio son columnas separadas y obligatorias: son el control
    -- de cuatro ojos sobre el unico medio de pago que se puede perder sin dejar
    -- huella en un tercero.
    testigo_id          bigint NOT NULL REFERENCES traza.usuario(id),
    custodio_id         bigint NOT NULL REFERENCES traza.usuario(id),
    fecha_hora_custodia timestamptz NOT NULL DEFAULT now()
);


-- ===== DETALLE ELECTRONICO =====
-- Extension 1-a-1 para SPEI, transferencia, tarjeta y cheque. La referencia
-- bancaria es obligatoria porque es lo unico que permite conciliar contra el
-- estado de cuenta; la acreditacion, en cambio, llega despues y por eso el
-- trio de columnas de verificacion nace nulo.
CREATE TABLE IF NOT EXISTS traza.movimiento_caja_electronico (
    movimiento_id                 bigint PRIMARY KEY REFERENCES traza.movimiento_caja(id),
    referencia_bancaria           text NOT NULL,
    cuenta_destino                text,
    fecha_acreditacion_verificada timestamptz,
    verificado_por_id             bigint REFERENCES traza.usuario(id)
);


-- ===== SECUENCIA DEL FOLIO RCI =====
-- Secuencia suelta, no una columna IDENTITY: el folio que se imprime en el
-- recibo (RCI-2026-000123) es texto compuesto y se pide con nextval() dentro de
-- traza.emitir_rci, mientras que recibo_caja_interno.id sigue siendo la llave
-- tecnica. Son dos numeraciones distintas a proposito, porque un recibo puede
-- insertarse y otro fallar sin que el folio impreso salte.
CREATE SEQUENCE IF NOT EXISTS traza.folio_rci_seq AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO MAXVALUE CACHE 1;


-- ===== RECIBO DE CAJA INTERNO (RCI) =====
-- El comprobante que se entrega al cliente. Se separa del movimiento porque
-- emitirlo es un acto distinto, a cargo de otra persona (ver el conflicto
-- caja.emitir_rci vs caja.recibir_pago) y con folio propio.
CREATE TABLE IF NOT EXISTS traza.recibo_caja_interno (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- UNIQUE: un movimiento genera a lo sumo un RCI. Dos recibos del mismo
    -- cobro son dos comprobantes en la calle por un solo ingreso.
    movimiento_id  bigint NOT NULL UNIQUE REFERENCES traza.movimiento_caja(id),
    -- El folio es unico en toda la empresa: es el numero que el cliente cita en
    -- una aclaracion y no puede repetirse entre sucursales ni ejercicios.
    folio_rci      text NOT NULL UNIQUE,
    fecha_emision  timestamptz NOT NULL DEFAULT now(),
    emitido_por_id bigint NOT NULL REFERENCES traza.usuario(id),
    -- Cancelado, no borrado: el folio queda ocupado y explicado, igual que una
    -- forma de papel inutilizada que se archiva en vez de tirarse.
    estatus        text NOT NULL DEFAULT 'emitido' CHECK (estatus = ANY (ARRAY['emitido'::text, 'cancelado'::text]))
);


-- ===== DEPOSITO BANCARIO =====
-- Cierra el ciclo del efectivo: el dinero que entro por caja tiene que aparecer
-- en el banco. Cuelga del RCI y no del movimiento porque lo que se deposita es
-- lo amparado por un recibo ya emitido.
CREATE TABLE IF NOT EXISTS traza.deposito_bancario (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    recibo_id         bigint NOT NULL REFERENCES traza.recibo_caja_interno(id),
    monto_depositado  numeric(18,2) NOT NULL CHECK (monto_depositado > 0),
    fecha_deposito    date NOT NULL,
    cuenta_destino    text NOT NULL,
    -- Obligatorio: sin comprobante el registro seria la palabra de quien
    -- deposito contra el faltante de caja.
    comprobante_ref   text NOT NULL,
    registrado_por_id bigint NOT NULL REFERENCES traza.usuario(id),
    registrado_en     timestamptz NOT NULL DEFAULT now()
);

-- Indice unico y no restriccion UNIQUE, tal como esta en la base: un recibo se
-- deposita una sola vez. Sin este candado, dos depositos parciales del mismo
-- RCI cuadrarian el arqueo dejando dinero suelto.
CREATE UNIQUE INDEX IF NOT EXISTS deposito_bancario_recibo_unico
    ON traza.deposito_bancario USING btree (recibo_id);


-- ===== REEMBOLSO =====
-- Devolucion al cliente con la pena convencional ya aplicada. Guarda el calculo
-- completo (base, pena y neto) en vez de solo el neto, porque cuando alguien
-- reclame hay que poder mostrar de donde salio la retencion sin volver a
-- correr las formulas, que pueden haber cambiado desde entonces.
CREATE TABLE IF NOT EXISTS traza.reembolso (
    id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operacion_id         bigint NOT NULL REFERENCES traza.operacion(id),
    tipo_reembolso       text NOT NULL CHECK (tipo_reembolso = ANY (ARRAY['apartado'::text, 'compraventa'::text])),
    -- Movimiento de entrada que se devuelve: ata el reembolso a un cobro real y
    -- no a un monto inventado.
    movimiento_id_origen bigint NOT NULL REFERENCES traza.movimiento_caja(id),
    formula_aplicada     text NOT NULL CHECK (formula_aplicada = ANY (ARRAY['P_C01'::text, 'D_vendedor'::text, 'P_C02'::text])),
    monto_base           numeric(18,2) NOT NULL CHECK (monto_base >= 0),
    monto_pena           numeric(18,2) NOT NULL CHECK (monto_pena >= 0),
    monto_reembolsado    numeric(18,2) NOT NULL CHECK (monto_reembolsado >= 0),
    aprobador_id         bigint NOT NULL REFERENCES traza.usuario(id),
    -- Nulo mientras el dinero no ha salido: aprobar y pagar son dos actos y el
    -- reembolso autorizado pero no entregado tiene que ser visible como tal.
    movimiento_id_salida bigint REFERENCES traza.movimiento_caja(id),
    -- Si hubo factura, no se entrega el dinero hasta que Contabilidad resuelve
    -- la cancelacion del CFDI; 'no_aplica' es el caso sin factura de por medio.
    cfdi_estatus         text NOT NULL DEFAULT 'no_aplica' CHECK (cfdi_estatus = ANY (ARRAY['no_aplica'::text, 'pendiente_cancelacion'::text, 'cancelado'::text])),
    creado_en            timestamptz NOT NULL DEFAULT now(),
    -- La aritmetica del reembolso se verifica en la base, redondeada a dos
    -- decimales: un neto que no sea exactamente base menos pena significa que
    -- alguien capturo el resultado a mano en lugar de aplicar la formula.
    CHECK (round((monto_base - monto_pena), 2) = monto_reembolsado)
);

-- Indice unico parcial: un mismo movimiento de salida no puede pagar dos
-- reembolsos. Los reembolsos aun no pagados (salida nula) quedan fuera del
-- indice para que puedan coexistir tantos pendientes como haga falta.
CREATE UNIQUE INDEX IF NOT EXISTS reembolso_movimiento_salida_unico
    ON traza.reembolso USING btree (movimiento_id_salida)
    WHERE (movimiento_id_salida IS NOT NULL);


-- ############################################################################
-- 2. RBAC DE FINANZAS
-- ############################################################################

-- ---------------------------------------------------------------------------
-- RBAC: funciones, triggers y semillas de control de acceso.
--
-- El módulo de caja reparte la operación del efectivo entre varias manos. El
-- objetivo de todo este bloque es que ninguna persona pueda cerrar por sí sola
-- el ciclo "recibo el dinero -> lo documento -> lo apruebo", que es donde vive
-- el riesgo de desvío. La autoridad se declara en datos (permiso, rol_sistema)
-- y se hace cumplir en la base, no en la UI.
-- ---------------------------------------------------------------------------

-- Lectura de autoridad efectiva: un permiso cuenta solo mientras la asignación
-- siga viva (fecha_fin IS NULL). Las asignaciones revocadas se conservan por
-- auditoría, así que el filtro por fecha_fin es el que evita que un rol
-- retirado siga abriendo puertas.
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

-- Candado central de las asignaciones. Exige que toda alta o baja pase por las
-- funciones oficiales (bandera traza.rbac_interno), prohíbe el borrado físico,
-- impide la autoasignación y bloquea que RBAC se use como puerta trasera para
-- otorgar a un empleado autoridad superior a la de su propio nivel.
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

-- Única puerta de alta. Levanta la bandera traza.rbac_interno (local a la
-- transacción) para que el trigger deje pasar el INSERT, y deja constancia en
-- bitacora_rbac en el mismo acto: la asignación y su rastro nacen juntas.
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

-- Única puerta de baja. Revocar es cerrar fecha_fin, nunca borrar: el historial
-- de quién tuvo qué permiso y hasta cuándo es evidencia de auditoría. Solo N3
-- revoca, y el motivo queda asentado en la bitácora.
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

-- Triggers RBAC.
-- Solo empleado_rol_sistema y bitacora_rbac llevan trigger: son las dos tablas
-- que cambian en operación. Los catálogos (permiso, permiso_conflicto,
-- rol_sistema, rol_sistema_permiso) se administran con el permiso
-- caja.administrar_rbac y no tienen candado a nivel de trigger.

DROP TRIGGER IF EXISTS empleado_rol_sistema_validado ON traza.empleado_rol_sistema;
CREATE TRIGGER empleado_rol_sistema_validado BEFORE INSERT OR DELETE OR UPDATE ON traza.empleado_rol_sistema FOR EACH ROW EXECUTE FUNCTION traza.validar_empleado_rol_sistema();

-- La bitácora es constancia: una vez escrita no se corrige ni se borra. Si un
-- registro salió mal, se asienta un movimiento nuevo que lo explique.
DROP TRIGGER IF EXISTS bitacora_rbac_inmutable ON traza.bitacora_rbac;
CREATE TRIGGER bitacora_rbac_inmutable BEFORE DELETE OR UPDATE ON traza.bitacora_rbac FOR EACH ROW EXECUTE FUNCTION traza.bloquear_mutacion();

-- ---------------------------------------------------------------------------
-- SEMILLAS
-- ---------------------------------------------------------------------------

-- Catálogo de permisos del módulo de caja. nivel_minimo es el piso jerárquico
-- que debe tener un empleado para poder recibir un rol que incluya el permiso.
-- 'EXTERNO' marca a Contabilidad: es un tercero fuera del escalafón N1/N2/N3,
-- por eso no compara contra el nivel del empleado.
-- (Las diez filas se siembran en la seccion 1, junto a la tabla.)

-- Segregación de funciones del módulo de caja. Cada par declara dos permisos
-- que NO pueden coexistir en la misma persona, porque juntos cierran un ciclo
-- de control sin un segundo par de ojos:
--   * quien recibe el pago no emite el RCI que lo documenta;
--   * quien recibe el pago no aprueba reembolsos (ni N2 ni N3);
--   * quien emite el RCI no registra el depósito bancario que lo respalda.
-- (Los cuatro pares se siembran en la seccion 1, junto a la tabla.)


-- ############################################################################
-- 3. LEDGER DE CAJA
-- ############################################################################

-- ============================================================================
-- Ledger de caja: funciones y triggers.
--
-- El ledger nunca se escribe con SQL suelto. Todas las tablas del ledger
-- (operacion, movimiento_caja y sus tres satelites, recibo_caja_interno y
-- deposito_bancario) llevan un trigger que aborta cualquier INSERT/UPDATE/DELETE
-- que no venga de una de las funciones de este archivo. El candado se abre con
-- un GUC de transaccion (traza.caja_interno) que solo las funciones ponen, de
-- modo que la separacion de funciones (quien recibe != quien verifica != quien
-- emite el recibo) no se pueda saltar desde la API ni desde la consola.
--
-- Dependencias que este fragmento NO crea (deben existir antes):
--   tablas/enums/secuencia: operacion, movimiento_caja, movimiento_caja_efectivo,
--     movimiento_caja_electronico, recibo_caja_interno, deposito_bancario,
--     forma_pago, tipo_movimiento_caja, folio_rci_seq
--   funciones: traza.tiene_permiso(bigint, text), traza.umbral_efectivo_pld()
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Funciones
-- ----------------------------------------------------------------------------

-- Candado de la tabla operacion. Una operacion es la cabecera de caja de un
-- contrato; se deriva del documento y de su precio pactado, nunca se teclea a
-- mano, porque el precio es la cifra contra la que se concilia todo el ledger.
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

-- El precio pactado se copia del campo de PDF que corresponde al tipo de
-- contrato. Se guarda desnormalizado en operacion para que la conciliacion no
-- dependa de que el capturista deje el campo intacto despues del cobro.
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

-- Unica puerta de alta de una operacion. Es idempotente (ON CONFLICT DO NOTHING)
-- para que la UI pueda llamarla cada vez que abre la pestaña de caja sin
-- duplicar la cabecera.
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

-- Si el capturista corrige el precio en el PDF despues de abrir la operacion,
-- el ledger tiene que enterarse: de lo contrario pago_verificado conciliaria
-- contra una cifra vieja y daria por pagado un contrato que no lo esta.
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

-- Candado general del ledger. Va sobre movimiento_caja y sus satelites: sin el,
-- cualquiera con acceso a la base podria marcar VERIFICADO un cobro que nadie
-- recibio, o borrar el rastro de un deposito.
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

-- Alta del renglon de caja. Nace siempre en estatus REGISTRADO: recibir dinero
-- y darlo por bueno son dos actos distintos, hechos por dos personas distintas.
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

-- Regla de tres personas en el efectivo: quien recibe, quien atestigua y quien
-- se queda con la custodia tienen que ser tres humanos distintos. Es el unico
-- control que queda cuando el dinero es fisico y no deja rastro bancario.
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

-- Transferencia de custodia del efectivo: el billete cambia de manos dentro de
-- la empresa y eso queda asentado con nombre y apellido antes de poder verificar.
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

-- Equivalente electronico de la custodia: el dinero no se da por llegado hasta
-- que alguien con permiso confirma que lo vio acreditado en la cuenta.
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

-- Paso REGISTRADO -> VERIFICADO. Concentra las cuatro condiciones duras:
-- permiso, separacion de funciones, respaldo del movimiento (custodia si es
-- efectivo, acreditacion si es electronico) y el umbral PLD de LFPIORPI, que
-- aqui se revisa contra el monto del renglon y no solo contra el precio del C-02.
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

-- Recibo de Caja Interno: el comprobante que se le entrega al cliente. Folio
-- correlativo anual desde folio_rci_seq, uno por movimiento, y jamas emitido por
-- la misma persona que recibio el dinero. Si se declara de quien viene el pago,
-- se exige que sea una identificacion F-03 vigente del mismo expediente: es el
-- amarre entre el dinero y la persona identificada que pide PLD.
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

-- Cierre del circuito del efectivo: el billete custodiado tiene que aparecer en
-- el banco. El deposito se exige integro (mismo monto exacto del movimiento)
-- para que nadie deposite parcial y deje un faltante sin explicar.
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

-- Un renglon de caja nunca se borra: se cancela dejando quien, cuando y por que.
-- El motivo minimo de 10 caracteres evita el clasico "error" como justificacion.
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

-- Veredicto de "esta pagado" que consumen los candados de cierre de expediente.
-- Exige tres cosas a la vez: precio pactado conocido y positivo, suma de cobros
-- VERIFICADOS igual al peso al precio (ni de menos ni de mas), y que no quede
-- efectivo verificado sin su RCI y su deposito bancario correspondiente.
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

-- ----------------------------------------------------------------------------
-- 2. Triggers
-- ----------------------------------------------------------------------------

-- Se usa DROP ... IF EXISTS + CREATE porque CREATE TRIGGER no admite OR REPLACE
-- en esta version; asi el fragmento es idempotente sobre la base de produccion.

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

-- Ojo con el orden alfabetico de los triggers BEFORE: "protegido" corre antes
-- que "validado", de modo que primero se comprueba que la escritura venga de una
-- funcion del modulo y solo despues se valida la regla de las tres personas.
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

-- Este trigger vive sobre documento_campo_valor (tabla del repo, migracion 011),
-- no sobre una tabla del ledger, pero su funcion pertenece a este modulo: sin el,
-- corregir el precio en el PDF dejaria la operacion con la cifra vieja.
DROP TRIGGER IF EXISTS documento_campo_valor_sincroniza_precio_operacion ON traza.documento_campo_valor;
CREATE TRIGGER documento_campo_valor_sincroniza_precio_operacion
    AFTER INSERT OR DELETE OR UPDATE ON traza.documento_campo_valor
    FOR EACH ROW EXECUTE FUNCTION traza.recalcular_precio_operacion_por_campo();


-- ############################################################################
-- 4. REEMBOLSOS Y UMBRAL PLD
-- ############################################################################

-- ---------------------------------------------------------------------
-- Formulas de pena que consume el reembolso
--
-- Devuelven tabla y no escalar porque el reembolso necesita las tres cifras a
-- la vez —base, pena y neto— y guardarlas por separado es lo que permite
-- explicarle despues al cliente de donde salio la retencion. Van antes de
-- crear_reembolso, que es su unico consumidor.
-- ---------------------------------------------------------------------

-- Pena espejo del apartado: la que paga el LOTE cuando es el lote quien
-- incumple. Por eso devuelve base + pena (se regresa el apartado y ademas se
-- indemniza) y no lleva el tope que si acota a la pena que paga el cliente.
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

    -- Pena espejo: no tiene el tope OP que sí aplica a P_C01; es a cargo del
    -- lote, no del cliente, y por diseño puede exceder el apartado.
    RETURN QUERY SELECT v_base, round((v_porcentaje / 100) * v_base, 2),
        v_base + round((v_porcentaje / 100) * v_base, 2);
END $$;

-- Rescision de la compraventa: la base no es el precio del contrato sino lo
-- efectivamente cobrado y verificado en caja, porque no se puede devolver
-- dinero que nunca entro. La pena se calcula sobre el precio (15%) pero se
-- acota dos veces —al precio y a lo pagado— para que el neto no sea negativo.
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

-- =====================================================================
-- Reembolsos y umbrales PLD: funciones, triggers y semilla.
-- Recuperado del catálogo de la base de producción (migraciones 028..032
-- cuyos archivos .sql se perdieron). Todo es idempotente: se aplica igual
-- sobre una base nueva (donde nada existe) que sobre producción (donde ya
-- existe y no debe alterarse ni perder datos).
--
-- Dependencias de otros fragmentos del mismo lote: las tablas traza.reembolso
-- y traza.umbral_pld, y las funciones traza.tiene_permiso,
-- traza.calcular_pena_espejo_c01 y traza.calcular_pena_rescision_c02.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Umbral PLD (LFPIORPI art. 32-II)
-- ---------------------------------------------------------------------

-- Reemplaza la versión constante de 027 (que incrustaba 376,565.10 como
-- número mágico dentro de la función). Ahora el umbral se lee de la tabla
-- traza.umbral_pld por año: la UMA la publica el INEGI cada febrero y el
-- valor no puede quedar congelado en el código. Si el año en curso no tiene
-- umbral capturado la función revienta a propósito, para que nadie opere
-- pagos en efectivo contra un umbral vencido.
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

-- El umbral es la línea roja de PLD: quien lo mueve mueve el límite legal de
-- todos los pagos en efectivo del sistema. Por eso solo un administrador
-- global (N3) puede escribirlo, y la fecha de actualización la pone la base,
-- no el cliente (así la bitácora del cambio no se puede falsear).
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

-- Semilla del umbral 2026: 3,210 UMA x $117.31 = $376,565.10 (identificación)
-- y 6,420 UMA = $753,010.20 (aviso a la UIF).
-- actualizado_por es FK a traza.usuario(id) y además el trigger de arriba
-- exige que ese usuario sea N3, así que NO se incrusta el id crudo (1) que
-- trae producción: en una base recién creada desde el repo ese id puede no
-- existir o no ser N3, y el INSERT fallaría. Se resuelve con un SELECT al
-- administrador N3 de menor id (en producción es justamente el id 1, así que
-- el resultado es idéntico). Si la base todavía no tiene ningún N3, el SELECT
-- no devuelve filas y no se siembra nada en vez de romper la migración: el
-- primer administrador deberá capturar el umbral antes de operar efectivo.
-- actualizado_en no se siembra a propósito: el trigger la fija con now().
INSERT INTO traza.umbral_pld (
    anio, uma_valor, umbral_identificacion, umbral_aviso, actualizado_por
)
SELECT 2026, 117.31, 376565.10, 753010.20, u.id
  FROM traza.usuario u
 WHERE u.nivel = 'N3'
 ORDER BY u.id
 LIMIT 1
ON CONFLICT (anio) DO NOTHING;

-- ---------------------------------------------------------------------
-- Reembolsos
-- ---------------------------------------------------------------------

-- Única puerta de entrada para crear un reembolso. Los montos NUNCA los
-- teclea el usuario: se recalculan aquí desde la fórmula de pena que
-- corresponda, para que el importe devuelto sea reproducible y auditable.
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

    -- Separación de funciones (H.2.3): quien recibió el cobro original no
    -- puede aprobar su propio reembolso.
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

-- Candado de escritura directa: la tabla reembolso no se toca con SQL suelto
-- (ni desde la Data API). Solo las funciones de Finanzas, que son las que
-- levantan la bandera de sesión traza.reembolso_interno, pueden escribirla.
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

-- Cierre del circuito: el reembolso aprobado se amarra al movimiento de caja
-- que efectivamente sacó el dinero. Se verifica que sea la misma operación,
-- que el movimiento sea de tipo REEMBOLSO y que el importe cuadre al centavo
-- con lo aprobado, para que nadie devuelva un monto distinto al autorizado.
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

    -- Candado fiscal (H.6): solo aplica a compraventa con CFDI ya timbrado.
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

-- ============================================================================
-- 5. OBJETOS PREEXISTENTES QUE LAS MIGRACIONES PERDIDAS MODIFICARON
--
-- Esta seccion es la razon de ser del archivo. Recrear las tablas y funciones
-- nuevas del modulo de caja no basta: 028..032 tambien reescribieron objetos que
-- ya venian de 001..027, y esas reescrituras se perdieron con los .sql. Sin
-- ellas, una base construida desde el repositorio quedaria con la version VIEJA
-- de estas cuatro definiciones —sintacticamente valida, silenciosa, y con la
-- regla de negocio equivocada—.
--
-- Se detectaron comparando md5 objeto por objeto (pg_get_functiondef /
-- pg_get_viewdef) entre produccion y una base levantada solo con 001..027. Las
-- cuatro comparten el mismo cambio de fondo: antes preguntaban «existe una fila
-- en certificacion_pago_c02?» y ahora preguntan «pago_verificado(operacion)?».
-- La diferencia no es cosmetica. La fila de certificacion era un sello que se
-- ponia una vez; pago_verificado() recalcula contra el ledger cada vez que se
-- consulta, y exige tres cosas: precio pactado, suma de cobros VERIFICADOS
-- igual al precio, y ningun efectivo sin su RCI y su deposito bancario. Con la
-- version vieja se podria entregar una unidad y cerrar su expediente con un
-- cobro cancelado despues del sello, o con efectivo que nunca llego al banco.
--
-- Hay un quinto objeto modificado, traza.umbral_efectivo_pld(): 028 lo cambio de
-- constante incrustada a lectura de la tabla umbral_pld. No se repite aqui
-- porque ya quedo recreado en la seccion 4, pegado a la tabla que lee.
-- ============================================================================

-- emitir_folio: el candado del F-11 (carta de entrega). Ahora exige que el C-02
-- del expediente tenga operacion de caja con el pago realmente conciliado.
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

-- cambiar_estado_unidad: solo cambia la rama VENDIDA_PEND_ENTREGA, que es donde
-- se decide si una unidad puede darse por vendida. El resto va igual que en 026.
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

-- cerrar_expediente: mismo cambio en el requisito del C-02. Cerrar es el acto
-- irreversible del expediente, asi que es el ultimo punto donde conviene
-- descubrir que el dinero no cuadra.
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

-- public.documentos: la vista que consume el Data API. Su columna
-- pago_verificado alimenta el semaforo del listado, asi que si se quedara
-- leyendo certificacion_pago_c02 la pantalla diria «pagado» mientras las
-- funciones de arriba niegan la entrega. Se recrea con CREATE OR REPLACE, que
-- exige el mismo juego de columnas en el mismo orden y con los mismos tipos:
-- solo cambia la expresion de esa columna.
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


-- ============================================================================
-- 6. PRIVILEGIOS DEL DATA API
--
-- Ninguna tabla de traza se expone por PostgREST —para eso estan las vistas de
-- public—, pero los default privileges de Neon otorgan escritura sobre objetos
-- nuevos, asi que cada migracion que crea tablas cierra la puerta explicitamente
-- (mismo patron que la 024). En produccion estas catorce tablas ya tienen el ACL
-- recortado; aqui se reproduce para que una base nueva nazca igual de cerrada.
-- El bloque va envuelto porque en un Postgres local los roles no existen.
-- ============================================================================

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
