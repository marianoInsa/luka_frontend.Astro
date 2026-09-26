# Validación · Landing LUKA v2

> Checklist heurístico y guion del test de 5 segundos. Fecha: 2026-09-26.

## Checklist CLEAR

| Criterio | Evidencia | Estado |
|---|---|---|
| **Clarity** | H1 dice el beneficio («Hacete cargo de tu plata sin planillas ni culpa») y el sub explica el mecanismo (escribís como hablás → categorías, límites y balances). Una sola idea por sección; sin jerga. | ✅ |
| **Layout** | Secuencia Duarte: Hero → Beneficios → Conflicto → Plan → FAQ → Cierre. Jerarquía tipográfica Gabarito/Inter, bento denso, rail de 3 pasos. Mobile 390 px en una columna, nav sin anclas (solo marca). | ✅ |
| **Emotion** | Conflicto HOY (caos gris) vs CON LUKA (orden con color): el color es la recompensa. Movimiento discreto (reveal 16 px) anulado con `prefers-reduced-motion`. | ✅ |
| **Action** | CTA «Empezá por WhatsApp» en hero y cierre; «Ver cómo funciona» lleva al plan. Un solo CTA primario por pantalla. | ✅ |
| **Relevance** | Copy de producto real: sin testimonios, cifras inventadas ni precios. Voz rioplatense (voseo). | ✅ |

## Presupuesto de decisiones (MECLABS)

- Del H1 al CTA: **1 paso** (clic en «Empezá por WhatsApp» abre el chat con el mensaje `Hola Luka!` precargado).
- Sin registro previo, sin formularios, sin pasos intermedios.
- CTA secundario («Ver cómo funciona») no compite: es ghost y ancla a contenido, no a conversión.

## Test de 5 segundos (guion)

**Objetivo:** verificar que en 5 segundos se entiende qué es LUKA y qué hacer.

**Preparación:** mostrar solo el hero (1440 px) durante 5 segundos; después retirar la pantalla.

**Preguntas (a 3 personas ajenas al proyecto):**

1. ¿Qué es LUKA? (esperado: asistente financiero por WhatsApp)
2. ¿Qué tenés que hacer para usarlo? (esperado: escribirle por WhatsApp)
3. ¿Qué te quedó de la página? (esperado: ordenar gastos / categorías / balances)

**Planilla de resultados:**

| Persona | P1 | P2 | P3 | Observaciones |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

**Criterio de éxito:** las 3 personas responden P1 y P2 correctamente.

**Estado:** ⏳ pendiente de ejecución (requiere 3 personas ajenas; la ejecución no bloquea el deploy).
