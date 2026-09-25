# Landing + Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar el manual de marca y las hojas de ruta al código: landing narrativa con CTA a WhatsApp y dashboard con tokens de marca, skeletons, accesibilidad y jerarquía visual.

**Architecture:** Dos ramas desde `main` (`landing-page`, `dashboard`), PRs separados. Landing = reescritura de `src/pages/index.astro` (prerender, CSS inline, sin deps). Dashboard = `tokens.css` como base del CSS legacy + re-mapeo de variables, skeletons con CSS/HTMX (sin tocar contratos) y fixes de a11y.

**Tech Stack:** Astro 7.3.4, vanilla CSS, HTMX 2.0.3, Chart.js 4.4.6, Vitest 5, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-09-25-landing-dashboard-design.md`

## Global Constraints

- Sin DDL ni migraciones; sin tocar `wrangler.jsonc` ni `prerenderEnvironment: 'node'`.
- HTMX y los 3 parciales (`dashboard/actualizar.astro`, `partials/transactions.astro`, `partials/charts.astro`) se mantienen 1:1.
- Cero dependencias nuevas. Sin Tailwind. Sin analytics.
- Tokens de `docs/marca/tokens/design-tokens.json` son la fuente de verdad; `src/styles/tokens.css` es su copia sincronizada (test existente lo exige).
- Regla de color: egreso `--money-out` (grafito), ingreso `--money-in` (esmeralda), rojo solo error/exceso.
- Copy: voseo rioplatense, sin afirmaciones no verificadas (nada de precios, cifrado, testimonios ni métricas inventadas).
- Commits sin trailer `Co-Authored-By` ni firmas de agente.
- Ninguna documentación versionada nombra competidores; el análisis competitivo vive en `.superpowers/sdd/` (gitignored).
- WhatsApp: `https://wa.me/15556378961?text=Hola%20Luka%21`.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `docs/landing/02-copy-deck.md` | crear | Strings finales de la landing |
| `docs/landing/03-validacion.md` | crear | Checklist CLEAR + guion test 5s |
| `src/pages/index.astro` | reescribir | Landing narrativa completa |
| `src/pages/landing.test.ts` | crear | Guard de estructura/CTA/a11y |
| `src/styles/style.css` | editar | Import tokens + re-mapeo legacy |
| `src/styles/admin_flows.css` | editar | Colores hardcodeados → tokens |
| `src/styles/brand-tokens.test.ts` | crear | Guard anti-hex legacy |
| `src/components/Stats.astro` | editar | Colores → tokens |
| `src/components/Transactions.astro` | editar | Colores → tokens |
| `src/components/Charts.astro` | editar | Skeletons + a11y |
| `src/components/Sidebar.astro` | editar | Label logout mobile |
| `src/components/Icon.astro` | editar | `aria-hidden` + `title` opcional |
| `src/pages/app.astro` | editar | Fonts, colores de gráficos, skeletons JS, filas/a11y |

---

## Task L0: Stitch v2 (6 pantallas, antes de codear)

**Files:** none in the repo (proyecto Stitch `projects/447579364756216071`).

- [ ] **Step 1:** Generar 6 pantallas con el design system `assets/17545251351142893120`: hero+nav+marquee · bento · conflicto+tour · plan+faq+cierre · dashboard · dashboard skeletons.
- [ ] **Step 2:** Gate: presentar screenshots al usuario y esperar aprobación antes de tocar `index.astro` o `style.css`.

## Task L1: Análisis competitivo (fuera del repo)

**Files:** none in the repo. Deliverable local en `.superpowers/sdd/landing/` (gitignored por política de marca: ningún nombre de competidor se versiona).

- [ ] **Step 1:** Fetch en vivo de los 3 sitios de referencia citados en la hoja de ruta (URLs solo en el scratch local).
- [ ] **Step 2:** Escribir la matriz con estas columnas: Titular/Propuesta · Enfoque narrativo (héroe/guía) · Nivel de negafobia (McKee) · Fricción detectada (MECLABS) · Test 5s · Plan de 3 pasos · Oportunidad para LUKA.
- [ ] **Step 3:** Cerrar con 3 conclusiones accionables para el copy de LUKA.
- [ ] **Step 4:** No commit. El repo solo recibe el copy deck sin referencias a competidores.

