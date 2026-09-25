import { readFileSync } from 'node:fs';

import type { AstroCookies } from 'astro';
import { describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  clearSessionCookie,
  createSessionToken,
  decodeSessionToken,
  setSessionCookie,
} from './session';

interface SessionVector {
  name: string;
  token: string;
  now: number;
  expect: string | null;
  authUserId?: string;
}

interface SessionVectors {
  secret: string;
  maxAgeSeconds: number;
  cases: SessionVector[];
}

const vectors = JSON.parse(
  readFileSync(new URL('./session.vectors.json', import.meta.url), 'utf8'),
) as SessionVectors;

const SECRET = vectors.secret;
const validCase = vectors.cases.find((vector) => vector.authUserId);
if (!validCase?.authUserId) throw new Error('falta el caso válido en session.vectors.json');

const AUTH_USER_ID = validCase.authUserId;
const CLOCK = new Date(validCase.now * 1000);

describe('createSessionToken', () => {
  it('firma un token byte-idéntico al de itsdangerous', async () => {
    await expect(createSessionToken(AUTH_USER_ID, { secret: SECRET, now: CLOCK })).resolves.toBe(
      validCase.token,
    );
  });

  it('mide la antigüedad con el now inyectado', async () => {
    const raw = await createSessionToken(AUTH_USER_ID, { secret: SECRET, now: CLOCK });
    const atBoundary = new Date((validCase.now + vectors.maxAgeSeconds) * 1000);
    const afterBoundary = new Date((validCase.now + vectors.maxAgeSeconds + 1) * 1000);
    const options = { secret: SECRET, maxAgeSeconds: vectors.maxAgeSeconds };
    await expect(decodeSessionToken(raw, { ...options, now: atBoundary })).resolves.toBe(
      AUTH_USER_ID,
    );
    await expect(decodeSessionToken(raw, { ...options, now: afterBoundary })).resolves.toBeNull();
  });
});

describe('decodeSessionToken', () => {
  it.each(vectors.cases)('acepta o rechaza el vector $name', async (vector) => {
    const now = new Date(vector.now * 1000);
    await expect(
      decodeSessionToken(vector.token, { secret: SECRET, now, maxAgeSeconds: vectors.maxAgeSeconds }),
    ).resolves.toBe(vector.expect);
  });

  it('rechaza un token válido verificado con otro secreto', async () => {
    await expect(
      decodeSessionToken(validCase.token, { secret: 'otro-secreto-distinto', now: CLOCK }),
    ).resolves.toBeNull();
  });

  it.each([null, undefined, '', 'a.b', 'a.b.c.d', 'x'.repeat(4097)])(
    'rechaza el valor malformado %j',
    async (raw) => {
      await expect(decodeSessionToken(raw, { secret: SECRET, now: CLOCK })).resolves.toBeNull();
    },
  );
});

function fakeCookies() {
  const set: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const removed: Array<{ name: string; options: Record<string, unknown> }> = [];
  const cookies = {
    set: (name: string, value: string, options: Record<string, unknown>) => {
      set.push({ name, value, options });
    },
    delete: (name: string, options: Record<string, unknown>) => {
      removed.push({ name, options });
    },
  } as unknown as AstroCookies;
  return { cookies, set, removed };
}

describe('setSessionCookie + clearSessionCookie', () => {
  it('guarda la sesión como cookie httpOnly de 7 días', async () => {
    const { cookies, set } = fakeCookies();
    await setSessionCookie(cookies, AUTH_USER_ID);
    expect(set).toHaveLength(1);
    const [call] = set;
    expect(call.name).toBe(SESSION_COOKIE);
    expect(call.value.split('.')).toHaveLength(3);
    expect(call.options).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE,
    });
    expect(typeof call.options.secure).toBe('boolean');
  });

  it('borra la sesión con los mismos atributos', () => {
    const { cookies, removed } = fakeCookies();
    clearSessionCookie(cookies);
    expect(removed).toHaveLength(1);
    const [call] = removed;
    expect(call.name).toBe(SESSION_COOKIE);
    expect(call.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
  });
});
