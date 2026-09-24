# 02 · Estado actual y próximos pasos

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-24 |
| **Rama** | `migration` |
| **Fase en curso** | F3 cerrado (código + validación local) y commiteado. Próxima fase: **F4 (admin)**; el deploy y el cutover de F1-F3 quedaron diferidos hasta terminarlo (decisión 2026-09-24). |
| **Plan** | `00-plan-limpieza-preparacion.md` (v2.0) |
| **Contrato de paridad** | `01-inventario-paridad.md` (v1.1) |

Este documento es el punto de entrada para retomar la migración en otra sesión. Resume qué está
hecho, qué falta, cómo levantar el entorno y qué no hay que romper.

---

## 1. Resumen para retomar en 30 segundos

- **F0, F1, F2 y F3 tienen el código completo.** F1, F2 y F3 además están validados de punta a
  punta en local contra la base real de Supabase.
- `web/` (Astro SSR) ya sirve: landing `/` (prerender, 0 KB JS), `robots.txt`, `sitemap.xml`,
  `/registro`, `/auth/google`, `/auth/callback`, `/registro/continuar`, `/registro/finalizar`,
  `/login`, `/logout`, `/dev-login`, `/app`, `/dashboard/actualizar`, `/partials/{charts,transactions}`,
  `/api/graficos/*` y `/exportar/csv`.
- **FastAPI sigue sirviendo todo lo demás** (`/app`, `/login`, `/logout`, `/dev-login`,
  `/api/graficos/*`, `/exportar/csv`, `/partials/*`, `/admin/flujos*`) y actúa de **facade** hacia
  Astro según `ASTRO_MIGRATED_PATHS`.
- **Próximo trabajo:** **F4 (panel de flujos)** — ver §9. Con F4 listo se despliega `web/` y se hace
  el cutover de F1-F3 por etapas (el parallel run de F3 ya se hizo en local, §5.3).

## 2. Estado por fase

| Fase | Estado | Evidencia | Pendiente |
|---|---|---|---|
| **F0** scaffold | ✅ Completo | `web/` con astro@7.3.4 + @astrojs/node 11, TS estricto, tokens de marca, job CI Node (`npm ci` + check + test + build) | — |
| **F1** landing + facade | ✅ Código · ⏳ deploy | Landing prerender con SEO; facade `app/proxy.py` (`ASTRO_ORIGIN`, `ASTRO_MIGRATED_PATHS`, no-op por defecto, reescritura de `Origin`, streaming, 502); `/` → `/app`; cookie `luka_session` con `Secure` en producción. Validado con Playwright el 2026-09-24 | Deploy de `web/`; cargar `ASTRO_ORIGIN` + `ASTRO_MIGRATED_PATHS` en Render; dominio canónico |
| **F2** onboarding | ✅ Código · ⏳ cutover | Data layer `postgres.js` (`web/src/lib/onboarding.ts`); páginas/endpoints de registro con `@supabase/ssr` (PKCE) y cookies firmadas propias; 123 tests web + integración real del happy path; E2E de navegador hasta el redirect de Google | Deploy de `web/`; Redirect URLs de Supabase en prod; cutover (`/registro,/auth` ya en `.env.example`) |
| **F3** sesión + dashboard | ✅ Código · ⏳ cutover | `session.ts` byte-compatible (vectores Python↔Astro), `/login`/`/logout`/`/dev-login`, `/app` con Chart.js + HTMX y los 3 parciales, 3 APIs de gráficos, CSV keyset; 188 tests web (169 herméticos + 19 de integración) y parallel run local sin diferencias de negocio | Deploy de `web/`; cutover (`/app,/login,/logout,/dev-login,/api/graficos/,/exportar/,/dashboard/,/partials/`); ventana de rollback |
| **F4** admin | Pendiente | — | Panel `/admin/flujos*` + proxy con `FLOW_ADMIN_API_KEY` |
| **F5** contract | Pendiente | — | Retiro de FastAPI, facade y código transitorio |

## 3. Cómo levantar el entorno local

