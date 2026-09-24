import { describe, expect, it } from 'vitest';
import type { AstroCookies } from 'astro';

import {
  AUTH_FLOW_MESSAGES,
  clearGoogleAuthCookies,
  clearOnboardingCookies,
  clearSupabaseAuthCookies,
  compareIdentities,
  extractGoogleProfileName,
  extractVerifiedGoogleIdentity,
  finalizeResultResponse,
  hasCodeVerifierCookie,
  isOnboardingPayload,
  isTerminalAuthSessionError,
  mapFinalizationFailure,
  parsePendingIdentity,
  pendingBindingMatches,
  type PendingAuthPayload,
} from './auth-flow';
import type { Sql } from './db';
import {
  finalizeOnboarding,
  hashToken,
  type FinalizationStatus,
  type VerifiedIdentity,
} from './onboarding';
import {
  ONBOARDING_COOKIE,
  PENDING_AUTH_COOKIE,
  PENDING_AUTH_MAX_AGE,
  signCookieValue,
  verifyCookieValue,
} from './signed-cookies';

const USER_ID = '11111111-2222-3333-4444-555555555555';
const INVITATION_ID = '76aecc76-0e88-4bae-a08f-c3c3297ed20a';
const AGREEMENT_ID = '1b6f0d5e-7a2c-4a1d-9c3e-5f8a2b7d4c10';
const PHONE = '5491199998888';
const EMAIL = 'user@example.com';

const SB_COOKIES = [
  'sb-testref-auth-token',
  'sb-testref-auth-token.0',
  'sb-testref-auth-token-code-verifier',
  'sb-testref-auth-token-flow-12345678-code-verifier',
  'sb-testref-auth-token-flows-code-verifier',
];
const COOKIE_HEADER = [
  `${ONBOARDING_COOKIE}=onboarding-raw`,
  `${PENDING_AUTH_COOKIE}=pending-raw`,
  ...SB_COOKIES.map((name) => `${name}=value`),
  'otra_cookie=1',
].join('; ');

function fakeCookies(): { cookies: AstroCookies; deleted: string[] } {
  const deleted: string[] = [];
  const cookies = {
    delete: (name: string) => {
      deleted.push(name);
    },
  } as unknown as AstroCookies;
  return { cookies, deleted };
}

function fakeRequest(cookieHeader: string): Request {
  return new Request('http://localhost/registro/finalizar', {
    headers: { cookie: cookieHeader },
  });
}

function flowContext() {
  const { cookies, deleted } = fakeCookies();
  return { cookies, deleted, request: fakeRequest(COOKIE_HEADER), secure: true };
}

function googleUser(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: USER_ID.toUpperCase(),
    email: '  User@Example.COM ',
    email_confirmed_at: '2026-09-24T00:00:00Z',
    app_metadata: { provider: 'google' },
    identities: [{ provider: 'google' }],
    user_metadata: { full_name: 'Nombre Google' },
    ...overrides,
  };
}

describe('parsePendingIdentity', () => {
  it('accepts a complete google payload', () => {
    expect(
      parsePendingIdentity({
        authUserId: USER_ID,
        provider: 'google',
        email: EMAIL,
        onboardingHash: 'hash',
      }),
    ).toEqual({ authUserId: USER_ID, provider: 'google', email: EMAIL, onboardingHash: 'hash' });
  });

  it.each([
    [null],
    [undefined],
    ['x'],
    [{}],
    [{ authUserId: USER_ID, provider: 'github', email: EMAIL, onboardingHash: 'hash' }],
    [{ authUserId: '', provider: 'google', email: EMAIL, onboardingHash: 'hash' }],
    [{ authUserId: USER_ID, provider: 'google', email: '', onboardingHash: 'hash' }],
    [{ authUserId: USER_ID, provider: 'google', email: EMAIL, onboardingHash: '' }],
  ])('rejects %j', (value) => {
    expect(parsePendingIdentity(value)).toBeNull();
  });
});

describe('pending cookie binding', () => {
  const rawOnboarding = 'cookie-de-onboarding-firmada';

  it('accepts the pending identity bound to the raw onboarding cookie', async () => {
    const pending: PendingAuthPayload = {
      authUserId: USER_ID,
      provider: 'google',
      email: EMAIL,
      onboardingHash: await hashToken(rawOnboarding),
    };
    await expect(pendingBindingMatches(pending, rawOnboarding)).resolves.toBe(true);
  });

  it('rejects a pending identity bound to another onboarding cookie', async () => {
    const pending: PendingAuthPayload = {
      authUserId: USER_ID,
      provider: 'google',
      email: EMAIL,
      onboardingHash: await hashToken('otra-cookie'),
    };
    await expect(pendingBindingMatches(pending, rawOnboarding)).resolves.toBe(false);
    await expect(
      pendingBindingMatches(pending, rawOnboarding),
    ).resolves.toBe(false);
  });

  it('rejects a pending cookie signed for a different raw value', async () => {
    const pending: PendingAuthPayload = {
      authUserId: USER_ID,
      provider: 'google',
      email: EMAIL,
      onboardingHash: await hashToken(rawOnboarding),
    };
    await expect(pendingBindingMatches(pending, `${rawOnboarding}-tampered`)).resolves.toBe(false);
  });
});

