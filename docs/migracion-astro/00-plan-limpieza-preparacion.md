# 00 · Plan de migración a Astro

| Campo | Valor |
|---|---|
| **Objetivo** | Migrar el frontend de LUKA (FastAPI + Jinja2 + HTMX) a Astro SSR, con landing pública, sin cortar el servicio en producción. |
| **Estado** | `v2.0` — 2026-09-23. Reescribe por completo la v1.0 (ver §14). |
| **Estrategia** | Strangler Fig con **facade transitorio en FastAPI**; cutover incremental por área. |
| **Alcance** | Repositorio `luka_frontend`: landing, registro/onboarding, dashboard, APIs de gráficos, export CSV y panel de flujos. No incluye cambios en el repo `luka/` (bot de WhatsApp) ni en el esquema de la base compartida. |
| **Documentos relacionados** | `01-inventario-paridad.md` (contrato de paridad: 25 rutas, cookies, consultas, tests, env); `02-estado-y-siguientes-pasos.md` (estado de avance y handoff); `docs/investigacion-frameworks-js-2026.md` (base técnica); `docs/marca/` (marca y tokens). |

---

## 1. Resumen ejecutivo

El sistema actual es un frontend server-rendered de complejidad **baja-media**: 25 rutas en un solo archivo de 1.196 líneas, 12 plantillas, 3 hojas CSS y 1 archivo JS. No hay SPA, ni ORM profundo, ni colas. Todo el cómputo sensible (cookies firmadas, transacción de onboarding con `FOR UPDATE`, proxy con secreto, CSV streaming) es server-side, lo que encaja directamente con Astro SSR.

La migración se hace **por partes, con el servicio vivo**, siguiendo el patrón Strangler Fig (Fowler) y Parallel Run (Newman): Astro vive en `web/` dentro de este repositorio; FastAPI permanece operativo y actúa como **facade** (proxy inverso) hacia Astro para los paths ya migrados. Cada fase corta un área a producción, con rollback inmediato por variable de entorno, y cierra borrando el código Python de esa área tras la ventana de rollback. Un big-bang rewrite queda descartado por riesgo y por evidencia de industria (§3.1).

**Contrato de URLs decidido:** un solo dominio; `/` = landing (Astro), `/app` = dashboard (Astro). Es el único cambio de URL del sistema; el bot no cambia.

**Línea base verificada (2026-09-23):** `ruff check .` OK; `pytest` **141 passed** en el venv local. Esa es la referencia de paridad.

**Estado de avance (2026-09-24):** F0-F4 tienen el código completo; F1-F3 están validados de punta a punta contra la base real de Supabase (F3 con parallel run local contra FastAPI) y F4 con E2E local contra un backend mock; commiteados en `migration`. Próxima etapa: **deploy de `web/` y cutover de F1-F4** (F5 al cerrar la ventana de rollback). El estado detallado por fase, cómo levantar el entorno local y el checklist de los próximos pasos viven en `02-estado-y-siguientes-pasos.md`.

---

## 2. Evaluación del sistema actual

### 2.1 Stack y superficie

| Componente | Detalle | Evidencia |
|---|---|---|
| Servidor | FastAPI 0.115.5 + Uvicorn 0.32.1; `app/main.py` 1.196 líneas | `requirements.txt`, `app/main.py` |
| Plantillas | Jinja2 3.1.4: 9 páginas + 3 parciales + 25 iconos SVG | `app/templates/` |
| Reactividad | HTMX 2.0.3 (CDN, `defer`) — solo 3 parciales | `app/templates/base.html:12` |
| Gráficos | Chart.js 4.4.6 (CDN, `defer`) | `app/templates/base.html:13` |
| Estilos | `style.css` 25.193 B; `admin_flows.css` 9.967 B; `registro.css` 5.707 B | `static/css/` |
| JS propio | `admin_flows.js` 19.762 B (solo panel de flujos) | `static/js/` |
| Datos | SQLAlchemy 2.0.36 + `psycopg[binary]` → Postgres Supabase (pooler 6543); `app/dashboard.py` 537 líneas, 11 funciones de consulta | `requirements.txt`, `app/dashboard.py` |
| Auth | Supabase Auth (PKCE, Google OAuth) + cookie de sesión propia `luka_session` (HMAC, 7 días) + magic link del bot | `app/services/supabase_auth.py`, `app/auth.py` |
| Backend externo | API de `luka/` protegida con `FLOW_ADMIN_API_KEY` (server-side) | `app/services/conversation_flow_admin.py` |
| Despliegue | Render plan free (`render.yaml`), servicio Python con spin-down | `render.yaml` |
| CI | Ruff + pytest (Python 3.12, `DATABASE_URL=sqlite`) | `.github/workflows/ci.yml` |

### 2.2 Complejidad y puntos delicados

Lo que exige cuidado (no por tamaño, sino por semántica):

