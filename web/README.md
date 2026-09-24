# web/ — Frontend Astro (migración)

Reemplazo en Astro del frontend actual de FastAPI + Jinja2 + HTMX. Este directorio
corresponde a las fases **F0** (scaffold), **F1** (landing) y **F2** (onboarding) del plan
de migración: `docs/migracion-astro/00-plan-limpieza-preparacion.md` §7.

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
- `SECRET_KEY` firma la cookie de onboarding (`luka_onboarding`); en producción debe tener
  32+ caracteres y no ser el placeholder de desarrollo.
- No se commitea `.env` (ya ignorado en `web/.gitignore`).

## Estructura

- `src/pages/`: `index.astro` es la landing pública (prerenderizada y sin JS; el SEO
  —title, description, canonical y Open Graph— vive ahí). `robots.txt.ts` y
  `sitemap.xml.ts` son endpoints también prerenderizados.
- `src/pages/registro.astro` y `src/pages/auth/google.ts` inician el onboarding (F2):
  validan el token de la invitación, emiten la cookie firmada `luka_onboarding` y arrancan
  el OAuth PKCE de Supabase. `src/pages/auth/callback.ts` intercambia el código y fija la
  identidad pendiente; `src/pages/registro/continuar.astro` y `src/pages/registro/finalizar.ts`
  completan el registro contra la DB (transacción en `src/lib/onboarding.ts`).
- `src/styles/`: `global.css` importa los tokens canónicos desde
  `docs/marca/tokens/tokens.css` (fuente única de verdad de la marca).
- `publicDir`: apunta a `../public/` (los assets de marca viven una sola vez en el repo).

`site` (canonical/OG/sitemap) sale de `APP_BASE_URL` y cae a `http://localhost:4321`
si no está definida.

## Tests

`npm test` corre la suite hermética (Vitest, sin red ni DB). El test de integración del
onboarding (`src/lib/onboarding.integration.test.ts`) está desactivado por defecto y
escribe y limpia filas de prueba en la DB real — incluida una fila temporal en
`auth.users` por la FK de `usuario.auth_user_id`:

```bash
RUN_DB_INTEGRATION=1 npx vitest run src/lib/onboarding.integration.test.ts
```

## Deuda conocida

- Los tokens se importan por ruta relativa fuera de `web/`: funciona en este repo,
  pero el build falla si `web/` se construye de forma aislada (standalone).
- Los estilos se inlinean por defecto (comportamiento `inlineStylesheets: 'auto'` de Astro).
- Las fuentes cargan desde Google Fonts en runtime.
- Hosting decidido: Render Web Service Node (adaptador standalone ya configurado);
  queda pendiente el deploy y el cutover de paths de F2.
