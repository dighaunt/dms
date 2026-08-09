

BEGIN;

DO $$
BEGIN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE
        ON public.expedientes, public.documentos, public.transiciones
        FROM authenticated;
    REVOKE ALL
        ON public.expedientes, public.documentos, public.transiciones
        FROM anonymous;
EXCEPTION WHEN undefined_object THEN
    RAISE NOTICE 'roles del Data API no existen en este entorno; revokes omitidos';
END $$;

COMMIT;
