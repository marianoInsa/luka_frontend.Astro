# Spec · Rediseño Landing + Dashboard LUKA

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-25 |
| **Estado** | Aprobado (plan ejecutado en ramas `landing-page` y `dashboard`) |
| **Alcance** | `luka_frontend.Astro`: landing pública (`/`) y dashboard (`/app`, login, admin) |
| **Fuera de alcance** | Repos `luka/` (DDL, datos, colores de categorías en DB), bot de WhatsApp, analytics |
| **Hojas de ruta** | Manual de Marca F1–F5 (ya documentado en `docs/marca/00…05`) + Hoja de ruta Landing F1–F5 |

---

## 1. Diagnóstico (hoja de ruta ↔ repo)

| Roadmap | Estado real | Gap a resolver |
|---|---|---|
| Manual Marca F1–F5 | ✅ `docs/marca/00…05` v0.4.0, D1.1–D5.5 cerradas, tokens v1.0.0 | Aplicar tokens al código (lo pide `03` §9) |
| Landing F1 benchmark | ❌ | Análisis competitivo en scratch local, no versionado (política de marca: sin nombres de competidores en el repo) |
| Landing F2 SB7 | ✅ en `docs/marca/02` | Copy deck final por sección |
| Landing F3 wireframe | ❌ | Stitch + 6 secciones |
| Landing F4 copy | Parcial | Strings finales H1/CTA/FAQ |
| Landing F5 validación | ❌ | Checklist CLEAR + guion test 5s + guard de estructura |
| Dashboard | ❌ `style.css` legacy (indigo `#6366f1`, rojo `#f87171` en egresos), no importa `tokens.css`, sin skeletons, a11y con gaps | Retheme + skeletons + a11y + jerarquía (Hick) |

## 2. Decisiones

- **D-1**: CTA WhatsApp = `https://wa.me/15556378961?text=Hola%20Luka%21` (constante inline en `index.astro`, sin archivo nuevo).
- **D-2**: **Sin prueba social inventada** (ni testimonios ni métricas). La landing usa verdad de producto. Se omiten las secciones 2 y 6 de la hoja de ruta (autoridad con métricas y testimonios).
- **D-3**: Tema oscuro únicamente. `[data-theme="light"]` ya existe en tokens; se activa cuando se pida.
- **D-4**: Sin analytics (no hay proveedor en el repo).
- **D-5**: Dos ramas desde `main` (`landing-page`, `dashboard`) + PR separado por rama. Commits sin trailer de co-autor. Merge solo con aprobación del usuario.
- **D-6**: Stitch como fuente de diseño: proyecto `projects/447579364756216071` ("LUKA — Producto 2026"), design system `assets/17545251351142893120` ("LUKA Brand System", dark, `#2563EB`, Space Grotesk/Inter).
- **D-7**: Restricciones de paridad intactas: HTMX y los 3 parciales, sin DDL, sin tocar `wrangler.jsonc` ni `prerenderEnvironment: 'node'`, sin dependencias nuevas.
- **D-8**: Dirección estética v2 **friendly colorida**: paleta categórica completa (`--cat-*`) en íconos, tiles, chips, gráficos y glows de fondo; el texto siempre en `--text-*` (AA); rojo solo error.
- **D-9**: Movimiento discreto + scroll reveal progresivo (`IntersectionObserver`), todo bajo `prefers-reduced-motion`; sin parallax ni scrollytelling pesado.
- **D-10**: Landing de 8 bloques: nav sticky · hero con producto · marquee categórico · bento · conflicto · tour con tabs CSS · plan 3 pasos · FAQ + cierre.
- **D-11**: Dashboard con **retoque conservador**: sin cambio de layout; tokens + paleta categórica + skeletons + micro-interacciones + a11y.
- **D-12**: Ninguna documentación versionada nombra competidores; el análisis competitivo vive en `.superpowers/sdd/` (gitignored).

## 3. Landing (`/`)

Arquitectura narrativa (secuencia Duarte: entender → evaluar → confiar → decidir):

