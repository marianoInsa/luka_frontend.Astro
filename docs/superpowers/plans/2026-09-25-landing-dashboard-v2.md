# Landing + Dashboard LUKA v2 «Bodegón» — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Iterar en Stitch la landing pantalla por pantalla según las correcciones del 2026-09-26 (D-19…D-23) y luego aplicarla al código sobre la identidad v2 «Bodegón». El retoque de marca del dashboard ya está ejecutado y mergeado.

**Architecture:** Rama `landing-page` (sincronizada con `main`). Landing = reescritura de `src/pages/index.astro` (prerender, CSS inline, JS mínimo, cero dependencias): Nav glass, Hero con mockup de teléfono, Beneficios bento, Conflicto face-off, Plan, FAQ, Cierre y footer simple. **Sin tour.** La Fase 2 del dashboard (tokens/skeletons/a11y) ya vive en `main` (`9c272e0`…`eaf7833`).

**Tech Stack:** Astro 7.3.4, vanilla CSS, HTMX 2.0.3, Chart.js 4.4.6, Vitest 5, Cloudflare Workers (wrangler dev).

**Spec:** `docs/superpowers/specs/2026-09-25-landing-dashboard-v2-design.md` (decisiones D-1…D-23 y reviews del 2026-09-25 y 2026-09-26)

**Revisión 2026-09-26:** la Fase 0 original (4 pantallas de una) quedó invalidada por el review; ahora es iteración **pantalla por pantalla** con gate individual. Se elimina el Tour (D-19), cambia el título del Plan (D-20), el footer se simplifica (D-21) y se prohíben emojis/componentes genéricos y el eyebrow (D-22).

## Global Constraints

- **Identidad cerrada:** tokens v2.0.0 (`docs/marca/tokens/`), fuente de verdad; `src/styles/tokens.css` es copia sincronizada (test de drift).
- Sin DDL ni migraciones; sin tocar `wrangler.jsonc`, `prerenderEnvironment: 'node'` ni el `name` del Worker.
- HTMX y los 3 parciales (`dashboard/actualizar.astro`, `partials/transactions.astro`, `partials/charts.astro`) se mantienen 1:1.
- **Cero dependencias nuevas.** Sin Tailwind. Sin React/framer-motion: el mockup de 21st.dev se re-implementa vanilla.
- Regla de color: egreso `--money-out` (gris cálido), ingreso `--money-in` (oliva), rojo `--danger` solo error/exceso; el color nunca es la única señal.
- Copy: voseo rioplatense; **sin precios ni costos**; sin afirmaciones no verificadas (nada de testimonios, cifras inventadas, cifrado).
- **Prohibido** el marquee, el eyebrow, el microcopy bajo los botones del hero, las tarjetas/puntos genéricos de «pulse effect» (D-11, D-12, D-14) y **los emojis en el chrome del sitio** (D-22).
- **Regla de secciones (D-22):** sólo título y subtítulo; sin eyebrow; sin componentes genéricos; íconos SVG lineales propios. El chat del mockup conserva el estilo real del bot.
- **Sin Tour de producto (D-19):** la página tiene 7 bloques + footer.
- **Plan (D-20):** H2 `Escribilo y olvidate. LUKA se acuerda por vos.`
- **Footer simple (D-21):** logo + `LUKA` + `© 2026 — Todos los derechos reservados`. Sin link de WhatsApp.
- **Nav sin CTA (D-24):** la navbar no lleva botón de WhatsApp; solo logo + anclas. El CTA vive en hero y cierre.
- **Stitch pantalla por pantalla (D-23):** aprobar una antes de generar la siguiente; registrar cada id en el spec §5.
- Commits sin trailer `Co-Authored-By`. **No push sin OK explícito del usuario** (esta sesión ya pusheó `landing-page` y `dashboard`; el resto, pedir).
- WhatsApp CTA: placeholder `https://wa.me/15556378961?text=Hola%20Luka%21` (D-1).
- Fuente display: **Gabarito** (Google Fonts) en el código; Stitch usa Rubik como proxy.

---

## Estado de partida (handoff 2026-09-26)

| Cosa | Estado |
|---|---|
| `main` | `bbfab77` (merge de `dashboard`), **pusheado**. Incluye Fase 2 completa (`9c272e0`…`eaf7833`) y las pantallas del dashboard registradas en el spec (`ff18d31`). |
| `landing-page` local | **Sincronizada con `main`** (`git merge --ff-only main`); 7 commits por delante de `origin/landing-page` (docs). La landing sigue siendo la v1. |
| Stitch | Proyecto `447579364756216071`; DS `assets/1946592025752870069` («LUKA — Bodegón»). Pantallas v2 de landing revisadas el 2026-09-26: **iteración obligatoria** (D-19…D-23). FAQ/Cierre aceptables como referencia (`48111d92…`, `6837ca89…`). Dashboard v1 aprobado. |
| Harness local | `.superpowers/sdd/` ya no existe (scratch gitignored); regenerar solo si hace falta (el mock de charts/admin y `.dev.vars` siguen documentados en `02-estado-y-siguientes-pasos.md`). |
| Local server | No hay server levantado; levantar con el patrón de los quirks si hace falta verificación visual. |

**Quirks del entorno (leer antes de ejecutar):**

