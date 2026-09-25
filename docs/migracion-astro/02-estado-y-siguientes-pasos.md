# 02 · Estado actual y próximos pasos

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-25 (cierre) |
| **Rama** | `migration` (merge ff-only a `main` por hito; branch de producción del Worker = `main`) |
| **Fase** | **Migración cerrada (M4)**: T9 y T10 completadas y validadas en producción, incluido el panel admin |
| **Plan vigente** | `10-plan-cloudflare-workers.md` (incluye hallazgos de ejecución en T7/T8) |
| **Contrato de paridad** | `01-inventario-paridad.md` (v1.1) |

Punto de entrada para retomar la migración en otra sesión: FastAPI fue eliminado, el proyecto Astro
vive en la **raíz** del repo y corre en **Cloudflare Workers**.

---

## 1. Resumen para retomar en 30 segundos

- **T0–T8 completas y validadas; M0–M4 mergeados y pusheados.**
- **Producción viva:** `https://luka-frontend.marianoinsaurralde5.workers.dev` — Worker
  `luka-frontend`, deployado por **Workers Builds desde `main`**, con secrets y Hyperdrive
  configurados.
- **T9 validada (2026-09-25):** Redirect URL de Supabase y `ONBOARDING_REGISTRATION_URL` de Render
  apuntando al Worker; **registro Google real completo** (303/303/200/200), **magic link real del
  bot** con `luka_session`, dashboard con datos reales (idéntico al frontend anterior), **CSV**
  exportado OK y **admin validado end-to-end** (listado real vía Worker; credencial sincronizada).
- **T10 completada:** README/AGENTS finales, `00` (F5), `01 §8` (checklist cerrado), `02` y este
  estado; `.opencode/` y `opencode.json` quedan fuera de git.
- El Worker duplicado `luka-frontend-astro` fue eliminado; su check fallido en GitHub fue un
  one-off (verificado con push trivial: no reincide).

## 2. Estado por tarea (plan 10)

| Tarea | Estado | Evidencia |
|---|---|---|
| T1 baseline + **M0** | ✅ | `main` ff a `842cc52`; 0 errores check, 218 passed + 21 skipped (números actuales) |
| T2 assets propios | ✅ | `64c9eaf` |
| T3 retiro de Python | ✅ | `e1b1586` (72 paths, +2/−10448) |
| T4 mover a la raíz + **M1** | ✅ | `cb137f9` (108 renombres) |
| T5 adapter Cloudflare | ✅ | `b5e3052` + `2467e7e` (`imageService` como opción del adapter) |
| T6 Hyperdrive + `runtime.ts` | ✅ | `adcb635` |
| T7 E2E local en workerd + **M2** | ✅ | `8560d21` (hallazgos H1–H5 abajo) |
| T8 Hyperdrive remoto + secrets + deploy + **M3** | ✅ | `b9396b5`, `85bdf42`, `558cadc`; login real en prod OK |
| T9 cutover Supabase/`luka` | ✅ | registro/magic link/dashboard/CSV/admin reales (§6) |
| T10 docs + **M4** | ✅ | README/AGENTS, `00` F5, `01 §8`, §7 |

Los commits de README del usuario (`d0a412b`, `397625c`) y el hotfix de config
(`2cb2ccb`, `APP_BASE_URL` de runtime) quedaron en `main` y `migration`.

## 3. Producción (Cloudflare)

- **Worker:** `luka-frontend` → `https://luka-frontend.marianoinsaurralde5.workers.dev`
  (sin rutas custom; solo `workers.dev`).
- **Config versionada:** `wrangler.jsonc` (sin secretos): `compatibility_date 2026-09-24`,
  `nodejs_compat`, assets `ASSETS` desde `./dist`, observability, vars `APP_ENV=production`,
  `AUTH_COOKIE_SECURE=true` y `APP_BASE_URL=https://luka-frontend.marianoinsaurralde5.workers.dev`
  (runtime, además de build var para `site`), `hyperdrive` id `56a6dbc0d07640a5b8fe6d16bcb7c975`.