describe('compareIdentities', () => {
  const pending: VerifiedIdentity = { authUserId: USER_ID, provider: 'google', email: EMAIL };

  it('accepts the same identity', () => {
    expect(compareIdentities({ ...pending }, pending)).toBe(true);
  });

  it('accepts a case-insensitive email and canonical uuid', () => {
    expect(
      compareIdentities(
        { authUserId: USER_ID.toUpperCase(), provider: 'google', email: ' User@Example.COM ' },
        pending,
      ),
    ).toBe(true);
  });

  it('rejects another provider', () => {
    expect(compareIdentities({ ...pending, provider: 'github' }, pending)).toBe(false);
  });

  it('rejects another auth user id', () => {
    expect(
      compareIdentities(
        { ...pending, authUserId: '99999999-2222-3333-4444-555555555555' },
        pending,
      ),
    ).toBe(false);
  });

  it('rejects another email', () => {
    expect(compareIdentities({ ...pending, email: 'otro@example.com' }, pending)).toBe(false);
  });

  it('rejects an invalid uuid on either side', () => {
    expect(compareIdentities({ ...pending, authUserId: 'no-es-uuid' }, pending)).toBe(false);
    expect(compareIdentities(pending, { ...pending, authUserId: 'no-es-uuid' })).toBe(false);
  });
});

describe('extractVerifiedGoogleIdentity', () => {
  it('extracts and normalizes a verified Google user', () => {
    expect(extractVerifiedGoogleIdentity({ user: googleUser() })).toEqual({
      authUserId: USER_ID,
      provider: 'google',
      email: EMAIL,
    });
  });

  it('accepts identities as plain objects or class instances', () => {
    class Identity {
      provider = 'google';
    }
    expect(
      extractVerifiedGoogleIdentity({ user: googleUser({ identities: [new Identity()] }) }),
    ).not.toBeNull();
  });

  it.each([
    [null],
    [{}],
    [{ user: null }],
    [{ user: googleUser({ id: 'no-es-uuid' }) }],
    [{ user: googleUser({ email: 'sin-arroba' }) }],
    [{ user: googleUser({ email: 'a@b@c.com' }) }],
    [{ user: googleUser({ email: '' }) }],
    [{ user: googleUser({ email_confirmed_at: null }) }],
    [{ user: googleUser({ app_metadata: { provider: 'github' } }) }],
    [{ user: googleUser({ identities: [{ provider: 'email' }] }) }],
    [{ user: googleUser({ identities: [] }) }],
    [{ user: googleUser({ identities: undefined }) }],
  ])('rejects %j', (value) => {
    expect(extractVerifiedGoogleIdentity(value)).toBeNull();
  });
});

describe('extractGoogleProfileName', () => {
  it('prefers full_name and falls back to name', () => {
    expect(extractGoogleProfileName({ user: googleUser() })).toBe('Nombre Google');
    expect(
      extractGoogleProfileName({ user: googleUser({ user_metadata: { name: 'Solo Name' } }) }),
    ).toBe('Solo Name');
    expect(extractGoogleProfileName({ user: googleUser({ user_metadata: {} }) })).toBeUndefined();
    expect(extractGoogleProfileName({ user: googleUser({ user_metadata: 'x' }) })).toBeNull();
    expect(extractGoogleProfileName(null)).toBeNull();
  });
});

describe('isTerminalAuthSessionError', () => {
  it('treats missing/invalid sessions as terminal', () => {
    expect(isTerminalAuthSessionError(Object.assign(new Error('x'), { name: 'AuthSessionMissingError' }))).toBe(true);
    expect(isTerminalAuthSessionError({ name: 'AuthInvalidJwtError' })).toBe(true);
    expect(isTerminalAuthSessionError({ name: 'AuthInvalidCredentialsError' })).toBe(true);
    expect(isTerminalAuthSessionError({ name: 'AuthPKCECodeVerifierMissingError' })).toBe(true);
  });

  it('treats 400/401/403 API errors as terminal', () => {
    for (const status of [400, 401, 403]) {
      expect(isTerminalAuthSessionError({ name: 'AuthApiError', status })).toBe(true);
    }
    for (const status of [429, 500, 502]) {
      expect(isTerminalAuthSessionError({ name: 'AuthApiError', status })).toBe(false);
    }
  });

  it('treats network and unknown errors as transient', () => {
    expect(isTerminalAuthSessionError(new TypeError('fetch failed'))).toBe(false);
    expect(isTerminalAuthSessionError({ name: 'AuthRetryableFetchError' })).toBe(false);
    expect(isTerminalAuthSessionError(null)).toBe(false);
  });
});