1. `astro dev`/`astro preview` no leen `.dev.vars` y fallan sin `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
2. Para `wrangler dev` con DB: exportar `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` con el valor de `POOLER_URL` de `.dev.vars` y lanzar detached (la skill `dev-server-lifecycle` en esta máquina timeoutea el readiness probe; usar el patrón WMI `cmd /d /c "set ... && node node_modules/wrangler/bin/wrangler.js dev --port 4321 >> log 2>> log"`).
3. **Detener el server antes de `npm run build`**: build + wrangler vivo produce `Assertion failed ... uv async.c` y build roto.
4. Stitch MCP: prompts largos timeoutean; la pantalla suele generarse igual. No reintentar en loop: esperar ~2 min y buscar con `list_screens` (la lista llega atrasada).
5. Verificación visual: Playwright sobre `http://127.0.0.1:4321`; dashboard con `/dev-login` (`ENABLE_MOCK_AUTH=true`).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `docs/landing/01-copy-deck.md` | crear | Strings finales de la landing (sin eyebrow/microcopy/marquee) |
| `docs/landing/02-validacion.md` | crear | Checklist CLEAR + guion del test de 5 s |
| `docs/superpowers/specs/…-design.md` | ya actualizado | Fuente de verdad del diseño (D-1…D-18) |
| `src/pages/index.astro` | reescribir | Landing completa (8 bloques) |
| `src/pages/landing.test.ts` | crear | Guard de estructura/CTA/a11y |
| `src/styles/style.css` | editar | Import de tokens + re-mapeo legacy |
| `src/styles/admin_flows.css` | editar | Hex hardcodeados → tokens |
| `src/styles/brand-tokens.test.ts` | crear | Guard anti-hex legacy |
| `src/components/{Stats,Transactions,Charts,Sidebar,Icon}.astro` | editar | Tokens, skeletons y a11y |
| `src/pages/app.astro` | editar | Fonts, colores de gráficos, skeletons JS |
| `src/layouts/AdminLayout.astro`, `src/pages/login.astro`, `src/pages/registro*.astro` | editar | Gabarito + favicons (si falta) |

---

# FASE 0 — Stitch, pantalla por pantalla (gate humano)

**Regla (D-23):** se genera UNA pantalla, se muestra al usuario (captura + link de Stitch), se itera con su feedback y sólo con su OK se pasa a la siguiente. Cada id aprobado se registra en el spec §5. **Ninguna tarea de código arranca sin las 4 pantallas aprobadas.**

**Estado 2026-09-26:** 0.1 ✅ (`56fccdcc…`, navbar sin CTA), 0.2 ✅ (`7c9c09b9…`), 0.4 ✅ (`6e59290a…`); 0.3 (Conflicto) pendiente por timeouts de Stitch. El usuario pidió **no re-editar Stitch** por correcciones: las notas de implementación viven en el spec §5 («Notas de implementación»). FAQ/Cierre y footer van directo a código.

**Constantes de todos los prompts:**

- DS «LUKA — Bodegón» (`assets/1946592025752870069`), device DESKTOP, ancho 1440.
- Fondo berenjena `#1B1420`; crema `#F5ECE2`; coral `#F0704C` (acción); durazno `#F2A48C`; oliva `#8FBF6F`; ámbar `#E8B44A`; gris cálido `#B3A3AC` (egreso); rojo `#F2555A` (solo error); texto espresso `#2A0F07` sobre coral.
- Rubik 700 como proxy de Gabarito (el código usa Gabarito); Inter para UI y datos; cifras tabulares.
- **Sin eyebrow, sin emojis, sin componentes genéricos, sin puntos parpadeantes/pulse, sin marquee, sin fotos.** Sólo título + subtítulo por sección. Íconos SVG lineales propios.
- Debe verse único de LUKA, cálido y con impacto: minimalista pero nunca aburrido ni genérico. WCAG AA.

### Task 0.1: Pantalla 1 — Nav + Hero

**Files:** ninguno en el repo. Stitch: proyecto `447579364756216071`, design system `assets/1946592025752870069`, device DESKTOP.

- [ ] **Step 1: Generar la pantalla con este prompt exacto**

```
Landing LUKA desktop 1440, fondo berenjena #1B1420 con aurora coral/durazno muy sutil al 10%. Identidad «Bodegón», WCAG AA. Es la primera impresión de la marca: debe verse única, cálida y con impacto, no una plantilla genérica.

NAV STICKY FLOTANTE CON GLASSMORPHISM (diseño propio, no barra estándar): barra separada del borde superior (margin 16px) y del ancho del contenido (máximo 1200px), fondo translúcido rgba(39,28,46,0.55) con backdrop-blur 18px, borde 1px rgba(245,236,226,0.12), radio 999px, sombra cálida difusa. Contenido: logo LUKA (isotipo coral→durazno) a la izquierda y anclas "Cómo funciona / Beneficios / Dudas" en crema #F5ECE2 centradas. SIN botón de WhatsApp en la navbar (D-24: el CTA vive en el hero).

HERO en 2 columnas, SIN eyebrow y SIN texto debajo de los botones:
- Izquierda: titular Rubik 700 crema 56px "Hacete cargo de tu plata sin planillas ni culpa"; subtítulo "Escribile tus gastos como hablás y Luka los ordena: categorías, límites y balances cuando los pedís."; botón primario coral "Empezá por WhatsApp" + botón ghost con borde crema translúcido "Ver cómo funciona". Nada más de texto en esa columna: sin eyebrow, sin microcopy, sin badges.
- Derecha: mockup de teléfono realista (chasis oscuro con bordes redondeados, isla superior, barra de estado) mostrando un chat de WhatsApp: burbuja entrante del usuario en coral suave "Gasté 5000 en nafta", respuesta de LUKA en tarjeta #34263C "Listo: nafta, $5.000 en Transporte" y una mini tarjeta de balance "$12.500 · Balance del mes" con barra coral. Detrás, flotando y parcialmente detrás del teléfono, una tarjeta de mini-dashboard con anillo categórico (lila #9B9BE0, agua #7FB5C9, mostaza #E0B84A, rosa #E87FA8, oliva #8FBF6F) y dos barras.

PROHIBIDO: marquee, eyebrow, emojis, puntos parpadeantes, badges de "pulse effect", texto de relleno, fotos o stock. Todo UI construida. WCAG AA.
```