`.env` en la raíz (no se commitea) debe tener:

- `DATABASE_URL` → Postgres de Supabase por **puerto 5432**. El 6543 no acepta TCP desde esta red.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY` (32+ chars) con valores reales.
- `ASTRO_ORIGIN=http://localhost:4321` y `ASTRO_MIGRATED_PATHS` con el valor de `.env.example`.

Astro **no** lee el `.env` de la raíz (es el de FastAPI): para el dev server hace falta
`web/.env` (subset documentado en `web/.env.example`; no se commitea). El script `npm run dev`
carga ese archivo con `node --env-file-if-exists=.env`, porque en dev las variables server-only
(`DATABASE_URL`, `SECRET_KEY`) deben estar en `process.env`. `/dev-login` necesita
`MOCK_AUTH_USER_ID` existente como `usuario.auth_user_id` para mostrar datos: en la DB
compartida ya está sembrado un usuario dev para `00000000-0000-0000-0000-000000000001`
(nombre `Usuario Dev`, whatsapp `5490000000000`, 9 categorías default, 2 límites y 6 movimientos
de ejemplo).

Servicios:

```bash
# Terminal A — FastAPI (facade + rutas no migradas)
uvicorn app.main:app --reload --port 8001

# Terminal B — Astro, topología de migración (build, NO dev server)
cd web && npm run build && node dist/server/entry.mjs   # :4321
```

- Para el OAuth local, el proceso de Astro necesita además
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY` (= valor de `SUPABASE_PUBLISHABLE_KEY`) y
  `APP_BASE_URL=http://localhost:4321`; la Redirect URL `http://localhost:4321/auth/callback` debe
  estar en Supabase → Auth → URL Configuration.
- Para `/dev-login` local: `ENABLE_MOCK_AUTH=true` y `MOCK_AUTH_USER_ID` de un `usuario.auth_user_id`
  existente (si no existe, el login funciona y `/app` redirige a `/login`).
- El **dev server** de Astro (`npm run dev`) sirve la landing sin estilos a través del facade porque
  usa URLs de Vite (`/@vite`, `/src/...`) que el facade no proxya. Para desarrollar UI, usalo directo
  en `:4321`; para validar la topología, usá el build.

Tests:

```bash
.venv\Scripts\python.exe -m pytest -q                 # 175 passed (hermético)
cd web; npm run check; npm test                       # 169 passed + 19 skipped (integración)
cd web; $env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts src/lib/dashboard.integration.test.ts src/lib/login.integration.test.ts
.venv\Scripts\python.exe -m pytest tests/test_session_vectors.py -q   # vectores de sesión
```

## 4. Onboarding: qué quedó validado contra Supabase real

- `GET /registro?token=…` con invitación real → 200 con términos, cookie `luka_onboarding` firmada.
- `POST /auth/google` → 303 a `…/auth/v1/authorize?provider=google&redirect_to=…/auth/callback&code_challenge=…s256`
  y cookie PKCE de `@supabase/ssr`.
- `identity_conflict` real: una cuenta Google ya registrada con otro `whatsapp_id` es rechazada y la
  transacción **no deja efectos** (invitación intacta, cero filas nuevas).
- Happy path de `finalizeOnboarding` contra PG real (test de integración guardado): vincula identidad,
  inserta 1 aceptación, siembra 9 categorías, consume la invitación; el segundo submit devuelve
  `invitation_consumed`.
- **Dato de la DB real:** existe la FK `usuario.auth_user_id → auth.users(id)` (el modelo SQLAlchemy
  la daba por opcional). El test de integración crea y borra una fila temporal en `auth.users`.

Para repetir el flujo manual: generar un token, calcular su `sha256` y sembrar una invitación.
Limpiar después.

