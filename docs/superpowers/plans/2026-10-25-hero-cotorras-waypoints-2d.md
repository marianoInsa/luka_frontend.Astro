# Hero Cotorras: vuelo 2D por waypoints

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [x]`) syntax for tracking. Do not commit or push unless the user explicitly requests it.

**Goal:** Reemplazar la patrulla horizontal por navegación 2D con waypoints aleatorios estratificados, reducir las aves 20% y cambiar la ruta en cada carga, sin recortar la silueta ni romper el blur universal.

**Architecture:** El modelo puro `hero-birds-model.ts` implementa un rectángulo seguro para el centro (`R = hypot(0.92, 0.61) * L`), waypoints en 3×3 zonas, llegada con radio `>= 2 * turnRadius` y giro limitado a `1.8 rad/s`. `hero-birds.ts` conserva el rasterizado local, el blur, la opacidad y el scheduler; cambia el layout para sembrar la ruta con una semilla por carga, escala el tamaño 0.8 y elimina los carriles.

**Tech Stack:** TypeScript, Vitest, Playwright. Sin dependencias nuevas.

## Global Constraints

- Rama actual: `feat/hero-cotorras`. No tocar `main`.
- No commits, push ni tags sin pedido explícito.
- No tocar backend, `package.json`, lockfiles, tokens, `public/`, Astro config ni wrangler.
- No tocar `src/pages/index.astro`; no introducir los substrings `precio`, `costo`, `gratis`, `café`, `cafe`, `marquee`, `pulse`, `parpade`.
- Silueta completa: 0 recortes, 0 correcciones del `clampBirdInside` de silueta en la simulación.
- Blur universal intacto: toda ave que solape título, subtítulo, botones, dashboard o teléfono se desenfoca desde la primera celda de tinta; mínimo 0,5 px.
- Opacidad solo sobre texto y controles translúcidos; CTA primario y tarjetas opacas no atenúan por sí solos.
- Pausa, auto-pausa, reduced motion estático y resize siguen funcionando.
- Semilla nueva en cada carga; semilla fija en tests.
- Sin `Math.random()` dentro de `stepFlock`.
- Sin wrap ni teletransportes.

---

### Task 1: Modelo de vuelo 2D y tests puros

**Files:**
- Modify: `src/scripts/hero-birds-model.ts`
- Modify: `src/scripts/hero-birds.test.ts`

**Interfaces:**
- `Bird` quita `direction`, `turn`, `lane`.
- `Bird` agrega `targetU`, `targetV`, `zone`, `zoneSeed`, `leg`.
- Exporta `birdReach(length)`, `safeFlightRect(length, width, height)`, `arrivalRadius(speed)`, `seedFlight(birds, width, height, seed)`.
- Mantiene `createFlock`, `stepFlock`, `resizeFlock`, `settleFlock`, `birdBounds`, `clampBirdInside`, `cruiseSpeed`, `createRng`, `resolveBirdCount`.

**Comportamiento:**
- `safeFlightRect` = centro permitido para que la caja rotada completa quede dentro. `R = hypot(max(-uMin, uMax), vHalf) * L`; pad 2 px.
- `createFlock` crea aves y llama `seedFlight` con la seed.
- `seedFlight` distribuye posiciones en zonas distintas, elige primer waypoint y orienta el heading hacia él.
- `chooseWaypoint` usa una permutación seeded de 9 zonas por ciclo, evita repetir la zona anterior, elige un punto aleatorio dentro de la zona y exige `minLeg = min(0.8 * diagonal, max(arrival, 0.25 * diagonal))`.
- `arrivalRadius(speed) = max(6, 2 * speed / TURN_RATE)`.
- `stepFlock` gira al destino con `TURN_RATE`, normaliza heading, avanza y mantiene el centro dentro de `safeFlightRect` como envelope interno.
- `resizeFlock` conserva `targetU`, `targetV`, `zoneSeed`, `zone`, `leg`; solo reencuadra posiciones.
- `settleFlock` no cambia su contrato.

**Tests a reemplazar/agregar:**
- `birdReach` y `safeFlightRect` con fórmula, inset y casos degenerados.
- `seedFlight` determinista; seeds distintas cambian rutas; 3 aves en zonas distintas.
- `arrivalRadius >= 2 * speed / TURN_RATE`.
- `stepFlock`: giro limitado, llegada cambia waypoint, heading normalizado, sin NaN, dt inválido, altura 0.
- Integración 90 s por viewport y seed: 0 AABB fuera, 0 correcciones del clamp, 0 teleports, giro <= 1.8*dt, `legs >= 3`, `zones >= 3`, signos de `dx` y `dy` positivos y negativos, recorrido >= 30% del rect seguro.
- Viewports: `1440x900`, `800x900`, `390x844`, `844x329`, `390x552`, `390x450`, `320x800`.
- Seed fija => misma trayectoria; seed distinta => distinta.
- Resize: conserva destinos y no recorta.

- [x] **Step 1: Escribir tests que fallen**
- [x] **Step 2: Verificar RED** con `npx vitest run src/scripts/hero-birds.test.ts`
- [x] **Step 3: Implementar el modelo**
- [x] **Step 4: Verificar GREEN** con el mismo comando.

---

### Task 2: Renderer, escala 20%, semilla por carga y limpieza

**Files:**
- Modify: `src/scripts/hero-birds.ts`
- Modify: `src/scripts/hero-birds.test.ts`
- Modify: `README.md`

**Interfaces:**
- `BIRD_SIZE_SCALE = 0.8`.
- `displayLength(width, height, depth, scale = BIRD_SIZE_SCALE)` exportada.
- `layoutHeroBirds(width, height, dpr, settleSeconds, seed = SEED)`.
- `resizeBirds(birds, count, width, height, scaleX, scaleY, seed = SEED)`.
- `createLoadSeed()` exportada.
- Borrar `pickLanes`, `applyLanes` y usos de `turnMargin`.
- `resizeFlock` recibe seed opcional.

**Comportamiento:**
- `startHeroBirds` calcula una seed por montaje y la usa en layout y resize.
- `resizeBirds` conserva destinos normalizados y reencuadra posiciones en el nuevo rect seguro.
- URL bar: escala `y` por ratio de stage y reencuadra en el rect seguro; no reconstruye.
- `settleLevel`: settle de 4 s y heading al horizontal más cercano; frame estático.
- No tocar `paintBirdFrame`, `blurTarget`, `opacityForOverlap`, `OBSTACLES`, scheduler, pausa ni canvas.

**Tests a agregar:**
- `layoutHeroBirds` escala 80% y conserva cajas/celdas.
- Misma seed igual; seeds distintas cambian destinos.
- `resizeBirds` conserva `targetU/V/zoneSeed/leg`; sin recorte; sin NaN.
- `settleLevel` horizontal y dentro del rect.
- Tests de blur/opacidad/scheduler existentes siguen verdes.

- [x] **Step 1: Escribir tests que fallen**
- [x] **Step 2: Verificar RED**
- [x] **Step 3: Implementar renderer**
- [x] **Step 4: Actualizar README**
- [x] **Step 5: Verificar GREEN**

---

### Task 3: Verificación completa y Playwright

**Files:**
- Create: `.superpowers/sdd/hero-parrot-waypoints-report.md`
- Create (temporales): `/tmp/opencode/hero-waypoints/*.mjs`

- [x] `npx vitest run src/scripts/hero-birds.test.ts src/pages/landing.test.ts`
- [x] `npm run check`
- [x] `npm test`
- [x] `npm run build`
- [x] Levantar `npx wrangler dev --port 4321` y validar con Playwright:
  - 1440×900, 800×900, 390×844, 844×390.
  - 60–90 s de observación.
  - Tinta real dentro del Hero; 0 recortes.
  - Cada ave recorre varias zonas y cambia de dirección.
  - Dos recargas producen rutas distintas.
  - Blur > 0 en todo frame con tinta sobre título, subtítulo, botones, dashboard o teléfono.
  - Opacidad solo en texto/controles translúcidos.
  - Pausa, reduced motion, resize, consola, overflow y contraste.
- [x] Escribir reporte con comandos, resultados, capturas y riesgos.

---

### Task 4: Review final

- [x] Reviewer independiente sobre el diff completo.
- [x] Corregir Critical/Important y re-review.
- [x] Reporte final. No commit.
