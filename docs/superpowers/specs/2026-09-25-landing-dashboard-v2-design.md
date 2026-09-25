# Spec · Landing + Dashboard LUKA v2 «Bodegón»

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-25 |
| **Estado** | Diseño aprobado en sesión; pendiente de review del spec antes del plan |
| **Alcance** | `luka_frontend.Astro`: landing pública (`/`) y dashboard (`/app`, login, admin) |
| **Fuera de alcance** | Repos `luka/` (DDL, datos, colores de categorías en DB), bot de WhatsApp, analytics, tema claro |
| **Identidad** | `docs/marca/00…05` v0.5.0 + tokens v2.0.0 (commit `3f228a8`) e isotipo recoloreado (commit `0c83eed`) |
| **Stitch** | Proyecto `projects/447579364756216071` · DS `assets/1946592025752870069` («LUKA — Bodegón») |

---

## 1. Contexto

La identidad v1 (navy + azul + esmeralda) se descartó por genérica. La v2 «Bodegón» (berenjena `#1B1420`, coral `#F0704C`, durazno `#F2A48C`, oliva `#8FBF6F`, gris cálido para egreso, rojo solo error; Gabarito display + Inter UI) ya está documentada, tokenizada y verificada AA, con isotipo e íconos recoloreados.

Queda **aplicarla al código**: la landing actual es un hero mínimo sin narrativa ni CTA a WhatsApp, y el dashboard conserva el CSS legacy (índigo `#6366f1`, rojo `#f87171` en egresos) sin skeletons ni cierre de a11y.

## 2. Decisiones

- **D-1**: CTA WhatsApp con placeholder `https://wa.me/15556378961?text=Hola%20Luka%21` como constante inline en `index.astro`; se reemplaza cuando exista el número real.
- **D-2**: **Sin prueba social inventada**: nada de testimonios, métricas ni precios. La landing usa verdad de producto.
- **D-3**: Tema oscuro único (D3.7 del manual); no se mantiene variante clara sin contraste verificado.
- **D-4**: Sin analytics (no hay proveedor en el repo). Sin dependencias nuevas; sin Tailwind.
- **D-5**: Dos ramas desde `main` (`landing-page`, `dashboard`), commits chicos por entrega, **sin trailer de co-autor**, sin push sin aprobación.
- **D-6**: Stitch como fuente de diseño de las pantallas; los tokens de `docs/marca/tokens/` son la fuente de verdad final.
- **D-7**: Paridad intacta: HTMX y los 3 parciales 1:1; sin DDL; sin tocar `wrangler.jsonc`, `prerenderEnvironment: 'node'` ni el `name` del Worker.
- **D-8**: Regla de color: egreso gris cálido, ingreso oliva, rojo solo error/exceso; el color nunca es la única señal.
- **D-9**: Movimiento discreto y anulado bajo `prefers-reduced-motion`; sin parallax ni scrollytelling.

## 3. Landing (`/`)

Reescritura de `src/pages/index.astro` (prerender, CSS inline, JS mínimo). Secuencia Duarte: entender → evaluar → confiar → decidir.

| # | Bloque | Contenido |
|---|---|---|
| 1 | Nav sticky | Logo + anclas (Cómo funciona / Beneficios / Dudas) + CTA WhatsApp persistente |
| 2 | Hero | H1 «Hacete cargo de tu plata sin planillas ni culpa» + sub + CTA dual (WhatsApp coral + «Ver cómo funciona» ghost) + microcopy; mini-dashboard flotante (KPI, anillo categórico, barras) + teléfono con chat |
| 3 | Marquee | Chips de las 9 categorías con `--cat-*`; copia duplicada `aria-hidden`; pausa en hover/focus |
| 4 | Bento beneficios | Grid asimétrico con tiles tintados al 10 % (`color-mix`) y mini-viz en divs |
| 5 | Conflicto | HOY (gris cálido apagado) vs CON LUKA (acentos categóricos) |
| 6 | Tour | 3 tabs CSS sin JS (Gastos / Límites / Balances) con UI construida |
| 7 | Plan | Timeline de 3 pasos (coral → ámbar → oliva) |
| 8 | FAQ + Cierre | 5 `details/summary` + banda `--gradient-brand` con CTA final |
| — | Footer | Logo + © + link de contacto WhatsApp |

