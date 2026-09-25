# 03 · Identidad Visual y Diseño Visceral

> **Entregable de Fase 3.** Nivel visceral (Norman): la reacción sensorial inmediata — color, forma, tipografía, aire. Un producto visualmente cálido y ordenado baja la ansiedad de mirar dinero.
> **Dirección vigente (v2 «Bodegón», 2026-09-25):** identidad **cálida rioplatense** — berenjena profunda, coral de acción, durazno y oliva. Reemplaza la paleta v1 (navy + azul `#2563EB` + esmeralda), descartada por genérica (azul/verde/gris: lenguaje de banco, no de Luka).
> **Decisiones de esta fase:** v1 cerradas 2026-09-23; **v2 re-iteradas y aprobadas 2026-09-25** (ver §10, D3.1′–D3.7).
> **Pendiente:** export del isotipo a SVG vectorial (D3.8) y adopción de tokens en el CSS del dashboard/landing (se planifica en las ramas `landing-page` y `dashboard`).
> Fuentes: `src/styles/*.css`, `src/pages/**`, `src/components/**`, `docs/marca/assets/`, `public/*`.
> Tokens: `tokens/design-tokens.json` (fuente de verdad) y `tokens/tokens.css` (implementación).

---

## 1. Principios visuales

1. **Calma sobre densidad.** Fondos profundos y cálidos, superficies limpias, aire generoso. El dinero ya estresa; el tablero no debe hacerlo.
2. **Oscuro como único tema (por ahora).** El producto vive en modo oscuro (WhatsApp de noche incluido). El tema claro queda **diferido** hasta que exista un toggle que lo consuma (D3.7); no se mantiene una variante sin verificar.
3. **El color comunica, no decora.** Cada color semántico tiene un único significado (ahorro, advertencia, gasto, error). Nunca rojo para un gasto normal.
4. **Los números son protagonistas.** Cifras tabulares, formato es-AR, jerarquía tipográfica clara.
5. **Movimiento discreto.** Micro-animaciones al servicio de la comprensión (fadeUp, feedback), nunca espectáculo.

---

## 2. Logomarca

### 2.1 Estructura de marca

| Elemento | Qué es | Estado |
|---|---|---|
| **Wordmark** | «LUKA» en Gabarito 700, tracking amplio (PNG en `public/logo-luka-texto.png`) | A rediseñar en la v2 |
| **Isotipo** | Burbuja de diálogo entrelazada que inscribe «L» y «K» en negativo, con degradado cálido coral→durazno | ✅ Integrado 2026-09-25 (PNG; master 1024×1024); SVG vectorial pendiente (D3.8) |
| **Favicon** | Derivado del isotipo: PNG 32/512 y apple-touch 180 (fondo `--berry-900`) | ✅ Regenerado 2026-09-25 con el isotipo v2 |

**Regla de convivencia:** el isotipo v2 (coral→durazno) está vigente en `public/` y `docs/marca/assets/` desde 2026-09-25; no se publican piezas nuevas con símbolos anteriores.

### 2.2 Construcción y variantes

- Construcción: burbuja de diálogo entrelazada en dos formas orgánicas que inscriben «L» y «K» en negativo; master raster `assets/isotipo-color.png` (1024×1024 px, fondo transparente).
- Colores v2 del símbolo (fijos, derivados de tokens): coral `#F0704C` (forma frontal), durazno `#F2A48C` (forma trasera), mezcla terracota `#E8805F` (superposiciones), alineados con `--gradient-brand`.
- **Objetivo de la v2:** exportar el símbolo como **SVG con rellenos editables** (`currentColor` o variables CSS) para eliminar el raster del sistema y permitir variantes mono/contraste.
- PNG derivados (`public/`): `favicon-32.png`, `favicon-512.png` (fondo transparente) y `apple-touch-icon.png` (180×180, fondo `#1B1420`).
- **Zona de resguardo:** margen mínimo = 25 % del ancho del símbolo. Nada entra en ese perímetro.
- **Tamaños mínimos:** 16 px; el master actual está verificado a 32 px (`favicon-32.png`). Por debajo de 16 px, no usar.
- **Contraste:** el símbolo exige contraste ≥ 3:1 con el fondo. Sobre fondo claro, usar la variante con contorno/knockout (a definir con el SVG); no recolorear ni aplicar filtros a mano.

