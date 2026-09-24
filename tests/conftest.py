"""Hermetic test environment.

These must be set before any test module imports app.main or
app.models.database: the F1 facade reads ASTRO_ORIGIN/ASTRO_MIGRATED_PATHS and
the SQLAlchemy engine reads DATABASE_URL at import time. load_dotenv() runs
with override=False, so values already present here are never replaced by the
developer's .env.
"""

import os

os.environ["ASTRO_ORIGIN"] = ""
os.environ["ASTRO_MIGRATED_PATHS"] = ""
os.environ.setdefault("DATABASE_URL", "sqlite:///./luka.db")
