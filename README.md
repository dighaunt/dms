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
| `DATABASE_URL_TEST` | Base **desechable** para las pruebas de integración de Finanzas. Ver «Pruebas» |
| `PERMITIR_PRUEBAS_SIN_BASE` | Escotilla para correr `npm test` sin esa base. Ver «Pruebas» |

## Pruebas

```bash
DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:5433/finanzas_test" npm test
```

La suite tiene dos mitades y sólo una corre sin base de datos.

- **Sin base**: aritmética de centavos en `BigInt`, formato del importe con
  letra, casillas del VIN. Es TypeScript puro.
- **Con base**: los candados del módulo de Finanzas —`CHECK`, disparadores,
  índices únicos parciales y funciones plpgsql—, que es donde vive el control
  interno del efectivo. Son las suites `antifraude`, `folios-firmas`,
  `reglas-socios-corte` y `reglas-utilidad-egreso`, y **necesitan
  `DATABASE_URL_TEST`**.

Sin la variable, esas suites se saltan y `npm test` **falla** con un caso
centinela por suite que explica qué quedó sin probar y cómo arreglarlo. Es
deliberado: antes se saltaban en silencio y la suite salía en verde con cero
cobertura de las reglas que sostienen el dinero.

Levantar la base de pruebas, en tres comandos:

```bash
createdb -h 127.0.0.1 -p 5433 -U postgres finanzas_test
DATABASE_URL="postgresql://postgres@127.0.0.1:5433/finanzas_test" npm run db:migrate
DATABASE_URL_TEST="postgresql://postgres@127.0.0.1:5433/finanzas_test" npm test
```

Es desechable y puede recrearse cuando sea: cada caso siembra sus datos dentro
de una transacción y termina en `ROLLBACK`, así que la base no acumula estado
entre corridas. No la apuntes a una base con datos reales.

Si sólo tocaste la UI y hoy no puedes levantar Postgres, el salto se autoriza de
forma explícita —queda anunciado en la salida y las pruebas siguen sin correr—:

```bash
PERMITIR_PRUEBAS_SIN_BASE=1 npm test
```

## Reglas duras

- Los candados viven en la BD; la UI solo los refleja. Los errores de negocio
  llegan como **409** con una explicación del manual; detalles técnicos del
  servidor o de proveedores no se exponen a la persona operadora.
- Tablas de hechos son **append-only** (triggers): corrección = cancelación +
  sustitución; reescaneo = nueva versión.
- Validación de todos los bodies con zod (**400** con detalle).

La arquitectura, normalización y reglas del motor PDF están documentadas en
[`docs/arquitectura-formularios.md`](docs/arquitectura-formularios.md).
