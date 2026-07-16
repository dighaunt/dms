-- Se aplica después de desplegar el onboarding que captura todos los datos.
-- NOT VALID protege el historial: las unidades previas no se reescriben, pero
-- toda alta o corrección futura debe tener una ficha apta para los contratos.
BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'traza.unidad'::regclass
           AND conname = 'unidad_datos_contractuales_requeridos'
    ) THEN
        ALTER TABLE traza.unidad
            ADD CONSTRAINT unidad_datos_contractuales_requeridos
            CHECK (
                color IS NOT NULL
                AND num_motor IS NOT NULL
                AND kilometraje_ingreso IS NOT NULL
                AND version_tipo IS NOT NULL
                AND placas IS NOT NULL
                AND entidad_emisora IS NOT NULL
                AND numero_factura_vigente IS NOT NULL
                AND numero_constancia_repuve IS NOT NULL
                AND numero_tarjeta_circulacion IS NOT NULL
                AND refrendos_anio IS NOT NULL
            ) NOT VALID;
    END IF;
END $$;

COMMIT;