```sql
-- token de prueba: reemplazar <TOKEN> y <SHA256_HEX> (sha256 del token en hex)
insert into onboarding_invitacion
  (id, whatsapp_id, token_hash, estado, expira_en, intentos, reenvios, creado_en, actualizado_en)
values
  (gen_random_uuid(), 'test-dev', '<SHA256_HEX>', 'pendiente', now() + interval '1 hour', 0, 0, now(), now());

-- cleanup (respetar orden de FKs)
delete from acuerdo_aceptado where usuario_id in (select id from usuario where whatsapp_id='test-dev');
delete from categorias       where usuario_id in (select id from usuario where whatsapp_id='test-dev');
delete from onboarding_invitacion where whatsapp_id='test-dev';
delete from usuario where whatsapp_id='test-dev';
```

Luego abrir `http://localhost:4321/registro?token=<TOKEN>`. Ojo: completar el registro con una cuenta
Google ya existente en la DB termina en `identity_conflict` (comportamiento correcto).

## 5. F3 (sesión + dashboard): checklist y validación local

Checklist del plan (`00` §7-F3):

1. ✅ `luka_session` byte-compatible (`web/src/lib/session.ts`) con vectores generados en Python y
   round-trip verificado en ambos sentidos (§5.1).
2. ✅ `/login` (consumo del token con `FOR UPDATE`), `/logout` y `/dev-login` (404 fuera de
   desarrollo); redirect a `/app` preservando `date_from`/`date_to` (§5.2).
3. ✅ Consultas de `app/dashboard.py` portadas a `postgres.js` (`web/src/lib/dashboard.ts`): 10 de las
   11 funciones; `get_expenses_by_day` **no se portó** (sin uso en `main.py`, ver §5.5).
4. ✅ `/app` con Chart.js 4.4.6 y **HTMX se mantiene**: `/dashboard/actualizar` (con `HX-Trigger`),
   `/partials/charts` y `/partials/transactions` con el mismo contrato.
5. ✅ `/exportar/csv` con keyset pagination (sin cargar todo en memoria) y formato byte-parity.
6. ✅ Parallel run contra FastAPI en local (mismo dataset y misma cookie): sin diferencias (§5.3).
7. ✅ Tests portados/reescritos; equivalencias en §5.4.
8. ⏳ Cutover (pendiente de deploy de `web/`): sumar a `ASTRO_MIGRATED_PATHS`:
   `/app,/login,/logout,/dev-login,/api/graficos/,/exportar/,/dashboard/,/partials/`.

### 5.1 Sesión byte-compatible

- Formato espejado de `itsdangerous` 2.2.0: `base64url(JSON)` + `.` + timestamp big-endian +
  `.` + `HMAC-SHA1` con clave `SHA1(salt + "signer" + secret)` (derivación django-concat), salt
  `"session"`, TTL 7 días, comparación constant-time vía `crypto.subtle.verify`.
- Vectores en `web/src/lib/session.vectors.json`, generados por `tests/generate_session_vectors.py`
  (casos válido/expirado/futuro/firma corrupta/otro salt/payload no-string/malformado). Vitest exige
  que el token firmado por Astro sea **byte-idéntico** al de Python para el mismo `(secret, id, ts)`;
  `tests/test_session_vectors.py` verifica esos tokens con `itsdangerous` (7 tests nuevos en cada lado).
- Prueba real de interoperabilidad en §5.3: FastAPI aceptó la cookie emitida por Astro en `/app`,
  `/api/graficos/*` y `/exportar/csv`.

### 5.2 Rutas de auth

- `/login`: consume el token sha256 con `SELECT … FOR UPDATE` en transacción; estados inválidos
  nunca se distinguen; token vencido se marca `vencido`; el vencido/consumido actualiza
  `actualizado_en` (paridad con el `onupdate` del ORM). Con token válido: 303 a `/app` con
  `date_from`/`date_to` válidos (si cualquiera es inválido se descartan ambos) y cookie
  `luka_session` (httpOnly, Lax, path `/`, 7 días, `Secure` solo en producción).
- `/logout` borra `luka_session` y redirige 303 a `/login`; `/dev-login` responde 303 a `/app` con
  `MOCK_AUTH_USER_ID` solo con `APP_ENV=development` + `ENABLE_MOCK_AUTH=true`, si no 404 con la
  misma página de error.