## Task L2: Copy deck

**Files:** Create `docs/landing/02-copy-deck.md`

- [ ] **Step 1:** Volcar los strings aprobados (verbatim, listos para pegar en `index.astro`):

```
H1: Hacete cargo de tu plata sin planillas ni culpa
Sub: Escribile tus gastos como hablás y Luka los ordena: categorías, límites y balances cuando los pedís.
CTA primario: Empezá por WhatsApp
Microcopy CTA: Sin tarjeta. Configuración en 30 segundos.
CTA secundario: Ver cómo funciona

Eyebrow conflicto: HOY / CON LUKA
H2 conflicto: El problema no sos vos. Son las herramientas.
Hoy: La plata se va y no sabés bien adónde
  · Anotás dos días y después te olvidás.
  · Los gastos están repartidos entre billeteras, bancos y efectivo.
  · A fin de mes llega la culpa, sin respuestas.
Con Luka: Todo queda ordenado sin que hagas nada extra
  · Un mensaje y listo: no hay formularios que completar.
  · Categorías, límites y balances en un solo lugar.
  · Decisiones con datos, sin planillas ni culpa.

H2 beneficios: Diseñado para darte claridad, no trabajo
  · Registrás en segundos — Texto o audio, como hablás.
  · Categorías automáticas — Luka entiende y clasifica solo.
  · Límites que avisan — Alertas al 80% de tu presupuesto, sin juzgar.
  · Balances claros — Totales, gráficos y patrimonio cuando los pedís.

H2 plan: Empezar toma menos que pedir un café
  1. Enviá un mensaje — Texto o audio: «Gasté 5000 en nafta». Sin formularios.
  2. Luka lo clasifica — Categoría, fecha y monto al instante. Te confirma el registro.
  3. Recibí tus balances — Límites, gráficos y totales cuando los pedís, por WhatsApp o acá.

H2 FAQ: Las dudas de siempre
  · ¿Necesito instalar algo? — No. Usás el WhatsApp que ya tenés.
  · ¿Cuánto tarda en registrar un gasto? — Segundos. Luka lo anota, lo clasifica y te lo confirma al instante.
  · ¿Puedo anotar gastos en efectivo? — Sí, también ingresos. Por texto o audio, como te salga.
  · ¿Qué puedo consultarle? — Balances, límites y gráficos por WhatsApp, o en detalle desde el dashboard.
  · ¿Y si mi mensaje es ambiguo? — Luka te repregunta de forma simple en vez de cargar algo mal.

H2 cierre: Empezá a ordenar tu plata hoy
Cierre sub: Enviá tu primer gasto y mirá cómo Luka lo ordena.
Footer: LUKA © {año} · Contacto: Escribinos por WhatsApp
```

- [ ] **Step 2:** Commit: `docs(landing): copy deck SB7 con strings finales`

## Task L3: Landing v2 (friendly colorida)

**Files:** Rewrite `src/pages/index.astro`

**Interfaces:**
- Consumes: `../styles/global.css` (tokens + display), `../components/Icon.astro` (`{name}`), `/logo-luka.png`, copy deck `docs/landing/02-copy-deck.md`, pantallas Stitch v2 (Task L0).
- Produces: ids `#como-funciona`, `#beneficios`, `#faq`, `#cierre` + `data-reveal` en secciones (los usa el guard test de L4).

Bloques y requisitos:

