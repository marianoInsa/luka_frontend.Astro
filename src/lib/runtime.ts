import { env as cfEnv } from 'cloudflare:workers';

// Binding de Hyperdrive (Tarea 8). En dev/tests no existe y db.ts cae a DATABASE_URL.
export function hyperdriveConnectionString(): string | undefined {
  const binding = (cfEnv as { HYPERDRIVE?: { connectionString?: string } }).HYPERDRIVE;
  return binding?.connectionString;
}
