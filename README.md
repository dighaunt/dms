# CLIQUEALO · Trazabilidad documental (M-01 Rev 3.0)

Sistema web de trazabilidad documental para un lote de autos usados: apertura de
expedientes (un expediente = un VIN = un folio), emisión de folios F-01…F-11 /
C-01…C-04, carga de escaneos versionados a Vercel Blob y ciclo de vida de la
unidad forzado por la base de datos.

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` como middleware) + TypeScript + Tailwind + shadcn/ui
- **Neon Postgres** — SQL plano con `pg` (sin ORM); los candados del manual viven
  en funciones plpgsql (`traza.emitir_folio`, `traza.cambiar_estado_unidad`)
- **Neon Auth** — toda ruta exige sesión; primer login hace upsert en `traza.usuario` (nivel N1)
- **Neon Data API** (PostgREST) — lecturas vía vistas de solo lectura en `public`,
  autenticadas con el JWT de la sesión; las escrituras siempre pasan por las
  funciones transaccionales
- **Vercel Blob privado** — URLs prefirmadas de 10 min y sha256 en cliente;
  en Vercel se autentica con OIDC y en local mediante `vercel env pull`
- **Motor AcroForm** — wizard tipado para los 15 PDFs oficiales; reutiliza datos,
  aplica reglas y sólo genera el archivo cuando no quedan campos sin resolver

## Puesta en marcha

```bash
cp .env.example .env   # llenar valores (ver abajo)
npm install
npm run db:migrate     # aplica migrations/*.sql y valida sus checksums
npm run dev
```

En una base ya existente, antes de la primera actualización usa
`npm run db:verify-ledger`. Si confirma el desfase histórico de las
migraciones 016–020, `npm run db:reconcile-ledger` registra únicamente ese
historial ya comprobado y sella los checksums; no vuelve a ejecutar el DDL.

Variables de entorno:

| Variable | Origen |
|----------|--------|
| `DATABASE_URL` | Cadena de conexión de Neon |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` | Página **Auth** del proyecto en Neon (secret ≥ 32 chars) |
| `DATA_API_URL` | Página **Data API** de Neon (opcional; sin ella las lecturas van por SQL directo) |
| `BLOB_STORE_ID` | Identificador del store privado de Vercel Blob |
| `VERCEL_OIDC_TOKEN` | Lo inyecta Vercel; para desarrollo local se obtiene con `vercel env pull` |

## Reglas duras

- Los candados viven en la BD; la UI solo los refleja. Los errores de negocio
  llegan como **409** con una explicación del manual; detalles técnicos del
  servidor o de proveedores no se exponen a la persona operadora.
- Tablas de hechos son **append-only** (triggers): corrección = cancelación +
  sustitución; reescaneo = nueva versión.
- Validación de todos los bodies con zod (**400** con detalle).

La arquitectura, normalización y reglas del motor PDF están documentadas en
[`docs/arquitectura-formularios.md`](docs/arquitectura-formularios.md).
