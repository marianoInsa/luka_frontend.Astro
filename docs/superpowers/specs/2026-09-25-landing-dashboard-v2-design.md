# Spec · Landing + Dashboard LUKA v2 «Bodegón»

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-25 (correcciones de review 2026-09-26) |
| **Estado** | Fase 2 (dashboard) **ejecutada y mergeada en `main`** (`9c272e0`…`eaf7833`); Fase 0 de landing **en iteración por pantalla** con las correcciones D-19…D-23; Fase 1 pendiente |
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
- **D-10**: Nav **sticky flotante con glassmorphism** (blur + fondo translúcido + borde sutil); CTA WhatsApp siempre visible.
- **D-11**: Hero **sin eyebrow** («ASISTENTE FINANCIERO POR WHATSAPP» se elimina) y **sin microcopy bajo los botones**. El teléfono del hero se adapta del componente «Great UI Mobile Mockup» de 21st.dev (id `23322`, MIT, React + framer-motion) **re-implementado en HTML/CSS vanilla con tokens** (sin dependencias nuevas).
- **D-12**: **Sin marquee de categorías**: no aporta valor y agrega ruido.
- **D-13**: Beneficios se rediseña como bento con jerarquía real y movimiento; prohibido el tile gigante y vacío («Categorías automáticas»).
- **D-14**: **Prohibidas las tarjetas genéricas de «pulse effect» / punto parpadeante** en toda la landing.
- **D-15**: Conflicto requiere **mayor impacto visual** (face-off HOY vs CON LUKA como escena, no dos columnas planas). El tour de producto se elimina (D-19).
- **D-16**: Plan de 3 pasos **sin menciones de precio ni costo** (el producto no es comprable aún) y con representación visual de cómo LUKA clasifica; más impacto.
- **D-17**: FAQ simple, sin adornos; Cierre aprobado tal cual.
- **D-18**: Dashboard v1 **aprobado como aceptable**: se implementa el retoque conservador de §4 sin rediseño de layout.
- **D-19** (review 2026-09-26): **Se elimina el Tour de producto.** La landing queda con 7 bloques: Nav, Hero, Beneficios, Conflicto, Plan, FAQ, Cierre + Footer. El tour no aportaba y alargaba la página.
- **D-20** (review 2026-09-26): Plan con H2 nuevo `Escribilo y olvidate. LUKA se acuerda por vos.`; tarjetas/riel con impacto visual real (no simples).
- **D-21** (review 2026-09-26): **Footer simple**: logo + `LUKA` + `© 2026 — Todos los derechos reservados`. Sin link de WhatsApp ni extras.
- **D-22** (review 2026-09-26): Regla de secciones: **sin eyebrow; solo título y subtítulo**; sin emojis ni componentes genéricos en el chrome del sitio; íconos SVG lineales propios. El chat del mockup conserva el estilo real del bot.
- **D-23** (review 2026-09-26): **Iteración pantalla por pantalla** en Stitch: se aprueba una pantalla a la vez (Nav+Hero → Beneficios → Conflicto → Plan) antes de pasar a la siguiente; cada id aprobado se registra en §5. FAQ y Cierre se reutilizan como referencia; el footer se define directo en código.

## 3. Landing (`/`)

Reescritura de `src/pages/index.astro` (prerender, CSS inline, JS mínimo). Secuencia Duarte: entender → evaluar → confiar → decidir.

