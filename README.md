# CLIQUEALO · Trazabilidad documental (M-01 Rev 3.0)

Sistema web de trazabilidad documental para un lote de autos usados: apertura de
expedientes (un expediente = un VIN = un folio), emisión de folios F-01…F-11 /
C-01…C-04, carga de escaneos versionados a Cloudflare R2 y ciclo de vida de la
unidad forzado por la base de datos.

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` como middleware) + TypeScript + Tailwind + shadcn/ui
- **Neon Postgres** — SQL plano con `pg` (sin ORM); los candados del manual viven
  en funciones plpgsql (`traza.emitir_folio`, `traza.cambiar_estado_unidad`)
- **Neon Auth** — toda ruta exige sesión; primer login hace upsert en `traza.usuario` (nivel N1)
- **Neon Data API** (PostgREST) — lecturas vía vistas de solo lectura en `public`,
  autenticadas con el JWT de la sesión; las escrituras siempre pasan por las
  funciones transaccionales
- **Cloudflare R2** — bucket privado, PUT/GET prefirmados (10 min), sha256 en cliente

## Puesta en marcha

```bash
cp .env.example .env   # llenar valores (ver abajo)
npm install
npm run db:migrate     # aplica migrations/*.sql (tabla public._migrations)
npm run dev
```

Variables de entorno:

| Variable | Origen |
|----------|--------|
| `DATABASE_URL` | Cadena de conexión de Neon |
| `NEON_AUTH_BASE_URL` / `NEON_AUTH_COOKIE_SECRET` | Página **Auth** del proyecto en Neon (secret ≥ 32 chars) |
| `DATA_API_URL` | Página **Data API** de Neon (opcional; sin ella las lecturas van por SQL directo) |
| `R2_*` | Credenciales de Cloudflare R2 |

## Reglas duras

- Los candados viven en la BD; la UI solo los refleja. Los errores de negocio
  llegan como **409** con el mensaje literal del manual.
- Tablas de hechos son **append-only** (triggers): corrección = cancelación +
  sustitución; reescaneo = nueva versión.
- Validación de todos los bodies con zod (**400** con detalle).