### 2.3 Usos indebidos

- No rotar, estirar, inclinar ni aplicar sombras/contornos/biseles.
- No cambiar el ángulo ni los colores del degradado; no usar degradados adicionales.
- No recrear el wordmark con otra tipografía ni separarlo del isotipo dentro de una misma pieza sin respetar el lockup.
- No recolorear el isotipo con colores fuera de los tokens de marca.
- No descomponer el símbolo: no separar las formas entrelazadas, no recortar partes ni cambiar su relación de entrelazado.
- No usar el isotipo sobre fondos con contraste < 3:1 ni en tamaños menores a 16 px.
- No reutilizar símbolos anteriores (monograma K, «A» triangular, variante azul→esmeralda).

### 2.4 Cumplimiento del brief

El símbolo mantiene el brief: burbuja entrelazada, **fluidez/diálogo**, sin clichés (globo, *swoosh*, monedas, alcancías). La v2 solo cambia la familia cromática (frío → cálido) y suma vector.

---

## 3. Sistema de color

### 3.1 Decisión de psicología y semiótica

Identidad **«Bodegón»**: la mesa compartida, la sobremesa, la plata charlada. Cálida, urbana, nocturna y con calle — lo opuesto al banco.

| Rol | Color | Por qué |
|---|---|---|
| Primario / acción | **Coral** (`#F0704C`) | Energía cálida y humana; invita a actuar sin la frialdad del azul financiero |
| Acento / hover | **Durazno** (`#F2A48C`) | Detalles, links y foco; misma familia, un paso más suave |
| Logro / ahorro / ingreso | **Oliva** (`#8FBF6F`) | Verde de campo, no de semáforo: celebra sin gritar |
| Advertencia de presupuesto | **Ámbar** (`#E8B44A`) | Alerta preventiva y constructiva; no es fracaso |
| Gasto / consumo | **Gris cálido** (`#B3A3AC`) | **Nunca rojo para gastar**: el rojo genera aversión al registro |
| Error / pérdida / riesgo | **Rojo** (`#F2555A`) | Reservado a errores reales, acciones destructivas y estados críticos |
| Superficies | Berenjena `#1B1420` / `#271C2E` / `#34263C` | Profundidad cálida sin negro puro; menos fatiga visual |
| Espacio en blanco | Aire generoso (`--space-6` a `--space-16`) | Evita la sobrecarga de los tableros financieros densos |

**Reglas de oro:**
1. El rojo no se usa para egresos, montos negativos normales ni categorías; solo error/riesgo/destructivo.
2. `--danger` como **texto** solo sobre `--bg-base` (5.33:1) o `--bg-surface` (4.82:1); sobre `--bg-elevated` da 4.18:1 → acompañar con ícono o subir el fondo.
3. `--danger` y `--action` comparten calidez: nunca uno al lado del otro sin ícono y texto que los distingan (daltonismo).
4. El ámbar de advertencia y `--cat-educacion` comparten familia: no conviven en el mismo indicador.

### 3.2 Primitivos

| Token | HEX | Uso |
|---|---|---|
| `berry-950` | `#150F19` | Fondos de overlays/hero |
| `berry-900` | `#1B1420` | Fondo base |
| `berry-800` | `#271C2E` | Superficie (cards, sidebar) |
| `berry-700` | `#34263C` | Superficie elevada |
| `berry-600` | `#453154` | Bordes fuertes / hover |
| `coral-600` | `#E5613F` | Acción presionada |
| `coral-500` | `#F0704C` | Acción por defecto, gradiente |
| `coral-400` | `#F58E70` | Hover |
| `peach-300` | `#F2A48C` | Acento, gradiente |
| `olive-500` | `#8FBF6F` | Éxito / ahorro / ingreso |
| `amber-500` | `#E8B44A` | Advertencia |
| `red-500` | `#F2555A` | Error / destructivo |
| `warm-500` | `#B3A3AC` | Egreso / neutro cálido |
| `espresso-950` | `#2A0F07` | Texto sobre acción |

