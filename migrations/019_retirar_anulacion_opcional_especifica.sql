-- La API limitada a F-09/F-10 fue sustituida por
-- anular_documento_excepcional, que opera sobre el catálogo documental.
-- Se elimina para que no exista un segundo camino ni reglas codificadas.
BEGIN;
DROP FUNCTION IF EXISTS traza.anular_documento_opcional_excepcional(bigint, text, text, bigint);
COMMIT;
