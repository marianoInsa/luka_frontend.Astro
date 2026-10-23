// Guard para tests de integración: solo se conecta a una DB local explícita,
// nunca a la URL de producción de `.dev.vars`.
//
// Vive en un módulo sin dependencias para que `vitest.setup.ts` pueda importarlo
// sin cargar `db.ts` (que trae `postgres` y el binding de `cloudflare:workers`,
// y rompería el `vi.mock('./runtime')` de `db.test.ts`).
export function isLocalDatabaseUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const host = new URL(value).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