### 3.3 Semánticos — verificados WCAG AA

Contraste calculado con luminancia relativa WCAG 2.x (script de verificación, 2026-09-25). Umbral texto ≥ 4.5:1; no-texto ≥ 3:1.

**Tema oscuro** (sobre `bg-base #1B1420` / `bg-surface #271C2E` / `bg-elevated #34263C`):

| Token | Valor | base | surface | elevated |
|---|---|---|---|---|
| `text-primary` | `#F5ECE2` | 15.40 | 13.92 | 12.08 |
| `text-secondary` | `#D6C4D2` | 10.87 | 9.82 | 8.52 |
| `text-muted` | `#AC9BB0` | 6.91 | 6.25 | 5.42 |
| `accent` | `#F2A48C` | 8.96 | 8.10 | 7.03 |
| `action` | `#F0704C` | 6.10 | 5.52 | 4.79 |
| `success` / `money-in` | `#8FBF6F` | 8.44 | 7.62 | 6.62 |
| `warning` | `#E8B44A` | 9.47 | 8.56 | 7.43 |
| `danger` | `#F2555A` | 5.33 | 4.82 | 4.18 ⚠ |
| `money-out` | `#B3A3AC` | 7.50 | 6.77 | 5.88 |
| Botón | `#2A0F07` sobre `#F0704C` | 6.09 | — | — |
| Botón hover | `#2A0F07` sobre `#F58E70` | 7.68 | — | — |

> `--text-muted` no debe usarse para lectura continua: es para hints y metadatos.
> ⚠ `--danger` no cumple 4.5:1 sobre `bg-elevated`: usar sobre base/surface o acompañar con ícono + texto.

### 3.4 Colores de categoría (9 canónicas + Otros)

Un color por categoría, consistente entre chat (gráficos PNG), dashboard y badges. Contraste ≥ 3:1 sobre base, superficie y elevada (mínimo medido: **3.57** en `Otros` sobre elevated; el resto ≥ 4.11).

| Categoría (display, código y datos) | Valor | base | surface | elevated |
|---|---|---|---|---|
| Servicios | `#9B9BE0` | 6.99 | 6.32 | 5.48 |
| Comida | `#F0704C` | 6.10 | 5.52 | 4.79 |
| Transporte | `#7FB5C9` | 8.01 | 7.24 | 6.29 |
| Ocio | `#B08BD0` | 6.38 | 5.77 | 5.00 |
| Vivienda | `#E8A87C` | 8.84 | 7.99 | 6.94 |
| Salud | `#57C4B0` | 8.50 | 7.69 | 6.67 |
| Educación | `#E0B84A` | 9.53 | 8.61 | 7.47 |
| Ropa | `#E87FA8` | 6.88 | 6.22 | 5.40 |
| Ingresos | `#8FBF6F` | 8.44 | 7.62 | 6.62 |
| Otros (bucket de gráficos) | `#8A7C87` | 4.55 | 4.11 | 3.57 |

**Regla de nombres (D3.6, ratificada v2):** la categoría canónica se unifica **con tildes** en display, código y almacenamiento («Educación»). La migración de datos sigue pendiente en el repo `luka/`.

### 3.5 Reglas de uso del color

- Superficies: máximo 3 niveles (base/surface/elevated). Sin gradientes de fondo salvo el hero.
- Estados interactivos: hover = un paso más claro de coral; focus = borde `--accent` + halo `--shadow-glow`; disabled = `text-muted` + 40 % opacidad.
- Glassmorphism vigente: `--bg-glass` + borde `--border` sobre superficies elevadas; no usarlo en tablas de datos.
- El color nunca es la única señal de estado: siempre acompañar con texto/ícono (daltonismo).

---

## 4. Tipografía y jerarquía de escaneo

### 4.1 Familias

| Rol | Familia | Fallbacks | Estado |
|---|---|---|---|
| **Display** (marca, landing, títulos de página) | **Gabarito** (500/700) | Inter, system-ui | Nueva v2; reemplaza a Space Grotesk |
| **UI / datos** (cuerpo, números, tablas, chat) | **Inter** (400/500/600/700/800) | system-ui, `-apple-system`, Segoe UI | Sin cambios |
| **Mono** (código, comandos del bot) | **JetBrains Mono** (400/600) | Fira Code, monospace | Sin cambios |