describe('code verifier cookie detection', () => {
  it('detects any cookie whose name contains code-verifier', () => {
    expect(hasCodeVerifierCookie(fakeRequest(COOKIE_HEADER))).toBe(true);
    expect(hasCodeVerifierCookie(fakeRequest('luka_onboarding=x; otra=1'))).toBe(false);
    expect(hasCodeVerifierCookie(fakeRequest(''))).toBe(false);
  });
});

describe('cookie clearing', () => {
  it('clears pending and supabase cookies but keeps the onboarding cookie', () => {
    const { cookies, deleted } = fakeCookies();
    clearGoogleAuthCookies(cookies, fakeRequest(COOKIE_HEADER), true);

    expect(deleted).toContain(PENDING_AUTH_COOKIE);
    for (const name of SB_COOKIES) expect(deleted).toContain(name);
    expect(deleted).not.toContain(ONBOARDING_COOKIE);
    expect(deleted).not.toContain('otra_cookie');
  });

  it('clears the onboarding, pending and supabase cookies', () => {
    const { cookies, deleted } = fakeCookies();
    clearOnboardingCookies(cookies, fakeRequest(COOKIE_HEADER), true);

    expect(deleted).toContain(ONBOARDING_COOKIE);
    expect(deleted).toContain(PENDING_AUTH_COOKIE);
    for (const name of SB_COOKIES) expect(deleted).toContain(name);
    expect(deleted).not.toContain('otra_cookie');
  });

  it('only clears supabase cookies', () => {
    const { cookies, deleted } = fakeCookies();
    clearSupabaseAuthCookies(cookies, fakeRequest(COOKIE_HEADER), true);

    expect(deleted.sort()).toEqual([...SB_COOKIES].sort());
  });
});

describe('mapFinalizationFailure', () => {
  it('returns null for success', () => {
    expect(mapFinalizationFailure('success')).toBeNull();
  });

  const CASES: Array<[FinalizationStatus, number, string, boolean]> = [
    ['invitation_expired', 410, AUTH_FLOW_MESSAGES.finalizeExpired, true],
    ['invitation_consumed', 409, AUTH_FLOW_MESSAGES.finalizeConsumed, true],
    ['agreement_not_found', 409, AUTH_FLOW_MESSAGES.termsChanged, true],
    ['agreement_changed', 409, AUTH_FLOW_MESSAGES.termsChanged, true],
    ['identity_conflict', 409, AUTH_FLOW_MESSAGES.identityConflict, true],
    ['invalid_identity', 400, AUTH_FLOW_MESSAGES.finalizeDefault, true],
    ['invitation_not_found', 400, AUTH_FLOW_MESSAGES.finalizeDefault, true],
    ['invitation_revoked', 400, AUTH_FLOW_MESSAGES.finalizeDefault, true],
    ['invitation_invalid', 400, AUTH_FLOW_MESSAGES.finalizeDefault, true],
    ['database_error', 503, AUTH_FLOW_MESSAGES.databaseError, false],
  ];

  it.each(CASES)('maps %s to %i', (status, code, message, clear) => {
    expect(mapFinalizationFailure(status)).toEqual({ status: code, message, clear });
  });

  it.each(CASES)('renders %s without PII and clears cookies accordingly', (status, code, message, clear) => {
    const context = flowContext();
    const response = finalizeResultResponse(status, context);

    expect(response.status).toBe(code);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(message).not.toContain('@');
    expect(context.deleted).not.toContain('otra_cookie');
    if (clear) {
      expect(context.deleted).toContain(ONBOARDING_COOKIE);
      expect(context.deleted).toContain(PENDING_AUTH_COOKIE);
    } else {
      expect(context.deleted).toEqual([]);
    }
  });
});

describe('finalizeResultResponse success', () => {
  it('renders the completion page and clears all onboarding cookies', async () => {
    const context = flowContext();
    const response = finalizeResultResponse('success', context);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Tu registro se completó correctamente.');
    expect(context.deleted).toContain(ONBOARDING_COOKIE);
    expect(context.deleted).toContain(PENDING_AUTH_COOKIE);
    for (const name of SB_COOKIES) expect(context.deleted).toContain(name);
    expect(context.deleted).not.toContain('otra_cookie');
  });
});

