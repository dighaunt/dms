

BEGIN;

SET search_path TO traza;

CREATE TABLE IF NOT EXISTS concepto_cobro (
    codigo   text PRIMARY KEY,
    etiqueta text NOT NULL,
    orden    smallint NOT NULL UNIQUE,
    activo   boolean NOT NULL DEFAULT true
);
INSERT INTO concepto_cobro (codigo, etiqueta, orden) VALUES
 ('ENGANCHE','Enganche',1),
 ('ABONO','Abono',2),
 ('LIQUIDACION_TOTAL','Liquidacion total',3),
 ('OTRO','Otro',4)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS concepto_egreso (
    codigo                  text PRIMARY KEY,
    etiqueta                text NOT NULL,
    orden                   smallint NOT NULL UNIQUE,
    es_anticipo_utilidades  boolean NOT NULL DEFAULT false,
    activo                  boolean NOT NULL DEFAULT true
);
INSERT INTO concepto_egreso (codigo, etiqueta, orden, es_anticipo_utilidades) VALUES
 ('COMISION_VENDEDOR','Pago de comision a vendedor',1,false),
 ('RETIRO_UTILIDADES_SOCIO','Retiro de utilidades por socio / accionista (anticipo a cuenta de utilidades)',2,true),
 ('PAGO_NOMINA','Pago de nomina o salario',3,false),
 ('PAGO_PROVEEDOR','Pago a proveedor',4,false),
 ('GASTO_OPERATIVO','Gasto operativo',5,false),
 ('OTRO','Otro',6,false)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS forma_pago_fin (
    codigo              text PRIMARY KEY,
    etiqueta            text NOT NULL,
    orden               smallint NOT NULL UNIQUE,
    afecta_caja_fisica  boolean NOT NULL,
    activo              boolean NOT NULL DEFAULT true
);
INSERT INTO forma_pago_fin (codigo, etiqueta, orden, afecta_caja_fisica) VALUES
 ('EFECTIVO','Efectivo',1,true),
 ('TRANSFERENCIA','Transferencia',2,false),
 ('DEPOSITO_BANCARIO','Deposito bancario',3,false),
 ('TARJETA','Tarjeta',4,false),
 ('CHEQUE','Cheque',5,false)
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE IF NOT EXISTS recibo_caja_rci01 (
    documento_id        bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo         text NOT NULL DEFAULT 'CACM-RCI-01'
                        CHECK (tipo_codigo = 'CACM-RCI-01'),
    vendedor_empleado_id bigint NOT NULL REFERENCES empleado(id),
    vendedor_id_tipo    text NOT NULL CHECK (char_length(trim(vendedor_id_tipo)) BETWEEN 2 AND 40),
    vendedor_id_numero  text NOT NULL CHECK (char_length(trim(vendedor_id_numero)) BETWEEN 3 AND 40),
    cliente_nombre      text NOT NULL CHECK (char_length(trim(cliente_nombre)) BETWEEN 3 AND 160),
    vehiculo_descripcion text,
    vin                 text REFERENCES unidad(vin),
    fecha_hora_cobro    timestamptz NOT NULL,
    documento_venta_id  bigint REFERENCES documento(id),
    folio_venta_texto   text,
    concepto_codigo     text NOT NULL REFERENCES concepto_cobro(codigo),
    concepto_otro       text,
    importe_total       numeric(18,2) NOT NULL CHECK (importe_total > 0),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),

    CHECK (documento_venta_id IS NOT NULL
           OR char_length(trim(coalesce(folio_venta_texto,''))) >= 3),
    CHECK (concepto_codigo <> 'OTRO'
           OR char_length(trim(coalesce(concepto_otro,''))) >= 3)
);

CREATE TABLE IF NOT EXISTS denominacion_rci01 (
    documento_id bigint NOT NULL REFERENCES recibo_caja_rci01(documento_id),
    denominacion numeric(10,2) NOT NULL CHECK (denominacion > 0),
    cantidad     integer NOT NULL CHECK (cantidad > 0),
    subtotal     numeric(18,2) GENERATED ALWAYS AS (denominacion * cantidad) STORED,
    PRIMARY KEY (documento_id, denominacion)
);

