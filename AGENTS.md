# AGENTS.md — LUKA Frontend

## Migración a Astro (en curso)

- **Leer primero:** `docs/migracion-astro/02-estado-y-siguientes-pasos.md` (estado por fase, entorno
  local, próximos pasos y cosas que no hay que romper).
- Plan: `docs/migracion-astro/00-plan-limpieza-preparacion.md`.
- Contrato de paridad (rutas, cookies, consultas, tests): `docs/migracion-astro/01-inventario-paridad.md`.
- `web/README.md`: comandos y estructura del proyecto Astro.

## Comandos

```powershell
# Python (FastAPI actual)
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m pytest -q          # 168 passed, hermético (tests/conftest.py)

# Web (Astro, en web/)
cd web
npm run check; npm test; npm run build          # 123 tests; build sin variables de entorno

# Integración real del onboarding (escribe y limpia filas de prueba; requiere DATABASE_URL)
$env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts
```

## Reglas del repo

- **Sin DDL ni migraciones desde `web/`**: el esquema de la base compartida pertenece al repo `luka/`.
- La suite Python es hermética (`tests/conftest.py` vacía `ASTRO_*` y fuerza sqlite); no la hagas
  depender del `.env` local ni de que Astro esté corriendo.
- `luka_session` es la sesión durable del dashboard (se mantiene en F3); la sesión Supabase es
  transitoria del registro.
- HTMX y los 3 parciales se mantienen (paridad 1:1 con el frontend actual).
- El facade (`app/proxy.py`) reescribe `Origin` para el `checkOrigin` de Astro: es transitorio, se
  retira en F5.
- No commitear ni pushear sin pedido explícito del usuario.
