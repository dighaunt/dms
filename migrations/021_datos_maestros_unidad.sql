-- Datos de identificación que los contratos C-01..C-04 repiten para una
-- misma unidad. Se guardan una vez al abrir el expediente para que los PDFs
-- posteriores los obtengan de la fuente maestra, no de capturas aisladas.
-- Las columnas se mantienen anulables para expedientes históricos creados
-- antes de este onboarding; el API exige estos datos en las altas nuevas.
BEGIN;

ALTER TABLE traza.unidad
    ADD COLUMN IF NOT EXISTS version_tipo text,
    ADD COLUMN IF NOT EXISTS placas text,
    ADD COLUMN IF NOT EXISTS entidad_emisora text,
    ADD COLUMN IF NOT EXISTS numero_factura_vigente text,
    ADD COLUMN IF NOT EXISTS numero_constancia_repuve text,
    ADD COLUMN IF NOT EXISTS numero_tarjeta_circulacion text,
    ADD COLUMN IF NOT EXISTS refrendos_anio smallint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_version_tipo_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_version_tipo_longitud
            CHECK (version_tipo IS NULL OR char_length(version_tipo) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_placas_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_placas_longitud
            CHECK (placas IS NULL OR char_length(placas) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_entidad_emisora_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_entidad_emisora_longitud
            CHECK (entidad_emisora IS NULL OR char_length(entidad_emisora) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_numero_factura_vigente_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_numero_factura_vigente_longitud
            CHECK (numero_factura_vigente IS NULL OR char_length(numero_factura_vigente) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_numero_constancia_repuve_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_numero_constancia_repuve_longitud
            CHECK (numero_constancia_repuve IS NULL OR char_length(numero_constancia_repuve) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_numero_tarjeta_circulacion_longitud'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_numero_tarjeta_circulacion_longitud
            CHECK (numero_tarjeta_circulacion IS NULL OR char_length(numero_tarjeta_circulacion) <= 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_refrendos_anio_rango'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_refrendos_anio_rango
            CHECK (refrendos_anio IS NULL OR refrendos_anio BETWEEN 0 AND 99);
    END IF;

END $$;

COMMENT ON COLUMN traza.unidad.version_tipo IS
    'Versión o tipo de la unidad, capturada una vez al alta.';
COMMENT ON COLUMN traza.unidad.numero_factura_vigente IS
    'Número de factura vigente, fuente maestra para contratos.';

COMMIT;