CREATE TABLE IF NOT EXISTS ingreso_vehiculo_rci02 (
    documento_id      bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo       text NOT NULL DEFAULT 'CACM-RCI-02'
                      CHECK (tipo_codigo = 'CACM-RCI-02'),
    expediente_id     bigint NOT NULL REFERENCES expediente(id),
    placas            text,
    kilometraje       integer CHECK (kilometraje IS NULL OR kilometraje >= 0),
    ubicacion_fisica  text,
    fecha_ingreso     date NOT NULL,
    num_llaves        smallint CHECK (num_llaves IS NULL OR num_llaves BETWEEN 0 AND 10),
    
    propietario_nombre   text NOT NULL CHECK (char_length(trim(propietario_nombre)) BETWEEN 3 AND 200),
    propietario_id_tipo  text NOT NULL,
    propietario_id_numero text NOT NULL,
    propietario_telefono text CHECK (propietario_telefono IS NULL OR propietario_telefono ~ '^[0-9]{10}$'),
    propietario_domicilio text,
    tipo_operacion    text NOT NULL CHECK (tipo_operacion IN ('COMPRA_DIRECTA','CONSIGNACION')),
    
    precio_compra     numeric(18,2) CHECK (precio_compra IS NULL OR precio_compra > 0),
    compra_forma_pago text REFERENCES forma_pago_fin(codigo),
    compra_fecha_pago date,
    precio_minimo_venta numeric(18,2) CHECK (precio_minimo_venta IS NULL OR precio_minimo_venta > 0),
    comision_monto    numeric(18,2) CHECK (comision_monto IS NULL OR comision_monto >= 0),
    comision_pct      numeric(5,2) CHECK (comision_pct IS NULL OR (comision_pct > 0 AND comision_pct <= 100)),
    consigna_fecha_limite date,
    UNIQUE (expediente_id),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),
    CHECK (
        (tipo_operacion = 'COMPRA_DIRECTA'
         AND precio_compra IS NOT NULL
         AND precio_minimo_venta IS NULL AND comision_monto IS NULL
         AND comision_pct IS NULL AND consigna_fecha_limite IS NULL)
        OR
        (tipo_operacion = 'CONSIGNACION'
         AND precio_compra IS NULL AND compra_forma_pago IS NULL AND compra_fecha_pago IS NULL
         AND precio_minimo_venta IS NOT NULL
         
         AND (comision_monto IS NOT NULL) <> (comision_pct IS NOT NULL))
    )
);

CREATE TABLE IF NOT EXISTS liquidacion_consigna_rci03 (
    documento_id        bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo         text NOT NULL DEFAULT 'CACM-RCI-03'
                        CHECK (tipo_codigo = 'CACM-RCI-03'),
    ingreso_rci02_id    bigint NOT NULL REFERENCES ingreso_vehiculo_rci02(documento_id),
    recibo_rci01_id     bigint REFERENCES recibo_caja_rci01(documento_id),
    documento_venta_id  bigint REFERENCES documento(id),
    consignante_nombre  text NOT NULL CHECK (char_length(trim(consignante_nombre)) BETWEEN 3 AND 200),
    precio_venta_final  numeric(18,2) NOT NULL CHECK (precio_venta_final > 0),
    monto_consignante   numeric(18,2) NOT NULL CHECK (monto_consignante >= 0),
    gastos_total        numeric(18,2) NOT NULL DEFAULT 0 CHECK (gastos_total >= 0),
    utilidad_neta       numeric(18,2)
                        GENERATED ALWAYS AS (precio_venta_final - monto_consignante - gastos_total) STORED,
    forma_ingreso_tesoreria text NOT NULL REFERENCES forma_pago_fin(codigo),
    institucion_bancaria text,
    cuenta_bancaria     text,
    UNIQUE (ingreso_rci02_id),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),
    CHECK (monto_consignante <= precio_venta_final),
    CHECK (forma_ingreso_tesoreria <> 'DEPOSITO_BANCARIO'
           OR (char_length(trim(coalesce(institucion_bancaria,''))) >= 2
               AND char_length(trim(coalesce(cuenta_bancaria,''))) >= 4))
);

CREATE TABLE IF NOT EXISTS gasto_liquidacion_rci03 (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id bigint NOT NULL REFERENCES liquidacion_consigna_rci03(documento_id),
    concepto     text NOT NULL CHECK (char_length(trim(concepto)) BETWEEN 3 AND 160),
    importe      numeric(18,2) NOT NULL CHECK (importe > 0),
    UNIQUE (documento_id, concepto)
);