La UI del producto no cambia de familia: Inter ya cumple legibilidad y tiene cifras tabulares. Gabarito se reserva a display (marca, landing, títulos) para no re-tematizar toda la interfaz.

### 4.2 Escala

| Token | Tamaño/Peso | Uso |
|---|---|---|
| `display-lg` | 32px / 700 / -0.02em | Título de landing/hero |
| `display-md` | 24px / 700 | Título de página |
| `heading-lg` | 20px / 700 | Título de sección/card |
| `heading-md` | 17px / 600 | Subtítulo |
| `body-lg` | 16px / 400 | Cuerpo principal |
| `body-md` | 14px / 400 | UI estándar |
| `body-sm` | 13px / 400 | Metadatos |
| `caption` | 12px / 500 | Labels, badges |
| `data` | 14px / 600 + `tnum` | Montos, tablas, KPIs |

### 4.3 Números y datos

- **Siempre cifras tabulares** (`font-variant-numeric: tabular-nums` / clase `.tabular`) para que los balances no bailen entre renders: montos, KPIs, tablas, ejes de gráficos.
- Formato es-AR: `$12.500` (miles con punto, sin decimales si son cero); decimales con coma cuando existan.
- Unidades: `%` para porcentajes, `ARS`/`USD` explícitas en contexto ambiguo.
- Alineación: montos a la derecha en tablas; KPIs con dígitos alineados en la misma columna.

---

## 5. Iconografía

- **Estilo:** line-style, grilla 24×24, trazo 1.75–2 px, esquinas y extremos redondeados, sin relleno. Set existente del frontend (`src/components/icons/`, ~25 SVG) como base oficial de UI.
- **Iconos de acción del chat:** `⏳` en proceso → `✅` éxito / `❌` error.
- **Categorías:** cada una de las 9 canónicas debe tener un ícono lineal propio, legible a 16 px en móvil, coloreado con `--cat-*`.
- **Prohibido:** emojis como iconografía de UI (se usan solo en texto del chat, `02-identidad-verbal.md` §4.4); iconos rellenos mezclados con lineales; íconos de más de 2 trazos conceptuales.

---

## 6. Componentes

### 6.1 Web (dashboard/onboarding)

| Componente | Especificación |
|---|---|
| Card / sección | `bg-surface`, radio `--radius-lg`, borde `--border`, `--shadow-card`; padding `--space-6` |
| Stat card / KPI | Label `caption` + valor `display-md` `.tabular`; badge de estado con color semántico |
| Chip | `--radius-full`, fondo `--bg-glass`, texto `caption`; «Próximamente» en `text-muted` |
| Barra de presupuesto | Riel `bg-elevated`; progreso: `action` normal, `warning` ≥ 80 %, `danger` excedido; siempre con % y monto textuales |
| Botón primario | Fondo `--action`, texto `--on-action`, radio `--radius-md`, hover `--action-hover`, focus con `--shadow-glow` |
| Botón secundario | Fondo transparente, borde `--border-strong`, texto `--text-primary` |
| Input | Fondo `bg-elevated`, borde `--border`, focus borde `--accent`; label siempre visible |
| Tabla / lista de movimientos | Filas 44 px mínimo, monto `.tabular` a la derecha, egreso en `money-out`, ingreso en `money-in`, fecha `text-secondary` |
| Empty state | Ícono lineal + frase útil («Enviá gastos a LUKA por WhatsApp para verlos acá.») + CTA |
| Alert | Fondo del tinte semántico al 12 %, borde al 30 %, ícono+texto; nunca solo color |

### 6.2 Chat (WhatsApp)

