# web/ — Frontend Astro (migración)

Reemplazo en Astro del frontend actual de FastAPI + Jinja2 + HTMX. Este directorio
corresponde a las fases **F0** (scaffold), **F1** (landing), **F2** (onboarding) y **F3**
(sesión + dashboard) del plan de migración:
`docs/migracion-astro/00-plan-limpieza-preparacion.md` §7. Estado de avance y
próximos pasos: `docs/migracion-astro/02-estado-y-siguientes-pasos.md`.

Durante la migración, FastAPI (`app/`) sigue siendo el servicio de producción;
`web/` se construye y despliega por separado.

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

Ver `web/.env.example`: `APP_ENV`, `APP_BASE_URL`, `AUTH_COOKIE_SECURE`, `SECRET_KEY`,
`DATABASE_URL`, `SUPABASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- Las variables `PUBLIC_*` se exponen al navegador por diseño (la publishable key es pública).
- Los secretos server-only (`SECRET_KEY`, `DATABASE_URL`, `FLOW_ADMIN_API_KEY`) nunca deben
  usar el prefijo `PUBLIC_`.
- `SECRET_KEY` firma las cookies firmadas propias (`luka_onboarding`, `luka_pending_google`
  y `luka_session`, byte-compatible con `itsdangerous`); en producción debe tener 32+
  caracteres y no ser el placeholder de desarrollo.
- Para `/dev-login` local: `ENABLE_MOCK_AUTH=true` (solo actúa con `APP_ENV=development`) y,
  si querés datos, `MOCK_AUTH_USER_ID` apuntando a un `usuario.auth_user_id` existente.
- `FLOW_ADMIN_AUTH_USER_IDS` (CSV, case-insensitive) controla si el nav muestra el link al
  panel de flujos (`isFlowAdmin` en `src/lib/flow-admin.ts`); el panel completo llega en F4.
- `ASTRO_MIGRATED_PATHS` es del servicio FastAPI (facade), no de `web/`.
- No se commitea `.env` (ya ignorado en `web/.gitignore`).

## Entorno local (dev)

El `.env` de la raíz es el de FastAPI: Vite **no** lo lee. Para `npm run dev` hace falta un
`web/.env` propio (ignorado por git; `web/.env.example` lista las claves). El script `dev` lo
carga con `node --env-file-if-exists=.env` porque en dev las variables server-only
(`DATABASE_URL`, `SECRET_KEY`) tienen que estar en `process.env`; las `PUBLIC_*` además se
exponen por `import.meta.env`.

```bash
# web/: copiá .env.example a .env y completá los valores reales
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
- `src/middleware.ts`: exige `luka_session` en las áreas privadas y redirige 303 a `/login`
  (paridad con el 401 → `/login` de FastAPI).
- `src/styles/`: `global.css` importa los tokens canónicos desde
  `docs/marca/tokens/tokens.css` (fuente única de verdad de la marca).
- `publicDir`: apunta a `../public/` (los assets de marca viven una sola vez en el repo).

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

Los vectores de compatibilidad de `luka_session` (`src/lib/session.vectors.json`) se generan
con `itsdangerous` desde la raíz del repo y se verifican en ambos sentidos:

```bash
.venv\Scripts\python.exe tests\generate_session_vectors.py   # regenera el JSON
.venv\Scripts\python.exe -m pytest tests/test_session_vectors.py -q
```

## Deuda conocida

- Los tokens se importan por ruta relativa fuera de `web/`: funciona en este repo,
  pero el build falla si `web/` se construye de forma aislada (standalone).
- Los estilos se inlinean por defecto (comportamiento `inlineStylesheets: 'auto'` de Astro);
  el dashboard importa `static/css/style.css` por el pipeline de Vite (URL hasheada en `/_astro`).
- Las fuentes cargan desde Google Fonts en runtime.
- Hosting decidido: Render Web Service Node (adaptador standalone ya configurado). Secuencia
  decidida (2026-09-24): terminar F4 (admin) y después desplegar y cortar F1-F3; el parallel run
  de F3 ya está validado en local.