1. **Sesión con cookies**: 5 cookies, firmadas con `itsdangerous`; PKCE manual con chunking (3000 chars/chunk, máx. 8).
2. **Transacción de onboarding**: `finalize_onboarding` con `FOR UPDATE`, consumo de invitación y siembra de 9 categorías; debe ser atómica.
3. **Proxy admin**: `FLOW_ADMIN_API_KEY` nunca debe llegar al navegador; allowlist por `auth_user_id`.
4. **CSV streaming**: `yield_per(100)` hoy; en `postgres.js` se resuelve con cursor o keyset (verificado: `.cursor()` documentado).
5. **Doble fuente de identidad**: la sesión durable es propia (`luka_session`), no la de Supabase (ver §5).

### 2.3 Hallazgos heredados que condicionan el plan

| Hallazgo | Estado |
|---|---|
| `public/` (logos/favicons) no se sirve en producción (solo `static/` está montado, `app/main.py:90`) | F0/F1 lo resuelven como `publicDir` de Astro |
| `luka_session` se emite **sin `secure`** (`app/main.py:693-699,714-720`) | Se corrige en F1, condicionado a producción (sin invalidar sesiones) |
| `render.yaml` quedó alineado con `.env.example` (12 variables) y sin `MOCK_WHATSAPP_ID` | Cerrado; los valores reales se cargan en el dashboard de Render |
| `python-jose[cryptography]` sin imports en `app/` | Se elimina en F5 (o antes si se toca `requirements.txt`) |
| `get_dias_racha` retorna `0` (placeholder, `app/dashboard.py:531-536`) | No es deuda de migración; se conserva el placeholder |
| `USD_TO_ARS_RATE = 1300.0` hardcodeada (`app/dashboard.py:34-36`) | F3 mantiene la constante por paridad; cotización real es ticket aparte |
| 141 tests pasando | Línea base de paridad; no se borra Python hasta cerrar cada área |

---

## 3. Estrategia

### 3.1 Por qué incremental y no big-bang

El rewrite total está descartado por tres razones convergentes:

- **Riesgo y valor**: Fowler documenta que el reemplazo directo "goes down in flames most of the time" y que el enfoque gradual da valor a medida que avanza, con menos riesgo por componente (Fowler, *Strangler Fig*, 2024). El costo es arquitectura transitoria, y el propio Fowler lo justifica: *"While this may appear to be a waste, the reduced risk and earlier value from the gradual approach outweigh its costs"*.
- **Conocimiento acumulado**: Spolsky (2000) llama al rewrite from scratch "the single worst strategic mistake that any software company can make": *"When you throw away code and start from scratch, you are throwing away all that knowledge"*. El código actual tiene 141 tests que codifican reglas de negocio (anulados, tasas, estados de invitación) que un rewrite reintroduce con bugs.
- **Costo real del big-bang acá**: el dashboard es la única vía de acceso a los datos para usuarios reales; un corte atómico de las 25 rutas convierte cualquier regresión en una caída total, sin rollback granular.

**Objeción honesta (Microsoft)**: la guía de Azure advierte que el patrón *"might not be suitable when: You migrate a small system and replacing the whole system is simple"*. Este sistema es chico, pero el reemplazo **no** es simple: sesión con formato binario propio, contrato de DB compartido y usuarios en producción. Además el costo de la infraestructura transitoria es un archivo (~50 líneas) que se borra al final. Se acepta el patrón con los ojos abiertos.

### 3.2 Patrones aplicados

| Patrón | Aplicación concreta en LUKA | Fuente |
|---|---|---|
| **Strangler Fig** | Astro envuelve al sistema actual; el facade intercepta requests y los redirige por path a medida que se portan | Fowler 2024; Newman 2019; Microsoft Azure Architecture Center |
| **Seam** (Feathers) | El seam es la capa HTTP: `ASTRO_MIGRATED_PATHS` en FastAPI. Permite desviar flujo sin editar cada handler | Fowler, *Legacy Seam* 2024 (definición de Feathers) |
| **Transitional Architecture** | El facade y la doble sesión compatible son elementos instalados para facilitar la displacement, y se retiran al completar | Cartwright/Horn/Lewis, *Patterns of Legacy Displacement* 2024 |
| **Parallel Run** | F3 corre FastAPI y Astro con el mismo dataset y compara salidas antes de voltear el tráfico | Newman, *Monolith to Microservices*, cap. 3 |
| **Parallel Change (expand–migrate–contract)** | Aplicado a la interfaz `luka_session`: se expande (ambos verifican/firman), se migra, se contrae (queda solo Astro) | Sato, *Parallel Change* 2014 |
| **Branch by Abstraction** | El data layer se escribe detrás de un módulo (`lib/db`) que permite coexistir consultas viejas y nuevas durante el port | Newman 2019 |
| **Feature toggle por env** | Cada área se corta/revierte con una variable de entorno, sin redeploy de código | Sato 2014 (feature flags en migrate) |

Advertencias de la literatura que este plan asume explícitamente:

