import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest no puebla process.env desde .env, así que el test de integración gated
// no veía DATABASE_URL. Solo se copia esa variable: el resto de la suite sigue
// hermética.
if (!process.env.DATABASE_URL) {
  try {
    const envPath = fileURLToPath(new URL('.env', import.meta.url));
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match?.[1] === 'DATABASE_URL') {
        process.env.DATABASE_URL = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch {
    // Sin .env: los tests gated se saltan y el resto no lo necesita.
  }
}
