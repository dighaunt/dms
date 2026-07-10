-- plpgsql resuelve tipos/tablas no calificados con el search_path del LLAMADOR.
-- Se fija en cada función para que operen igual desde cualquier conexión
-- (app con search_path=public, psql, Data API RPC).
BEGIN;

ALTER FUNCTION traza.abrir_expediente(text, text, bigint) SET search_path = traza;
ALTER FUNCTION traza.emitir_folio(text, bigint, bigint) SET search_path = traza;
ALTER FUNCTION traza.cambiar_estado_unidad(text, text, bigint) SET search_path = traza;

COMMIT;