- Thoughtworks: la transición larga y el doble mantenimiento son el costo real; el riesgo mayor es **quedarse a mitad de camino** (sistema híbrido peor que cualquiera de los dos). Mitigación: cada fase cierra con cutover + retiro de código del área (§3.4).
- Sato: *"If the contract phase is not executed you might end up in a worse state than you started"*. Mitigación: la ventana de rollback es finita y el borrado del código Python es un entregable de cada fase, no un "algún día".

### 3.3 Arquitectura de transición: FastAPI como facade

El dominio apunta hoy al servicio FastAPI. Ese es el punto de intercepción natural: **no se agrega infraestructura nueva**.

```text
                    ┌───────────────────────────────┐
   navegador ──────▶│  FastAPI (servicio actual)    │
                    │                               │
                    │  ASTRO_MIGRATED_PATHS vacío   │──▶ handlers Python (áreas no migradas)
                    │  path migrado                 │──▶ ASTRO_ORIGIN (Astro SSR) ──▶ Supabase Postgres
                    └───────────────────────────────┘
```

- Variables en el servicio FastAPI: `ASTRO_ORIGIN` (URL HTTPS de `web/`) y `ASTRO_MIGRATED_PATHS` (lista separada por comas; prefijos; la entrada `/` es coincidencia exacta de la raíz).
- Con la lista vacía el facade es **no-op**: cero cambio de comportamiento (rollback trivial y seguro).
- El proxy reenvía método, path, query, cookies y body; devuelve status y headers crudos, incluyendo **múltiples `Set-Cookie`** (necesario para PKCE de Supabase) y `HX-Trigger` (HTMX).
- No intercepta `/static` ni paths fuera de la lista. No es un proxy abierto: solo prefijos declarados.
- `httpx==0.27.2` (ya instalado como dependencia de dev) pasa a `requirements.txt` en F1.
- Seguridad: el facade corre server-side; no expone secretos; las cookies viajan por el mismo host (no cambian de dominio), por lo que la sesión es compartida entre ambos servicios durante la transición.

### 3.4 Disciplina de contract (anti "migración a medias")

Cada fase sigue este ciclo, sin excepción:

1. Construir el área en Astro en staging.
2. Verificar paridad (tests portados + parallel run donde aplique).
3. Agregar los paths a `ASTRO_MIGRATED_PATHS` → cutover.
4. **Ventana de rollback de 2 semanas** con el código Python aún desplegado.
5. PR separado que borra el código Python del área (templates, rutas, servicios) y, si corresponde, sus tests.
6. F5 cierra: borra el facade, retira el servicio FastAPI y apunta el dominio a Astro.

---

## 4. Contrato de URLs (un solo dominio)

| Path | Hoy | Destino | Fase |
|---|---|---|---|
| `/` | dashboard | **landing** (Astro, prerender, 0 KB JS de framework) | F1 |
| `/app` | — | **dashboard** (Astro SSR) | F3 |
| `/registro`, `/registro/continuar`, `/registro/finalizar` | FastAPI | Astro (mismos paths) | F2 |
| `/auth/google`, `/auth/callback` | FastAPI | Astro (mismos paths) | F2 |
| `/login`, `/logout`, `/dev-login` | FastAPI | Astro (mismos paths) | F3 |
| `/exportar/csv`, `/api/graficos/*`, `/dashboard/actualizar`, `/partials/*` | FastAPI | Astro (mismos paths) | F3 |
| `/admin/flujos*` | FastAPI | Astro (mismos paths) | F4 |

Cambios que acompañan al contrato (F1, orden estricto):

1. Mover el dashboard FastAPI de `/` a `/app` (`app/main.py:949`) y actualizar el nav (`base.html:28`).
2. Cambiar el redirect post-login a `/app` preservando `date_from`/`date_to` (`app/main.py:691`).
3. Corregir `secure` de `luka_session` en producción (`app/main.py:693-699,714-720`).
4. Recién entonces, rutear `/` a Astro.

El bot no cambia: su link sigue siendo `/login?token=…` (mismo host, mismo path). Los bookmarks viejos a `/` caen en la landing, que ofrece CTA a `/app` (se descarta redirect condicional por sesión: mantiene la landing estática y simple).

---

## 5. Sesión y cookies

### 5.1 Hallazgo: la sesión durable es `luka_session`, no la de Supabase

Verificado en el flujo real:

- El dashboard se autentica con el magic link del bot (`/login?token=…`), que emite `luka_session` firmada con `SECRET_KEY` (`app/auth.py:23-54`), 7 días.
- Las cookies de Supabase (`luka_sb_pkce`, `luka_sb_session`) son **transitorias del registro**: al finalizar onboarding se borran (`_clear_all_onboarding_cookies`, `app/main.py:119-126,594-600`).

Consecuencia: **no se adopta `@supabase/ssr` como sesión del dashboard**. Se mantiene `luka_session`, y `@supabase/ssr` reemplaza solo el PKCE/chunking transitorio (TTL 10-15 min; sin necesidad de compatibilidad). Esto evita re-login masivo y conserva el flujo del bot.

