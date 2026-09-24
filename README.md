# LUKA Frontend

Plataforma web complementaria para el bot financiero LUKA en WhatsApp.
Provee un dashboard visual interactivo y detallado, utilizando Jinja2, HTMX, y Chart.js sobre FastAPI.

## Tecnologías Utilizadas

- **Backend**: Python 3 con [FastAPI](https://fastapi.tiangolo.com/) y SQLAlchemy.
- **Frontend**: Plantillas Jinja2 con HTML puro, [HTMX](https://htmx.org/) para reactividad del lado del servidor sin necesidad de recargar la página.
- **Estilos**: Vanilla CSS con diseño avanzado (Dark mode, Glassmorphism, CSS Grid).
- **Gráficos**: [Chart.js](https://www.chartjs.org/) para métricas dinámicas.
- **Base de Datos**: PostgreSQL vía Supabase (reutilizando los datos guardados por el bot LUKA).

## Contrato de base de datos compartido

Las migraciones de la base compartida pertenecen a `blob1618/luka`. Este repositorio
solo mantiene modelos SQLAlchemy consumidores compatibles; no debe usarse
`Base.metadata.create_all()` para modificar la instancia compartida de Supabase.

## Estructura del Proyecto

```text
luka_frontend/
├── app/
│   ├── main.py              # Entrypoint de FastAPI y rutas HTMX
│   ├── auth.py              # Generación y validación de tokens de sesión
│   ├── dashboard.py         # Consultas a la base de datos para armar las métricas
│   ├── models/
│   │   └── database.py      # Conexión SQLAlchemy y declaración de tablas
│   └── templates/
│       ├── base.html        # Layout principal (Sidebar, dependencias JS/CSS)
│       ├── dashboard.html   # Estructura del dashboard principal
│       ├── login.html       # Interfaz de "magic link"
│       └── partials/        # Archivos que se recargan vía HTMX
│           ├── charts.html
│           ├── stats.html
│           └── transactions.html
├── static/
│   └── css/
│       └── style.css        # Hoja de estilos del proyecto
├── .env                     # Variables de entorno locales
├── .env.example             # Plantilla de variables
├── render.yaml              # Configuración de despliegue como código
└── requirements.txt         # Dependencias Python
```

## Ejecutar en Local

1. Crea y activa tu entorno virtual:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```
2. Instala dependencias:
   ```bash
   pip install -r requirements.txt
   ```
3. Configura tu `.env` tomando como base `.env.example`. **Asegurate de que tu puerto en la URL de Supabase sea el `6543` (el transaction pooler para evitar errores de red).**
4. Arranca el servidor local en modo desarrollo:
   ```bash
   uvicorn app.main:app --reload --port 8001
   ```
5. Para probar sin necesidad del bot de WhatsApp, abrí `http://localhost:8001/dev-login` que iniciará sesión automáticamente.

## Migración a Astro (en curso)

El frontend está migrando a Astro en fases (ver `docs/migracion-astro/00-plan-limpieza-preparacion.md`).
Durante la migración, FastAPI sigue siendo el servicio de producción y `web/` se despliega aparte:
Astro sirve la landing pública y FastAPI actúa de facade para los paths ya migrados.

Variables del facade (ver `.env.example`):

- `ASTRO_ORIGIN`: URL del servicio de `web/` (Astro).
- `ASTRO_MIGRATED_PATHS`: lista separada por comas de los paths que sirve Astro; el resto queda en FastAPI.
  Debe incluir los assets de la landing (CSS construido en `/_astro`, archivos de `public/` y
  robots/sitemap): sin ellos la landing responde 200 pero sus assets dan 404. Con la lista vacía el
  facade es no-op.

Para probar la topología de la migración en local usá el build de Astro, no el dev server:

1. Terminal A — Astro: `cd web && npm run build && node dist/server/entry.mjs` (puerto 4321).
2. Terminal B — FastAPI: `uvicorn app.main:app --reload --port 8001`, con `ASTRO_ORIGIN=http://localhost:4321`
   y `ASTRO_MIGRATED_PATHS` como en `.env.example`.
3. Abrí `http://localhost:8001/`: la landing la sirve Astro; `/app`, `/login` y el resto siguen en FastAPI.

El dev server de Astro referencia URLs de Vite (`/@vite`, `/src/...`) que el facade no proxya: la landing
se vería sin estilos a través de `:8001`.

## Despliegue en Producción (Render)

### Opción 1: Usar Render Blueprint (Automático)
Dado que el repositorio incluye un archivo `render.yaml`, solo tienes que conectar el repositorio de GitHub en el dashboard de Render en la sección "Blueprints".

### Opción 2: Web Service Manual
Si creas el Web Service manualmente en Render, utiliza la siguiente configuración:

- **Build Command:** `pip install -r requirements.txt`
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Variables de entorno necesarias
No te olvides de configurar las siguientes **Environment Variables** en Render
(el listado completo con la plantilla está en `.env.example`):

- `APP_ENV` (`development` o `production`; en producción se exige HTTPS y cookies seguras).
- `APP_BASE_URL` (URL pública base del frontend; debe ser HTTPS en producción).
- `SUPABASE_URL` (URL del proyecto Supabase usada para la autenticación).
- `SUPABASE_PUBLISHABLE_KEY` (clave publicable de Supabase; empieza con `sb_publishable_`).
- `AUTH_COOKIE_SECURE` (`true` obligatorio en producción; `false` solo para desarrollo local).
- `ENABLE_MOCK_AUTH` (solo desarrollo: habilita `/dev-login`; en producción debe quedar desactivado).
- `SECRET_KEY` (Generá un texto largo, aleatorio y seguro para cifrar las cookies de los usuarios).
- `MOCK_AUTH_USER_ID` (solo desarrollo: UUID del usuario falso que usa `/dev-login`).
- `DATABASE_URL` (Debe ser idéntica a la que usás localmente).
- `LUKA_BACKEND_URL` (URL pública o privada alcanzable del backend `luka`).
- `FLOW_ADMIN_API_KEY` (misma credencial interna configurada en el backend; nunca se expone al navegador).
- `FLOW_ADMIN_AUTH_USER_IDS` (lista separada por comas de `auth_user_id` autorizados a administrar flujos).

Las variables marcadas como solo desarrollo (`ENABLE_MOCK_AUTH`, `MOCK_AUTH_USER_ID` y
`AUTH_COOKIE_SECURE=false`) no deben usarse en producción; el resto son obligatorias.

## Panel de flujos conversacionales

Los administradores autorizados acceden a `/admin/flujos`. El panel lista
recorridos, crea y edita borradores, valida texto/botones/listas y permite
publicar, descartar o retirar versiones. Todas las operaciones pasan por la API
protegida de `luka`; este repositorio no lee ni modifica las tablas de flujos en
Supabase.

Los flujos sólo personalizan resultados que el backend ya decidió. No existe un
menú principal obligatorio: después de `/link` o mientras hay una interacción
visual pendiente, el usuario puede escribir otra operación y el dispatcher de
Luka la procesa normalmente.