- **Secrets cargados (solo nombres):** `SECRET_KEY`, `SUPABASE_URL`,
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LUKA_BACKEND_URL`, `FLOW_ADMIN_API_KEY`,
  `FLOW_ADMIN_AUTH_USER_IDS`. Los valores **no están en el repo** (se cargaron desde el `.env`
  viejo de `luka_frontend-VIEJO`).
- **Workers Builds:** conectado al fork; branch `main`, root `/`, build `npm ci && npm run build`,
  deploy `npx wrangler deploy`; build vars `APP_BASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
  El `name` del Worker debe seguir siendo `luka-frontend`: Workers Builds lo pisa con
  `WRANGLER_CI_OVERRIDE_NAME`, así que si el Worker se llama distinto, el deploy va a otro lado.
- **Bundle:** ~1621 KiB crudo / **383.7 KiB gzip** (gate free: 3 MiB). CPU 10 ms se asume OK
  (no medido con tráfico real).
- **Rollback:** `npx wrangler versions list --name luka-frontend` + `npx wrangler rollback`.
  El repo original (FastAPI/Render) queda intacto como rollback de producto.

## 4. Entorno local

`.dev.vars` en la raíz (ignorado por git) con estas claves: `APP_ENV=development`,
`APP_BASE_URL=http://localhost:4321`, `AUTH_COOKIE_SECURE=false`, `ENABLE_MOCK_AUTH=true`,
`SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY`, `MOCK_AUTH_USER_ID`,
`DATABASE_URL` (session pooler, puerto 5432), `POOLER_URL` (misma cadena), `LUKA_BACKEND_URL`,
`FLOW_ADMIN_API_KEY`, `FLOW_ADMIN_AUTH_USER_IDS`.

Reglas del entorno local (hallazgos de T7/T8):

- **`astro dev`/`astro preview` no leen `.dev.vars`** (usan las vars del build). Para E2E local con
  env real: `npx wrangler dev` (`:4321`), que sí las carga.
