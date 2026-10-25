# Hero Cotorras ASCII Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit or push.

**Goal:** Add a procedural ASCII flock of Argentine monk parakeets flying behind the Luka landing Hero, with per-bird blur while crossing behind content and an accessible pause control.

**Architecture:** Each bird is rendered procedurally to its own transparent canvas inside an absolute background layer. A pure TypeScript model owns motion, morphology, sampling, overlap, and blur math. A DOM/controller module owns fixed-step RAF, rasterization, cached content rectangles, lifecycle, pause, resize, and reduced motion. CSS `filter: blur()` is applied only to individual bird canvases; HTML content always stays above and never receives a filter.

**Tech Stack:** Astro, TypeScript, Canvas 2D, CSS, Vitest, Playwright CLI/MCP. No new dependencies.

## Global Constraints

- Repository: `luka_frontend.Astro`, branch `feat/hero-cotorras`.
- Execution kept the working tree free of commits until final user authorization. Commits are local only; no push, no tags.
- Only modify the frontend worktree. Never touch backend or database.
- Do not modify `package.json`, lockfiles, `astro.config.mjs`, `wrangler.jsonc`, `src/styles/tokens.css`, or `public/`.
- Do not publish or copy `cotorra-parada.png` or `cotorra-volando.jpg`; they are visual references only.
- No new runtime or dev dependency. Playwright is global only.
- Animation lives only in the landing Hero.
- `src/pages/landing.test.ts` forbids these substrings anywhere in `index.astro`, including CSS and comments: `precio`, `costo`, `gratis`, `café`, `cafe`, `marquee`, `pulse`, `parpade`.
- Canvas/background is decorative: `aria-hidden="true"`, no focusable children, `pointer-events: none`.
- HTML content stays above birds and must never receive a CSS filter.
- Continuous motion must have a keyboard-operable pause/resume control. Reduced motion renders a static settled frame and hides the control.
- Palette: green body/wings, gray chest/head, orange beak only. No blue, no aquatic wake, no fish, no prey, no pointer interaction.
- Preserve no-JS Hero behavior and existing chat/card interactions.
- Cap canvas DPR at 2.
- License/credit for ascii-sharks (MIT, Copyright (c) 2026 drewdi) is required when its code or substantial implementation is adapted.

---

### Task 1: Pure procedural bird model

**Files:**
- Create: `src/scripts/hero-birds-model.ts`
- Create: `src/scripts/hero-birds.test.ts`

**Interfaces:**
- Produces for Task 2/3:
  - `type BirdPart = 'body' | 'wing' | 'chest' | 'tail' | 'beak' | 'eye' | 'edge'`
  - `interface Bird { id: number; x: number; y: number; heading: number; speed: number; phase: number; flapRate: number; length: number; depth: number; seed: number; flap: number }`
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `interface ShapeSample { part: BirdPart; shade: number }`
  - `createRng(seed: number): () => number`
  - `resolveBirdCount(viewportWidth: number): 1 | 2 | 3`
  - `createFlock(count: number, width: number, height: number, seed?: number): Bird[]`
  - `stepFlock(birds: Bird[], dt: number, width: number, height: number): void`
  - `resizeFlock(birds: Bird[], count: number, width: number, height: number): Bird[]`
  - `settleFlock(birds: Bird[], width: number, height: number, seconds: number): void`
  - `birdBounds(bird: Bird): Rect`
  - `overlapRatio(bounds: Rect, obstacles: Rect[]): number`
  - `blurTarget(overlap: number, maxBlur: number): number`
  - `approach(current: number, target: number, dt: number, rate: number): number`
  - `sampleBird(bird: Bird, worldX: number, worldY: number): ShapeSample | null`
  - `glyphForShade(shade: number, part: BirdPart): string`

**Steps:**

