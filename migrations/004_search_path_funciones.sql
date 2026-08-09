

BEGIN;

ALTER FUNCTION traza.abrir_expediente(text, text, bigint) SET search_path = traza;
ALTER FUNCTION traza.emitir_folio(text, bigint, bigint) SET search_path = traza;
ALTER FUNCTION traza.cambiar_estado_unidad(text, text, bigint) SET search_path = traza;

COMMIT;