- **A11y**: `alt` en imágenes, `aria-labelledby` por sección, foco visible, contraste AA, marquee duplicado `aria-hidden`, revelado progresivo que nunca oculta contenido sin JS.
- **SEO**: `title`/`description`/OG actualizados al H1; canonical sin cambios.
- **Guard test** (`src/pages/landing.test.ts`): CTA, secciones (`como-funciona`, `beneficios`, `faq`, `cierre`), H1, `alt` y `details`.
- **Copy**: strings aprobados en la sección 2 del diseño (voseo, sin jerga, sin afirmaciones no verificadas).

## 4. Dashboard (`/app`, login, admin)

Retoque conservador, **sin cambiar layout ni contratos HTMX**:

- **Tokens**: `style.css` importa `tokens.css` y re-mapea legacy → marca; `admin_flows.css`, `Stats/Transactions/Charts/Sidebar/Icon`, `app.astro` y `AdminLayout/login` sin hex hardcodeados.
- **Skeletons**: KPIs (`#stats-loading` + `hx-indicator`), gráficos hasta que Chart.js dibuja (`data-loading` + `aria-busy`), filas shimmer en transacciones al re-fetch; sin shimmer animado con `prefers-reduced-motion`.
- **Datos**: paleta categórica en charts/chips/dots (mapa canónico con fallback), barras coral / ámbar ≥80 % / rojo excedido, siempre con % y monto textuales; egreso gris cálido, ingreso oliva.
- **A11y**: iconos decorativos `aria-hidden`, label en logout mobile, `aria-label` + fallback en canvases, filas ≥44 px, estado nunca solo por color.
- **Gabarito** en títulos de página (display), Inter en UI y datos.
- **Guard test** (`src/styles/brand-tokens.test.ts`): `style.css` importa tokens y no conserva hex legacy (`#6366f1`, `#8b5cf6`, `#080b14`, `#0f1424`, `#161d30`, `#f1f5f9`, `#f87171`); `admin_flows.css` sin `#818cf8`/`#a5b4fc`/`#5eead4`.

## 5. Stitch (pantallas)

DS «LUKA — Bodegón»: dark, coral primario, Rubik como **proxy** de Gabarito (Stitch no la ofrece; el código usa Gabarito), Inter UI, radio 8.

**Generadas y aprobables:**
- Hero + nav + marquee → `screens/1f13587f0e3541349f4e4526fc011d50`
- Bento de beneficios → `screens/4751199a113146f58df3654f58e0bd94`
- Conflicto + tour → `screens/426c589d2ff44b0d929c164d8427642c`
- Plan + FAQ + cierre → `screens/48111d9223124a35b558db2d35ac5e3e`

**Pendientes (el MCP timeoutea, quedan en el proyecto):** dashboard normal y dashboard con skeletons. Se reintentan antes de tocar `style.css`; si no salen, el dashboard se implementa directo desde tokens + spec (es retoque conservador).

## 6. Ejecución

1. **Stitch** (arriba) → review visual del usuario.
2. Rama `landing-page`: reescribir `index.astro` + `landing.test.ts` + docs de validación (`docs/landing/03-validacion.md`: checklist CLEAR y guion del test de 5 s).
3. Rama `dashboard`: tokens + skeletons + a11y + guard test.
4. Verificación por rama: `npm run check`, `npm test`, `npm run build`; revisión visual con Playwright sobre `wrangler dev` (landing + login + dashboard con `/dev-login`).
5. Cierre: PR por rama **solo si el usuario pide push**.

## 7. Riesgos

- **Colores de categoría desde la DB** (`src/lib/dashboard.ts`) pueden ser legacy: se normalizan en el cliente contra el mapa canónico y caen al color de la API si no matchean.
- **Re-mapeo de `style.css`** afecta `/login` y `/admin`: verificación visual de las tres vistas.
- **Stitch puede desviarse** en detalles: los tokens son la verdad final.
- **Endpoint `/app` sin sesión** redirige a login: para verlo local usar `/dev-login` (`ENABLE_MOCK_AUTH`).

## 8. Verificación de aceptación

- [ ] Landing con los 8 bloques, CTA WhatsApp y guard tests verdes.
- [ ] Dashboard sin hex legacy, con skeletons visibles en KPIs/gráficos/transacciones.
- [ ] `npm run check` 0 errores · `npm test` verde · `npm run build` OK.
- [ ] Contraste AA/3:1 verificado en las superficies donde se usa cada color.
- [ ] HTMX y los 3 parciales intactos (mismo contrato).
