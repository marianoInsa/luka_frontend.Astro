# LUKA Frontend — Astro

Frontend en Astro del agente financiero LUKA en WhatsApp: landing pública, onboarding
(registro con Google), dashboard y panel de flujos.

## Requisitos

- Node >= 22.12 (ver `engines` en `package.json`)

## Comandos

```bash
npm install        # dependencias
npm run dev        # astro dev (NO lee .dev.vars)
npm run check      # chequeo de tipos y de plantillas Astro
npm run build      # build de producción (dist/)
npm run preview    # sirve el build local (workerd, NO lee .dev.vars)
npm test           # suite hermética (Vitest)
```

Para correr en workerd con las variables de `.dev.vars`: `npx wrangler dev` (astro dev/preview no
leen ese archivo).

## Despliegue

Producción: Worker `luka-frontend` en Cloudflare (`https://luka-frontend.marianoinsaurralde5.workers.dev/`),
deployado por **Workers Builds desde `main`** (root `/`, `npm ci && npm run build`, `npx wrangler deploy`).
Deploy manual:

```bash
npm run deploy   # astro build && wrangler deploy
```

El `name` de `wrangler.jsonc` debe seguir siendo `luka-frontend` (Workers Builds lo pisa con
`WRANGLER_CI_OVERRIDE_NAME`). Rollback: `npx wrangler versions list --name luka-frontend` +
`npx wrangler rollback`.

## Variables de entorno

Ver `.env.example`: `APP_ENV`, `APP_BASE_URL`, `AUTH_COOKIE_SECURE`, `SECRET_KEY`,
`DATABASE_URL`, `SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LUKA_BACKEND_URL`,
`FLOW_ADMIN_API_KEY` y `FLOW_ADMIN_AUTH_USER_IDS`.

- En producción las variables y secretos del Worker se configuran en `wrangler.jsonc` (`vars`) y
  con `npx wrangler secret put` (secretos); `.dev.vars` es solo para local (ignorado por git).
- `APP_BASE_URL` se usa en build (`site` para canonical/OG/sitemap) **y en runtime** (armar el
  `redirect_to` del OAuth en `src/lib/supabase.ts`); en el Worker va como var de runtime.
- `DATABASE_URL` es el fallback de dev/test; en producción la DB se accede por el binding
  **Hyperdrive** (`postgres.js`, cliente nuevo por request). Supabase directo es IPv6-only: usar
  siempre el session pooler (`:5432`).
- Las variables `PUBLIC_*` se exponen al navegador por diseño (la publishable key es pública).
- Los secretos server-only (`SECRET_KEY`, `DATABASE_URL`, `FLOW_ADMIN_API_KEY`) nunca deben
  usar el prefijo `PUBLIC_`.
- `SECRET_KEY` firma las cookies firmadas propias (`luka_onboarding`, `luka_pending_google`
  y `luka_session`, byte-compatible con `itsdangerous`); en producción debe tener 32+
  caracteres y no ser el placeholder de desarrollo.
- Para `/dev-login` local: `ENABLE_MOCK_AUTH=true` (solo actúa con `APP_ENV=development`) y,
  si querés datos, `MOCK_AUTH_USER_ID` apuntando a un `usuario.auth_user_id` existente. No cargar
  esas dos en producción (`/dev-login` responde 404).
- `FLOW_ADMIN_AUTH_USER_IDS` (CSV, case-insensitive) es la allowlist del panel de flujos:
  sin ella nadie pasa el gate (403) y el nav no muestra «Flujos».
- `LUKA_BACKEND_URL` y `FLOW_ADMIN_API_KEY` apuntan al backend `luka/` que expone la API de
  flujos; la clave viaja solo server-side en el header `Authorization` y debe coincidir con la
  del servicio en Render.

## Entorno local (dev)

`.dev.vars` en la raíz (ignorado por git; `.dev.vars.example` lista las claves) con
`APP_ENV=development`, `APP_BASE_URL=http://localhost:4321`, `AUTH_COOKIE_SECURE=false`,
`ENABLE_MOCK_AUTH=true`, `MOCK_AUTH_USER_ID`, `SECRET_KEY`, `SUPABASE_URL`,
`PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` (session pooler, `:5432`), `LUKA_BACKEND_URL`,
`FLOW_ADMIN_API_KEY` y `FLOW_ADMIN_AUTH_USER_IDS`.

```powershell
npx wrangler dev   # http://localhost:4321; carga .dev.vars
```

- `astro dev`/`astro preview` **no** leen `.dev.vars` (usan las vars del build): para E2E local
  con env real usar `wrangler dev`.
