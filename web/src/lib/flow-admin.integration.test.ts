import { describe, expect, it } from 'vitest';

import { flowAdminClient } from './flow-admin';

// Gated: pega contra el backend real de Luka. Solo lectura, nunca crea,
// publica, archiva ni toca borradores de flujos reales.
const RUN = process.env.RUN_FLOW_BACKEND === '1';

describe.skipIf(!RUN)('flow admin client (backend real, solo lectura)', () => {
  it('list() resuelve un array de flujos', async () => {
    const flows = await flowAdminClient.list();
    expect(Array.isArray(flows)).toBe(true);
  });

  it('contracts() trae events y node_types como arrays', async () => {
    const contract = await flowAdminClient.contracts();
    expect(Array.isArray(contract.events)).toBe(true);
    expect(Array.isArray(contract.node_types)).toBe(true);
  });
});