- [ ] **Step 2: Descargar la screenshot y guardarla** en `.superpowers/sdd/brand/v2-stitch-01-nav-hero.png` (gitignored).
- [ ] **Step 3: Mostrarla al usuario y esperar feedback** (captura + link de Stitch). Iterar con `stitch_edit_screens` sobre el id hasta el OK explícito. **No generar la pantalla 2 sin este OK.**
- [ ] **Step 4: Registrar el id aprobado** en el spec §5.

### Task 0.2: Pantalla 2 — Beneficios (bento con impacto)

- [ ] **Step 1: Generar con este prompt exacto**

```
Sección de beneficios LUKA desktop 1440, continuación de la landing, fondo berenjena #1B1420, aurora sutil lila y agua. Debe VENDER, no aburrir: impacto visual alto sin ruido.

Titular Rubik 700 crema "Diseñado para darte claridad, no trabajo" + subtítulo corto "Menos fricción, más control." Sin eyebrow, sin badges, sin emojis.

BENTO con jerarquía real e impacto (grid-template-areas, gap 20px, cards #271C2E radio 24px borde rgba(245,236,226,0.10), sombra cálida):
1. Tile protagonista "Categorías automáticas": mini-viz grande y rica (burbuja "Gasté 5000 en nafta" → riel → 3 chips de categoría con íconos lineales + badge oliva "Clasificado"), ancho de 2 columnas x 1 fila — PROHIBIDO que sea un tile gigante semivacío o de doble alto.
2. Tile "Registrás en segundos": onda de audio en durazno + transcripción corta.
3. Tile "Límites que avisan": barra ámbar al 80% con texto tabular "80% · $80.000 de $100.000".
4. Tile "Balances claros": sparkline oliva + cifra tabular "$12.500".
5. Tile "Sin planillas": grilla de celdas que se ordena + ícono lineal grande.

Cada tile: título corto + subtítulo de una línea (nada más de texto); fondo color-mix de su categórico al 10%; ícono SVG lineal propio. Sin tarjetas genéricas, sin puntos parpadeantes, sin tiles vacíos. WCAG AA.
```

- [ ] **Step 2: Descargar la screenshot** a `.superpowers/sdd/brand/v2-stitch-02-bento.png`.
- [ ] **Step 3: Mostrarla y esperar OK** (iterar si hace falta). Recién entonces generar la pantalla 3.
- [ ] **Step 4: Registrar el id aprobado** en el spec §5.

### Task 0.3: Pantalla 3 — Conflicto (sin Tour)

- [ ] **Step 1: Generar con este prompt exacto**

```
Sección conflicto LUKA desktop 1440, fondo berenjena #1B1420. Face-off impactante, no dos columnas planas. Sin tour de producto: esta pantalla y la página no llevan tour.

AFICHE DE CONTRASTE partido por una grieta luminosa coral, con dos escenas:
- Izquierda "HOY": escena monocroma en gris cálido #B3A3AC que se desarma —papeles, tickets y notificaciones en capas superpuestas con rotaciones leves, desenfoque y textura de estática—; se siente caos, pero elegante y controlado (nada de clipart).
- Derecha "CON LUKA": la misma información ordenada en una escena limpia con chips categóricos, un balance claro y un trazo coral continuo que atraviesa la escena.

Titular Rubik 700 crema "El problema no sos vos. Son las herramientas." Subtítulos: "La plata se va y no sabés bien adónde" (lado HOY) y "Todo queda ordenado sin que hagas nada extra" (lado CON LUKA).

Sólo título y subtítulos: sin eyebrow, sin emojis, sin badges con punto pulsante, sin tarjetas genéricas. Debe ser la pieza más impactante de la página. WCAG AA.
```

- [ ] **Step 2: Descargar la screenshot** a `.superpowers/sdd/brand/v2-stitch-03-conflicto.png`.
- [ ] **Step 3: Mostrarla y esperar OK** (iterar si hace falta). Recién entonces generar la pantalla 4.
- [ ] **Step 4: Registrar el id aprobado** en el spec §5.

### Task 0.4: Pantalla 4 — Plan (título nuevo, con impacto)

- [ ] **Step 1: Generar con este prompt exacto**

