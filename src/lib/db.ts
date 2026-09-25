import postgres from 'postgres';

import { envValue } from './env';
import { hyperdriveConnectionString } from './runtime';

export type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

/**
 * En el Worker (binding HYPERDRIVE) devuelve un cliente nuevo por llamada:
 * Hyperdrive hace el pooling y los sockets de Workers no sobreviven entre
 * requests. Sin binding (dev/tests), singleton lazy con DATABASE_URL; el
 * módulo es importable (y el build queda verde) sin DATABASE_URL: el error
 * recién aparece al primer uso.
 *
 * `envValue` lee `process.env` (lo que cargan el server standalone, Render y
 * `npm run dev` con `--env-file-if-exists=.env`) y cae a `import.meta.env`.
 * https://docs.astro.build/en/guides/environment-variables/
 */
export function getDb(): Sql {
  const hyperdrive = hyperdriveConnectionString();
  if (hyperdrive) {
    return postgres(hyperdrive, { max: 5, fetch_types: false, prepare: true });
  }

  if (client) return client;

  const url = envValue('DATABASE_URL');
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Configure it as a server-only environment variable (never PUBLIC_).',
    );
  }

  client = postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    // Supabase transaction pooler (port 6543) needs prepare:false; an explicit
    // sslmode in the URL wins over the default.
    ...(/[?&]sslmode=/.test(url) ? {} : { ssl: 'require' as const }),
  });
  return client;
}

export async function closeDb(): Promise<void> {
  const sql = client;
  client = null;
  await sql?.end({ timeout: 5 });
}
