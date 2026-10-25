# Hero Cotorras: vuelo de ida y vuelta

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Do not commit or push unless the user explicitly requests it.

**Goal:** Cambiar el vuelo de las cotorras ASCII para que recorran el Hero de izquierda a derecha, giren en U y vuelvan de derecha a izquierda en bucle, de forma independiente por ave.

**Architecture:** El cambio vive en el modelo puro `hero-birds-model.ts`: agrega dirección, viraje y carril por ave y reemplaza el resorte horizontal por un margen de giro que cubre la caja rotada completa. En `hero-birds.ts` el carril se elige al montar dentro de la franja visible y con el barrido de la U adentro, el tick corre el clamp de caja completa como red (no debe corregir nunca) y todos los componentes del Hero entran como obstáculos: blur siempre desde la primera celda de tinta cubierta, opacidad sólo sobre texto y controles translúcidos. El scheduler y los controles no se modifican salvo que un test lo exija.

**Tech Stack:** TypeScript, Vitest, Playwright. Sin dependencias nuevas.

## Global Constraints

- Rama actual: `feat/hero-cotorras`, HEAD base `7e995f7`.
- No tocar `main`, backend, package/lockfiles, tokens, `public/`, Astro config ni wrangler.
- No commits, push ni tags sin pedido explícito.
- No cambiar el aspecto ASCII, la paleta, el blur por ave, la pausa ni reduced motion.
- La silueta completa de cada ave permanece dentro del área visible del Hero (`stage = min(capa, viewport − offset de la capa, tope del arte)`); no usar wrap ni teletransporte.
- No se permite recorte de ala, cola, cabeza ni pico. El giro comienza antes del borde, sin clamp que arrastre el cuerpo.
- Todas las aves deben desenfocarse al pasar detrás de cualquier componente visible: título, subtítulo, botones, dashboard y teléfono.
- Cada ave conserva dirección, carril y viraje independientes.
- Guard de `index.astro`: no introducir los substrings `precio`, `costo`, `gratis`, `café`, `cafe`, `marquee`, `pulse`, `parpade`.
- El frame de reduced motion debe seguir siendo estático y razonable.

---

### Task 1: Patrulla horizontal izquierda-derecha con virajes en U

**Files:**
- Modify: `src/scripts/hero-birds-model.ts`
- Modify: `src/scripts/hero-birds.ts`
- Modify: `src/scripts/hero-birds.test.ts`
- Modify: `README.md`

**Interfaces:**
- Extiende `Bird` con `direction: 1 | -1`, `turn: 1 | -1`, `lane: number`.
- Mantiene sin cambios la firma de `createFlock`, `stepFlock`, `resizeFlock`, `settleFlock` y `birdBounds`.
- `hero-birds.ts`: `advanceBirds` (tick + clamp de caja), `pickLanes` (carril que contiene el barrido de la U), `resizeBirds` (proyección + banda segura) y `settleLevel` (frame estático nivelado).

**Comportamiento requerido:**
- `createFlock` distribuye las aves en el ancho, alterna dirección inicial y asigna un carril vertical estable como fracción de altura.
- `stepFlock` dirige horizontalmente hacia `0` o `π`, con una oscilación vertical leve alrededor del carril.
- Al entrar en el margen de giro, fija una nueva dirección una sola vez, elige el lado del arco y gira a velocidad angular limitada hasta completar la U.
- No hay wrap: el ave nunca reaparece por el lado opuesto.
- `clampBirdInside` corre en el tick como red de seguridad, pero con el margen correcto no debe corregir nunca (0 correcciones en los tests). También encuadra en mount, settle estático y resize.
- El comportamiento es determinista por seed y seguro ante `dt` inválido.
- El README describe el recorrido de ida y vuelta y que la silueta permanece completa.
- Legibilidad: las aves permanecen visibles y completas. No se exige un periodo nítido porque el blur es universal al pasar detrás de cualquier componente. Contraste texto/CTA ≥4,5:1.
- Carriles: se eligen al montar desde los rectángulos reales del copy (`pickLanes`), no desde fracciones fijas.
- Resize a mitad de U: sin salto (sólo proyección de layout, sin clamp de caja).
- Silueta: 0 frames con la caja rotada fuera del layer (AABB medido antes del clamp del tick), 0 correcciones del clamp y 0 tinta fuera, en todos los viewports.
- Blur: toda ave que solape título, subtítulo, CTA row, dashboard o teléfono recibe blur visible desde la primera celda de tinta cubierta (mínimo 0,5 px, máximo actual por viewport); sin excepciones por cobertura baja ni por “opaco”.
- Opacidad: sólo texto y controles translúcidos (ghost y pausa). El CTA primario opaco y los huecos de la fila de acciones reciben blur pero no atenuación.