```
Sección "cómo funciona" LUKA desktop 1440, fondo berenjena #1B1420. Debe verse única y con impacto, no tres columnas simples.

Titular Rubik 700 crema "Escribilo y olvidate. LUKA se acuerda por vos." + subtítulo corto "Tres pasos, cero planillas." Sin eyebrow ni emojis. PROHIBIDO mencionar precios, costos, café o comparaciones.

RIEL VIVO de 3 momentos con tarjetas de alto impacto visual (no cards planas): un trazo luminoso coral→durazno conecta los tres momentos, con nodos y profundidad:
1. "Escribís como hablás" — burbuja "Gasté 5000 en nafta" con onda de audio.
2. "El cerebro de LUKA lo entiende" — diagrama central del núcleo (red de nodos/circuito): el mensaje entra y salen tres etiquetas "Monto $5.000", "Categoría Transporte", "Fecha hoy"; los nodos usan los colores categóricos.
3. "Ves todo ordenado" — tarjeta con el movimiento clasificado y el balance actualizado.
Cada momento: título + subtítulo de una línea y mini-viz rica. El riel y los nodos con degradado, estáticos (sin puntos parpadeantes). WCAG AA.
```

- [ ] **Step 2: Descargar la screenshot** a `.superpowers/sdd/brand/v2-stitch-04-plan.png`.
- [ ] **Step 3: Mostrarla y esperar OK** (iterar si hace falta).
- [ ] **Step 4: Registrar el id aprobado** en el spec §5.

### Task 0.5: Referencias de FAQ/Cierre y gate final

- [ ] **Step 1:** FAQ y Cierre no se rediseñan: reutilizar la pantalla ya revisada como referencia (`48111d92…` o `6837ca89…`, la que el usuario señale) al implementar.
- [ ] **Step 2:** Footer no se mockea: se implementa directo en código (D-21: logo + `LUKA` + `© 2026 — Todos los derechos reservados`).
- [ ] **Step 3:** Con las 4 pantallas aprobadas y registradas en el spec §5, recién ahí arranca la Fase 1.

---

# FASE 1 — Landing (`landing-page`)

Rama: `git checkout landing-page` (ya apunta al handoff).

### Task L1: Copy deck final

**Files:**
- Create: `docs/landing/01-copy-deck.md`

**Interfaces:**
- Produces: strings finales que usa L2 (se copian verbatim a `index.astro`).

- [ ] **Step 1: Escribir el archivo con este contenido**

```markdown
# Copy deck · Landing LUKA v2

> Strings aprobados. Sin eyebrow, sin microcopy en el hero, sin marquee, sin tour, sin pricing.

## Nav
- CTA: `Empezá por WhatsApp`

## Hero
- H1: `Hacete cargo de tu plata sin planillas ni culpa`
- Sub: `Escribile tus gastos como hablás y Luka los ordena: categorías, límites y balances cuando los pedís.`
- CTA primario: `Empezá por WhatsApp`
- CTA secundario: `Ver cómo funciona`

## Beneficios
- H2: `Diseñado para darte claridad, no trabajo`
- Sub: `Menos fricción, más control.`
- Tiles: `Categorías automáticas` / `Registrás en segundos` / `Límites que avisan` / `Balances claros` / `Sin planillas`

## Conflicto
- H2: `El problema no sos vos. Son las herramientas.`
- HOY: `La plata se va y no sabés bien adónde`
- CON LUKA: `Todo queda ordenado sin que hagas nada extra`

## Plan
- H2: `Escribilo y olvidate. LUKA se acuerda por vos.`
- 1: `Escribís como hablás` — `Un mensaje o un audio: «Gasté 5000 en nafta».`
- 2: `El cerebro de LUKA lo entiende` — `Detecta monto, categoría y fecha.`
- 3: `Ves todo ordenado` — `Balances, límites y gráficos cuando los pedís.`

## FAQ
- H2: `Las dudas de siempre`
- 5 pares Q/A (ver spec §3)

## Cierre
- H2: `Empezá a ordenar tu plata hoy`
- Sub: `Enviá tu primer gasto y mirá cómo Luka lo ordena.`
- CTA: `Empezá por WhatsApp`

## Footer
- `LUKA © {año} — Todos los derechos reservados` (sin link de WhatsApp, D-21)
```

- [ ] **Step 2:** `git add docs/landing/01-copy-deck.md && git commit -m "docs(landing): copy deck v2 sin eyebrow, marquee ni pricing"`

### Task L2: Guard de estructura (primero el test)

**Files:**
- Test: `src/pages/landing.test.ts`

**Interfaces:**
- Consumes: `src/pages/index.astro` como texto.
- Produces: contrato que L3 debe cumplir: ids `como-funciona`, `beneficios`, `faq`, `cierre`; CTA WhatsApp; H1; `alt`; `details`; ausencia de lo prohibido.

- [ ] **Step 1: Escribir el test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(import.meta.dirname, 'index.astro'), 'utf8');

