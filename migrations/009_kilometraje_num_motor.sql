-- Los formatos del paquete piden kilometraje y n° de motor una y otra vez
-- (F-01, F-02, F-05, C-01..C-04). num_motor ya existía sin capturarse desde
-- el wizard; kilometraje_ingreso es el odómetro al día 0 y alimenta el
-- prellenado de PDFs (src/lib/formatos-pdf.ts).
BEGIN;

ALTER TABLE traza.unidad
    ADD COLUMN kilometraje_ingreso integer
    CHECK (kilometraje_ingreso IS NULL OR kilometraje_ingreso >= 0);

COMMIT;