- **DB local desde workerd:** el TLS de `cloudflare:sockets` contra Supavisor está roto
  (workerd#2712). Para local con DB, simular Hyperdrive:
  `$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="<POOLER_URL>"` + `npx wrangler dev`
  (miniflare conecta desde Node, donde TLS funciona). Sin eso, el fallback `DATABASE_URL` solo
  sirve para el primer request ("I/O on behalf of a different request").
- **Supabase directo es IPv6-only**: no sirve desde workerd (ni local ni Workers). Usar siempre el
  session pooler `aws-1-sa-east-1.pooler.supabase.com:5432`.
- **No quitar `prerenderEnvironment: 'node'`** de `astro.config.mjs`: con el binding Hyperdrive, el
  prerender en workerd intenta resolver una conexión local y el build falla (rompería CI).
- Usuario dev sembrado en la DB compartida: `00000000-0000-0000-0000-000000000001`
  (Usuario Dev, 9 categorías, 2 límites, 6 movimientos).
- Tests: `npm run check` (0 errores) y `npm test` (**218 passed + 21 skipped**). Integración gated:
  `$env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts`
  (Node conecta al pooler; no requiere workerd).

## 5. Harness de validación local (scratch, gitignored)

En `.superpowers/sdd/10-plan-cloudflare-workers/`:

- `mock-luka-backend.mjs` → backend falso en `:8099` (contrato de `src/lib/flow-admin.ts`).
- `seed-test-data.mjs seed-login|seed-invite|cleanup-login|cleanup-invite` → siembra/limpia filas
  de prueba y escribe `login-url.txt`/`registro-url.txt` (nunca imprime tokens).
- `pg-local-tls-proxy.mjs` → proxy TLS Node en `:5433` (alternativa al binding Hyperdrive
  simulado; el camino recomendado es el binding).
- `task-7-report.md` → detalle de la validación local completa.
- Si se borra `.superpowers/`, estos scripts se pierden; regenerarlos a partir del plan 10 (T7) y
  de `src/lib/flow-admin.test.ts`.

## 6. T9 — ejecutada (2026-09-25)

1. ✅ **Supabase → Auth → URL Configuration:** `https://luka-frontend.marianoinsaurralde5.workers.dev/auth/callback`
   agregada (hecho por el usuario).
2. ✅ **Render (`luka/`):** `ONBOARDING_REGISTRATION_URL=https://luka-frontend.marianoinsaurralde5.workers.dev/registro`
   (solo esa variable; hecho por el usuario). El bot deriva `/login` del mismo host.
3. ✅ **Validado:**
   - Registro Google real completo (`POST /auth/google` 303 → `/auth/callback` 303 →
     `/registro/continuar` 200 → `/registro/finalizar` 200).
   - Magic link real del bot (`/link` en WhatsApp) → `/login` 303 → `/app` 200 con `luka_session`.
   - Dashboard con datos reales idéntico al frontend anterior; `/exportar/csv` OK.
   - Hallazgo y fix: `APP_BASE_URL` faltaba como var de runtime del Worker (el build var no llega
     al runtime) → `POST /auth/google` respondía 503. Corregido en `2cb2ccb` (`wrangler.jsonc`).
4. ✅ **Admin:** sincronizada la `FLOW_ADMIN_API_KEY` con Render (Cloudflare secret + `.dev.vars`) y
   re-seteado el secret `LUKA_BACKEND_URL` del Worker a `https://luka-f2nb.onrender.com` (el `.env`
   viejo traía `http://localhost:8000`). Evidencia: integración read-only 2/2 contra
   `https://luka-f2nb.onrender.com` y `/admin/flujos` en el Worker → 200 con el listado real de
   flujos (sin alerta), con sesión válida. Nota: la primera request a Render free puede
   cold-startear >5s (usar `--testTimeout=20000`).
5. **Rollback:** reponer `ONBOARDING_REGISTRATION_URL` y borrar la Redirect URL nueva; el Worker
   se revierte con `npx wrangler rollback`.

## 7. T10 — ejecutada (2026-09-25)

- ✅ `README.md` actualizado (stack Astro, deploy Cloudflare/Workers Builds, variables build vs
  runtime, Hyperdrive, entorno local con `.dev.vars` + `wrangler dev`), `AGENTS.md` revisado,
  `00` (F5 completada) y `01 §8` (checklist cerrado con el pendiente de admin anotado).
- ✅ Review final del branch (diff de cierre: docs + `wrangler.jsonc` ya validado en producción) y
  **M4**: `git checkout main; git merge --ff-only migration; git push origin main; git checkout migration`.
- ✅ Decisión: **no se versionan** `opencode.json` ni `.opencode/` (setup local de agentes); se
  agregaron a `.gitignore`.

## 8. Cosas que no hay que romper

- **Sin DDL ni migraciones desde este repo**: el esquema pertenece al repo `luka/`.
- **`APP_BASE_URL` es var de runtime del Worker** (además de build var para `site`): de ella sale
  el `redirect_to` del OAuth (`src/lib/supabase.ts`). Si falta en runtime, `/auth/google` da 503.
- `SECRET_KEY`, `DATABASE_URL`/Hyperdrive y `FLOW_ADMIN_API_KEY`: solo server-side, nunca `PUBLIC_`.
- `luka_session` es la sesión durable; los vectores son byte-compatibles y están **congelados**
  (`src/lib/session.vectors.json`; el generador Python se eliminó junto con `tests/`).
- HTMX y los 3 parciales se mantienen (paridad 1:1).
- `prerenderEnvironment: 'node'` en el adapter (ver §4).
- El `name` del Worker debe coincidir con el del dashboard (`luka-frontend`).
- Nunca conectar a Supabase con `postgres` directo desde el Worker: siempre Hyperdrive (pooler IPv4).

## 9. Estado de git (cierre 2026-09-25)

- **M4 ejecutado**: `main` = `migration` (merge `--ff-only` + push); `git log main..migration` vacío.
- Commits de cierre: `3d8b538` (docs T10 + `.gitignore`) y el commit que documenta el cierre de la
  validación admin (topes de ambas ramas, disparan Workers Builds).
- Historial relevante: `2cb2ccb` (fix `APP_BASE_URL` runtime), `2881aaf`/`39caf05` (handoff),
  `397625c` (README/trigger), `d0a412b` (README).