describe('signed pending cookie round-trip', () => {
  it('verifies a pending payload within the 15 minute window', async () => {
    const now = new Date('2026-09-24T12:00:00Z');
    const options = {
      secret: 'test-secret-key-with-more-than-32-characters',
      salt: 'luka-pending-google-auth-v1',
      maxAgeSeconds: PENDING_AUTH_MAX_AGE,
      now,
    };
    const payload = {
      authUserId: USER_ID,
      provider: 'google',
      email: EMAIL,
      onboardingHash: await hashToken('cookie-raw'),
    };
    const raw = await signCookieValue(payload, options);

    await expect(verifyCookieValue(raw, options)).resolves.toEqual(payload);
    await expect(
      verifyCookieValue(raw, {
        ...options,
        now: new Date(now.getTime() + (PENDING_AUTH_MAX_AGE + 1) * 1000),
      }),
    ).resolves.toBeNull();
    expect(isOnboardingPayload(payload)).toBe(false);
  });
});

interface InvitationRow {
  id: string;
  whatsapp_id: string;
  estado: string;
  expira_en: Date;
  usuario_id: string | null;
  consumida_en: Date | null;
  revocada_en: Date | null;
}

function finalizeFake(): {
  sql: Sql;
  state: { usuarioInserts: number; aceptadoInserts: number; categoriaInserts: number };
} {
  const state = {
    invitation: {
      id: INVITATION_ID,
      whatsapp_id: PHONE,
      estado: 'pendiente',
      expira_en: new Date(Date.now() + 60 * 60 * 1000),
      usuario_id: null,
      consumida_en: null,
      revocada_en: null,
    } as InvitationRow,
    usuarioInserts: 0,
    aceptadoInserts: 0,
    categoriaInserts: 0,
  };

  const tx = ((strings: TemplateStringsArray) => {
    const text = strings.join('$');
    if (text.includes('FROM onboarding_invitacion')) return Promise.resolve([{ ...state.invitation }]);
    if (text.includes('FROM acuerdo_version')) {
      return Promise.resolve([
        {
          id: AGREEMENT_ID,
          version: '2026-07',
          contenido: 'Términos',
          esta_vigente: true,
          vigente_desde: new Date('2026-07-01T00:00:00Z'),
        },
      ]);
    }
    if (text.includes('INSERT INTO usuario')) {
      state.usuarioInserts += 1;
      return Promise.resolve([]);
    }
    if (text.includes('FROM usuario')) return Promise.resolve([]);
    if (text.includes('INSERT INTO acuerdo_aceptado')) {
      state.aceptadoInserts += 1;
      return Promise.resolve([]);
    }
    if (text.includes('FROM acuerdo_aceptado')) return Promise.resolve([]);
    if (text.includes('INSERT INTO categorias')) {
      state.categoriaInserts += 1;
      return Promise.resolve([]);
    }
    if (text.includes('FROM categorias')) return Promise.resolve([]);
    if (text.includes('UPDATE onboarding_invitacion')) {
      state.invitation.estado = 'consumida';
      state.invitation.consumida_en = new Date();
      return Promise.resolve([]);
    }
    throw new Error(`unexpected query: ${text}`);
  }) as unknown as Sql;

  const sql = Object.assign(tx, {
    begin: async (callback: (transaction: Sql) => Promise<unknown>) => callback(tx),
  }) as unknown as Sql;

  return { sql, state };
}

describe('double submit after success', () => {
  it('maps the second finalize to invitation_consumed without duplicating data', async () => {
    const { sql, state } = finalizeFake();
    const identity: VerifiedIdentity = { authUserId: USER_ID, provider: 'google', email: EMAIL };

    const first = await finalizeOnboarding(sql, INVITATION_ID, AGREEMENT_ID, identity, 'Nombre');
    expect(first.status).toBe('success');
    expect(state.usuarioInserts).toBe(1);
    expect(state.aceptadoInserts).toBe(1);
    expect(state.categoriaInserts).toBe(9);

    const second = await finalizeOnboarding(sql, INVITATION_ID, AGREEMENT_ID, identity, 'Nombre');
    expect(second.status).toBe('invitation_consumed');
    expect(state.usuarioInserts).toBe(1);
    expect(state.aceptadoInserts).toBe(1);

    const context = flowContext();
    const response = finalizeResultResponse(second.status, context);
    expect(response.status).toBe(409);
    expect(await response.text()).toContain(AUTH_FLOW_MESSAGES.finalizeConsumed);
    expect(context.deleted).toContain(ONBOARDING_COOKIE);
    expect(context.deleted).toContain(PENDING_AUTH_COOKIE);
  });
});
