-- C-01 usa “REFRENDOS AL AÑO” para el año del último refrendo (por ejemplo,
-- 2026), no para una cantidad. Corrige el contrato de datos y recupera los
-- valores ya capturados en contratos históricos hacia traza.unidad.
BEGIN;

ALTER TABLE traza.unidad
    DROP CONSTRAINT IF EXISTS unidad_refrendos_anio_rango;

WITH campos AS (
    SELECT
        e.vin,
        CASE
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_14'), ('C-02', 'C02_f_46'), ('C-03', 'C03_f_87'), ('C-04', 'C04_f_128')) THEN 'version_tipo'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_20'), ('C-02', 'C02_f_52'), ('C-03', 'C03_f_93'), ('C-04', 'C04_f_134')) THEN 'placas'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_21'), ('C-02', 'C02_f_53'), ('C-03', 'C03_f_94'), ('C-04', 'C04_f_135')) THEN 'entidad_emisora'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_22'), ('C-02', 'C02_f_54'), ('C-03', 'C03_f_95'), ('C-04', 'C04_f_136')) THEN 'numero_factura_vigente'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_23'), ('C-02', 'C02_f_55'), ('C-03', 'C03_f_96'), ('C-04', 'C04_f_137')) THEN 'numero_constancia_repuve'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_24'), ('C-02', 'C02_f_56'), ('C-03', 'C03_f_97'), ('C-04', 'C04_f_138')) THEN 'numero_tarjeta_circulacion'
            WHEN (d.tipo_codigo, v.campo_pdf) IN (('C-01', 'C01_f_25'), ('C-02', 'C02_f_57'), ('C-03', 'C03_f_98'), ('C-04', 'C04_f_139')) THEN 'refrendos_anio'
        END AS clave,
        NULLIF(btrim(COALESCE(v.valor_texto, v.valor_numero::text)), '') AS valor,
        d.emitido_en,
        v.actualizado_en,
        d.id AS documento_id
    FROM traza.documento d
    JOIN traza.expediente e ON e.id = d.expediente_id
    JOIN traza.documento_campo_valor v ON v.documento_id = d.id
    WHERE d.tipo_codigo IN ('C-01', 'C-02', 'C-03', 'C-04')
), recientes AS (
    SELECT *, row_number() OVER (
        PARTITION BY vin, clave
        ORDER BY emitido_en DESC, actualizado_en DESC, documento_id DESC
    ) AS posicion
    FROM campos
    WHERE clave IS NOT NULL AND valor IS NOT NULL
), fuente AS (
    SELECT
        vin,
        max(valor) FILTER (WHERE clave = 'version_tipo' AND posicion = 1) AS version_tipo,
        max(valor) FILTER (WHERE clave = 'placas' AND posicion = 1) AS placas,
        max(valor) FILTER (WHERE clave = 'entidad_emisora' AND posicion = 1) AS entidad_emisora,
        max(valor) FILTER (WHERE clave = 'numero_factura_vigente' AND posicion = 1) AS numero_factura_vigente,
        max(valor) FILTER (WHERE clave = 'numero_constancia_repuve' AND posicion = 1) AS numero_constancia_repuve,
        max(valor) FILTER (WHERE clave = 'numero_tarjeta_circulacion' AND posicion = 1) AS numero_tarjeta_circulacion,
        max(valor) FILTER (
            WHERE clave = 'refrendos_anio'
              AND posicion = 1
              AND valor ~ '^[0-9]{4}$'
              AND valor::integer BETWEEN 1980 AND 2100
        )::smallint AS refrendos_anio
    FROM recientes
    GROUP BY vin
), resuelto AS (
    SELECT
        u.vin,
        COALESCE(NULLIF(u.version_tipo, ''), f.version_tipo) AS version_tipo,
        COALESCE(NULLIF(u.placas, ''), f.placas) AS placas,
        COALESCE(NULLIF(u.entidad_emisora, ''), f.entidad_emisora) AS entidad_emisora,
        COALESCE(NULLIF(u.numero_factura_vigente, ''), f.numero_factura_vigente) AS numero_factura_vigente,
        COALESCE(NULLIF(u.numero_constancia_repuve, ''), f.numero_constancia_repuve) AS numero_constancia_repuve,
        COALESCE(NULLIF(u.numero_tarjeta_circulacion, ''), f.numero_tarjeta_circulacion) AS numero_tarjeta_circulacion,
        COALESCE(u.refrendos_anio, f.refrendos_anio) AS refrendos_anio
    FROM traza.unidad u
    JOIN fuente f ON f.vin = u.vin
)
UPDATE traza.unidad u
   SET version_tipo = r.version_tipo,
       placas = r.placas,
       entidad_emisora = r.entidad_emisora,
       numero_factura_vigente = r.numero_factura_vigente,
       numero_constancia_repuve = r.numero_constancia_repuve,
       numero_tarjeta_circulacion = r.numero_tarjeta_circulacion,
       refrendos_anio = r.refrendos_anio
  FROM resuelto r
 WHERE u.vin = r.vin
   AND (u.version_tipo, u.placas, u.entidad_emisora, u.numero_factura_vigente,
        u.numero_constancia_repuve, u.numero_tarjeta_circulacion, u.refrendos_anio)
       IS DISTINCT FROM
       (r.version_tipo, r.placas, r.entidad_emisora, r.numero_factura_vigente,
        r.numero_constancia_repuve, r.numero_tarjeta_circulacion, r.refrendos_anio)
   AND r.version_tipo IS NOT NULL
   AND r.placas IS NOT NULL
   AND r.entidad_emisora IS NOT NULL
   AND r.numero_factura_vigente IS NOT NULL
   AND r.numero_constancia_repuve IS NOT NULL
   AND r.numero_tarjeta_circulacion IS NOT NULL
   AND r.refrendos_anio IS NOT NULL;

ALTER TABLE traza.unidad
    ADD CONSTRAINT unidad_refrendos_anio_rango
    CHECK (refrendos_anio IS NULL OR refrendos_anio BETWEEN 1980 AND 2100) NOT VALID;

COMMENT ON COLUMN traza.unidad.refrendos_anio IS
    'Año del último refrendo de la unidad, según su documentación.';

COMMIT;