| Componente | Especificación |
|---|---|
| Confirmación | ✅ + una línea: `✅ Registré tu egreso: nafta por $5000 ARS.` |
| Alerta de límite | ⚠️ + categoría en negrita + montos; máximo 4 líneas |
| Sugerencia | 💡 + propuesta + botones («Sí, avisame» / «No, gracias») |
| Lista | 📌 + ítems con guion; máximo 10 antes de paginar |
| Gráfico | PNG 2× con paleta categórica, fondo `--bg-surface` |
| Estados de reacción | ⏳ procesando · ✅ listo · ❌ error |

---

## 7. Gráficos y datos

- **Paleta de datos:** la tabla §3.4 en el orden canónico; «Otros» siempre gris cálido; máximo 6 elementos por gráfico (5 categorías + Otros).
- **Torta:** etiquetas con nombre + %; nunca más de 6 porciones; ingreso vs egreso no se mezcla en una torta.
- **Barras:** orden descendente por monto; grilla sutil (`--border`), sin 3D ni sombras.
- **Evolución mensual:** línea/área con relleno al 12 %; máx. 24 meses.
- **Accesibilidad:** cada serie con etiqueta textual (leyenda o etiqueta directa); no depender solo del color.
- **Consistencia chat↔web:** mismo color por categoría en PNG de WhatsApp y dashboard (fuente: tokens).

---

## 8. Design Tokens

| Archivo | Rol |
|---|---|
| `tokens/design-tokens.json` | Fuente de verdad (W3C-style `$type`/`$value`), **v2.0.0** |
| `tokens/tokens.css` | Implementación lista para copiar: `:root` oscuro (+ utilidades `.tabular`) |
| `src/styles/tokens.css` | Copia sincronizada del proyecto Astro (test `src/styles/tokens.test.ts` la verifica byte a byte) |

Cobertura: color (primitivo/semántico/categórico/gradientes), tipografía, espaciado, radios, sombras, movimiento. Regla de gobernanza: **ningún valor de diseño se escribe hardcodeado en componentes**; todo sale de tokens (`05-gobernanza-manual-vivo.md` §4).

---

## 9. Migración desde el estado actual

| Actual | Valor | Destino v2 |
|---|---|---|
| Tokens v1 `navy-900`/`navy-800`/`navy-700` | `#0A1626` / `#102138` / `#17304D` | `berry-900/800/700` `#1B1420` / `#271C2E` / `#34263C` |
| `--action` v1 | `#2563EB` | `#F0704C` coral |
| `--accent` v1 | `#6EA8FF` | `#F2A48C` durazno |
| `--money-in` v1 | `#34D399` | `#8FBF6F` oliva |
| `--money-out` v1 | `#94A3B8` | `#B3A3AC` gris cálido |
| `--warning` v1 | `#FBBF24` | `#E8B44A` |
| `--danger` v1 | `#F87171` | `#F2555A` |
| Fuente display | Space Grotesk | Gabarito |
| Isotipo | PNG azul→esmeralda | PNG v2 coral→durazno vigente 2026-09-25 (master 1024×1024) + SVG (pendiente, D3.8) |
| Favicons | PNG v1 | Regenerados 2026-09-25 con el isotipo v2 |
| Tema claro (`[data-theme="light"]`) | Bloque completo v1 | **Retirado** de tokens v2 (diferido, D3.7); reponer con contraste verificado cuando exista toggle |
| Dashboard `style.css` (legacy) | indigo `#6366f1`, rojo `#f87171` en egresos | Tokens v2 (rama `dashboard`) |
| Landing `index.astro` | hero mínimo azul/soft | Rediseño con tokens v2 (rama `landing-page`) |
| Gráficos `app.astro` | colores hardcodeados | Tokens v2 (`--cat-*`, `--money-*`) |

**Alcance:** esta fase documenta y versiona los tokens. La adopción en código se ejecuta en las ramas `landing-page` (landing y CTA a WhatsApp) y `dashboard` (tokens, skeletons, a11y), con sus tests de guard.

---

## 10. Decisiones de esta fase