### 5.2 Expand–contract de `luka_session`

| Fase | Estado |
|---|---|
| **Expand (F3)** | Astro **verifica y firma** `luka_session` byte-compatible (Web Crypto: HMAC-SHA1, derivación `django-concat`, base64url sin padding, TTL 7 días, comparación constant-time). Ambos servicios comparten sesiones; el rollback por path no obliga a re-loguear. |
| **Migrate (F3→F4)** | `/login`, `/logout` y `/dev-login` pasan a Astro; FastAPI sigue validando las mismas cookies para las áreas no migradas. |
| **Contract (F5)** | Al retirarse FastAPI, queda una sola implementación. `luka_session` se conserva como sesión del dashboard (el bot la necesita); no se migra a sesión Supabase. |

### 5.3 Verificación de compatibilidad (bloqueante de F3)

1. Generar vectores en Python: tokens firmados con `SECRET_KEY` fija + `auth_user_id` y timestamp conocidos (incluidos casos borde: expirado, firma corrupta, payload malformado, otro salt).
2. Astro los verifica en Vitest: acepta los válidos, rechaza los inválidos, aplica `max_age`.
3. Round-trip inverso: tokens firmados por Astro son verificados por `itsdangerous` (script Python de test).
4. Sin los 3 pasos en verde, `/app` no se corta.

Nota de seguridad: la reimplementación es código sensible (firma). Requiere comparación constant-time, verificación de firma **antes** de parsear payload, y límite de tamaño. Los tests de `test_supabase_auth.py`/`test_dashboard_login.py` son la referencia de comportamiento.

---

## 6. Decisiones

### 6.1 Cerradas (no se re-litigan)

1. **Framework**: Astro 7.3.x (`astro@7.3.4` verificado en npm) con `@astrojs/node` en modo `standalone` (v11.1.x; peer `astro ^7.2.1`). Requiere Node ≥ 22.12 (engines del paquete).
2. **Datos**: `postgres.js` (`postgres@3.4.x`) contra el pooler 6543 con `prepare: false` (documentado para PgBouncer transaction mode). Sin ORM: las migraciones pertenecen a `luka/`.
3. **Auth de onboarding**: `@supabase/ssr` (`0.12.x`, peer `@supabase/supabase-js ^2.114.0`) + `@astrojs/node`.
4. **Estrategia**: strangler con facade transitorio; cutover por área; contract por fase (§3).
5. **URLs**: un dominio, `/` landing, `/app` dashboard (§4).
6. **Sesión**: se mantiene `luka_session` con compatibilidad expand-contract (§5).
7. **Reactividad**: se mantiene HTMX 2.0.3 y los 3 parciales (paridad 1:1); Chart.js se monta con script de página como hoy. Sin framework de islas.
8. **Fecha/params**: `date_from`/`date_to` (`YYYY-MM-DD`) se conservan tal cual, incluida la propagación desde `/login`.
9. **Admin**: mismo deploy de Astro, proxy server-side con `FLOW_ADMIN_API_KEY`.
10. **Repo `luka/`**: no se toca.

### 6.2 Pendientes con criterio de cierre

| Decisión | Gate | Criterios |
|---|---|---|
| **Hosting de `web/`** | Fin de F1 (§9) | Cold start aceptable / costo / complejidad de Postgres. Recomendación por defecto: Render Web Service Node (misma plataforma); Cloudflare + Hyperdrive como alternativa si el cold start no es aceptable. |
| **Dominio canónico** | Antes de F1 en producción | `APP_BASE_URL` definitivo (HTTPS) para canonical/OG y para `redirect_to` de OAuth. |
| **Corte de `get_dias_racha`** | F3 | Se conserva placeholder `0` por paridad. |
| **Cotización USD** | Post-F3 | Se conserva `1300.0`; ticket aparte. |

---

## 7. Fases

### F0 · Scaffold de `web/` (sin producción)

**Objetivo:** proyecto Astro que compila, consume la marca y tiene CI propio.