| # | Bloque | Implementación |
|---|---|---|
| 1 | Nav sticky | `position: sticky` con fondo glass; logo, anclas y CTA WhatsApp |
| 2 | Hero | Grid 2 columnas: copy + composición (mini-dashboard flotante con anillo/barras/KPI + teléfono con chat); aurora multicapa |
| 3 | Marquee | Chips de las 9 categorías con `--cat-*`; lista duplicada `aria-hidden="true"`; pausa en hover/focus; sin animación en `reduced-motion` |
| 4 | Bento | Grid asimétrico (`grid-template-areas`); tiles con `color-mix()` de categóricas al 10 % y mini-viz hecha con divs (sparkline/anillo/barras) |
| 5 | Conflicto | 2 columnas: HOY grafito / CON LUKA con acentos categóricos |
| 6 | Tour | 3 tabs CSS (`input[type=radio]:checked`, sin JS): Gastos / Límites / Balances, cada uno con UI HTML |
| 7 | Plan | Timeline de 3 pasos con icono categórico (azul → ámbar → esmeralda) |
| 8 | FAQ + Cierre | 5 `details/summary` + banda final `--gradient-brand` con CTA |
| — | Footer | Logo + © + WhatsApp |

- [ ] **Step 1:** Escribir `index.astro` con los 8 bloques, copy deck verbatim y CSS/JS inline: reveal por `IntersectionObserver` que agrega `has-reveal` en `<html>` solo si hay JS y no hay `prefers-reduced-motion`; aurora y marquee con keyframes; count-up de KPIs ≤ 20 líneas.
- [ ] **Step 2:** Verificar contraste: categóricos solo en íconos/dots/bordes/áreas grandes; texto en `--text-*`.
- [ ] **Step 3:** Run: `npm run check` → Expected: 0 errores.
- [ ] **Step 4:** Run: `npx astro build` y verificar `dist/index.html` incluye `wa.me/15556378961` y las 8 secciones.
- [ ] **Step 5:** Commit: `feat(landing): v2 friendly colorida con paleta completa y scroll reveal`

## Task L4: Guard de estructura de landing

**Files:** Create `src/pages/landing.test.ts`

- [ ] **Step 1:** Escribir el test (lee el fuente como string; mismo patrón que `src/styles/tokens.test.ts`):

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, 'index.astro'), 'utf8');