- [ ] Write failing Vitest cases in `src/scripts/hero-birds.test.ts` covering:
  - deterministic RNG with equal seeds;
  - responsive count: 390→1, 800→2, 1440→3; boundaries 719/720 and 959/960;
  - flock count, finite coordinates, speed and depth ranges;
  - movement over time and continuous steering inside the Hero bounds without NaN;
  - resize preserving bird ids and producing the requested count;
  - `settleFlock` advancing state deterministically without running RAF;
  - `birdBounds` containing the center and returning finite dimensions;
  - `overlapRatio`: disjoint 0, contained 1, half overlap approximately 0.5, clamped 0..1;
  - `blurTarget`: 0 at no overlap, monotonic, never above `maxBlur`;
  - `approach`: converges toward target and does not overshoot materially;
  - `sampleBird`: body at center, no hit far outside, beak at the front, wings symmetric at zero bank, long tail behind;
  - `glyphForShade`: returns only characters from the documented ASCII ramps.
- [ ] Run `npx vitest run src/scripts/hero-birds.test.ts` and confirm it fails because the module does not exist.
- [ ] Implement the minimum pure model that passes. Use 12 body nodes or equivalent articulated heading; body undulation must be subtle, not fish-like. Wing phase is independent at roughly 1.4–2.0 Hz with short glide envelopes. Heading turns smoothly; birds steer back from bounds instead of wrapping.
- [ ] Run `npx vitest run src/scripts/hero-birds.test.ts`; expect all tests passing.
- [ ] Run `npm run check`; expect 0 errors.
- [ ] Write full report to `.superpowers/sdd/task-1-report.md` and return status, test counts, files changed, concerns.

---

### Task 2: Static Hero integration and recognizable silhouette

