import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;

/**
 * Lazily creates the postgres.js client. The module is importable (and the
 * build stays green) without DATABASE_URL; the error only happens on first use.
 *
 * The URL is read from import.meta.env first (Astro/Vite loads web/.env there,
 * which covers `npm run dev`) and falls back to process.env, which the
 * standalone Node build and hosts like Render populate at runtime.
 * https://docs.astro.build/en/guides/environment-variables/
 */
export function getDb(): Sql {
  if (client) return client;

  const url = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;
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