- Middleware (`web/src/middleware.ts`): `/app`, `/dashboard`, `/partials`, `/api/graficos`,
  `/exportar` sin sesión válida → 303 `/login` (paridad con el 401 → `/login` de FastAPI, también
  para los endpoints JSON y el CSV).

### 5.3 Parallel run local (2026-09-24, Supabase real)

Dataset temporal (usuario + `auth.users` + categorías + límites + movimientos activos/anulados en
ARS/USD, con una descripción con coma y comilla) y la cookie firmada por Astro usada también contra
FastAPI en `:8001`:

- 3 endpoints JSON (`/api/graficos/{distribucion,cartera,flujo}`) con el mismo rango: idénticos
  (deep-equal tras parsear; Python serializa `13000.0` y JS `13000`).
- CSV (`/exportar/csv`) en mes en curso y mes anterior: **byte-idéntico** (header, quoting, `\r\n`,
  `str(float)` de Python, anulado y datos de otros usuarios ausentes).
- HTML del dashboard de Python servido con la cookie de Astro: 200 y mismos KPIs
  (patrimonio, cotización, presupuesto, categoría top).
- E2E Playwright: login válido/inválido, filtros HTMX (stats + transacciones + 3 gráficos se
  redibujan; estado vacío con rango sin datos), 3 charts montados, logout, redirects sin sesión,
  `/dev-login` en dev (303) y con `APP_ENV=production` (404, cookie `Secure`+`HttpOnly`+`Lax`+7d),
  0 errores y 0 warnings de consola.
- Cleanup verificado: 0 filas de prueba en la DB.

### 5.4 Tests portados

- `test_dashboard_login.py` (19) → `web/src/lib/session.test.ts` (18), `web/src/lib/login.integration.test.ts`
  (7) y los checks de ruta/middleware del E2E.
- `test_dashboard_queries.py` (11, 10 portados) → `web/src/lib/dashboard.integration.test.ts` (10) +
  herméticos de `dashboard.test.ts`/`dates.test.ts`/`csv.test.ts`/`format.test.ts`.
- `test_main.py`: `/login` renderiza y `/app` sin sesión → 303 `/login` cubiertos por E2E; `/` → `/app`
  lo cubre Python mientras el facade esté activo.
- Suite web: 169 herméticos + 19 de integración (3 archivos gated por `RUN_DB_INTEGRATION=1`).
- Suite Python: 175 passed (168 base + 7 vectores de sesión); `ruff` limpio.

### 5.5 Diferencias documentadas respecto de Python

1. `get_expenses_by_day` no se portó: ninguna ruta la usaba (el test asociado no se replicó).
2. CSV: se agregó desempate `id DESC` para que el keyset tenga orden total (`fecha` + `creado_en`
   pueden empatar) y `creado_en` viaja como texto para no perder microsegundos en el cursor; con el
   dataset de prueba el resultado sigue siendo byte-idéntico. No "simplificarlo" sin revisar §5.3.
3. Presupuestos: una sola query (`LEFT JOIN` + `GROUP BY`) en vez del N+1; sin `ORDER BY` (Python
   tampoco ordena, el orden de la lista no es contrato).
4. `decodeSessionToken` rechaza payloads que no sean string (Python devolvería el valor parseado sin
   validar tipo): endurecimiento defensivo que no afecta tokens reales.
5. Empates en "categoría top" y orden entre movimientos con el mismo `creado_en` quedan sin
   determinismo, igual que en Python.

## 6. Operativo pendiente (deploys)

**Secuencia decidida (2026-09-24):** terminar F4 y recién después desplegar `web/` y cortar
F1-F3 (un solo deploy y una sola ventana de rollback). Al retomar el deploy, hacerlo por etapas
según el plan (`00` §3.4).