- DB local desde workerd: el TLS de `cloudflare:sockets` contra Supavisor está roto
  (workerd#2712). Simular Hyperdrive:
  `$env:CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="<POOLER_URL>"; npx wrangler dev`
  (miniflare conecta desde Node). Sin eso, el fallback `DATABASE_URL` solo sirve para el primer
  request.
- `/dev-login` firma una sesión con `MOCK_AUTH_USER_ID`; para ver el dashboard, ese id debe
  existir como `usuario.auth_user_id` (si no, `/app` redirige a `/login`).
- No quitar `prerenderEnvironment: 'node'` de `astro.config.mjs`: con el binding Hyperdrive, el
  prerender en workerd falla en el build.

## Estructura

- `src/pages/`: `index.astro` es la landing pública (prerenderizada y sin JS; el SEO
  —title, description, canonical y Open Graph— vive ahí). `robots.txt.ts` y
  `sitemap.xml.ts` son endpoints también prerenderizados.
- `src/pages/registro.astro` y `src/pages/auth/google.ts` inician el onboarding (F2):
  validan el token de la invitación, emiten la cookie firmada `luka_onboarding` y arrancan
  el OAuth PKCE de Supabase. `src/pages/auth/callback.ts` intercambia el código y fija la
  identidad pendiente; `src/pages/registro/continuar.astro` y `src/pages/registro/finalizar.ts`
  completan el registro contra la DB (transacción en `src/lib/onboarding.ts`).
- `src/pages/login.astro`, `logout.ts` y `dev-login.ts` (F3): magic link del bot con consumo
  atómico (`src/lib/login.ts`), sesión `luka_session` byte-compatible con itsdangerous
  (`src/lib/session.ts`) y el atajo local de desarrollo.
- `src/pages/app.astro` (F3): dashboard SSR con Chart.js + HTMX; `src/pages/dashboard/actualizar.astro`
  y `src/pages/partials/{charts,transactions}.astro` son los 3 parciales con el mismo contrato.
  `src/pages/api/graficos/*` y `src/pages/exportar/csv.ts` exponen gráficos y CSV (keyset
  pagination en `src/lib/csv.ts`). Las consultas viven en `src/lib/dashboard.ts`.
- `src/pages/admin/flujos*.astro` y `src/pages/admin/flujos/api/*` (F4): panel admin con las 3
  páginas (listado, editor nuevo y editor existente) y los 6 proxies JSON hacia el backend
  `luka` (`src/lib/flow-admin.ts`). El editor vive en `src/scripts/admin-flows.ts` (port de
  `static/js/admin_flows.js`) y el shell en `src/layouts/AdminLayout.astro` +
  `src/components/Admin{FlowsList,FlowEditor}.astro`; el gate 403 por allowlist y el secreto
  server-side se validan en sus tests.
- `src/components/Sidebar.astro`: chrome compartido del área privada (dashboard + admin).
- `src/middleware.ts`: exige `luka_session` en las áreas privadas (`/app`, `/dashboard`,
  `/partials`, `/api/graficos`, `/exportar`, `/admin`) y redirige 303 a `/login`.
- `src/styles/`: `global.css` importa los tokens canónicos desde
  `docs/marca/tokens/tokens.css` (fuente única de verdad de la marca).
- `public/` (raíz): assets de marca (favicons y logos); es el `publicDir` por defecto de
  Astro.

`site` (canonical/OG/sitemap) sale de `APP_BASE_URL` y cae a `http://localhost:4321`
si no está definida.

## Tests

`npm test` corre la suite hermética (Vitest, sin red ni DB). Los tests de integración están
desactivados por defecto y escriben y limpian filas de prueba en la DB real (incluida una fila
temporal en `auth.users` por la FK de `usuario.auth_user_id`). `vitest.setup.ts` solo copia
`DATABASE_URL` de `.dev.vars` (raíz):

```bash
RUN_DB_INTEGRATION=1 npx vitest run src/lib/onboarding.integration.test.ts
RUN_DB_INTEGRATION=1 npx vitest run src/lib/dashboard.integration.test.ts src/lib/login.integration.test.ts
```

La integración del panel admin (`src/lib/flow-admin.integration.test.ts`) es **read-only** (nunca
crea ni publica flujos) y se activa con `RUN_FLOW_BACKEND=1` más `LUKA_BACKEND_URL` y
`FLOW_ADMIN_API_KEY` en el entorno:

```powershell
$env:RUN_FLOW_BACKEND='1'; npx vitest run src/lib/flow-admin.integration.test.ts
```

La compatibilidad de `luka_session` con `itsdangerous` (`src/lib/session.vectors.json`) se
verifica en `src/lib/session.test.ts`.

## Deuda conocida

- Los estilos se inlinean por defecto (comportamiento `inlineStylesheets: 'auto'` de Astro);
  el dashboard importa `src/styles/style.css` y el panel admin además
  `src/styles/admin_flows.css`, ambos por el pipeline de Vite (URL hasheada en `/_astro`).
- Las fuentes cargan desde Google Fonts en runtime.
- Hosting: Cloudflare Workers mediante `@astrojs/cloudflare` y Wrangler.