**Tareas**
1. Crear `web/` con `astro@7.3.4` + `@astrojs/node` (standalone), TypeScript estricto, Node fijado a 22 LTS.
2. Tokens sin duplicar: `web/src/styles/global.css` importa `docs/marca/tokens/tokens.css` (Vite permite importar fuera del root; si el build no lo tolera, copia + deuda anotada).
3. Fuentes: Space Grotesk (display), Inter con cifras tabulares (UI/datos), JetBrains Mono. `tokens.css` no declara `font-family`; aprovisionar vía API de fuentes de Astro o `@font-face`.
4. Assets de marca: `publicDir` a `../public/` o copia de los 8 archivos a `web/public/`.
5. `web/.env.example` (subconjunto F0/F1): `APP_ENV`, `APP_BASE_URL`, `AUTH_COOKIE_SECURE`, `SUPABASE_URL`, `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
6. `web/README.md`: comandos, variables, relación con el resto del repo.
7. CI: job Node (install + build + test) junto al job Python existente.

**Criterios de salida**
- `npm run build` verde y sin errores de tipos.
- Página mínima renderiza con tokens en tema oscuro y `[data-theme="light"]`.
- CI de `web/` verde; job Python sigue verde (141 passed).
- `web/.env.example` y `web/README.md` existen.

**Rollback:** borrar `web/` y su job de CI. Producción intacta.

### F1 · Landing + facade + `/app` (primer cutover)

**Objetivo:** landing pública en producción y mecanismo de cutover probado, con el área más segura (estática, sin sesión, sin DB).

**Tareas (en orden)**
1. Facade en FastAPI (`app/proxy.py`): middleware/catch-all con `ASTRO_ORIGIN` + `ASTRO_MIGRATED_PATHS` (default vacío = no-op). Reenvía método/path/query/cookies/body; preserva status y headers crudos (múltiples `Set-Cookie`, `HX-Trigger`); excluye `/static`; tests unit en Python (matching de prefijos, passthrough de cookies/headers, no-op con lista vacía).
2. Mover dashboard FastAPI `/` → `/app`; nav (`base.html:28`); redirect post-login a `/app` preservando fechas (`app/main.py:691`).
3. Fix `secure` de `luka_session` en producción.
4. `httpx==0.27.2` a `requirements.txt`.
5. Landing Astro en `/`: prerender, 0 KB de JS de framework, SEO (title/description/canonical/OG), `sitemap.xml`/`robots.txt`, assets de marca, copy según `docs/marca/02-identidad-verbal.md`. Deploy estático (Render Static Site: guía oficial de Astro para Render cubre Static Site; no tiene spin-down).
6. Activar `ASTRO_MIGRATED_PATHS` con la landing completa → cutover. Valor verificado en la validación manual del 2026-09-24:
   `/,/_astro,/robots.txt,/sitemap.xml,/favicon-32.png,/favicon-512.png,/apple-touch-icon.png,/logo-luka.png`.
   (Lista de assets actualizada con el logo nuevo: se retiraron `favicon.svg`, `logo-luka.svg` y las variantes claro/oscuro/mono; se agregó `logo-luka.png`.)
   **Solo `/` no alcanza**: el HTML pasa por el facade pero sus assets (`/_astro/*.css`, logos, favicons, robots/sitemap) darían 404. En local, probar la topología con el build de Astro (`node dist/server/entry.mjs`), no con el dev server (sus URLs de Vite no se proxyean).
7. **Cerrar gate de hosting** (§9).

**Criterios de salida**
- Landing en producción sin JS de framework (verificable en el HTML del build).
- `/app` funciona igual que antes; magic link del bot aterriza en `/app`; sesiones existentes siguen válidas.
- Facade probado: con lista vacía no-op; con la lista completa la landing y sus assets responden 200 y el resto del sitio sigue local; quitar paths revierte en caliente.
- Suite Python verde (incluidos los tests nuevos del facade); CI de `web/` verde.

**Rollback:** quitar `/` de `ASTRO_MIGRATED_PATHS` (env change). El código Python del dashboard nunca se tocó.

### F2 · Onboarding: registro + OAuth + finalización

**Objetivo:** flujo público de registro completo en Astro, con acceso a DB.

**Tareas**
1. Data layer con `postgres.js`: invitación, acuerdo, usuario y siembra de 9 categorías; portar `finalize_onboarding` como transacción (`sql.begin`) con `FOR UPDATE` equivalente.
2. Páginas `/registro`, `/registro/continuar`; endpoints `/auth/google`, `/auth/callback`, `/registro/finalizar`; `@supabase/ssr` para PKCE (chunking nativo, reemplaza `luka_sb_pkce`/`luka_sb_session`).
3. Portar tests: `test_registration.py` (18), `test_onboarding_finalization.py` (21), `test_supabase_auth.py` (35) y las rutas de `test_main.py` que apliquen. Conservar aserciones de seguridad (no PII/hash, `noindex`, cookies httpOnly/lax/secure/TTL).
4. Verificar permisos del usuario de DB para las escrituras (antes de portar consultas).
5. Activar `ASTRO_MIGRATED_PATHS=/registro,/auth/` → cutover.

**Criterios de salida**
- Flujo completo contra staging Supabase: `/registro` → Google → callback → continuar → finalizar, incluidos invitación inválida/consumida/expirada y doble submit.
- Tests portados verdes en CI; tests Python equivalentes verdes (convivencia).
- Ninguna migración ni `create_all` contra Supabase desde `web/`.

**Rollback:** quitar los paths (el flujo real sigue en FastAPI, intacto).

### F3 · Sesión + dashboard + APIs + CSV

**Objetivo:** paridad 1:1 del área privada, con la sesión compatible.

**Tareas**
1. `web/src/lib/session.ts`: verificar/firmar `luka_session` byte-compatible + vectores de §5.3.
2. `/login` (consumo de token con lock), `/logout`, `/dev-login` (404 fuera de desarrollo); redirect a `/app` preservando `date_from`/`date_to`.
3. Portar las 11 consultas de `app/dashboard.py` con las notas de `01-inventario-paridad.md §4.1` (LEFT JOIN, `COALESCE`, `GROUP BY 1,2` en SQL crudo, N+1 de presupuestos → un solo `GROUP BY`). Excluir siempre `anulado_en IS NOT NULL`.
4. Dashboard `/app` con Chart.js igual que hoy; HTMX y los 3 parciales (`/dashboard/actualizar` con `HX-Trigger`, `/partials/charts`, `/partials/transactions`).
5. `/exportar/csv` con cursor/keyset (sin cargar todo en memoria), encabezado `Fecha, Monto, Moneda, Categoria, Descripcion`.
6. **Parallel run**: mismo dataset de prueba, comparar salidas FastAPI vs Astro (3 endpoints de gráficos, KPIs, CSV). Documentar cualquier diferencia antes de cortar.
7. Portar `test_dashboard_login.py` (19), `test_dashboard_queries.py` (11), `test_main.py` (2).
8. Activar `ASTRO_MIGRATED_PATHS=/app,/login,/logout,/dev-login,/api/graficos/,/exportar/,/dashboard/,/partials/` → cutover.

**Criterios de salida**
- Parallel run sin diferencias de negocio (anulados excluidos, tasa 1300, últimos 6 meses, top categoría).
- Vectores de cookie en verde (Python ↔ Astro, ambas direcciones).
- CSV byte-equivalente en encabezado y filas para el mismo dataset.
- Rollback probado; sesiones en vuelo no se invalidan.

**Rollback:** quitar los paths.

### F4 · Panel de flujos (admin) — ✅ cerrado 2026-09-24 (detalle en `02` §9)

**Objetivo:** paridad del panel admin, con secreto server-side.

**Tareas**
1. Páginas `/admin/flujos`, `/admin/flujos/nuevo`, `/admin/flujos/[flow_id]`.
2. Proxies JSON: validar, crear (201), guardar/descartar borrador, publicar, retirar. `FLOW_ADMIN_API_KEY` solo en runtime server; autorización con `FLOW_ADMIN_AUTH_USER_IDS` (CSV, case-insensitive).
3. Portar `admin_flows.js` (comportamiento del editor) y `admin_flows.css`.
4. Portar `test_conversation_flow_admin.py` (7): gate 403, listado/editor, proxies, no filtración del secreto, errores de validación.
5. Activar `ASTRO_MIGRATED_PATHS` con `/admin/` → cutover.

**Criterios de salida**
- Contrato JSON idéntico al actual (mismos códigos y forma de errores).
- El secreto no aparece en bundles, HTML ni respuestas.
- Gate de admin responde 403 a no autorizados.

**Rollback:** quitar `/admin/`.

### F5 · Contract y retiro de FastAPI

**Objetivo:** una sola implementación, sin código transitorio.

**Tareas**
1. Verificar que pasó la ventana de rollback de la última área y que FastAPI no recibe tráfico (métricas del servicio).
2. Borrar, en PRs separados por área: templates, rutas, servicios y tests Python de cada área migrada.
3. Borrar el facade (`app/proxy.py`) y apuntar el dominio al servicio Astro.
4. Retirar el servicio FastAPI de Render; `render.yaml` pasa a Node.
5. CI final: solo job de `web/`; retirar job y tests Python junto con el código.
6. Actualizar `README.md`, `.env.example` raíz y docs de migración (marcar checklist de `01 §8`).
7. Eliminar `python-jose` del requirements final (si no se hizo antes).

**Criterios de salida**
- Checklist de paridad `01 §8` cerrado.
- Cero tráfico en el servicio viejo antes de retirarlo.
- `ruff`/pytest ya no corren porque no existe código Python de app; CI de `web/` verde.
- Rollback documentado: redeploy del servicio viejo desde git mientras exista (hasta el borrado).

---

## 8. Testing y paridad

- **Contrato**: `01-inventario-paridad.md` es la lista de verificación; cada fila se marca al cortar su fase.
- **Python (existente)**: sigue verde hasta que su área se retira; es la referencia de comportamiento (141 tests).
- **Astro**: Vitest para unidades (cookies, queries con Postgres de test, proxy admin), Playwright para E2E (magic link, OAuth simulado, registro completo, dashboard, logout).
- **Facade**: tests unit en Python (matching, passthrough, no-op).
- **Cookies**: vectores generados en Python + round-trip inverso (§5.3).
- **Parallel run (F3)**: script que compara salidas old/new por endpoint y falla si hay diferencias de negocio.
- **OAuth E2E**: se simula el proveedor como hoy (`FakeSupabaseAuth`); smoke manual contra staging.

## 9. Deploy y gate de hosting

Datos verificados para la decisión (fin de F1):

| Criterio | Render Web Service (Node) | Render Static Site | Cloudflare (Pages/Workers) |
|---|---|---|---|
| Aplica a | SSR (`node ./dist/server/entry.mjs`, adaptador Node standalone) | Solo landing/prerender | SSR con `@astrojs/cloudflare` |
| Cold start | Plan free con spin-down | No (CDN) | No |
| Postgres directo | Sí, `postgres.js` + `prepare:false` al pooler 6543 | N/A | Requiere Hyperdrive (`postgres.js` lo soporta con `nodejs_compat`) o Data API |
| Landing estática | Servida por el mismo servicio | Servida por CDN | CDN |
| Complejidad operativa | Una plataforma (la actual) | Una plataforma | Plataforma nueva + pieza de conexión a Postgres |

**Recomendación por defecto:** F1 en Render Static Site (landing, sin spin-down, gratis) y desde F2, Render Web Service Node (misma plataforma, mismo pooler). **Alternativa:** Cloudflare + Hyperdrive si el cold start del dashboard resulta inaceptable; el facade funciona igual porque solo necesita un `ASTRO_ORIGIN` HTTPS. La decisión se cierra al final de F1 con métricas de la landing y prueba de latencia.

## 10. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Compatibilidad de firma `luka_session` (Python ↔ Web Crypto) | Sesiones inválidas / bypass de auth | Vectores + round-trip (§5.3); comparación constant-time; bloquea el cutover de F3 |
| Divergencia de resultados SQLAlchemy ↔ `postgres.js` | Números distintos en producción | Parallel run obligatorio en F3; dataset de prueba con anulados, multi-moneda y categorías nulas |
| Permisos del pooler para el usuario de `web/` | Consultas fallan en runtime | Verificar permisos antes de F2; sin DDL desde `web/` |
| Facade como punto único de falla | Caída total | Es el servicio actual (ya es SPOF); no-op por defecto; tests de passthrough; rollback por env |
| Doble servicio free con spin-down | Latencia y confusión de tráfico | Corte por path en el mismo dominio; staging no publicitado |
| Migración que se estanca (híbrido permanente) | Complejidad peor que cualquiera de los dos | Contract por fase con ventana finita (§3.4); F5 con criterio de cierre explícito |
| SEO en el cutover de `/` | Landing sin indexar | Canonical, sitemap y OG antes de cortar; `/app` con `noindex` |
| `luka_session` sin `Secure` | Cookie viajando sin TLS | Fix en F1 (condicionado a producción), sin invalidar firmas |

## 11. Pendientes diferidos (fuera de esta migración)

| Pendiente | Repo | Archivo | Estado |
|---|---|---|---|
| D2.6 — Copys de degradación en voz Luka | `luka/` | `app/services/dispatcher.py` (varias líneas) | Copy aprobado; implementación pendiente |
| D3.6 — Categorías con tildes + `UPDATE` de filas | Semillas en `luka_frontend/`; migración en `luka/` | `app/services/onboarding_finalization.py:19-29` | Aprobado; migración pendiente |
| STK-222 — Reacciones ✅/❌ | `luka/` | `app/api/whatsapp.py:629` | Aprobado; implementación pendiente |
| Paleta categórica de gráficos | `luka/` | `app/services/movement_chart.py:22` | A migrar a tokens categóricos |
| Cotización USD real | `luka_frontend/` (post-F3) | `app/dashboard.py:34-36` | Sin decisión de fuente; F3 mantiene constante |

## 12. Fuentes verificadas (doble verificación)

Método: cada fuente se consultó **dos veces** el 2026-09-23 (fetch directo + segunda pasada por re-fetch o por canal/página independiente). Todas respondieron 2xx y el contenido respalda la afirmación citada.

| # | Fuente | URL | 1ª verificación | 2ª verificación | Respalda |
|---|---|---|---|---|---|
| 1 | Fowler, *Strangler Fig* (22/08/2024) | `martinfowler.com/bliki/StranglerFigApplication.html` | Fetch OK; cita textual de arquitectura transitoria | Página hermana *Patterns of Legacy Displacement* (05/03/2024) y Thoughtworks enlazan y confirman el enfoque | §3.1, §3.2 |
| 2 | Fowler, *Legacy Seam* (04/01/2024) | `martinfowler.com/bliki/LegacySeam.html` | Fetch OK; definición de Feathers textual | *Patterns of Legacy Displacement* enlaza `/bliki/LegacySeam.html` y define "seam" en el mismo sentido | §3.2 |
| 3 | Cartwright/Horn/Lewis, *Patterns of Legacy Displacement* (05/03/2024) | `martinfowler.com/articles/patterns-legacy-displacement/` | Fetch OK; 4 actividades y definición de *Transitional Architecture* | *Strangler Fig* (2024) las enumera y enlaza | §3.2, §3.4 |
| 4 | Sato, *Parallel Change* (13/05/2014) | `martinfowler.com/bliki/ParallelChange.html` | Fetch OK; expand/migrate/contract + advertencia de contract | Segunda lectura directa (misma URL) + tag page de Fowler | §3.2, §3.4, §5.2 |
| 5 | Newman, *Strangler Fig Pattern* (01/12/2019) | `samnewman.io/patterns/refactoring/strangler-fig-application` | Fetch OK; "wraps around… intercepting calls" | TOC de *Monolith to Microservices* lo lista como patrón del cap. 3 | §3.2 |
| 6 | Newman, *Branch By Abstraction* (01/12/2019) | `samnewman.io/patterns/architectural/branch-by-abstraction/` | 1ª URL 404 → URL canónica verificada | El TOC del libro enlaza la URL canónica | §3.2 |
| 7 | Newman, *Monolith to Microservices* (libro) | `samnewman.io/books/monolith-to-microservices` | Fetch OK; TOC: Parallel Run (cap. 3), descomposición de DB (cap. 4) | Enlaces editoriales (O'Reilly/Amazon) presentes en la página | §3.2, §8 |
| 8 | Spolsky, *Things You Should Never Do, Part I* (06/04/2000) | `joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/` | Fetch OK; "single worst strategic mistake" textual | Segunda lectura directa (misma URL) | §3.1 |
| 9 | Microsoft, *Strangler Fig pattern* (Azure Architecture Center; `ms.date` 29/05/2026) | `learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig` | Fetch OK; façade, 4 fases, cuándo NO aplica | Markdown crudo en `MicrosoftDocs/architecture-center` (canal independiente) idéntico | §3.1, §3.2, §3.3 |
| 10 | Chandrasekaran, *Embracing the Strangler Fig* (Thoughtworks, 25/10/2023) | `thoughtworks.com/insights/articles/embracing-strangler-fig-pattern-legacy-modernization-part-one` | Fetch OK; 7 pasos, pros y contras (transición larga, migración incompleta) | Enlazada desde *Strangler Fig* de Fowler ("Further Reading") | §3.2, §10 |
| 11 | Astro, *Upgrade to v7* | `docs.astro.build/en/guides/upgrade-to/v7` | Fetch OK; Vite 8, compilador Rust, breaking changes | `registry.npmjs.org/astro/latest` → `7.3.4` | §6.1 |
| 12 | Astro, *@astrojs/node* | `docs.astro.build/en/guides/integrations-guide/node` | Fetch OK; `mode: standalone`, `dist/server/entry.mjs` | `registry.npmjs.org/@astrojs/node/latest` → `11.1.6`, peer `astro ^7.2.1` | §6.1, §9 |
| 13 | Astro, *Deploy to Render* | `docs.astro.build/en/guides/deploy/render/` | Fetch OK; la guía oficial cubre Static Site (publish `dist/client`) | Contraste con la doc del adaptador Node (SSR = Web Service) | §9 |
| 14 | Supabase, *Use Supabase Auth with Astro* | `supabase.com/docs/guides/auth/quickstarts/astrojs` | Fetch OK; `createServerClient` + `parseCookieHeader` + `Astro.cookies` + Node standalone | `registry.npmjs.org/@supabase/ssr/latest` → `0.12.7`, peer `@supabase/supabase-js ^2.114.0` | §6.1 |
| 15 | postgres.js (README oficial) | `github.com/porsager/postgres` | Fetch OK; `prepare:false` para PgBouncer transaction mode; `sql.begin`, `.cursor()`; soporte Hyperdrive | `registry.npmjs.org/postgres/latest` → `3.4.9` (Unlicense; export `workerd`) | §6.1, §7-F3, §9 |

## 13. Verificación de línea base (2026-09-23)

- `ruff check .` → *All checks passed!*
- `pytest` (venv local) → **141 passed** en 41,9 s.
- Conteos de superficie (rutas, plantillas, consultas, env, tests) verificados por lectura directa; el detalle por ruta vive en `01-inventario-paridad.md`.

## 14. Changelog respecto de v1.0

| Cambio | v1.0 | v2.0 |
|---|---|---|
| Estrategia | Fases F0-F2 con cutover atómico del área privada al final | Strangler con facade y cutover **por área** (F0-F5) |
| URLs | Pendiente; landing y dashboard competían por `/` | Un dominio: `/` landing, `/app` dashboard |
| Sesión | Pregunta abierta (`luka_session` vs Supabase) | Se mantiene `luka_session` con expand-contract verificado |
| Hosting | Pendiente sin gate | Gate al final de F1 con criterios y recomendación |
| Fases | F0 scaffold, F1 landing+registro, F2 dashboard+retiro | F0 scaffold, F1 landing+facade, F2 onboarding, F3 sesión+dashboard, F4 admin, F5 contract |
| Fuentes | Sin fundamento bibliográfico | 15 fuentes de industria verificadas 2 veces (§12) |
| Rollback | Por fase a nivel dominio | Por path, en caliente, vía env var |
