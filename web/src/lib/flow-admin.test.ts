import { afterEach, describe, expect, it } from 'vitest';

import { isFlowAdmin } from './flow-admin';

const KEY = 'FLOW_ADMIN_AUTH_USER_IDS';

afterEach(() => {
  delete process.env[KEY];
});

describe('isFlowAdmin (espejo de conversation_flow_admin.is_flow_admin)', () => {
  it('acepta ids del CSV sin importar mayúsculas ni espacios', () => {
    process.env[KEY] = ' AAAA-1111 , bbbb-2222 ';
    expect(isFlowAdmin('aaaa-1111')).toBe(true);
    expect(isFlowAdmin('BBBB-2222')).toBe(true);
    expect(isFlowAdmin('cccc-3333')).toBe(false);
  });

  it('sin configurar no habilita a nadie', () => {
    delete process.env[KEY];
    expect(isFlowAdmin('aaaa-1111')).toBe(false);
  });

  it('un CSV vacío o solo comas no habilita a nadie', () => {
    process.env[KEY] = ' , ';
    expect(isFlowAdmin('')).toBe(false);
    expect(isFlowAdmin('aaaa-1111')).toBe(false);
  });
});