- [ ] **Step 1: Escribir tests que fallen**

Agregar casos en `src/scripts/hero-birds.test.ts`:
- `makeBird` y fixtures incluyen `direction`, `turn`, `lane`.
- `createFlock` alterna direcciones iniciales y asigna carriles separados.
- Simulación de 90 s a 1200×700: cada ave recorre al menos 60 % del ancho, visita ambos sentidos y permanece finita dentro de límites.
- La simulación registra al menos un viraje por ave y el heading pasa por la zona de ±π/2, demostrando arco y no giro instantáneo.
- `|Δheading| <= 1.8 * dt + epsilon` en cada paso.
- `y` permanece dentro del Hero y cerca del carril (±15 % de altura).
- Misma seed produce el mismo estado; seeds distintas producen carriles/direcciones diferentes.
- `resizeFlock` conserva `lane` como fracción y no introduce NaN.
- `settleFlock` no cambia el contrato.

- [ ] **Step 2: Verificar RED**

Run: `npx vitest run src/scripts/hero-birds.test.ts`
Expected: FAIL por campos/recorrido nuevos.

- [ ] **Step 3: Implementar el modelo mínimo**

Modificar solo `hero-birds-model.ts` para satisfacer los tests. Usar márgenes proporcionales a `bird.length` y al ancho, limitar el giro a 1.8 rad/s, conservar la lógica vertical y la determinación por seed. No reescribir el sampler ni el renderer.

- [ ] **Step 4: Documentación**

Actualizar el bullet del Hero en `README.md` para describir el vuelo de ida y vuelta en U.

- [ ] **Step 5: Verificación**

Run:
```bash
npx vitest run src/scripts/hero-birds.test.ts src/pages/landing.test.ts
npm run check
npm test
npm run build
```
Expected: suite verde y build correcto.

- [ ] **Step 6: Reporte**

Escribir `.superpowers/sdd/hero-parrot-patrol-report.md` con RED/GREEN, comandos, archivos, capturas si corresponden, self-review y riesgos.

---

## Gate Playwright posterior

Un verificador independiente debe observar en Chromium 1440, 844, 800 y 390:

- Al menos un ciclo L→R→L en desktop, sin teletransporte ni pop.
- Giro en U continuo y heading correcto, sin recorte de la silueta en ningún frame.
- Todas las aves se desenfocan detrás de título, subtítulo, botones, dashboard y teléfono.
- Todas las aves reciben blur en cualquier frame con solape real contra título, subtítulo, botones, dashboard o teléfono; no hay excepción por cobertura baja: una sola celda de tinta cubierta ya exige blur > 0 (mínimo 0,5 px, sin pasar el máximo del viewport).
- El copy y los controles translúcidos (ghost, pausa) mantienen contraste AA mientras un ave los cruza. En 844×390 todas las aves quedan dentro del viewport (>30 % de tinta visible en todo frame).
- Blur y contraste siguen funcionando durante el cruce.
- Pausa durante el giro congela el frame; reanudación continúa sin salto.
- Resize a mitad de giro no produce NaN ni salto.
- Reduced motion queda estático.
- Consola limpia, sin overflow nuevo, CTA/tarjetas operativos.
- Frame time comparable al actual; aclarar limitación headless.