describe('landing v2', () => {
  it('usa el CTA de WhatsApp con el número acordado', () => {
    expect(source).toContain('https://wa.me/15556378961?text=Hola%20Luka%21');
  });

  it('conserva las secciones narrativas', () => {
    for (const id of ['como-funciona', 'beneficios', 'faq', 'cierre']) {
      expect(source).toContain(`id="${id}"`);
    }
  });

  it('incluye el H1 y el plan aprobados', () => {
    expect(source).toContain('Hacete cargo de tu plata sin planillas ni culpa');
    expect(source).toContain('Escribilo y olvidate. LUKA se acuerda por vos.');
  });

  it('no menciona precios ni costos', () => {
    for (const banned of ['precio', 'costo', 'gratis', 'café', 'cafe']) {
      expect(source.toLowerCase()).not.toContain(banned);
    }
  });

  it('no incluye eyebrow ni microcopy del hero', () => {
    expect(source).not.toContain('ASISTENTE FINANCIERO POR WHATSAPP');
    expect(source).not.toContain('Sin instalaciones');
    expect(source).not.toContain('Configuración en 30 segundos');
  });

  it('no incluye marquee ni efectos de pulso', () => {
    for (const banned of ['marquee', 'pulse', 'parpade']) {
      expect(source.toLowerCase()).not.toContain(banned);
    }
  });

  it('toda imagen tiene alt', () => {
    const imgs = source.match(/<img\b[^>]*>/g) ?? [];
    for (const img of imgs) expect(img).toContain('alt=');
  });

  it('el FAQ usa details/summary nativo', () => {
    expect((source.match(/<details/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });

  it('el footer es simple y sin link de WhatsApp', () => {
    expect(source).toContain('Todos los derechos reservados');
    expect(source).not.toContain('Escribinos por WhatsApp');
  });
});
```

- [ ] **Step 2:** `npx vitest run src/pages/landing.test.ts` → Expected: **FAIL** (el `index.astro` actual no tiene `como-funciona` ni el título nuevo del plan… el H1 sí existe; falla por `como-funciona`).
- [ ] **Step 3:** Commit: `test(landing): guard de estructura, copy y prohibiciones v2`

### Task L3: Reescribir la landing

**Files:**
- Modify: `src/pages/index.astro` (reescritura completa)
- Reference: pantallas aprobadas de Fase 0, `docs/landing/01-copy-deck.md`, `src/styles/global.css` (`--font-display` ya es Gabarito)

**Interfaces:**
- Consumes: tokens (`--gradient-brand`, `--cat-*`, `--money-*`), `../components/Icon.astro` (`{name}`), copy deck.
- Produces: ids y estructura que exige L2.

- [ ] **Step 1: Reescribir `index.astro`** con este contrato de bloques:

1. **Head:** reemplazar Space Grotesk por Gabarito en el `<link>` de Google Fonts (`family=Gabarito:wght@500;700&family=Inter...`). Mantener title/description/canonical/OG (actualizar description si hace falta).
2. **Nav glass sticky** (`position: sticky; top: var(--space-4)`) con `backdrop-filter: blur(18px)`, fondo `rgba(39,28,46,.55)`, borde `--border`, radio `--radius-full`; anclas a `#como-funciona`, `#beneficios`, `#faq`; sin CTA (D-24).
3. **Hero** `id="hero"` 2 columnas: copy (H1 + sub + CTA dual) y composición. **Sin eyebrow, sin microcopy.**
4. **Beneficios** `id="beneficios"`: bento denso de 5 tiles según la pantalla aprobada, tiles con `color-mix(in srgb, var(--cat-*) 10%, transparent)`.
5. **Conflicto**: face-off HOY vs CON LUKA como escena según la pantalla aprobada. **Sin tour.**
6. **Plan** `id="como-funciona"`: riel de 3 momentos + diagrama del núcleo (nodos con `--cat-*`), H2 y copy del deck (D-20).
7. **FAQ** `id="faq"`: 5 `<details><summary>`; sin decoraciones genéricas.
8. **Cierre** `id="cierre"`: banda `--gradient-brand`, H2/sub/CTA del deck.
9. **Footer**: logo + `LUKA` + `© {año} — Todos los derechos reservados`. Sin WhatsApp (D-21).

**Mockup del teléfono (adaptación del componente 21st.dev id 23322):**

- [ ] **Step 2: Descargar el código de referencia** una sola vez con `get_component({ id: 23322 })` (consume cupo) o mirar el preview en https://21st.dev/@saurabh-2607/components/great-ui-mobile-mockup. Es React + framer-motion (MIT): **no se instala**. Extraer de ahí solo la estructura visual (chasis, isla, barra de estado) y re-implementarla en HTML/CSS:

```html
<div class="phone" aria-hidden="true">
  <div class="phone-island"></div>
  <div class="phone-status">
    <span>9:41</span><span class="phone-signal"></span>
  </div>
  <div class="phone-chat">
    <div class="bubble bubble--user">Gasté 5000 en nafta</div>
    <div class="bubble bubble--luka">Listo: nafta, $5.000 en Transporte.</div>
    <div class="mini-balance">
      <span class="mini-balance__label">Balance del mes</span>
      <span class="mini-balance__value tabular">$12.500</span>
      <span class="mini-balance__bar"></span>
    </div>
  </div>
</div>
```

CSS mínimo esperado (usar tokens): `.phone { width: 300px; border-radius: 40px; background: var(--bg-elevated); border: 1px solid var(--border-strong); box-shadow: var(--shadow-card); }`, `.phone-island { width: 96px; height: 26px; border-radius: var(--radius-full); background: var(--berry-950); margin: 10px auto; }`, burbujas con `--action`/`--bg-elevated` y `--on-action`/`--text-primary`.

- [ ] **Step 3: Movimiento (JS mínimo, ≤ 30 líneas)**: `IntersectionObserver` que agrega `data-reveal-visible` a `[data-reveal]` **solo** si `matchMedia('(prefers-reduced-motion: reduce)').matches === false`; el CSS revela con `opacity/translateY(16px)` y transición. Sin JS, el contenido ya es visible (nunca oculto por defecto).
- [ ] **Step 4:** `npx vitest run src/pages/landing.test.ts` → Expected: **PASS**.
- [ ] **Step 5:** `npm run check` → Expected: 0 errores.
- [ ] **Step 6:** Commit: `feat(landing): v2 con nav glass, mockup de telefono y plan sin pricing`

### Task L4: Validación heurística

**Files:**
- Create: `docs/landing/02-validacion.md`

- [ ] **Step 1:** Documentar: checklist CLEAR (Clarity/Layout/Emotion/Action/Relevance) con evidencia por sección; presupuesto de decisiones MECLABS (clic en CTA → 1 paso hasta WhatsApp); guion del test de 5 segundos (3 preguntas, 3 personas ajenas, planilla de resultados) y el estado del test (pendiente/ejecutado).
- [ ] **Step 2:** Commit: `docs(landing): checklist CLEAR y guion de test de 5 segundos`

### Task L5: Verificación visual y cierre de rama

- [ ] **Step 1:** Con el server local levantado (ver quirks), navegar la landing con Playwright, capturar desktop y mobile (390 px) y revisar: nav glass al scrollear, hero sin textos extra, bento sin huecos, conflicto con impacto (sin tour), plan con impacto, FAQ abriendo, cierre y footer simple.
- [ ] **Step 2:** `npm run check; npm test; npm run build` (con el server **detenido**) → todo verde.
- [ ] **Step 3:** Push y PR **solo con OK del usuario**: `git push -u origin landing-page` + `gh pr create --base main --head landing-page`.

---

# FASE 2 — Dashboard (`dashboard`) — ✅ EJECUTADA

Rama `dashboard` (mergeada a `main` en `bbfab77`): tokens Bodegón (`9c272e0`), guard anti-hex (`a8f87f0`), skeletons (`6e76096`), a11y (`eaf7833`). v1 aprobada: retoque conservador, sin cambio de layout. Las tareas D1–D4 quedan abajo como registro histórico.

### Task D1: Tokens de marca en el CSS del dashboard

**Files:**
- Modify: `src/styles/style.css`, `src/styles/admin_flows.css`, `src/components/{Stats,Transactions,Charts}.astro`, `src/pages/app.astro`, `src/layouts/AdminLayout.astro`, `src/pages/login.astro`

**Interfaces:**
- Consumes: `src/styles/tokens.css` (v2.0.0), que define `--bg-base/surface/elevated`, `--border/strong`, `--text-primary/secondary/muted`, `--accent`, `--action`, `--action-hover`, `--on-action`, `--success`, `--warning`, `--danger`, `--money-in`, `--money-out`, `--cat-*`, `--gradient-brand`, `--shadow-card/glow`, `--font-display/ui`.
- Produces: CSS sin hex legacy (lo verifica D2).

- [ ] **Step 1:** `style.css` línea 1: agregar `@import "./tokens.css";` y reemplazar el bloque `:root` legacy por:

```css
:root {
  --bg-glass-hover: rgba(245, 236, 226, 0.06);
  --border-hover:   var(--border-strong);
  --accent-primary: var(--action);
  --accent-violet:  var(--cat-ocio);
  --accent-pink:    var(--cat-ropa);
  --accent-teal:    var(--cat-salud);
  --accent-amber:   var(--warning);
  --sidebar-w:      240px;
  --header-h:       60px;
}
```

- [ ] **Step 2:** Reemplazos exactos en `style.css` (buscar → reemplazar):

| Buscar | Reemplazar |
|---|---|
| `#6366f1` | `var(--action)` |
| `#8b5cf6` | `var(--cat-ocio)` |
| `#a5b4fc` y `#c7d2fe` | `var(--accent)` |
| `rgba(99,102,241,.N)` | `color-mix(in srgb, var(--action) N%, transparent)` |
| `rgba(239,68,68,.N)` | `color-mix(in srgb, var(--danger) N%, transparent)` |
| `#f87171` (montos negativos y barras) | `var(--money-out)` en `.stat-value--negative`; `var(--danger)` en `.kpi-bar--over`, `.over-budget`, `.bar-over`, `.over-label` |
| `#fbbf24` | `var(--warning)` |
| `#fca5a5` | `var(--danger)` |
| `#94a3b8` | `var(--money-out)` |
| `rgba(245,158,11,.15)` | `color-mix(in srgb, var(--warning) 15%, transparent)` |
| `rgba(248,113,113,.15)` | `color-mix(in srgb, var(--danger) 15%, transparent)` |

- [ ] **Step 3:** `admin_flows.css`: `#818cf8`/`#a5b4fc`/`#c7d2fe` → `var(--accent)`; `#6366f1` → `var(--action)`; `#7175f5` → `var(--action-hover)`; `rgba(99,102,241,*)` → `color-mix(in srgb, var(--action) N%, transparent)`; `#5eead4`/`#99f6e4`/`rgba(20,184,166,*)` → `var(--success)` / `color-mix(...)`; rojos → `var(--danger)` / `color-mix(...)`; `#0c1120` → `var(--bg-base)`.
- [ ] **Step 4:** `Stats.astro`: `#94a3b8` → `var(--money-out)`, `#10b981` → `var(--success)`, `#f87171` → `var(--danger)`, `#f59e0b` → `var(--warning)`, `#6366f1` → `var(--action)`, `#8b5cf6` → `var(--cat-ocio)`. Eliminar `stat-value--negative` del KPI de patrimonio (el signo ya informa).
- [ ] **Step 5:** `Transactions.astro`: ingreso → `var(--money-in)`, egreso → `var(--money-out)`, categoría de ingreso `#64748b` → `var(--money-out)`.
- [ ] **Step 6:** `app.astro` (script de gráficos): ticks `#94a3b8`/`#64748b` → `cssVar('--text-secondary')`/`cssVar('--text-muted')` con `const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim()`; cartera ARS → `cssVar('--cat-servicios')`, USD → `cssVar('--cat-ingresos')`; flujo ingresos → `cssVar('--money-in')`, egresos → `cssVar('--money-out')`; en el pie usar mapa por categoría canónica (sin tildes, `Otro`→`Otros`) contra `--cat-*`, fallback al color de la API.
- [ ] **Step 7:** Barras de presupuesto: `var(--danger)` si `budget.over`, `var(--warning)` si `pct >= 80`, si no `var(--action)`.
- [ ] **Step 8:** Gabarito: cambiar el `<link>` de fuentes en `app.astro`, `AdminLayout.astro`, `login.astro`, `registro.astro` y `registro/continuar.astro` a `family=Gabarito:wght@500;700&family=Inter:...`; `font-family: var(--font-display)` en títulos de página.
- [ ] **Step 9:** `npm run check` → 0 errores. Commit: `refactor(dashboard): tokens Bodegon en CSS y componentes`

### Task D2: Guard anti-hex legacy

**Files:**
- Test: `src/styles/brand-tokens.test.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(import.meta.dirname, f), 'utf8');

describe('brand tokens en CSS legacy', () => {
  it('style.css importa tokens y no conserva la paleta legacy', () => {
    const css = read('style.css').toLowerCase();
    expect(css).toContain('@import "./tokens.css"');
    for (const hex of ['#6366f1', '#8b5cf6', '#a5b4fc', '#c7d2fe', '#080b14', '#0f1424', '#161d30', '#f1f5f9', '#94a3b8']) {
      expect(css).not.toContain(hex);
    }
  });

  it('admin_flows.css no hardcodea la paleta legacy', () => {
    const css = read('admin_flows.css').toLowerCase();
    for (const hex of ['#6366f1', '#818cf8', '#a5b4fc', '#5eead4', '#99f6e4']) {
      expect(css).not.toContain(hex);
    }
  });
});
```

- [ ] **Step 2:** `npx vitest run src/styles/brand-tokens.test.ts` → Expected: PASS tras D1.
- [ ] **Step 3:** Commit: `test(styles): guard anti-hex legacy en dashboard y admin`

### Task D3: Skeletons

**Files:**
- Modify: `src/styles/style.css`, `src/components/Charts.astro`, `src/pages/app.astro`

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
  background: linear-gradient(100deg, transparent 20%, rgba(245, 236, 226, 0.07) 50%, transparent 80%);
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

- [ ] **Step 2:** `Charts.astro`: envolver cada `<canvas>` en `<div class="chart-wrapper" data-loading="true" aria-busy="true">` con un `<div class="chart-skeleton" aria-hidden="true">` hermano, y `aria-label` en el canvas (`Gráfico de egresos por categoría`, `Egresos por mes y moneda`, `Flujo mensual de ingresos y egresos`).
- [ ] **Step 3:** `app.astro`: helper y llamadas:

```js
function markChartLoaded(containerId) {
  const wrapper = document.getElementById(containerId)?.querySelector('.chart-wrapper');
  if (wrapper) { wrapper.dataset.loading = 'false'; wrapper.setAttribute('aria-busy', 'false'); }
}
```

Llamar `markChartLoaded('card-pie' | 'card-portfolio' | 'card-flow')` en cada rama (vacío o con datos) de `fetchAndBuildCharts`; en el `catch`, dejar el skeleton y `aria-busy="false"` con el mensaje de error existente.

- [ ] **Step 4:** En `#stats-section`, antes de `<Stats/>`, insertar `<div id="stats-loading" class="stats-grid" aria-hidden="true">{Array.from({ length: 4 }).map(() => <div class="skeleton skeleton-stat" />)}</div>` y agregar `hx-indicator="#stats-loading"` al form de filtros.
- [ ] **Step 5:** En el listener `actualizarGraficos`, antes del fetch de transacciones:

```js
const txList = document.getElementById('transactions-list');
txList.setAttribute('aria-busy', 'true');
txList.innerHTML = '<div class="tx-skeleton-row"><div class="skeleton" style="height:44px;border-radius:999px"></div><div class="skeleton" style="height:16px"></div><div class="skeleton" style="height:16px"></div></div>'.repeat(5);
const txRes = await fetch(`/partials/transactions?date_from=${from}&date_to=${to}`);
txList.innerHTML = await txRes.text();
txList.setAttribute('aria-busy', 'false');
```

- [ ] **Step 6:** `npm run check` → 0 errores. Commit: `feat(dashboard): skeletons en KPIs, graficos y transacciones`

### Task D4: Accesibilidad

**Files:**
- Modify: `src/components/Icon.astro`, `src/components/Sidebar.astro`, `src/styles/style.css`

- [ ] **Step 1:** `Icon.astro`: prop opcional `label?: string`; con label → `<span role="img" aria-label={label}>`; sin label → `<span aria-hidden="true">`.
- [ ] **Step 2:** `Sidebar.astro`: logout mobile con `aria-label="Cerrar sesión"`.
- [ ] **Step 3:** `style.css`: `.tx-row { min-height: 44px; }`.
- [ ] **Step 4:** `npm run check; npx vitest run` → verde. Commit: `fix(a11y): iconos decorativos, logout mobile y filas de 44px`

### Task D5: Verificación visual y cierre de rama

- [ ] **Step 1:** Levantar server, entrar con `/dev-login`, verificar: KPIs skeleton al filtrar, gráficos con paleta Bodegón, transacciones sin rojo, límites coral/ámbar/rojo con texto, `/login` y `/admin/flujos` sin índigo.
- [ ] **Step 2:** `npm run check; npm test; npm run build` (server detenido) → verde.
- [ ] **Step 3:** Push y PR **solo con OK del usuario**.

---

## Self-Review (revisado 2026-09-26)

- **Spec coverage:** D-10/D-11 → 0.1 + L3; D-12 → 0.1 (prompt) + L2 (guard) + L3; D-13 → 0.2 + L3; D-14 → 0.1–0.4 (prompts) + L2 (guard); D-15 → 0.3 + L3; D-16 → 0.4 + L1/L2; D-17 → 0.5 + L3; D-18 → Fase 2; **D-19 → 0.3 + L3 (sin tour); D-20 → L1/L2/L3; D-21 → L1/L2/L3; D-22 → constantes de Fase 0 + prompts + L2; D-23 → Fase 0 (gate por pantalla); D-24 → 0.1 + L3**; dashboard §4 → D1–D4 ✅ ejecutado; Stitch §5 → Fase 0.
- **Placeholders:** los prompts de Stitch y los strings de copy son finales; no hay TBD.
- **Consistencia:** ids `como-funciona/beneficios/faq/cierre` coinciden entre L2/L3; `#stats-loading`/`data-loading` coinciden entre D1/D3; `--cat-*`/`--money-*` existen en tokens v2.0.0. El guard L2 exige el H2 nuevo del Plan y el footer sin WhatsApp (D-20/D-21) y el rechazo de emojis no se testea (queda en el review visual).

---

## Apéndice · Feedback de review del usuario (2026-09-25, verbatim)

- **NavBar:** sticky y flotante con glassmorphism.
- **HERO:** menos texto; el H1 está bien, pero quitar el eyebrow «ASISTENTE FINANCIERO POR WHATSAPP»; sin texto debajo de los botones; para la tarjeta del chat, incluir y adaptar el componente https://21st.dev/@saurabh-2607/components/great-ui-mobile-mockup (id `23322`).
- **MARQUEE:** no gusta, no aporta valor, aporta ruido.
- **BENEFICIOS:** no gusta la disposición; «Categorías automáticas» es muy grande y está muy vacía; rediseñar con bento cards y mayor movimiento.
- **REGLA GENERAL:** no incluir tarjetas genéricas tipo «Pulse Effect» ni puntos parpadeantes.
- **CONFLICTO y TOUR:** muy simples y genéricos; falta impacto visual.
- **PLAN DE 3 PASOS:** la frase «…menos que pedir un café» se repite con la competencia; no hablar de pricing ni costos (no es comprable aún); falta impacto y mejor representación de cómo LUKA clasifica.
- **FAQ:** bien, pero incluye una tarjeta genérica de «pulse effect»; debe ser simple y sencilla.
- **CIERRE:** gusta.
- **DASHBOARD:** en general bien, aceptable para la primera versión.

---

## Apéndice · Feedback de review del usuario (2026-09-26, verbatim)

> si revise las pantallas y tengo las siguientes correcciones:
> - NAVBAR: Quiero un diseño diferente. Que sea sticky y con diseño glassmorphism.
> - REGLA GENERAL PARA TODAS LAS SECCIONES: Sin eyebrow. Sólo título y subtítulo. No utilices componentes ni emojis genéricos.
> - HERO: Elimina el mensaje debajo de los botones de "Sin instalaciones. Configuracion en 30 segundos". A la derecha, para mostrar una demo breve, debe ocuparse y adaptarse el siguiente componente: https://21st.dev/@saurabh-2607/components/great-ui-mobile-mockup
> - MARQUEE: Eliminalo. No aporta valor y solo aporta ruido visual.
> - BENTO DE BENEFICIOS: Limpia el texto, solo quiero titulo y subtitulo. A los bentos les falta mayor impacto visual, son muy simples y sencillos. Además, el bento de "Categorías automáticas" es muy grande al pedo. Esta sección debe comprar al usuario, actualmente solo aburre al usuario.
> - CONFLICTO Y TOUR DE PRODUCTO: Esta sección debe tener mayor impacto to visual, el face-off debe ser impactante. El tour de producto es una sección que sobra, quitala.
> - PLAN DE 3 PASOS: Cambia el título por "Escribilo y olvidate. LUKA se acuerda por vos.". Y las tarjetas deben tener mayor impacto visual tambien, lucen muy simples y sencillas.
> - FAQ y Cierre: las únicas secciones aceptables que no requieren grandes modificaciones por ahora.
> - FOOTER: Debe ser simple. Logo + "LUKA" + derechos y año (2026). Nada más.
>
> Conclusión: EL diseño es muy simple, sencillo y sobre todo ABURRIDO. Esta bien que debe ser algo minimalista y evitar el ruido visual, pero hay que balancear para que no luzca tan aburrido y simple. Otra cuestión de suma relevancia que va de la mano con que sea aburrido, es que el sitio es demasiado genérico. No se esforzó ni si quiera un poco en innovar para resaltar con detalles ni componentes que resalten.
>
> Debemos iterar pantalla por pantalla para ir encontrando diseños únicos que adopten la identidad de LUKA y logren impacto visual a los usuarios.