**Files:**
- Create: `src/scripts/hero-birds.ts`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/landing.test.ts`

**Interfaces:**
- Consumes every export from Task 1.
- Produces `startHeroBirds(): { pause(): void; resume(): void; destroy(): void } | null` (lifecycle may be extended in Task 3).
- Adds markup hook `[data-hero-birds]` and control hook `[data-hero-motion]`.

**Steps:**

- [ ] Add source assertions first in `src/pages/landing.test.ts`: Hero contains `data-hero-birds`, the layer has `aria-hidden="true"`, and Hero contains `data-hero-motion` with text `Pausar animación`. Keep the existing forbidden-substring guard green.
- [ ] Run `npx vitest run src/pages/landing.test.ts`; expect failure on the new assertions.
- [ ] In `src/pages/index.astro`, insert `<div class="hero__birds" data-hero-birds aria-hidden="true"></div>` as first child of the Hero section. Add the pause button after the existing CTA links in `.hero__actions`; native `<button type="button" data-hero-motion disabled>`, visible text, 44px minimum target, inline pause/play SVG, no `aria-pressed`, hidden until `hero-js`.
- [ ] Add Hero-scoped CSS: Hero `position: relative; isolation: isolate`; birds layer `position:absolute; inset:0; z-index:0; overflow:hidden; pointer-events:none`; copy/art `position:relative; z-index:1`. Button styles and focus-visible state. Do not add banned substrings in comments or classes.
- [ ] Implement static rendering in `src/scripts/hero-birds.ts`: create 1–3 transparent canvas layers from `resolveBirdCount`, fixed deterministic flock, per-bird fixed box, DPR cap 2, system monospace, cell width 8–13 px, 5 samples per cell, coverage threshold, color block plus dark glyph, palette green/gray/orange. Draw one frame only; no RAF yet.
- [ ] Use a recognizable monk-parakeet top-down silhouette: rounded head, short hooked orange beak, gray face/chest, green body/wings, two broad wings with separated tip feathers, very long tapered tail. No crest. Do not use the reference images as runtime assets.
- [ ] Ensure missing canvas context or missing DOM fails silently: Hero unchanged, button hidden/disabled, no thrown error.
- [ ] Run `npx vitest run src/pages/landing.test.ts src/scripts/hero-birds.test.ts`; expect all passing.
- [ ] Run `npm run check`; expect 0 errors.
- [ ] Write full report to `.superpowers/sdd/task-2-report.md` and return status, test counts, files changed, concerns.

---

### Task 3: Flight loop, per-bird blur, pause, and lifecycle

**Files:**
- Modify: `src/scripts/hero-birds.ts`
- Modify: `src/scripts/hero-birds-model.ts` only if Task 1 tests expose a missing helper
- Modify: `src/scripts/hero-birds.test.ts`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Consumes Task 1/2 exports.
- `startHeroBirds` returns a controller with `pause`, `resume`, `destroy`.
- Button state: `data-paused="true|false"` and visible label switches between `Pausar animación` and `Reanudar animación`.

**Steps:**

- [ ] Add failing pure tests for any new timing/blur helper. Keep all existing model tests green.
- [ ] Implement fixed timestep `1/60`, max 4 substeps, dt clamp 0.1 s, `requestAnimationFrame`; reset timestamp and accumulator on resume to avoid jumps.
- [ ] Implement per-bird rasterization each frame into its own fixed-size canvas. Position with subpixel `translate3d`; quantize glyph cells to integers. Cap DPR at 2.
- [ ] Cache obstacle rectangles relative to the birds layer for `.hero__copy h1`, `.hero__copy > p`, `.hero__actions`, `.mini-dash`, `.phone`; refresh on mount, `document.fonts.ready`, layer/element ResizeObserver, and relevant layout transitions. Never call `getBoundingClientRect`, `getComputedStyle`, `offsetTop`, or similar inside the animation loop.
- [ ] Compute per-bird overlap from `birdBounds` and cached rectangles. Smooth blur with `approach`; use smoothstep and max blur 3–6 px desktop, at most 4 px mobile. Apply CSS `filter: blur(Npx)` only to that bird canvas; use `filter:none` at zero; quantize changes; set `will-change:filter` only while blurred.
- [ ] Implement pause/resume via controller and button: cancel RAF, keep last frame, keyboard-operable, update label and `data-paused`. Pause when Hero leaves viewport and when document is hidden; resume without jumping only if user did not pause.
- [ ] Implement `prefers-reduced-motion`: settle ~4 seconds, render one static frame, no RAF, hide/disable pause control. Listen for preference changes and enter/leave static mode safely.
- [ ] Resize responsive counts at existing breakpoints: <720→1, 720–959→2, ≥960→3. Rescale positions and bird lengths without NaN; avoid teleporting on tiny resizes.
- [ ] Add cleanup: cancel RAF, disconnect ResizeObserver/IntersectionObserver, remove media/query/button/document listeners, zero canvas backing stores. Guard against duplicate initialization. Handle `astro:before-swap` if present.
- [ ] Run `npx vitest run src/scripts/hero-birds.test.ts src/pages/landing.test.ts`; expect all passing.
- [ ] Run `npm run check`; expect 0 errors.
- [ ] Write full report to `.superpowers/sdd/task-3-report.md` and return status, test counts, files changed, concerns.

---

### Task 4: Documentation, license, and regression build

**Files:**
- Create: `THIRD-PARTY.md`
- Modify: `README.md`

**Steps:**

- [ ] Add `THIRD-PARTY.md` with the full MIT license notice for `stackedlol/ascii-sharks`, Copyright (c) 2026 drewdi, and a one-line description of what was adapted.
- [ ] Update `README.md` Hero section to mention the procedural ASCII flock, pause control, and reduced-motion behavior. Do not add commercial copy or banned substrings to `index.astro`.
- [ ] Run `npm run check`; expect 0 errors.
- [ ] Run `npm test`; expect the complete suite green.
- [ ] Run `npm run build`; expect successful Cloudflare Workers build.
- [ ] Write full report to `.superpowers/sdd/task-4-report.md` and return status, test counts, build result, concerns.

---

## Independent verification gates

After Task 2 and after Task 3, dispatch a separate visual verifier using Playwright. Capture and inspect screenshots in `.superpowers/sdd/hero-cotorras/`:

- 1440×900 desktop, 800×900 tablet, 390×844 mobile.
- Static silhouette recognizability and ASCII crispness.
- Bird overlap blur, sharp recovery, content `filter:none`.
- Pause freezes canvas; resume changes frames.
- Reduced motion static; no control; no RAF movement.
- No horizontal overflow; CTA and card click-to-front remain functional; console clean.
- Chromium, Firefox, WebKit for the final gate.

Do not claim completion without test, build, and inspected screenshot evidence.
