# 02 · Estado actual y próximos pasos

| Campo | Valor |
|---|---|
| **Fecha** | 2026-09-24 |
| **Rama** | `migration` |
| **Fase en curso** | F2 cerrado (código + validación). El próximo paso es F3. |
| **Plan** | `00-plan-limpieza-preparacion.md` (v2.0) |
| **Contrato de paridad** | `01-inventario-paridad.md` (v1.1) |

Este documento es el punto de entrada para retomar la migración en otra sesión. Resume qué está
hecho, qué falta, cómo levantar el entorno y qué no hay que romper.

---

## 1. Resumen para retomar en 30 segundos

- **F0, F1 y F2 tienen el código completo.** F1 y F2 además están validados de punta a punta en local
  contra la base real de Supabase.
- `web/` (Astro SSR) ya sirve: landing `/` (prerender, 0 KB JS), `robots.txt`, `sitemap.xml`,
  `/registro`, `/auth/google`, `/auth/callback`, `/registro/continuar`, `/registro/finalizar`.
- **FastAPI sigue sirviendo todo lo demás** (`/app`, `/login`, `/logout`, `/dev-login`,
  `/api/graficos/*`, `/exportar/csv`, `/partials/*`, `/admin/flujos*`) y actúa de **facade** hacia
  Astro según `ASTRO_MIGRATED_PATHS`.
- **Próximo trabajo:** F3 (sesión `luka_session` byte-compatible, `/login`, dashboard `/app`, APIs,
  CSV, parallel run) y los deploys operativos de F1/F2.

## 2. Estado por fase

| Fase | Estado | Evidencia | Pendiente |
|---|---|---|---|
| **F0** scaffold | ✅ Completo | `web/` con astro@7.3.4 + @astrojs/node 11, TS estricto, tokens de marca, job CI Node (`npm ci` + check + test + build) | — |
| **F1** landing + facade | ✅ Código · ⏳ deploy | Landing prerender con SEO; facade `app/proxy.py` (`ASTRO_ORIGIN`, `ASTRO_MIGRATED_PATHS`, no-op por defecto, reescritura de `Origin`, streaming, 502); `/` → `/app`; cookie `luka_session` con `Secure` en producción. Validado con Playwright el 2026-09-24 | Deploy de `web/`; cargar `ASTRO_ORIGIN` + `ASTRO_MIGRATED_PATHS` en Render; dominio canónico |
| **F2** onboarding | ✅ Código · ⏳ cutover | Data layer `postgres.js` (`web/src/lib/onboarding.ts`); páginas/endpoints de registro con `@supabase/ssr` (PKCE) y cookies firmadas propias; 123 tests web + integración real del happy path; E2E de navegador hasta el redirect de Google | Deploy de `web/`; Redirect URLs de Supabase en prod; cutover (`/registro,/auth` ya en `.env.example`) |
| **F3** sesión + dashboard | ⏳ Siguiente | — | Ver §5 |
| **F4** admin | Pendiente | — | Panel `/admin/flujos*` + proxy con `FLOW_ADMIN_API_KEY` |
| **F5** contract | Pendiente | — | Retiro de FastAPI, facade y código transitorio |

## 3. Cómo levantar el entorno local

`.env` en la raíz (no se commitea) debe tener:

- `DATABASE_URL` → Postgres de Supabase por **puerto 5432**. El 6543 no acepta TCP desde esta red.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY` (32+ chars) con valores reales.
- `ASTRO_ORIGIN=http://localhost:4321` y `ASTRO_MIGRATED_PATHS` con el valor de `.env.example`.

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
- El **dev server** de Astro (`npm run dev`) sirve la landing sin estilos a través del facade porque
  usa URLs de Vite (`/@vite`, `/src/...`) que el facade no proxya. Para desarrollar UI, usalo directo
  en `:4321`; para validar la topología, usá el build.

Tests:

```bash
.venv\Scripts\python.exe -m pytest -q                 # 168 passed (hermético)
cd web; npm run check; npm test                       # 123 passed (integración skipeada)
cd web; $env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts
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

## 5. Próximos pasos (F3) — checklist

1. **`luka_session` byte-compatible** (bloqueante del cutover de F3): verificar y firmar la cookie con
   el mismo formato que `itsdangerous` (`URLSafeTimedSerializer`, salt `"session"`, HMAC-SHA1,
   derivación django-concat, base64url sin padding, TTL 7 días). Generar vectores en Python y
   round-trip inverso (Astro → Python). Sin esto no se corta `/app`.
2. `/login` (consumo del token del bot con lock), `/logout`, `/dev-login` (404 fuera de desarrollo);
   redirect a `/app` preservando `date_from`/`date_to`.
3. `/app` con las 11 consultas de `app/dashboard.py` (notas de port en `01-inventario-paridad.md` §4.1):
   excluir `anulado_en`, `COALESCE` de categorías, `GROUP BY` en SQL crudo, N+1 de presupuestos → un
   solo `GROUP BY`, tasa USD 1300 constante.
4. Chart.js igual que hoy; **HTMX se mantiene** con los 3 parciales (`/dashboard/actualizar` con
   `HX-Trigger`, `/partials/charts`, `/partials/transactions`).
5. `/exportar/csv` con cursor/keyset (mismo encabezado y filas).
6. **Parallel run** contra FastAPI (mismo dataset: 3 endpoints de gráficos, KPIs, CSV) antes de cortar.
7. Portar tests: `test_dashboard_login.py` (19), `test_dashboard_queries.py` (11), `test_main.py` (2).
8. Cutover: sumar a `ASTRO_MIGRATED_PATHS`:
   `/app,/login,/logout,/dev-login,/api/graficos/,/exportar/,/dashboard/,/partials/`.

## 6. Operativo pendiente (deploys)

- **`web/` en Render:** Web Service Node (decisión cerrada). Build `npm ci && npm run build`; start
  `node dist/server/entry.mjs`; variables: `DATABASE_URL`, `SUPABASE_URL`,
  `PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SECRET_KEY`, `APP_ENV=production`, `APP_BASE_URL=<dominio>`,
  `AUTH_COOKIE_SECURE=true`.
- **Servicio FastAPI en Render:** cargar `ASTRO_ORIGIN` (URL del servicio Astro) y
  `ASTRO_MIGRATED_PATHS` (valor de `.env.example`).
- **Supabase → Auth → URL Configuration:** agregar `<APP_BASE_URL>/auth/callback` de producción.
- **Dominio canónico** (`APP_BASE_URL` de producción): pendiente de decisión.

## 7. Cosas que no hay que romper

- **Sin DDL ni migraciones desde `web/`**: el esquema pertenece al repo `luka/`.
- El facade **reescribe `Origin`** para el `checkOrigin` de Astro: no quitar hasta F5.
- **`luka_session` se mantiene** como sesión del dashboard; la sesión Supabase es transitoria del
  registro (se borra al finalizar).
- **HTMX y los 3 parciales se mantienen** (paridad 1:1).
- `DEFAULT_CATEGORIES` incluye `"Educacion"` sin tilde a propósito (D3.6 diferido).
- La suite Python es **hermética** (`tests/conftest.py` vacía `ASTRO_*` y fuerza sqlite): no depende
  del `.env` del desarrollador ni de que Astro esté corriendo.

## 8. Estado de git (al 2026-09-24)

- Rama `migration` (renombrada desde `feature/f0-scaffold-astro-web`; existe `origin/migration`).
- Al escribir este documento había 7 commits locales sin pushear (F2 + fixes), más el commit de este
  documento. Verificar con: `git log --oneline origin/migration..HEAD`.
