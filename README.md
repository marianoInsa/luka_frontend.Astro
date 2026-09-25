# LUKA Frontend — Astro (migración)

Frontend en Astro del bot financiero LUKA en WhatsApp: landing pública, onboarding
(registro con Google), dashboard y panel de flujos. Corresponde a las fases **F0**
(scaffold), **F1** (landing), **F2** (onboarding), **F3** (sesión + dashboard) y **F4**
(panel de flujos) del plan de migración:
`docs/migracion-astro/00-plan-limpieza-preparacion.md` §7. Estado de avance y
próximos pasos: `docs/migracion-astro/02-estado-y-siguientes-pasos.md`.

## Requisitos

- Node >= 22.12 (ver `engines` en `package.json`)

## Comandos

```bash
npm install        # dependencias
npm run dev        # servidor de desarrollo en http://localhost:4321
npm run check      # chequeo de tipos y de plantillas Astro
npm run build      # build de producción (dist/)
npm run preview    # sirve el build localmente
```

Producción (adaptador Node standalone):

```bash
node ./dist/server/entry.mjs   # respeta HOST y PORT del entorno
```

## Variables de entorno

Ver `.env.example`: `APP_ENV`, `APP_BASE_URL`, `AUTH_COOKIE_SECURE`, `SECRET_KEY`,
`DATABASE_URL`, `SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `LUKA_BACKEND_URL`,
`FLOW_ADMIN_API_KEY` y `FLOW_ADMIN_AUTH_USER_IDS`.

- Las variables `PUBLIC_*` se exponen al navegador por diseño (la publishable key es pública).
- Los secretos server-only (`SECRET_KEY`, `DATABASE_URL`, `FLOW_ADMIN_API_KEY`) nunca deben
  usar el prefijo `PUBLIC_`.
- `SECRET_KEY` firma las cookies firmadas propias (`luka_onboarding`, `luka_pending_google`
  y `luka_session`, byte-compatible con `itsdangerous`); en producción debe tener 32+
  caracteres y no ser el placeholder de desarrollo.
- Para `/dev-login` local: `ENABLE_MOCK_AUTH=true` (solo actúa con `APP_ENV=development`) y,
  si querés datos, `MOCK_AUTH_USER_ID` apuntando a un `usuario.auth_user_id` existente.
- `FLOW_ADMIN_AUTH_USER_IDS` (CSV, case-insensitive) es la allowlist del panel de flujos:
  sin ella nadie pasa el gate (403) y el nav no muestra «Flujos».
- `LUKA_BACKEND_URL` y `FLOW_ADMIN_API_KEY` apuntan al backend `luka/` que expone la API de
  flujos; la clave viaja solo server-side en el header `Authorization`.
- No se commitea `.env` (ya ignorado en `.gitignore`).

## Entorno local (dev)

Para `npm run dev` hace falta un `.env` en la raíz (ignorado por git; `.env.example`
lista las claves). El script `dev` lo carga con `node --env-file-if-exists=.env` porque en dev
las variables server-only (`DATABASE_URL`, `SECRET_KEY`) tienen que estar en `process.env`; las
`PUBLIC_*` además se exponen por `import.meta.env`.

```bash
# copiá .env.example a .env y completá los valores reales
npm run dev            # http://localhost:4321
```

- `/dev-login` firma una sesión con `MOCK_AUTH_USER_ID`; para ver el dashboard, ese id debe
  existir como `usuario.auth_user_id` (si no, `/app` redirige a `/login`).

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
  `/partials`, `/api/graficos`, `/exportar`, `/admin`) y redirige 303 a `/login`
  (paridad con el 401 → `/login` de FastAPI).
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
`DATABASE_URL` del `.env` de la raíz:

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
verifica en `src/lib/session.test.ts`; con Python retirado del repo ya no hay comando local
para regenerar los vectores.

## Deuda conocida

- Los estilos se inlinean por defecto (comportamiento `inlineStylesheets: 'auto'` de Astro);
  el dashboard importa `src/styles/style.css` y el panel admin además
  `src/styles/admin_flows.css`, ambos por el pipeline de Vite (URL hasheada en `/_astro`).
- Las fuentes cargan desde Google Fonts en runtime.
- Hosting: en migración a Cloudflare Workers
  (`docs/migracion-astro/10-plan-cloudflare-workers.md`); el adaptador actual es Node standalone.
