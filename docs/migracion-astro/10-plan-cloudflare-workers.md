# 10 · Plan: migración completa a Astro + Cloudflare Workers (fork)

| Campo | Valor |
|---|---|
| **Repositorio** | Fork de `luka_frontend` (todas las ramas forkeadas) |
| **Rama de trabajo** | `migration` (ya existe en el fork; **no** crear rama nueva) |
| **Branch de producción** | `main` (merge ff-only por hito; Workers Builds apunta acá) |
| **Estado** | **Ejecutada hasta M3 (tareas 0–8)**; pendientes T9 (cutover Supabase/`luka` + validación real) y T10 (docs + M4). Ver §Estado de ejecución |
| **Fecha** | 2026-09-24 (plan) · ejecución 2026-09-25 |
| **Histórico** | `00-plan-limpieza-preparacion.md`, `01-inventario-paridad.md`, `02-estado-y-siguientes-pasos.md` (fases F0-F4 cerradas) |

> **Para el agente que ejecuta:** usar `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar tarea por tarea. Seguir los checkboxes en orden; cada
> tarea termina con verificación y commit. Los hitos **M0–M4** se mergean a `main` con
> `git merge --ff-only` (ver §Estrategia de ramas y deploys). Este documento es autosuficiente: no
> depende de la conversación que lo originó. Para retomar, leer primero
> `02-estado-y-siguientes-pasos.md`.

## Estado de ejecución (2026-09-25)

Producción viva: Worker **`luka-frontend`** → `https://luka-frontend.marianoinsaurralde5.workers.dev`
(deployado por **Workers Builds desde `main`**; bundle 1621 KiB crudo / 383.7 KiB gzip).

| Tarea | Estado | Evidencia |
|---|---|---|
| T0–T4 (M0, M1) | ✅ | `842cc52`, `64c9eaf`, `e1b1586`, `cb137f9` |
| T5–T7 (M2) | ✅ | `b5e3052`+`2467e7e`, `adcb635`, `8560d21` |
| T8 (M3) | ✅ | `b9396b5` (binding), `85bdf42` (prerender node), `558cadc`; login real en prod OK |
| T9 / T10 | ⏳ | ver `02-estado-y-siguientes-pasos.md` §6 y §7 |

Artefactos de producción: Hyperdrive id `56a6dbc0d07640a5b8fe6d16bcb7c975`; secrets cargados (solo
nombres) `SECRET_KEY`, `SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LUKA_BACKEND_URL`,
`FLOW_ADMIN_API_KEY`, `FLOW_ADMIN_AUTH_USER_IDS`. Workers Builds: root `/`, build
`npm ci && npm run build`, deploy `npx wrangler deploy`, branch `main`, build vars `APP_BASE_URL` y
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`. El `name` del config debe seguir siendo `luka-frontend` (Workers
Builds lo pisa con `WRANGLER_CI_OVERRIDE_NAME`). El Worker duplicado `luka-frontend-astro` se
eliminó; su check fallido fue one-off.

## Objetivo

En el fork, eliminar FastAPI por completo, dejar el proyecto Astro en la **raíz del repo**,
desplegar el SSR en **Cloudflare Workers** con assets estáticos, y re-apuntar el backend `luka` +
Supabase al nuevo dominio. El repo original (FastAPI en Render) queda intacto como rollback.

## Arquitectura objetivo

```text
navegador / bot WhatsApp
        │  https://luka-frontend.<cuenta>.workers.dev
        ▼
Cloudflare Workers (workerd)
  ├─ assets estáticos (landing prerender, /_astro, favicons, robots, sitemap)
  └─ Astro 7 SSR (@astrojs/cloudflare v14)
        ├─ Hyperdrive ──▶ Supabase Postgres (pooling + cache de statements)
        ├─ @supabase/ssr ──▶ Supabase Auth (Google OAuth PKCE, solo registro)
        └─ FLOW_ADMIN_API_KEY ──▶ backend `luka` (panel admin, server-side)
