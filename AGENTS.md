# AGENTS.md — LUKA Frontend

## Migración a Astro + Cloudflare Workers (ejecutada hasta M3)

- **Leer primero:** `docs/migracion-astro/02-estado-y-siguientes-pasos.md` (estado, entorno local,
  harness de validación, T9/T10 pendientes y cosas que no hay que romper).
- Plan de migración completa: `docs/migracion-astro/10-plan-cloudflare-workers.md` (incluye el
  estado de ejecución y los hallazgos de T7/T8).
- Producción: Worker `luka-frontend` → `https://luka-frontend.marianoinsaurralde5.workers.dev`
  (deploy desde `main` vía Workers Builds; secrets y Hyperdrive configurados).
- Contrato de paridad (rutas, cookies, consultas, tests): `docs/migracion-astro/01-inventario-paridad.md`.
- `README.md`: comandos y estructura del proyecto (raíz del repo).

## Comandos

```powershell
# Todo corre en la raíz del repo
npm run check; npm test; npm run build          # suite hermética; build sin variables de entorno

# Local en workerd con .dev.vars (astro dev/preview NO leen .dev.vars)
npx wrangler dev                                 # :4321

# Local con DB real: simular Hyperdrive (workerd no puede TLS contra Supavisor)
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE = "<session pooler :5432>"; npx wrangler dev

# Integración real del onboarding (escribe y limpia filas de prueba; requiere DATABASE_URL)
$env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts
```

## Reglas del repo

- **Sin DDL ni migraciones desde este repo**: el esquema de la base compartida pertenece al repo `luka/`.
- `luka_session` es la sesión durable del dashboard; la sesión Supabase es transitoria del registro.
- HTMX y los 3 parciales se mantienen (paridad 1:1 con el frontend actual).
- No commitear ni pushear sin pedido explícito del usuario.
- **Nunca versionar documentación con nombres de competidores** (benchmarks, comparativas, capturas):
  el análisis competitivo vive en `.superpowers/sdd/` (gitignored) y el repo solo recibe el resultado
  sin referencias.
- No tocar `prerenderEnvironment: 'node'` (el build con Hyperdrive falla sin él) ni el `name`
  `luka-frontend` de `wrangler.jsonc` (Workers Builds lo pisa con `WRANGLER_CI_OVERRIDE_NAME`).