- **`web/` en Render:** Web Service Node (decisión cerrada). Build `npm ci && npm run build`; start
  `node dist/server/entry.mjs`; variables: `DATABASE_URL`, `SUPABASE_URL`,
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY`, `APP_ENV=production`, `APP_BASE_URL=<dominio>`,
  `AUTH_COOKIE_SECURE=true`.
- **Servicio FastAPI en Render:** cargar `ASTRO_ORIGIN` (URL del servicio Astro) y
  `ASTRO_MIGRATED_PATHS`. Al cortar F3, sumar los paths de §5.8 al valor de F1/F2.
  `ENABLE_MOCK_AUTH`/`MOCK_AUTH_USER_ID` no deben ir a producción (`APP_ENV=production` ya fuerza
  el 404 de `/dev-login`).
- **Supabase → Auth → URL Configuration:** agregar `<APP_BASE_URL>/auth/callback` de producción.
- **Dominio canónico** (`APP_BASE_URL` de producción): pendiente de decisión.

## 7. Cosas que no hay que romper

- **Sin DDL ni migraciones desde `web/`**: el esquema pertenece al repo `luka/`.
- El facade **reescribe `Origin`** para el `checkOrigin` de Astro: no quitar hasta F5.
- **`luka_session` se mantiene** como sesión del dashboard; la sesión Supabase es transitoria del
  registro (se borra al finalizar).
- **HTMX y los 3 parciales se mantienen** (paridad 1:1).
- El **middleware** de Astro exige sesión en `/app`, `/dashboard`, `/partials`, `/api/graficos`,
  `/exportar` (303 a `/login`); `/login`, `/logout`, `/dev-login`, la landing y el registro son
  públicos.
- El formato de `luka_session` está clavado por vectores: si se toca `session.ts`, regenerar con
  `tests/generate_session_vectors.py` y correr Vitest + `tests/test_session_vectors.py`.
- `web/vitest.setup.ts` copia **solo `DATABASE_URL`** del `.env` raíz (para los tests gated);
  no agregar más variables ahí para no romper la hermeticidad del resto de la suite.
- `DEFAULT_CATEGORIES` incluye `"Educacion"` sin tilde a propósito (D3.6 diferido).
- La suite Python es **hermética** (`tests/conftest.py` vacía `ASTRO_*` y fuerza sqlite): no depende
  del `.env` del desarrollador ni de que Astro esté corriendo.

## 8. Estado de git (al 2026-09-24)

- Rama `migration` (renombrada desde `feature/f0-scaffold-astro-web`; existe `origin/migration`).
- F3 quedó en commits locales ordenados sobre `migration` (sesión, capa de datos, entorno de dev,
  rutas/vistas, docs). **Falta `git push`** (no fue pedido).
- Verificar con: `git log --oneline origin/migration..HEAD` y `git status --short`.

## 9. Próxima sesión: F4 (panel de flujos)

Alcance detallado en `00` §7-F4; punteros concretos:

1. Páginas `/admin/flujos` (listado), `/admin/flujos/nuevo` y `/admin/flujos/[flow_id]` (editor) —
   plantillas de referencia `app/templates/admin_flows.html` y `admin_flow_editor.html`. El nav de
   `/app` ya muestra "Flujos" cuando `isFlowAdmin` (`web/src/lib/flow-admin.ts`).
2. Proxies JSON: validar, crear (201), guardar/descartar borrador, publicar y retirar — contrato y
   forma de errores de `app/services/conversation_flow_admin.py`
   (`FlowAdminAPIError` → `{message, errors}`). `FLOW_ADMIN_API_KEY` solo en runtime server.
3. Portar `static/js/admin_flows.js` (comportamiento del editor) y `static/css/admin_flows.css`.
4. Portar `tests/test_conversation_flow_admin.py` (7): gate 403, listado/editor, proxies, no
   filtración del secreto, errores de validación.
5. Criterios de salida: mismo contrato JSON, secreto solo server-side, 403 a no autorizados.
   No cortar `/admin/` en `ASTRO_MIGRATED_PATHS` hasta la etapa de deploy.

No depende del deploy: F4 se construye y valida en local contra el backend `luka` (según
`LUKA_BACKEND_URL` / `FLOW_ADMIN_API_KEY` del `.env`, o con dobles en los tests).
