# web/ — Frontend Astro (migración)

Reemplazo en Astro del frontend actual de FastAPI + Jinja2 + HTMX. Este directorio
corresponde a las fases **F0** (scaffold) y **F1** (landing) del plan de migración:
`docs/migracion-astro/00-plan-limpieza-preparacion.md` §7.

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

Ver `web/.env.example`: `APP_ENV`, `APP_BASE_URL`, `AUTH_COOKIE_SECURE`,
`SUPABASE_URL` y `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

- Las variables `PUBLIC_*` se exponen al navegador por diseño (la publishable key es pública).
- Los secretos server-only (`SECRET_KEY`, `DATABASE_URL`, `FLOW_ADMIN_API_KEY`) no son
  parte de esta fase y nunca deben usar el prefijo `PUBLIC_`.
- No se commitea `.env` (ya ignorado en `web/.gitignore`).

## Estructura

- `src/pages/`: `index.astro` es la landing pública (prerenderizada y sin JS; el SEO
  —title, description, canonical y Open Graph— vive ahí). `robots.txt.ts` y
  `sitemap.xml.ts` son endpoints también prerenderizados.
- `src/styles/`: `global.css` importa los tokens canónicos desde
  `docs/marca/tokens/tokens.css` (fuente única de verdad de la marca).
- `publicDir`: apunta a `../public/` (los assets de marca viven una sola vez en el repo).

`site` (canonical/OG/sitemap) sale de `APP_BASE_URL` y cae a `http://localhost:4321`
si no está definida.

## Deuda conocida

- Los tokens se importan por ruta relativa fuera de `web/`: funciona en este repo,
  pero el build falla si `web/` se construye de forma aislada (standalone).
- Los estilos se inlinean por defecto (comportamiento `inlineStylesheets: 'auto'` de Astro).
- Las fuentes cargan desde Google Fonts en runtime.
- La decisión de hosting queda pendiente hasta el final de F1
  (ver §9 del plan).
