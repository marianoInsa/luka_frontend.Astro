# Spec · Hero animado (mobile mockup + cards apiladas)

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-26 |
| **Estado** | Aprobado por el usuario; en implementación |
| **Alcance** | `src/pages/index.astro` (hero), `src/scripts/hero-art.ts`, tests |
| **Fuera de alcance** | Dashboard/`/app`, panel admin, repos `luka/`, analytics |
| **Origen del diseño** | Componente 21st.dev id `23322` «Great UI Mobile Mockup» (MIT, Saurabh Sharma / Great UI), re-implementado en HTML/CSS/TS vanilla con tokens LUKA |
| **Antecedente** | D-11 del spec `2026-09-25-landing-dashboard-v2-design.md` ya declaraba este componente como origen del teléfono del hero |

## 1. Contexto

El hero tiene dos tarjetas superpuestas: `.mini-dash` («Gastos de octubre») y `.phone` (chat estático de un solo intercambio). El teléfono ya fue adaptado del componente de 21st (D-11) pero le faltan el chrome completo y la animación. Se quiere: completar la adaptación, animar un flujo de carga de gastos e ingresos, renombrar el Dashboard y permitir traer al frente cualquiera de las dos tarjetas con click.

## 2. Decisiones (usuario, 2026-09-26)

- **D-25**: En `<960px` se muestran **ambas tarjetas apiladas** (teléfono primero, Dashboard debajo); el click-to-front aplica en desktop, donde se superponen.
- **D-26**: ~~La secuencia loopea sin control de pausa~~ (superada por D-35).
- **D-27**: Paleta **identidad LUKA** (tokens berry/coral/oliva), no el verde WhatsApp del original.
- **D-28**: El **teléfono arranca al frente** (sin cambio visual inicial).
- **D-29**: La tarjeta «Gastos de octubre» pasa a llamarse **«Dashboard»**.
- **D-30**: Sin dependencias nuevas; sin frameworks; JS mínimo en `src/scripts/hero-art.ts` (patrón `admin-flows.ts`).
- **D-31** (2026-09-26, formato WhatsApp): El chat mantiene el **tema LUKA** (colores de marca); en 2026 WhatsApp permite temas de chat con colores/fondos propios, así que no es una infracción de formato.
- **D-32**: El balance del último mensaje va como **texto en la misma burbuja** (`Balance del mes: *$805.000*`, ver D-37), sin barra de progreso.
- **D-33**: Header con **`Cuenta comercial`** (un número de Cloud API es Business Account); el indicador de escritura es el oficial: **logo + tres puntos al pie del chat**.
- **D-34**: **Sin emojis**; negrita = `*texto*` de WhatsApp; **ticks azules de leído** en los mensajes del usuario; foto de perfil del chat = `/logo-luka.png` (mismo asset que nav/footer).
- **D-35** (2026-09-26): La secuencia se reproduce **una sola vez por carga de página** (sin loop, sin hold/fade ni reset); la única forma de repetirla es recargar. Resuelve la deuda WCAG 2.2.2.
- **D-36**: El indicador de escritura muestra **solo los tres puntos** (sin foto de perfil); el logo queda únicamente como foto de perfil del header.
- **D-37** (2026-09-26): El **Dashboard refleja los datos del chat** con 4 categorías (Comida `$20.000` 44,4%, Servicios `$12.000` 26,7%, Ocio `$8.000` 17,8%, Transporte `$5.000` 11,1%; total `$45.000`), donut con los **tokens oficiales** por categoría (periwinkle y violeta quedan como el par más parecido; cada barra mantiene color + label) y centro `100% / total`, barras con montos y pie `Balance del mes $805.000`; el título reemplaza el punto coral por un ícono de hamburguesa decorativo (la tarjeta entera es el control de stack). Comida y Ocio son valores ficticios que no aparecen en el chat; el chat cierra solo con `Balance del mes: *$805.000*` para no contradecir el total.

## 3. Diseño

### 3.1 Markup
- `.hero__art` deja de ser `aria-hidden`: pasa a `role="group" aria-label="Vista de producto"` con `data-hero-cards`.
- Cada tarjeta conserva su div (`.mini-dash`, `.phone`) + clase `.stack-card` + `data-card` y suma un `<button class="stack-card__hit" aria-pressed>` superpuesto (`inset: 0`) como único control clickeable (patrón stretched-link; HTML válido, sin interactivos anidados). El contenido visual interno queda `aria-hidden="true"`.
- Teléfono: se conservan `.bubble`, `.chat__day`, `.phone__input`; se portan del original: botones laterales, barra de estado con 3 SVG, header y home indicator. Estado final (D-31..D-36): foto de perfil `/logo-luka.png`, `Cuenta comercial`, indicador de escritura solo con puntos, hora + ticks azules y sin íconos/barras custom en las burbujas.
- Secuencia: segmentos en orden DOM con `data-seg="user|reply|typing"` y `data-seq` en el teléfono.