CREATE TABLE IF NOT EXISTS ajuste_utilidad_rci03 (
    id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    documento_id   bigint NOT NULL REFERENCES liquidacion_consigna_rci03(documento_id),
    monto_ajuste   numeric(18,2) NOT NULL CHECK (monto_ajuste <> 0),
    nota_auditoria text NOT NULL CHECK (char_length(trim(nota_auditoria)) >= 20),
    autorizado_por bigint NOT NULL REFERENCES usuario(id),
    creado_en      timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION recalcular_gastos_rci03()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_documento bigint;
BEGIN
    v_documento := CASE TG_OP WHEN 'DELETE' THEN OLD.documento_id ELSE NEW.documento_id END;
    UPDATE liquidacion_consigna_rci03
       SET gastos_total = COALESCE(
             (SELECT sum(importe) FROM gasto_liquidacion_rci03 WHERE documento_id = v_documento), 0)
     WHERE documento_id = v_documento;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS gasto_rci03_recalcula ON gasto_liquidacion_rci03';
    EXECUTE 'CREATE TRIGGER gasto_rci03_recalcula AFTER INSERT OR UPDATE OR DELETE ON gasto_liquidacion_rci03
             FOR EACH ROW EXECUTE FUNCTION recalcular_gastos_rci03()';
END $$;

CREATE TABLE IF NOT EXISTS ingreso_servicio_rci04 (
    documento_id       bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo        text NOT NULL DEFAULT 'CACM-RCI-04'
                       CHECK (tipo_codigo = 'CACM-RCI-04'),
    cliente_nombre     text NOT NULL CHECK (char_length(trim(cliente_nombre)) BETWEEN 3 AND 160),
    vehiculo_descripcion text,
    placas             text,
    orden_servicio     text NOT NULL CHECK (char_length(trim(orden_servicio)) BETWEEN 1 AND 40),
    fecha_hora_cobro   timestamptz NOT NULL,
    descripcion_servicio text NOT NULL CHECK (char_length(trim(descripcion_servicio)) >= 5),
    cobrador_empleado_id bigint NOT NULL REFERENCES empleado(id),
    forma_pago         text NOT NULL REFERENCES forma_pago_fin(codigo),
    importe_total      numeric(18,2) NOT NULL CHECK (importe_total > 0),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo)
);

CREATE TABLE IF NOT EXISTS recibo_nomina_rci06 (
    documento_id        bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo         text NOT NULL DEFAULT 'CACM-RCI-06'
                        CHECK (tipo_codigo = 'CACM-RCI-06'),
    empleado_id         bigint NOT NULL REFERENCES empleado(id),
    periodo_inicio      date NOT NULL,
    periodo_fin         date NOT NULL,
    percepcion_sueldo   numeric(18,2) NOT NULL DEFAULT 0 CHECK (percepcion_sueldo >= 0),
    percepcion_comisiones numeric(18,2) NOT NULL DEFAULT 0 CHECK (percepcion_comisiones >= 0),
    percepcion_otras    numeric(18,2) NOT NULL DEFAULT 0 CHECK (percepcion_otras >= 0),
    total_percepciones  numeric(18,2)
                        GENERATED ALWAYS AS (percepcion_sueldo + percepcion_comisiones + percepcion_otras) STORED,
    deduccion_isr       numeric(18,2) NOT NULL DEFAULT 0 CHECK (deduccion_isr >= 0),
    deduccion_imss_infonavit numeric(18,2) NOT NULL DEFAULT 0 CHECK (deduccion_imss_infonavit >= 0),
    deduccion_otras     numeric(18,2) NOT NULL DEFAULT 0 CHECK (deduccion_otras >= 0),
    total_deducciones   numeric(18,2)
                        GENERATED ALWAYS AS (deduccion_isr + deduccion_imss_infonavit + deduccion_otras) STORED,
    neto_pagado         numeric(18,2)
                        GENERATED ALWAYS AS (
                            percepcion_sueldo + percepcion_comisiones + percepcion_otras
                          - deduccion_isr - deduccion_imss_infonavit - deduccion_otras) STORED,
    forma_pago          text NOT NULL REFERENCES forma_pago_fin(codigo),
    UNIQUE (empleado_id, periodo_inicio, periodo_fin),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),
    CHECK (periodo_fin >= periodo_inicio),

    CHECK (deduccion_isr + deduccion_imss_infonavit + deduccion_otras
           <= percepcion_sueldo + percepcion_comisiones + percepcion_otras)
);