```

- Sesión durable: cookie propia `luka_session` (HMAC), sin cambios.
- HTMX 2.0.3 y Chart.js 4.4.6 se mantienen por CDN.
- Sin Render, sin facade, sin código Python.

## Estrategia de ramas y deploys

`main` es la branch desplegable (producción de Workers Builds); `migration` es la branch de
trabajo. Los merges son **fast-forward** y se hacen solo en hitos, nunca con la suite en rojo:

```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```

| Hito | Contenido | Tareas |
|---|---|---|
| **M0** | F0–F4 ya commiteados en `migration` (28 commits) | 1 |
| **M1** | Repo Astro-only en la raíz (assets propios, Python retirado, `web/` movido) | 2, 3, 4 |
| **M2** | Adapter Cloudflare + Hyperdrive verdes en workerd local | 5, 6, 7 |
| **M3** | Primer deploy real validado + Workers Builds conectado a `main` | 8 |
| **M4** | Documentación y cierre | 10 |

La Tarea 9 (cutover de Supabase y `luka`) se valida entre M3 y M4: no toca código.

- Workers Builds se conecta **después** del merge de M3: conectarlo antes dispararía un deploy de
  un `main` sin Hyperdrive ni secrets, pisando el deploy manual ya validado.
- Rollback: `npx wrangler rollback` (versiones del Worker) + repo original intacto. Sin tags de
  git.

## Restricciones globales

- Astro se mantiene en `7.3.4`; `@astrojs/cloudflare` v14 exige peer `astro ^7.2.0` y
  `wrangler ^4.125.0`.
- Sin DDL ni migraciones desde el proyecto Astro: el esquema pertenece al repo `luka/`.
- `SECRET_KEY`, `DATABASE_URL`/Hyperdrive y `FLOW_ADMIN_API_KEY`: solo server-side, nunca `PUBLIC_`.
- No commitear: `.dev.vars`, `.env`, `.wrangler/`, `dist/`, `node_modules/`.
- Entorno local: Windows + PowerShell.
- El repo original no se modifica (salvo lo ya hecho: logos commiteados en `migration`).
- Merge a `main` solo en hitos, con `--ff-only` y con la suite verde.

## Hallazgo de plataforma (leer primero)

`@astrojs/cloudflare` **eliminó Cloudflare Pages en su v13** (Astro 6+). Con Astro 7 el único
destino oficial es **Workers con static assets** (mismo dashboard, Git integration, previews,
dominios y free tier). Gates del free tier a medir en la Tarea 8: CPU 10 ms/invocación y bundle
3 MiB comprimido; si no alcanza → Workers Paid (USD 5/mes). La alternativa descartada es bajar
Astro a la v5 + adapter v12 para Pages (re-validar F1-F4).

## Estructura objetivo

Rutas **finales**: la Tarea 4 mueve `web/*` a la raíz; hasta entonces los mismos archivos viven
bajo `web/`. `public/` (4 PNG) ya está en la raíz: no se mueve ni se copia.

| Acción | Archivos |
|---|---|
| Crear | `wrangler.jsonc`, `src/lib/runtime.ts`, `src/test-stubs/cloudflare-workers.ts`, `src/components/icons/*.svg` (23), `src/styles/{style,admin_flows,tokens}.css`, `.dev.vars.example`, `src/styles/tokens.test.ts` |
| Modificar | `astro.config.mjs`, `package.json`, `src/components/Icon.astro`, `src/pages/{app.astro,login.astro,index.astro,registro.astro,registro/continuar.astro}`, `src/layouts/AdminLayout.astro`, `src/styles/global.css`, `src/lib/{db.ts,registro.ts}`, `vitest.setup.ts`, `vitest.config.ts`, `.gitignore`, `.github/workflows/ci.yml`, `README.md`, `AGENTS.md` |
| Borrar | `app/`, `static/`, `tests/`, `scripts/`, `requirements.txt`, `requirements-dev.txt`, `render.yaml`, `.env.example` (raíz), `web/` (carpeta, tras el move); `web/.env` local se renombra a `.dev.vars` en la raíz (Tarea 5) |

---

## Tarea 0 — Prerrequisito ya cumplido (repo original)

En el repo original se commiteó y pusheó `3cc09d0 chore(brand): actualizar logos y favicons a PNG`
(assets PNG nuevos, glows a `rgba(10,93,251)`, páginas de `web/` actualizadas, lista de assets del
facade actualizada). El fork debe hacerse **después** de ese push para traerlo.

- [x] Commit y push en `origin/migration` (hecho: `3cc09d0`).

**Criterio de salida:** el fork incluye `3cc09d0` en su rama `migration`.

---

## Tarea 1 — Fork, rama `migration`, baseline y **M0**

**Files:** ninguno (solo git).

- [ ] **Paso 1: Verificar el fork y la rama**
```powershell
git remote -v
git branch -a
git log --oneline -1
```
Esperado: `origin` apunta al fork; existe `migration`; el último commit es `3cc09d0`.

- [ ] **Paso 2: Trabajar en `migration` (sin rama nueva)**
```powershell
git checkout migration
git pull origin migration
```

- [ ] **Paso 3: Baseline verde antes de tocar nada**
```powershell
cd web
npm ci
npm run check
npm test
npm run build
```
Esperado: 0 errores de `astro check`; ~215 tests passed + 21 skipped; build OK.
(El suite Python todavía existe pero se elimina en la Tarea 3; no hace falta correrlo.)

- [ ] **Paso 4: M0 — primer merge a `main`**
```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```
Esperado: `main` avanza a `3cc09d0` sin merge commit.

**Criterio de salida:** `migration` con baseline verde y árbol limpio; `main` con F0–F4 pusheado y
CI verde.

---

## Tarea 2 — Assets autocontenidos en `web/`

**Files:** iconos, CSS y tokens (ver tabla de estructura).

**Nota (`public/`):** los 4 PNG ya viven en la raíz y `web/astro.config.mjs` ya los sirve con
`publicDir: '../public'`. No se copia nada ni se toca esa línea; la Tarea 4 la elimina al mover
(queda el default `public/` de la raíz).

- [ ] **Paso 1: Copiar iconos y reescribir `Icon.astro`**
```powershell
New-Item -ItemType Directory -Force web\src\components\icons | Out-Null
Copy-Item app\templates\components\icons\*.svg web\src\components\icons\
```
En `web/src/components/Icon.astro`, cambiar los 23 imports
`'../../../app/templates/components/icons/X.svg?raw'` → `'./icons/X.svg?raw'` (mismos nombres).

- [ ] **Paso 2: Copiar CSS, tokens y actualizar imports**
```powershell
Copy-Item static\css\style.css web\src\styles\style.css
Copy-Item static\css\admin_flows.css web\src\styles\admin_flows.css
Copy-Item docs\marca\tokens\tokens.css web\src\styles\tokens.css
```
Actualizar imports:
- `web/src/pages/app.astro` y `web/src/pages/login.astro`: `import '../styles/style.css';`
- `web/src/layouts/AdminLayout.astro`: `import '../styles/style.css';` +
  `import '../styles/admin_flows.css';` (ese orden)
- `web/src/styles/global.css`: `@import "./tokens.css";`
- `web/src/lib/registro.ts`: importar `'../styles/tokens.css?raw'`.

- [ ] **Paso 3: Test de drift de tokens** — crear `web/src/styles/tokens.test.ts` que lea
`web/src/styles/tokens.css` y `../../../docs/marca/tokens/tokens.css` y compare (con
`it.skipIf` si el archivo de `docs/` no existe, para permitir builds aislados).

- [ ] **Paso 4: Verificación y commit**
```powershell
cd web; npm run check; npm test; npm run build; cd ..
git add -A
git commit -m "refactor(web): assets propios (iconos, CSS y tokens)"
```

Esperado: verde; el build ya no depende de `app/` ni `static/` (solo de `docs/` para el test de
drift y de `../public` para assets, ambos invariantes al move).

---

## Tarea 3 — Retiro completo de Python y configs legacy

**Files:** borrados + CI + gitignore.

- [ ] **Paso 1: Borrar el legacy**
```powershell
git rm -r app static tests scripts
git rm requirements.txt requirements-dev.txt render.yaml .env.example
Remove-Item luka.db -ErrorAction SilentlyContinue
```

- [ ] **Paso 2: CI solo Node** — en `.github/workflows/ci.yml` borrar el job `test` (Python) y
sus steps; queda solo el job `web` (check + test + build) con `working-directory: web` (pasa a la
raíz en la Tarea 4).

- [ ] **Paso 3: gitignore** — en `.gitignore` raíz quitar reglas Python que ya no aplican
(`.venv/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`); en `web/.gitignore` agregar
`.wrangler/` y `.dev.vars`.

- [ ] **Paso 4: Verificación y commit**
```powershell
cd web; npm run check; npm test; npm run build; cd ..
git add -A
git commit -m "chore: retirar FastAPI y configuracion Python del repo"
```
Esperado: build verde sin ningún archivo fuera de `web/` (salvo `docs/` y `public/`).

---

## Tarea 4 — Mover el proyecto a la raíz (**M1**)

**Files:** todo `web/*`, `.gitignore`, CI, `AGENTS.md`, `README.md`.

- [ ] **Paso 1: Mover con `git mv` (detecta renombres)**
```powershell
git rm README.md
git mv web/src src
git mv web/astro.config.mjs astro.config.mjs
git mv web/package.json package.json
git mv web/package-lock.json package-lock.json
git mv web/tsconfig.json tsconfig.json
git mv web/vitest.config.ts vitest.config.ts
git mv web/vitest.setup.ts vitest.setup.ts
git mv web/.env.example .env.example
git mv web/README.md README.md
git rm web/.gitignore
# si existe web/.env local (no commiteado): moverlo a .env en la raíz
# (la Tarea 5 lo renombra a .dev.vars) o borrarlo ANTES del Remove-Item
Remove-Item web -Recurse -Force
```

- [ ] **Paso 2: `.gitignore` raíz consolidado**
```gitignore
node_modules/
dist/
.astro/
.env
.env.production
npm-debug.log*
.wrangler/
.dev.vars
.DS_Store
.vscode/
.agents/
.playwright-mcp/
```

- [ ] **Paso 3: Corregir rutas**
- `astro.config.mjs`: eliminar `publicDir: '../public',` (el default `public/` de la raíz es el
  correcto).
- `vitest.setup.ts`: `new URL('../.env', ...)` → `new URL('.env', ...)`.
- `src/styles/tokens.test.ts` (de la Tarea 2): ruta a docs → `../../docs/marca/tokens/tokens.css`.
- `.github/workflows/ci.yml`: quitar los 4 `working-directory: web` y
  `cache-dependency-path: web/package-lock.json` (quedan los defaults de la raíz).
- `AGENTS.md` y `README.md`: comandos sin `cd web`.

- [ ] **Paso 4: Reinstalar y verificar en la raíz**
```powershell
npm ci
npm run check
npm test
npm run build
```

- [ ] **Paso 5: Commit**
```powershell
git add -A
git commit -m "refactor: mover el proyecto Astro a la raiz del repo"
```

- [ ] **Paso 6: M1 — merge a `main`**
```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```

**Criterio de salida:** raíz con `src/`, `public/`, `docs/`, configs de Astro y CI en la raíz; sin
carpeta `web/` ni archivos Python; suite verde en `migration` y en `main`.

---

## Tarea 5 — Adapter de Cloudflare

**Files:** `package.json`, `astro.config.mjs`, `wrangler.jsonc`, `tsconfig.json` (raíz).

- [ ] **Paso 1: Dependencias**
```powershell
npm uninstall @astrojs/node
npm install @astrojs/cloudflare
npm install -D wrangler
```

- [ ] **Paso 2: `astro.config.mjs`**
```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: process.env.APP_BASE_URL || 'http://localhost:4321',
  output: 'server',
  session: false,
  imageService: 'passthrough',
  adapter: cloudflare(),
  server: { port: 4321 },
});
```
`session: false` evita aprovisionar KV (no usamos `Astro.session`); `imageService: 'passthrough'`
evita el binding de Images (no usamos `astro:assets`).

- [ ] **Paso 3: `wrangler.jsonc`**
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "luka-frontend",
  "main": "@astrojs/cloudflare/entrypoints/server",
  "compatibility_date": "2026-09-24",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "binding": "ASSETS", "directory": "./dist" },
  "observability": { "enabled": true },
  "vars": { "APP_ENV": "production", "AUTH_COOKIE_SECURE": "true" }
}
```
El bloque `hyperdrive` se agrega en la Tarea 8. `APP_BASE_URL` es var de build, no de runtime.

- [ ] **Paso 4: Scripts y env local**
En `package.json`:
`"dev": "astro dev"`, `"build": "astro build"`, `"preview": "astro preview"`,
`"deploy": "astro build && wrangler deploy"`, `"cf-typegen": "wrangler types"`.
Renombrar `.env` → `.dev.vars` (lo lee el runtime de workerd) y crear `.dev.vars.example` con las
claves (sin valores).

- [ ] **Paso 5: Verificación y commit**
```powershell
npm run check
npm run build
npm run preview   # workerd; verificar "/" y "/login" en http://localhost:4321
git add -A
git commit -m "feat: adaptador Cloudflare y configuracion wrangler"
```
Nota: `astro dev`/`preview` ahora corren en workerd; si un prerender necesitara APIs de Node,
existe `prerenderEnvironment: 'node'` como escape.

---

## Tarea 6 — Postgres en Workers: Hyperdrive + `runtime.ts`

**Files:** `src/lib/runtime.ts` (nuevo), `src/lib/db.ts`, `src/lib/db.test.ts`,
`vitest.config.ts`, `vitest.setup.ts`, `src/test-stubs/cloudflare-workers.ts`.

- [ ] **Paso 1: Test que falla primero** (extender `db.test.ts`): con un binding `HYPERDRIVE`
simulado, `getDb()` debe construir el cliente con `connectionString` y
`{ max: 5, fetch_types: false, prepare: true }`; sin binding, seguir usando `DATABASE_URL`.
Simular el binding con `vi.mock('./runtime', ...)`.

- [ ] **Paso 2: `src/lib/runtime.ts`**
```ts
import { env as cfEnv } from 'cloudflare:workers';

// Binding de Hyperdrive (Tarea 8). En dev/tests no existe y db.ts cae a DATABASE_URL.
export function hyperdriveConnectionString(): string | undefined {
  const binding = (cfEnv as { HYPERDRIVE?: { connectionString?: string } }).HYPERDRIVE;
  return binding?.connectionString;
}
```

- [ ] **Paso 3: `db.ts`** — con Hyperdrive, cliente **nuevo por llamada** (Hyperdrive maneja el
pooling; los sockets de Workers no sobreviven entre requests). Sin Hyperdrive (dev/tests),
mantener el singleton actual con `DATABASE_URL` y `prepare: false`:
```ts
export function getDb(): Sql {
  const hyperdrive = hyperdriveConnectionString();
  if (hyperdrive) {
    return postgres(hyperdrive, { max: 5, fetch_types: false, prepare: true });
  }
  if (client) return client;
  // ...rama actual con envValue('DATABASE_URL') y { prepare: false, ssl: 'require', ...}
}
```

- [ ] **Paso 4: Alias de test** — en `vitest.config.ts`:
```ts
resolve: { alias: { 'cloudflare:workers': '/src/test-stubs/cloudflare-workers.ts' } },
```
Y el stub `src/test-stubs/cloudflare-workers.ts`:
```ts
export const env: Record<string, unknown> = {};
```

- [ ] **Paso 5: `vitest.setup.ts`** — leer `.dev.vars` de la raíz (en vez de `.env`) para copiar
`DATABASE_URL` (mismo parseo línea a línea).

- [ ] **Paso 6: Verificación y commit**
```powershell
npm run check; npm test; npm run build
git add -A
git commit -m "feat: Hyperdrive para Postgres en Workers"
```

---

## Tarea 7 — E2E local en workerd + **M2**

**Files:** ninguno (validación).

**Hallazgos de plataforma (leer antes de ejecutar):**
- `astro preview` **no carga `.dev.vars`** (cae a las `vars` del build; `/dev-login` daría 404) →
  usar `npx wrangler dev`, que sí lo carga.
- Supabase **directo es IPv6-only**; el session pooler (`aws-1-<region>.pooler.supabase.com:5432`)
  es IPv4 y es la vía válida.
- El TLS de `cloudflare:sockets` contra Supavisor está roto en workerd (workerd#2712): la DB local
  se valida **simulando el binding Hyperdrive** (binding temporal en `wrangler.jsonc` antes del
  build + `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<session pooler>`) o se
  difiere a T9 contra el Worker desplegado. El fallback singleton de `db.ts` no sirve para más de
  un request en workerd ("I/O on behalf of a different request").

- [ ] **Paso 1: Build y arranque**
```powershell
npm run build
npx wrangler dev      # :4321; sí lee .dev.vars (astro preview no)
```
`.dev.vars` debe tener `DATABASE_URL`, `SECRET_KEY`, `APP_ENV=development`,
`ENABLE_MOCK_AUTH=true`, `MOCK_AUTH_USER_ID`, `SUPABASE_URL`,
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `FLOW_ADMIN_*` y `LUKA_BACKEND_URL=http://localhost:8099`.

- [ ] **Paso 2: Mock del backend `luka`** — script Node temporal en `:8099` con `/health`,
contracts, list y mutaciones (create/validate/draft/publish/archive), validando el Bearer.

- [ ] **Paso 3: Playwright, checklist completo**
  - `/` landing (prerender) con logo/favicons nuevos; `/robots.txt` y `/sitemap.xml`.
  - `/admin/flujos` sin sesión → 303 `/login`; `/dev-login` → `/app`; dashboard con stats,
    3 charts, HTMX y `/exportar/csv`.
  - Admin: listado, alta, validar, guardar, publicar, descartar, retirar, y 503 con el mock caído.
  - `/registro?token=<sembrado>` smoke (sin click en Google).
  - `/login?token=<sembrado>` real contra Supabase (SQL de siembra/cleanup en
    `docs/migracion-astro/02` §4).
  - Con `APP_ENV=production`: `/dev-login` → 404 y cookie con `Secure`.
  - 0 errores de consola; secretos ausentes del HTML y de `dist/`.

- [ ] **Paso 4: M2 — merge a `main`**
```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```

**Criterio de salida:** checklist completo en verde y `main` con la suite verde. Los ítems que
dependen de la DB pueden validarse contra el Worker desplegado en T9 si workerd local no coopera
(ver hallazgos); documentar lo que quede diferido.

---

## Tarea 8 — Hyperdrive remoto, secrets y primer deploy (**M3**)

**Files:** `wrangler.jsonc`.

- [ ] **Paso 1: Login y creación de Hyperdrive**
```powershell
npx wrangler login
npx wrangler hyperdrive create luka-frontend-db --connection-string="postgres://postgres:<PASS>@db.<REF>.supabase.co:5432/postgres"
```
La creación valida la conexión. Si falla por IPv6, usar la **session pooler**:
`postgres://postgres.<REF>:<PASS>@aws-1-<region>.pooler.supabase.com:5432/postgres`.
Nunca la transaction pooler (6543).

- [ ] **Paso 2: Binding** — agregar a `wrangler.jsonc`:
```jsonc
"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<ID_DEVUELTO>" }]
```

**Nota de build:** con el binding Hyperdrive presente, `astro build` intenta resolver una conexión local
desde el prerender en workerd y falla. Por eso `astro.config.mjs` usa
`cloudflare({ imageService: 'passthrough', prerenderEnvironment: 'node' })` (el prerender de la
landing no necesita workerd). Sin ese cambio, el build exige
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` también en CI.

- [ ] **Paso 3: Secrets**
```powershell
npx wrangler secret put SECRET_KEY            # 32+ chars aleatorios
npx wrangler secret put SUPABASE_URL
npx wrangler secret put PUBLIC_SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put LUKA_BACKEND_URL
npx wrangler secret put FLOW_ADMIN_API_KEY
npx wrangler secret put FLOW_ADMIN_AUTH_USER_IDS
```
No cargar `ENABLE_MOCK_AUTH` ni `MOCK_AUTH_USER_ID`.

- [ ] **Paso 4: Deploy manual**
```powershell
npm run build   # con APP_BASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno
npx wrangler deploy
```
Anotar `https://luka-frontend.<cuenta>.workers.dev` y revisar el tamaño del bundle en la salida
(gate free: 3 MiB comprimido).

- [ ] **Paso 5: Smoke** — `GET /` (200), `/login` (200), `/admin/flujos` (303 a `/login`),
`/robots.txt`. Si `process.env` no estuviera poblado en el Worker, diagnosticar con
`npx wrangler tail`; contingencia: leer las vars desde `runtime.ts` con
`import { env } from 'cloudflare:workers'`.
- [ ] **Paso 5b (opcional): confirmar conexiones Hyperdrive** —
`SELECT DISTINCT usename, application_name FROM pg_stat_activity WHERE application_name = 'Cloudflare Hyperdrive';`
(las conexiones de Hyperdrive se identifican con `application_name = 'Cloudflare Hyperdrive'`).

**Nota (dev local con el binding ya presente):** a partir de este paso, `astro dev`/`astro preview`
usan la simulación local de Hyperdrive y el fallback a `DATABASE_URL` de `.dev.vars` deja de aplicar.
Para previsualizar contra Supabase, exportar antes de arrancar (no se commitean credenciales):
```powershell
$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://postgres.<REF>:<PASS>@aws-1-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```
Alternativa: `npx wrangler dev --remote` (usa la config remota de Hyperdrive y **escribe en la base
real**, usarlo con cuidado).

- [ ] **Paso 6: M3 — merge a `main`**
```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```

- [ ] **Paso 7: Workers Builds** — dashboard: Workers & Pages → Create → Workers → conectar el
fork; **root directory `/`**; build `npm ci && npm run build`; deploy `npx wrangler deploy`;
**production branch `main`**; build vars: `APP_BASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
La conexión dispara el primer build de `main`, que es el mismo commit ya validado en el Paso 5.

- [ ] **Paso 8: Validar el deploy automático** — mismo smoke del Paso 5 sobre la versión
desplegada desde `main`.

**Criterio de salida:** deploy vivo desde `main`, smoke OK en ambos deploys (manual y automático).
Rollback: `npx wrangler versions list` + `npx wrangler rollback`.

---

## Tarea 9 — Supabase + `luka` + validación end-to-end real

- [ ] **Paso 1: Supabase → Auth → URL Configuration** — agregar
`https://luka-frontend.<cuenta>.workers.dev/auth/callback`.

- [ ] **Paso 2: `luka/` (servicio backend en Render)** — setear
`ONBOARDING_REGISTRATION_URL=https://luka-frontend.<cuenta>.workers.dev/registro`
(el bot deriva `/login` del mismo host, `app/services/dashboard_link.py:68`).
Cambiar **solo** esa variable.

- [ ] **Paso 3: Validar**
  - Registro completo (Google real, manual) o smoke con invitación sembrada.
  - Magic link: pedir `/link` en WhatsApp y verificar que aterriza en el Worker y crea
    `luka_session` (o sembrar un token en `dashboard_login_link` y abrir `/login?token=`).
  - Dashboard con datos reales, CSV, y admin contra el backend `luka` real.
  - Cleanup de filas de prueba (SQL en `docs/migracion-astro/02` §4).

**Rollback:** reponer `ONBOARDING_REGISTRATION_URL` y borrar la Redirect URL nueva en Supabase.

---

## Tarea 10 — Docs finales y cierre (**M4**)

**Files:** `README.md`, `AGENTS.md`.

- [ ] **Paso 1: Docs finales** — `README.md` (stack Astro, deploy Cloudflare, variables, cómo
correr local), `AGENTS.md` (comandos solo web y sin `cd web`); actualizar
`docs/migracion-astro/00` (F5 completado) y `01 §8` (checklist cerrado).

- [ ] **Paso 2: Commit final**
```powershell
git add -A
git commit -m "docs: migracion completa a Astro + Cloudflare Workers"
```

- [ ] **Paso 3: M4 — merge a `main`**
```powershell
git checkout main
git merge --ff-only migration
git push origin main
git checkout migration
```

**Criterio de salida:** `main` desplegando desde la raíz del repo; FastAPI eliminado; `luka` y
Supabase apuntando al Worker.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Pages no soportado por adapter v13+ | Workers con static assets (decisión confirmada) |
| Free tier: 10 ms CPU / 3 MiB bundle | Medir en el primer deploy; si no alcanza → Workers Paid USD 5/mes |
| `process.env` vacío en el Worker | Compat date ≥ 2026-08-04 lo activa por defecto; contingencia `cloudflare:workers` en `runtime.ts` |
| Hyperdrive + Supabase (IPv6/pooler) | Preferir connection string directa; fallback session pooler 5432; nunca 6543 |
| Socket cacheado entre requests | Cliente postgres.js nuevo por llamada cuando hay Hyperdrive |
| `astro dev` ahora es workerd (deps CJS) | Si una dep falla, `optimizeDeps.include` en Vite (doc del adapter) |
| Sesiones del dominio viejo no migran | Re-login por magic link; sin pérdida de datos |
| `main` del fork diverge del upstream en M1 | El rollback es el **repo original** (intacto) + `wrangler rollback` del Worker; el fork no vuelve atrás |
| Auto-deploy prematuro pisa el deploy manual | Workers Builds se conecta recién después del merge M3, sobre `main` ya validado |
| Merge a `main` con la suite roja | Criterio de salida de cada tarea antes del merge; `--ff-only` detecta divergencias |
| Preview local tras agregar el binding Hyperdrive | Exportar `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` (session pooler con `sslmode=require`) o usar `wrangler dev --remote` con cuidado (ver Tarea 8) |

## Checklist de cierre (adaptado de `01-inventario-paridad.md` §8)

- [ ] Las 25 rutas responden con el mismo path/método desde el Worker.
- [ ] Magic link, OAuth PKCE, `/dev-login` (404 en prod), cookies httpOnly/lax/secure/TTL.
- [ ] Las 10 consultas devuelven los mismos valores (anulados excluidos, tasa 1300, top categoría,
      últimos 6 meses).
- [ ] `/exportar/csv` byte-equivalente, sin cargar todo en memoria.
- [ ] Sin DDL/migraciones desde el proyecto Astro.
- [ ] Secretos solo server-side; `FLOW_ADMIN_API_KEY` ausente de HTML/bundles.
- [ ] Suite web verde (hermética + gated) y E2E Playwright completo.
- [ ] `main` es la branch de producción del Worker y `git log main..migration` está vacío.
- [ ] Repo sin carpeta `web/` ni archivos Python; CI corre solo en la raíz.
