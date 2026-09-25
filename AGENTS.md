# AGENTS.md — LUKA Frontend

## Migración a Astro (en curso)

- **Leer primero:** `docs/migracion-astro/02-estado-y-siguientes-pasos.md` (estado por fase, entorno
  local, próximos pasos y cosas que no hay que romper).
- Plan de migración completa (Astro + Cloudflare Workers): `docs/migracion-astro/10-plan-cloudflare-workers.md`.
- Plan de limpieza previa: `docs/migracion-astro/00-plan-limpieza-preparacion.md`.
- Contrato de paridad (rutas, cookies, consultas, tests): `docs/migracion-astro/01-inventario-paridad.md`.
- `README.md`: comandos y estructura del proyecto (raíz del repo).

## Comandos

```powershell
# Todo corre en la raíz del repo
npm run check; npm test; npm run build          # suite hermética; build sin variables de entorno

# Integración real del onboarding (escribe y limpia filas de prueba; requiere DATABASE_URL)
$env:RUN_DB_INTEGRATION='1'; npx vitest run src/lib/onboarding.integration.test.ts
```

## Reglas del repo

- **Sin DDL ni migraciones desde este repo**: el esquema de la base compartida pertenece al repo `luka/`.
- `luka_session` es la sesión durable del dashboard; la sesión Supabase es transitoria del registro.
- HTMX y los 3 parciales se mantienen (paridad 1:1 con el frontend actual).
- No commitear ni pushear sin pedido explícito del usuario.