| # | Decisión | Estado |
|---|---|---|
| D3.1 | Paleta navy + azul `#2563EB` + esmeralda `#0E9F6E` | ⛔ **Superseded 2026-09-25** por D3.1′ |
| D3.1′ | **Paleta «Bodegón»**: berenjena + coral `#F0704C` + durazno `#F2A48C` + oliva `#8FBF6F`, semánticos verificados AA | ✅ Aprobado 2026-09-25 |
| D3.2 | Rojo prohibido para gastos; gris cálido para egreso | ✅ Vigente |
| D3.3 | Símbolo nuevo de isotipo (L/K en burbuja); K y A deprecados | ✅ Vigente |
| D3.4 | Space Grotesk (display) + Inter (UI/datos) + JetBrains Mono | ⛔ **Superseded 2026-09-25** por D3.4′ |
| D3.4′ | **Gabarito** (display) + Inter (UI/datos, tabular) + JetBrains Mono | ✅ Aprobado 2026-09-25 |
| D3.5 | Design tokens versionados en `docs/marca/tokens/` como fuente de verdad | ✅ Vigente (v2.0.0) |
| D3.6 | Categorías unificadas con tildes (display, código y datos) + color oficial | ✅ Vigente — migración de datos pendiente en `luka/` |
| D3.7 | **Tema oscuro único**; tema claro diferido hasta que exista toggle (no se versiona una variante sin contraste verificado) | ✅ Aprobado 2026-09-25 |
| D3.8 | **Símbolo vectorial (SVG)** como formato objetivo; PNG recoloreado es transitorio | ✅ Aprobado 2026-09-25 |
| D3.9 | Regla de convivencia `danger`/`action`: nunca sin ícono+texto; `danger` texto no va sobre elevated | ✅ Aprobado 2026-09-25 |

---

## 11. Anexo · Valores RGB

Conversión estándar de los HEX del sistema (sRGB 8-bit).

**Primitivos**

| Token | HEX | RGB |
|---|---|---|
| `berry-950` | `#150F19` | 21, 15, 25 |
| `berry-900` | `#1B1420` | 27, 20, 32 |
| `berry-800` | `#271C2E` | 39, 28, 46 |
| `berry-700` | `#34263C` | 52, 38, 60 |
| `berry-600` | `#453154` | 69, 49, 84 |
| `coral-600` | `#E5613F` | 229, 97, 63 |
| `coral-500` | `#F0704C` | 240, 112, 76 |
| `coral-400` | `#F58E70` | 245, 142, 112 |
| `peach-300` | `#F2A48C` | 242, 164, 140 |
| `olive-500` | `#8FBF6F` | 143, 191, 111 |
| `amber-500` | `#E8B44A` | 232, 180, 74 |
| `red-500` | `#F2555A` | 242, 85, 90 |
| `warm-500` | `#B3A3AC` | 179, 163, 172 |
| `espresso-950` | `#2A0F07` | 42, 15, 7 |

**Semánticos propios (sin primitivo equivalente)**

| Token | HEX | RGB |
|---|---|---|
| `text-primary` | `#F5ECE2` | 245, 236, 226 |
| `text-secondary` | `#D6C4D2` | 214, 196, 210 |
| `text-muted` | `#AC9BB0` | 172, 155, 176 |

**Categorías**

| Categoría | HEX | RGB |
|---|---|---|
| Servicios | `#9B9BE0` | 155, 155, 224 |
| Comida | `#F0704C` | 240, 112, 76 |
| Transporte | `#7FB5C9` | 127, 181, 201 |
| Ocio | `#B08BD0` | 176, 139, 208 |
| Vivienda | `#E8A87C` | 232, 168, 124 |
| Salud | `#57C4B0` | 87, 196, 176 |
| Educación | `#E0B84A` | 224, 184, 74 |
| Ropa | `#E87FA8` | 232, 127, 168 |
| Ingresos | `#8FBF6F` | 143, 191, 111 |
| Otros | `#8A7C87` | 138, 124, 135 |

---

## 12. Fuentes

- `src/styles/*.css`, `src/pages/**`, `src/components/**`, `public/*`, `docs/marca/assets/*`.
- Verificación de contraste: script de luminancia WCAG ejecutado 2026-09-25 (resultados en §3.3–3.4).
- Norman, D. *Emotional Design* (nivel visceral); Neumeier, M. *The Brand Gap* (originalidad/epidemias visuales); Miller, D. *Building a StoryBrand* (claridad de marca).