describe('landing', () => {
  it('usa el CTA de WhatsApp con el número acordado', () => {
    expect(source).toContain('https://wa.me/15556378961?text=Hola%20Luka%21');
  });

  it('conserva las secciones narrativas', () => {
    for (const id of ['como-funciona', 'faq', 'cierre']) {
      expect(source).toContain(`id="${id}"`);
    }
  });

  it('incluye el H1 aprobado y el plan de 3 pasos', () => {
    expect(source).toContain('Hacete cargo de tu plata sin planillas ni culpa');
    expect(source).toMatch(/Empezar toma menos que pedir un caf/);
  });

  it('toda imagen tiene alt', () => {
    const imgs = source.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) expect(img).toContain('alt=');
  });

  it('el FAQ usa details/summary nativo', () => {
    expect((source.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/pages/landing.test.ts` → Expected: PASS.
- [ ] **Step 3:** Commit: `test(landing): guard de estructura, CTA y accesibilidad`

## Task L5: Validación heurística

**Files:** Create `docs/landing/03-validacion.md`

- [ ] **Step 1:** Documentar: checklist CLEAR (Clarity/Layout/Emotion/Action/Relevance) con evidencia por sección; presupuesto de decisiones MECLABS (clic en CTA → 1 paso); guion del test de 5 segundos (3 preguntas, 3 personas ajenas, planilla de resultados).
- [ ] **Step 2:** Commit: `docs(landing): checklist CLEAR y guion de test de 5 segundos`

## Task L6: PR de landing

- [ ] **Step 1:** Run: `npm run check; npm test; npm run build` → Expected: todo verde.
- [ ] **Step 2:** `git push -u origin landing-page` y `gh pr create --base main --head landing-page --title "Landing narrativa SB7 + CTA WhatsApp" --body "<resumen + evidencia>"`.

---

## Task D1: Tokens de marca en el CSS del dashboard

**Files:** Modify `src/styles/style.css`, `src/styles/admin_flows.css`, `src/components/Stats.astro`, `src/components/Transactions.astro`, `src/pages/app.astro`, `src/layouts/AdminLayout.astro`, `src/pages/login.astro`

- [ ] **Step 1:** `style.css` línea 1 (antes del comentario) agregar `@import "./tokens.css";` y reemplazar el bloque `:root` (líneas 7–40) por:

```css
:root {
  --bg-glass-hover: rgba(255,255,255,0.07);
  --border-hover:   var(--border-strong);
  --accent-primary: var(--action);
  --accent-violet:  var(--cat-vivienda);
  --accent-pink:    var(--cat-ropa);
  --accent-teal:    var(--cat-salud);
  --accent-amber:   var(--warning);
  --sidebar-w:      240px;
  --header-h:       60px;
}
```

- [ ] **Step 2:** Reemplazar hex hardcodeados de `style.css`: `#a5b4fc` → `var(--accent)`, `#c7d2fe` → `var(--accent)`, `rgba(99,102,241,.18)` → `color-mix(in srgb, var(--action) 18%, transparent)`, `#f87171` → `var(--danger)`, `#fbbf24` → `var(--warning)`, `#fca5a5` → `var(--danger)`, `rgba(239,68,68,.15)` → `color-mix(in srgb, var(--danger) 15%, transparent)`, `#94a3b8` de gradiente → `var(--money-out)`.
- [ ] **Step 3:** `admin_flows.css`: `#818cf8` y `#a5b4fc` y `#c7d2fe` → `var(--accent)`; `#6366f1` → `var(--action)`; `#7175f5` → `var(--action-hover)`; `rgba(99,102,241,*)` → `color-mix(in srgb, var(--action) N%, transparent)`; verdes legacy (`#5eead4`, `#99f6e4`, `rgba(20,184,166,*)`) → `var(--success)` / `color-mix(in srgb, var(--success) N%, transparent)`; rojos legacy → `var(--danger)` / `color-mix(...)`; `#0c1120` → `var(--bg-base)`.
- [ ] **Step 4:** `Stats.astro`: `#94a3b8` → `var(--money-out)`, `#10b981` → `var(--success)`, `#f87171` → `var(--danger)`, `#f59e0b` → `var(--warning)`, `#6366f1` → `var(--action)`, `#8b5cf6` → `var(--cat-ocio)`. Eliminar `'stat-value--negative'` del KPI de patrimonio (patrimonio negativo también es grafito; el signo `+/-` ya informa).
- [ ] **Step 5:** `Transactions.astro`: ingreso → `var(--money-in)`, egreso → `var(--money-out)`, categoría ingreso `#64748b` → `var(--money-out)`.
- [ ] **Step 6:** `app.astro` script de gráficos: `CHART_DEFAULTS` ticks `#94a3b8`/`#64748b` → `cssVar('--text-secondary')`/`cssVar('--text-muted')` (helper `const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim()`); cartera ARS `rgba(99,102,241,.75)` → `cssVar('--cat-servicios')`, USD `rgba(16,185,129,.75)` → `cssVar('--cat-ingresos')`; flujo Ingresos `rgba(20,184,166,.80)` → `cssVar('--money-in')`, Egresos `rgba(236,72,153,.75)` → `cssVar('--money-out')`; en `buildPieChart` usar mapa por categoría canonicalizada (quita tildes/`Otro`→`Otros`) contra `--cat-*`, con fallback al color de la API.
- [ ] **Step 7:** Barras de presupuesto en `app.astro`: `background` = `var(--danger)` si `budget.over`, `var(--warning)` si `pct >= 80`, si no `var(--action)`; `over-budget`/`bar-over` quedan en `var(--danger)`. El dot de categoría puede seguir usando `budget.color`.
- [ ] **Step 8:** Agregar Space Grotesk al `<link>` de fuentes en `app.astro`, `AdminLayout.astro` y `login.astro` (`family=Space+Grotesk:wght@500;700`) y `font-family: var(--font-display)` en `.page-title`/`h1` de página.
- [ ] **Step 9:** Run: `npm run check` → Expected: 0 errores.
- [ ] **Step 10:** Commit: `refactor(dashboard): tokens de marca en CSS y componentes`

## Task D2: Guard anti-hex legacy

**Files:** Create `src/styles/brand-tokens.test.ts`

- [ ] **Step 1:** Escribir el test:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(import.meta.dirname, f), 'utf8');

describe('brand tokens en CSS legacy', () => {
  it('style.css importa tokens y no conserva el indigo legacy', () => {
    const css = read('style.css');
    expect(css).toContain('@import "./tokens.css"');
    for (const hex of ['#6366f1', '#8b5cf6', '#080b14', '#0f1424', '#161d30', '#f1f5f9']) {
      expect(css.toLowerCase()).not.toContain(hex);
    }
  });

  it('admin_flows.css no hardcodea la paleta legacy', () => {
    const css = read('admin_flows.css');
    for (const hex of ['#6366f1', '#818cf8', '#a5b4fc', '#5eead4']) {
      expect(css.toLowerCase()).not.toContain(hex);
    }
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run src/styles/brand-tokens.test.ts` → Expected: PASS tras D1.
- [ ] **Step 3:** Commit: `test(styles): guard anti-hex legacy en dashboard y admin`

## Task D3: Skeletons

**Files:** Modify `src/styles/style.css`, `src/components/Charts.astro`, `src/pages/app.astro`

- [ ] **Step 1:** Agregar al final de `style.css`:

```css
/* ── Skeletons ───────────────────────────────────────────────────────────── */
.skeleton {
  background: var(--bg-glass);
  border-radius: var(--radius-sm);
  position: relative;
  overflow: hidden;
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.06) 50%, transparent 80%);
  animation: skeleton-sweep 1.4s ease-in-out infinite;
}
@keyframes skeleton-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(100%); }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton::after { animation: none; }
}
#stats-loading { display: none; }
#stats-loading.htmx-request { display: grid; }
#stats-loading.htmx-request + .stats-grid { display: none; }
.skeleton-stat { height: 108px; border-radius: var(--radius-lg); }
.chart-skeleton { position: absolute; inset: var(--space-4); display: grid; gap: var(--space-3); }
.chart-wrapper[data-loading='false'] .chart-skeleton { display: none; }
.tx-skeleton-row { display: grid; grid-template-columns: 44px 1fr 96px; gap: var(--space-3); align-items: center; padding: var(--space-3) 0; }
```

- [ ] **Step 2:** `Charts.astro`: envolver cada `<canvas>` con un skeleton hermano:

```astro
<div class="chart-wrapper" data-loading="true" aria-busy="true">
  <div class="chart-skeleton" aria-hidden="true">
    <div class="skeleton" style="height: 100%"></div>
  </div>
  <canvas id="chart-pie" aria-label="Gráfico de egresos por categoría"></canvas>
</div>
```

Análogo para `chart-portfolio` (aria-label: «Egresos por mes y moneda») y `chart-flow` («Flujo mensual de ingresos y egresos»).

- [ ] **Step 3:** `app.astro`: tras construir o marcar vacíos los gráficos, apagar el skeleton:

```js
function markChartLoaded(containerId) {
  const card = document.getElementById(containerId);
  const wrapper = card?.querySelector('.chart-wrapper');
  if (wrapper) { wrapper.dataset.loading = 'false'; wrapper.setAttribute('aria-busy', 'false'); }
}
```

Llamar `markChartLoaded('card-pie' | 'card-portfolio' | 'card-flow')` en cada rama (vacío o con datos) de `fetchAndBuildCharts`; en el `catch` dejar el skeleton visible y `aria-busy="false"` con el mensaje de error existente.

- [ ] **Step 4:** `app.astro`: en `#stats-section` insertar antes de `<Stats/>`:

```astro
<div id="stats-loading" class="stats-grid" aria-hidden="true">
  {Array.from({ length: 4 }).map(() => <div class="skeleton skeleton-stat" />)}
</div>
```

y en el `<form class="filter-form">` agregar `hx-indicator="#stats-loading"`.

- [ ] **Step 5:** `app.astro`: en el listener `actualizarGraficos`, antes del fetch de transacciones:

```js
const txList = document.getElementById('transactions-list');
txList.setAttribute('aria-busy', 'true');
txList.innerHTML = '<div class="tx-skeleton-row"><div class="skeleton" style="height:44px;border-radius:999px"></div><div class="skeleton" style="height:16px"></div><div class="skeleton" style="height:16px"></div></div>'.repeat(5);
const txRes = await fetch(`/partials/transactions?date_from=${from}&date_to=${to}`);
txList.innerHTML = await txRes.text();
txList.setAttribute('aria-busy', 'false');
```

- [ ] **Step 6:** Run: `npm run check` → Expected: 0 errores.
- [ ] **Step 7:** Commit: `feat(dashboard): skeletons en KPIs, gráficos y transacciones`

## Task D4: Accesibilidad

**Files:** Modify `src/components/Icon.astro`, `src/components/Sidebar.astro`, `src/styles/style.css`

- [ ] **Step 1:** `Icon.astro`: agregar prop opcional `label?: string` y renderizar `<span role="img" aria-label={label}>` cuando exista; si no, envolver en `<span aria-hidden="true">`.
- [ ] **Step 2:** `Sidebar.astro:65` → `<a href="/logout" class="mobile-logout" aria-label="Cerrar sesión">`.
- [ ] **Step 3:** `style.css`: `.tx-row { min-height: 44px; }` (si no está ya) y revisar que `.chart-empty-msg` mantenga contraste.
- [ ] **Step 4:** Run: `npm run check; npx vitest run` → Expected: verde.
- [ ] **Step 5:** Commit: `fix(a11y): iconos decorativos, logout mobile y filas de 44px`

## Task D5: Pulido friendly (sin cambiar layout)

**Files:** Modify `src/pages/app.astro`, `src/styles/style.css`

- [ ] **Step 1:** Charts: ring más grueso (`cutout: '68%'`) y leyenda en `--text-secondary`; paleta categórica aplicada en D1.
- [ ] **Step 2:** KPI cards: `.stat-icon` con fondo `color-mix(in srgb, var(--cat-*) 12%, transparent)` y radio `--radius-full`; hover lift (`translateY(-2px)` + `--shadow-card`); `:focus-visible` con `--shadow-glow`.
- [ ] **Step 3:** Sidebar: item activo con fondo `color-mix(in srgb, var(--action) 14%, transparent)` + borde `--accent`; iconos nav en `--accent` al hover.
- [ ] **Step 4:** Filas de transacción con hover `--bg-glass-hover`; badge de categoría con dot categórico + texto `--text-primary`.
- [ ] **Step 5:** `prefers-reduced-motion`: anular lifts/transforms.
- [ ] **Step 6:** Run: `npm run check; npm test` → Expected: verde.
- [ ] **Step 7:** Commit: `feat(dashboard): pulido friendly con paleta categorica y micro-interacciones`

## Task D6: PR de dashboard

- [ ] **Step 1:** Run: `npm run check; npm test; npm run build` → Expected: todo verde.
- [ ] **Step 2:** `git push -u origin dashboard` y `gh pr create --base main --head dashboard --title "Dashboard con tokens de marca, skeletons y a11y" --body "<resumen + evidencia>"`.

---

## Self-Review

- **Spec coverage:** landing §3 → L0–L6; dashboard §4 → D1–D5; Stitch §5 → L0; decisiones D-1–D-12 aplicadas en constraints y tasks; verificación §6 → steps de check/test/build + L6/D6.
- **Política de marca:** ninguna doc versionada nombra competidores; el análisis vive en `.superpowers/sdd/` (gitignored) y el copy deck no lo referencia.
- **Placeholders:** ninguno; los strings viven en el copy deck (L2) y el diseño en las pantallas Stitch (L0), que se aprueban antes de L3.
- **Consistencia:** ids `como-funciona`/`beneficios`/`faq`/`cierre` coinciden entre L3 y L4; `#stats-loading` y `data-loading` coinciden entre D1 y D3; `--cat-*`/`--money-*` existen en `tokens.css`.