| # | Bloque | Contenido |
|---|---|---|
| 1 | Nav sticky flotante | Glassmorphism (blur + fondo translúcido + borde sutil), logo + anclas (Cómo funciona / Beneficios / Dudas) + CTA WhatsApp persistente |
| 2 | Hero | H1 «Hacete cargo de tu plata sin planillas ni culpa» + sub + CTA dual (WhatsApp coral + «Ver cómo funciona» ghost). **Sin eyebrow y sin microcopy bajo los botones.** Composición: mockup de teléfono con chat de WhatsApp adaptado del componente 21st.dev id `23322` (re-implementado vanilla) + mini-dashboard |
| 3 | Beneficios (bento v2) | Rediseñar: bento con jerarquía real, tiles densos (mini-viz + copy corto) y movimiento discreto; prohibido el tile vacío gigante |
| 4 | Conflicto | Rediseñar con impacto visual (face-off HOY vs CON LUKA como escena, no dos columnas planas) |
| 5 | Plan | H2 `Escribilo y olvidate. LUKA se acuerda por vos.` 3 pasos **sin pricing** + visual del «cerebro» de LUKA clasificando el gasto; tarjetas con impacto |
| 6 | FAQ | Simple y sencilla, sin adornos ni tarjetas genéricas |
| 7 | Cierre | Aprobado tal cual: banda `--gradient-brand` + CTA final |
| — | Footer | Simple: logo + `LUKA` + `© 2026 — Todos los derechos reservados` |

- **Eliminado respecto de la revisión v1:** marquee de categorías (D-12), eyebrow del hero (D-11), microcopy del hero (D-11), tarjetas/puntos «pulse» (D-14), **tour de producto (D-19)**.

- **A11y**: `alt` en imágenes, `aria-labelledby` por sección, foco visible, contraste AA, revelado progresivo que nunca oculta contenido sin JS.
- **SEO**: `title`/`description`/OG actualizados al H1; canonical sin cambios.
- **Guard test** (`src/pages/landing.test.ts`): CTA, secciones (`como-funciona`, `beneficios`, `faq`, `cierre`), H1, `alt` y `details`.
- **Copy**: strings aprobados en la sección 2 del diseño (voseo, sin jerga, sin afirmaciones no verificadas).

## 4. Dashboard (`/app`, login, admin)

**✅ Ejecutado** (rama `dashboard`, mergeado a `main`: `9c272e0` tokens, `a8f87f0` guard, `6e76096` skeletons, `eaf7833` a11y). Retoque conservador, **sin cambiar layout ni contratos HTMX**:

- **Tokens**: `style.css` importa `tokens.css` y re-mapea legacy → marca; `admin_flows.css`, `Stats/Transactions/Charts/Sidebar/Icon`, `app.astro` y `AdminLayout/login` sin hex hardcodeados.
- **Skeletons**: KPIs (`#stats-loading` + `hx-indicator`), gráficos hasta que Chart.js dibuja (`data-loading` + `aria-busy`), filas shimmer en transacciones al re-fetch; sin shimmer animado con `prefers-reduced-motion`.
- **Datos**: paleta categórica en charts/chips/dots (mapa canónico con fallback), barras coral / ámbar ≥80 % / rojo excedido, siempre con % y monto textuales; egreso gris cálido, ingreso oliva.
- **A11y**: iconos decorativos `aria-hidden`, label en logout mobile, `aria-label` + fallback en canvases, filas ≥44 px, estado nunca solo por color.
- **Gabarito** en títulos de página (display), Inter en UI y datos.
- **Guard test** (`src/styles/brand-tokens.test.ts`): `style.css` importa tokens y no conserva hex legacy (`#6366f1`, `#8b5cf6`, `#080b14`, `#0f1424`, `#161d30`, `#f1f5f9`, `#f87171`); `admin_flows.css` sin `#818cf8`/`#a5b4fc`/`#5eead4`.

## 5. Stitch (pantallas)

DS «LUKA — Bodegón»: dark, coral primario, Rubik como **proxy** de Gabarito (Stitch no la ofrece; el código usa Gabarito), Inter UI, radio 8.

**v1 generada y revisada por el usuario el 2026-09-25** (feedback en §3 y en el plan, Fase 0):
- Hero + nav + marquee → `screens/1f13587f0e3541349f4e4526fc011d50`
- Bento de beneficios → `screens/4751199a113146f58df3654f58e0bd94`
- Conflicto + tour → `screens/426c589d2ff44b0d929c164d8427642c`
- Plan + FAQ + cierre → `screens/48111d9223124a35b558db2d35ac5e3e`

