import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { isLocalDatabaseUrl } from './src/lib/db-url';

const isIntegration = process.env.RUN_DB_INTEGRATION === '1';

if (isIntegration) {
  // La integración exige una DB local explícita: nunca copiar DATABASE_URL de
  // .dev.vars (que apunta al pooler de producción).
  if (!process.env.DATABASE_URL || !isLocalDatabaseUrl(process.env.DATABASE_URL)) {
    throw new Error(
      'DB integration requires an explicit localhost DATABASE_URL; refusing to use .dev.vars',
    );
  }
} else if (!process.env.DATABASE_URL) {
  // Fuera de integración, Vitest no puebla process.env desde .dev.vars; solo se
  // copia DATABASE_URL para el resto de la suite (que sigue hermética), sin pisar
  // una variable ya definida.
  try {
    const envPath = fileURLToPath(new URL('.dev.vars', import.meta.url));
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match?.[1] === 'DATABASE_URL') {
        process.env.DATABASE_URL = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
      }
    }
  } catch {
    // Sin .dev.vars: los tests gated se saltan y el resto no lo necesita.
  }
}