### 3.2 CSS
- Stack (solo `≥960px`): `.stack-card` transiciona `transform/box-shadow/filter`; `.is-front` → `z-index: 2` + sombra fuerte; detrás → `scale(.98) translateY(10px)` y brillo levemente menor. Anulado en `prefers-reduced-motion`.
- Mobile: ambas tarjetas `position: static`, grid con gap, teléfono primero.
- Animación: `.hero-js` (clase en `<html>`, la agrega el script inline del head si no hay reduced-motion) oculta los `[data-seg]`; `.is-on` los muestra con transición opacity/transform. Clases y keyframes sin los substrings prohibidos por `landing.test.ts` (`pulse`, `parpade`, `marquee`).
- Sin JS o con reduced-motion: el chat queda en estado final estático (progressive enhancement).

### 3.3 JS (`src/scripts/hero-art.ts`)
- `runSequence(count, step, apply)`: planificador puro con un `setTimeout` encadenado; `apply(i)` por segmento y **termina tras el último** (D-35). Complejidad ciclomática ≤ 2.
- `initStack(root)`: delegación de click sobre los botones; toggle `.is-front` + `aria-pressed`. CC ≤ 2.
- Adapter DOM: en cada `apply`, limpia `typing` y marca el segmento actual con `.is-on`; `IntersectionObserver` (threshold 0.3, `disconnect()` al primer intersect) arranca la secuencia una sola vez si `hero-js` está presente. CC ≤ 3.

### 3.4 Copy de la secuencia (una pasada: 9 segmentos × 1,1 s ≈ 10 s; queda el estado final, D-35)

| # | Segmento | Texto |
|---|---|---|
| 1 | user | `Cobré 850000 de sueldo` |
| 2 | reply | `Listo: sueldo, *+$850.000* en *Ingresos*.` |
| 3 | user | `Gasté 5000 en nafta` |
| 4 | reply | `Listo: nafta, *$5.000* en *Transporte*.` |
| 5 | user | `Pagué 12000 de internet` |
| 6 | reply | `Listo: internet, *$12.000* en *Servicios*.` + `Balance del mes: *$805.000*` |

Sin palabras prohibidas por el guard de la landing, sin precios ni emojis.

### 3.5 Formato WhatsApp (2026-09-26)

Investigación (sep 2026): iOS con Liquid Glass y burbujas más redondeadas; temas de chat con
colores/fondos propios; indicador de escritura oficial = tres puntos al pie + foto de perfil;
ticks 1 gris/2 grises/2 azules; formato de texto `*negrita*`/`_cursiva_`/`~tachado~`/mono/listas;
Cloud API permite texto, media, reacciones, ubicación, contactos, interactivos y plantillas
(no SVG custom ni barras). Adaptación aplicada:

- Eliminados el check SVG dentro de las burbujas (`.bubble__check`), la barra de balance
  (`.mini-balance`) y el color de texto verde (`.money-in`).
- Agregados: hora en las respuestas, ticks azules de leído en los mensajes del usuario,
  logo LUKA como foto de perfil (header e indicador de escritura), `Cuenta comercial`,
  burbujas sin borde y con radio 18px/4px (estilo iOS 2026).
- El indicador de escritura muestra solo los tres puntos, sin foto de perfil (D-36).

## 4. Verificación

- `src/scripts/hero-art.test.ts`: planner con `vi.useFakeTimers()` (orden y corte tras el último segmento).
- `src/pages/landing.test.ts`: título `Dashboard`, ausencia de `Gastos de octubre`, `data-card`, `data-seq`, `data-seg="typing"`, strings de la secuencia, guardas de formato WhatsApp (sin `bubble__check`/`mini-balance`/`tabular money-in`; con `Cuenta comercial`, `bubble__ticks` y el balance como texto) y ≥4 usos de `logo-luka.png`.
- `npm run check`, `npm test`, `npm run build`.
- Playwright: desktop 1440 (click-to-front en ambas direcciones, una pasada sin repetición) y mobile 390 (ambas apiladas); `emulateMedia({ reducedMotion: 'reduce' })` → estado final estático.

## 5. Deuda

- Si el bundle JS no carga, los segmentos quedan ocultos (misma dependencia que el `reveal-ready` existente).
