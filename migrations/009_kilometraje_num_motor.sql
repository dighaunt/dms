

BEGIN;

ALTER TABLE traza.unidad
    ADD COLUMN kilometraje_ingreso integer
    CHECK (kilometraje_ingreso IS NULL OR kilometraje_ingreso >= 0);

COMMIT;