| # | Sección | Contenido |
|---|---|---|
| 1 | Nav sticky | Logo, anclas (Cómo funciona / Beneficios / FAQ) y CTA WhatsApp persistente |
| 2 | Hero | H1 + sub + CTA dual + microcopy; mini-dashboard flotante + teléfono con chat; aurora multicapa |
| 3 | Marquee | Chips de las 9 categorías con su color; copia duplicada `aria-hidden`; pausa en hover/focus |
| 4 | Bento beneficios | Grid asimétrico con tiles tintados por categoría (`color-mix()` al 10 %) + mini-viz |
| 5 | Conflicto | HOY en grafito vs CON LUKA con acentos de color (el color como recompensa narrativa) |
| 6 | Tour de producto | Tabs CSS sin JS (Gastos / Límites / Balances) con UI construida en HTML |
| 7 | Plan de 3 pasos (`id="como-funciona"`) | Timeline con icono categórico por paso |
| 8 | FAQ + Cierre | 5 objeciones con `details/summary` nativo + banda final con gradiente de marca y CTA |
| — | Footer | Logo + © + link de contacto WhatsApp |

- **Paleta (D-8)**: aurora por sección con `color-mix()` de categóricas al 8–14 %, tiles y chips tintados, data-viz con la paleta categórica completa; texto AA en `--text-*`; rojo solo error.
- **Movimiento (D-9)**: aurora lenta, marquee pausable, reveal on scroll, count-up de KPIs, hover lift y focus glow; todo anulado en `prefers-reduced-motion`.
- **CTAs duales**: directo (WhatsApp) y transicional (ancla).
- **A11y**: `alt` en imágenes, `aria-labelledby` por sección, `focus-visible`, FAQ nativo, marquee duplicado `aria-hidden`, sin JS ⇒ contenido visible (revelado progresivo, nunca oculto por defecto).
- **Sin afirmaciones no verificadas**: nada de "gratis", precios, cifrado ni borrado de datos que no estén en el producto; copy 100 % original.
- **SEO**: `title`/`description`/OG actualizados al nuevo H1; canonical sin cambios.

## 4. Dashboard

- **Tokens**: `style.css` importa `tokens.css` y re-mapea sus variables legacy → marca (indigo→`--action`, textos→`--text-*`, rojo de egresos→`--money-out`, sombra glow→`--shadow-glow`). `admin_flows.css` y colores hardcodeados de componentes/gráficos → tokens.
- **Regla de oro**: egreso grafito (`--money-out`), ingreso esmeralda (`--money-in`), rojo solo error/exceso. Barras de presupuesto: `--action` normal, `--warning` ≥80 %, `--danger` excedido, siempre con % y monto textuales.
- **Skeletons** (nunca espacios en blanco):
  - KPIs: skeleton dentro de `#stats-section` + `hx-indicator`, visible mientras HTMX actualiza (CSS puro).
  - Gráficos: silueta por card hasta que Chart.js termina de dibujar.
  - Transacciones: filas shimmer mientras el fetch de `/partials/transactions` responde.
  - `prefers-reduced-motion`: sin shimmer animado.
- **A11y**: `aria-hidden="true"` en iconos decorativos, label en logout mobile, `aria-label` + fallback textual en canvases, filas ≥44 px, estado nunca solo por color.
- **Tipografía**: Space Grotesk en títulos de página (display); Inter en UI.
- **Retoque conservador, sin cambio de layout (D-11)**: paleta categórica en charts/chips/dots, micro-interacciones (hover lift, focus glow, sidebar activo con glow) y skeleton shimmer tintado.

## 5. Stitch (pantallas)

Proyecto: `projects/447579364756216071` · Design system: `assets/17545251351142893120` · https://stitch.withgoogle.com/projects/447579364756216071

**v1 (exploración):** hero+plan, conflicto+beneficios y FAQ+cierre/landing; dashboard con timeout de transporte del MCP.

**v2 (aprobada, friendly colorida):** 6 pantallas — hero+nav+marquee · bento · conflicto+tour · plan+faq+cierre · dashboard · dashboard skeletons. Los ids se registran acá al aprobarse el gate de diseño.

## 6. Verificación

- `npm run check`, `npm test` (218+21 + tests nuevos), `npm run build`.
- Tests guard: estructura de landing (CTA WhatsApp, secciones, `alt`) y anti-hex legacy en CSS.
- Local: `npx wrangler dev` (landing prerender + dashboard con Hyperdrive simulado); Playwright para screenshots y contraste.
- Paridad: contratos HTMX y parciales intactos; sin DDL.

## 7. Riesgos

- Los colores de categoría que llegan de la DB (`lib/dashboard.ts`) pueden ser legacy; se normalizan en el cliente contra los tokens cuando el nombre matchea una categoría canónica.
- El re-mapeo de `style.css` afecta también a `/login` y `/admin`: verificación visual de las tres vistas.
- Stitch puede desviarse de la marca en detalles; los tokens de `docs/marca/tokens/` son la fuente de verdad final para el código.