CREATE TABLE IF NOT EXISTS vale_egreso_rci05 (
    documento_id        bigint PRIMARY KEY REFERENCES documento_financiero(id),
    tipo_codigo         text NOT NULL DEFAULT 'CACM-RCI-05'
                        CHECK (tipo_codigo = 'CACM-RCI-05'),
    fecha_hora          timestamptz NOT NULL,
    concepto_codigo     text NOT NULL REFERENCES concepto_egreso(codigo),
    concepto_otro       text,
    folio_relacionado_id bigint REFERENCES documento_financiero(id),
    folio_relacionado_texto text,
    recibo_nomina_id    bigint REFERENCES recibo_nomina_rci06(documento_id),
    beneficiario_nombre text NOT NULL CHECK (char_length(trim(beneficiario_nombre)) BETWEEN 3 AND 200),
    beneficiario_id_tipo text NOT NULL,
    beneficiario_id_numero text NOT NULL,
    socio_usuario_id    bigint REFERENCES usuario(id),
    forma_pago          text NOT NULL REFERENCES forma_pago_fin(codigo),
    importe             numeric(18,2) NOT NULL CHECK (importe > 0),
    FOREIGN KEY (documento_id, tipo_codigo)
        REFERENCES documento_financiero (id, tipo_codigo),
    CHECK (concepto_codigo <> 'OTRO'
           OR char_length(trim(coalesce(concepto_otro,''))) >= 3),

    CHECK (concepto_codigo <> 'PAGO_NOMINA' OR recibo_nomina_id IS NOT NULL),

    CHECK (concepto_codigo <> 'RETIRO_UTILIDADES_SOCIO' OR socio_usuario_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS vale_egreso_rci05_concepto_idx
    ON vale_egreso_rci05 (concepto_codigo, fecha_hora);
CREATE INDEX IF NOT EXISTS vale_egreso_rci05_socio_idx
    ON vale_egreso_rci05 (socio_usuario_id) WHERE socio_usuario_id IS NOT NULL;

DO $$
DECLARE
    v_tabla text;
BEGIN
    FOREACH v_tabla IN ARRAY ARRAY[
        'recibo_caja_rci01','denominacion_rci01','ingreso_vehiculo_rci02',
        'liquidacion_consigna_rci03','gasto_liquidacion_rci03','ingreso_servicio_rci04',
        'vale_egreso_rci05','recibo_nomina_rci06'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', v_tabla || '_congelado', v_tabla);
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION bloquear_detalle_documento_fin()',
            v_tabla || '_congelado', v_tabla);
    END LOOP;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS ajuste_utilidad_rci03_inmutable ON ajuste_utilidad_rci03';
    EXECUTE 'CREATE TRIGGER ajuste_utilidad_rci03_inmutable BEFORE UPDATE OR DELETE ON ajuste_utilidad_rci03
             FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion()';
END $$;

CREATE OR REPLACE FUNCTION validar_ingreso_vehiculo_rci02()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_origen text;
BEGIN
    SELECT origen INTO v_origen FROM expediente WHERE id = NEW.expediente_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El expediente indicado no existe';
    END IF;
    IF (NEW.tipo_operacion = 'COMPRA_DIRECTA' AND v_origen <> 'PROPIA')
       OR (NEW.tipo_operacion = 'CONSIGNACION' AND v_origen <> 'CONSIGNADA') THEN
        RAISE EXCEPTION 'El expediente registra la unidad como % y el ingreso la declara como %; corrige el expediente antes de continuar',
            v_origen, NEW.tipo_operacion;
    END IF;
    RETURN NEW;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS ingreso_vehiculo_rci02_valida ON ingreso_vehiculo_rci02';
    EXECUTE 'CREATE TRIGGER ingreso_vehiculo_rci02_valida BEFORE INSERT OR UPDATE ON ingreso_vehiculo_rci02
             FOR EACH ROW EXECUTE FUNCTION validar_ingreso_vehiculo_rci02()';
END $$;

CREATE OR REPLACE FUNCTION validar_liquidacion_rci03()
RETURNS trigger LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_tipo_op text;
BEGIN
    SELECT tipo_operacion INTO v_tipo_op
      FROM ingreso_vehiculo_rci02 WHERE documento_id = NEW.ingreso_rci02_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La liquidacion debe referir un ingreso de vehiculo existente';
    END IF;
    IF v_tipo_op <> 'CONSIGNACION' THEN
        RAISE EXCEPTION 'Solo se liquida una unidad ingresada en consignacion; esta entro por compra directa';
    END IF;
    IF estado_documento_fin(NEW.ingreso_rci02_id) <> 'FIRMADO' THEN
        RAISE EXCEPTION 'El ingreso de la unidad en consignacion debe estar firmado antes de liquidarla';
    END IF;
    RETURN NEW;
END $$;

DO $$
BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS liquidacion_rci03_valida ON liquidacion_consigna_rci03';
    EXECUTE 'CREATE TRIGGER liquidacion_rci03_valida BEFORE INSERT OR UPDATE ON liquidacion_consigna_rci03
             FOR EACH ROW EXECUTE FUNCTION validar_liquidacion_rci03()';
END $$;

CREATE OR REPLACE FUNCTION validar_arqueo_rci01(p_documento bigint)
RETURNS void LANGUAGE plpgsql SET search_path = traza AS $$
DECLARE
    v_importe numeric(18,2);
    v_suma    numeric(18,2);
BEGIN
    SELECT importe_total INTO v_importe FROM recibo_caja_rci01 WHERE documento_id = p_documento;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT COALESCE(sum(subtotal), 0) INTO v_suma
      FROM denominacion_rci01 WHERE documento_id = p_documento;
    IF v_suma <> v_importe THEN
        RAISE EXCEPTION 'El desglose de denominaciones suma % y el importe declarado es %; revisa el arqueo antes de firmar',
            to_char(v_suma, 'FM999,999,999.00'), to_char(v_importe, 'FM999,999,999.00');
    END IF;
END $$;

COMMIT;
