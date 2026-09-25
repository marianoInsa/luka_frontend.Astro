import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const localPath = fileURLToPath(new URL('./tokens.css', import.meta.url));
const docsPath = fileURLToPath(
  new URL('../../docs/marca/tokens/tokens.css', import.meta.url),
);

// La copia local debe seguir a docs/marca/tokens/tokens.css (fuente única). En
// builds aislados sin docs/ el test se salta.
describe('tokens.css', () => {
  it.skipIf(!existsSync(docsPath))(
    'la copia local está sincronizada con docs/marca/tokens/tokens.css',
    () => {
      expect(readFileSync(localPath, 'utf8')).toBe(readFileSync(docsPath, 'utf8'));
    },
  );
});