**Rediseño obligatorio antes de tocar código** (Fase 0 original, **superada por la iteración v2 de abajo**): ~~conflicto+tour con impacto~~ (el tour se elimina, D-19), hero+nav sin eyebrow/microcopy y con nav glass flotante, beneficios bento denso, plan sin pricing y con el cerebro de LUKA clasificando. FAQ simple y cierre tal cual.

**v2 landing — iteración por pantalla (2026-09-26, D-19…D-23):** el usuario revisó las pantallas v2 y pidió correcciones; se aprueba una pantalla a la vez y se registra acá:

| Pantalla | Prompt / requisitos | Id aprobado |
|---|---|---|
| 1 · Nav + Hero | Nav sticky flotante glassmorphism; hero 2 col sin eyebrow ni microcopy; mockup de teléfono (componente 21st.dev id `23322` re-implementado vanilla) | _pendiente_ |
| 2 · Beneficios | Bento con impacto real; texto mínimo (título + subtítulo); sin tile gigante vacío; mini-visual por tile | _pendiente_ |
| 3 · Conflicto | Face-off HOY vs CON LUKA como escena impactante; **sin tour** | _pendiente_ |
| 4 · Plan | H2 D-20; tarjetas/riel con impacto; cerebro de LUKA clasificando | _pendiente_ |
| FAQ + Cierre | Sin rediseño: se reutiliza la referencia ya revisada (`48111d92…`, `6837ca89…`) | — |
| Footer | No se mockea: se implementa directo en código (D-21) | — |

**v2 dashboard con DS Bodegón (generada 2026-09-25; referencia visual de Fase 2, D-18):**
- Dashboard normal → `screens/6981d126bbf948dd8c5e803b22f62d71`
- Dashboard estado de carga (skeletons) → `screens/43cf00e8dbc449f1868b0410b323fb00`

## 6. Ejecución

1. **Stitch** por pantalla (D-23) → aprobación del usuario pantalla a pantalla → ids en §5.
2. Rama `landing-page` (sincronizada con `main`): copy deck (`docs/landing/01-copy-deck.md`) → guard test `src/pages/landing.test.ts` (TDD) → reescribir `index.astro` → validación (`docs/landing/02-validacion.md`: checklist CLEAR y guion del test de 5 s).
3. ~~Rama `dashboard`: tokens + skeletons + a11y + guard test.~~ ✅ Ejecutada y mergeada (`9c272e0`…`eaf7833`).
4. Verificación: `npm run check`, `npm test`, `npm run build`; revisión visual con Playwright sobre `wrangler dev` (landing desktop 1440 + mobile 390; dashboard con `/dev-login`).
5. Cierre: merge `--ff-only` a `main` + push **solo con OK del usuario** (Workers Builds deploya desde `main`).

## 7. Riesgos

- **Colores de categoría desde la DB** (`src/lib/dashboard.ts`) pueden ser legacy: se normalizan en el cliente contra el mapa canónico y caen al color de la API si no matchean.
- **Re-mapeo de `style.css`** afecta `/login` y `/admin`: verificación visual de las tres vistas.
- **Stitch puede desviarse** en detalles: los tokens son la verdad final.
- **Endpoint `/app` sin sesión** redirige a login: para verlo local usar `/dev-login` (`ENABLE_MOCK_AUTH`).

## 8. Verificación de aceptación

- [ ] Landing con los 7 bloques + footer simple (sin tour, título del Plan D-20, footer D-21), CTA WhatsApp y guard tests verdes.
- [x] Dashboard sin hex legacy, con skeletons visibles en KPIs/gráficos/transacciones (`9c272e0`…`eaf7833`).
- [ ] `npm run check` 0 errores · `npm test` verde · `npm run build` OK.
- [ ] Contraste AA/3:1 verificado en las superficies donde se usa cada color.
- [ ] HTMX y los 3 parciales intactos (mismo contrato).
