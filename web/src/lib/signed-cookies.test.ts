import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_CONTEXT_MAX_AGE,
  signCookieValue,
  ttlSeconds,
  verifyCookieValue,
} from './signed-cookies';

const SECRET = 'test-secret-key-with-more-than-32-characters';
const SALT = 'luka-onboarding-context-v1';
const baseOptions = { secret: SECRET, salt: SALT, maxAgeSeconds: ONBOARDING_CONTEXT_MAX_AGE };
const NOW = new Date('2026-09-24T12:00:00Z');

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('signCookieValue + verifyCookieValue', () => {
  it('round-trips a payload', async () => {
    const payload = { invitationId: 'inv-1', agreementVersionId: 'agr-1' };
    const raw = await signCookieValue(payload, { ...baseOptions, now: NOW });
    await expect(verifyCookieValue(raw, { ...baseOptions, now: NOW })).resolves.toEqual(payload);
  });

  it('rejects a tampered payload', async () => {
    const raw = await signCookieValue({ role: 'user' }, { ...baseOptions, now: NOW });
    const [, issuedAt, signature] = raw.split('.');
    const tampered = `${encode({ role: 'admin' })}.${issuedAt}.${signature}`;
    await expect(verifyCookieValue(tampered, { ...baseOptions, now: NOW })).resolves.toBeNull();
  });

  it('rejects a tampered signature', async () => {
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: NOW });
    const [payload, issuedAt, signature] = raw.split('.');
    const flipped = signature.endsWith('A') ? 'B' : 'A';
    const tampered = `${payload}.${issuedAt}.${signature.slice(0, -1)}${flipped}`;
    await expect(verifyCookieValue(tampered, { ...baseOptions, now: NOW })).resolves.toBeNull();
  });

  it('rejects a cookie signed with another salt', async () => {
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: NOW });
    await expect(
      verifyCookieValue(raw, { ...baseOptions, salt: 'luka-pending-google-auth-v1', now: NOW }),
    ).resolves.toBeNull();
  });

  it('rejects a cookie signed with another secret', async () => {
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: NOW });
    await expect(
      verifyCookieValue(raw, { ...baseOptions, secret: 'otro-secreto-distinto', now: NOW }),
    ).resolves.toBeNull();
  });

  it('rejects an expired cookie', async () => {
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: NOW });
    const afterExpiry = new Date(NOW.getTime() + (ONBOARDING_CONTEXT_MAX_AGE + 1) * 1000);
    await expect(verifyCookieValue(raw, { ...baseOptions, now: afterExpiry })).resolves.toBeNull();
  });

  it('accepts a cookie within its max age', async () => {
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: NOW });
    const justBefore = new Date(NOW.getTime() + (ONBOARDING_CONTEXT_MAX_AGE - 1) * 1000);
    await expect(verifyCookieValue(raw, { ...baseOptions, now: justBefore })).resolves.toEqual({
      invitationId: 'inv-1',
    });
  });

  it('rejects a timestamp too far in the future', async () => {
    const future = new Date(NOW.getTime() + 10 * 60 * 1000);
    const raw = await signCookieValue({ invitationId: 'inv-1' }, { ...baseOptions, now: future });
    await expect(verifyCookieValue(raw, { ...baseOptions, now: NOW })).resolves.toBeNull();
  });

  it.each([null, undefined, '', 'no-es-una-cookie', 'a.b', 'a.b.c.d', 'x'.repeat(5000)])(
    'rejects the malformed value %j',
    async (raw) => {
      await expect(verifyCookieValue(raw, { ...baseOptions, now: NOW })).resolves.toBeNull();
    },
  );

  it('rejects an unsigned payload with a plausible shape', async () => {
    const issuedAt = Math.floor(NOW.getTime() / 1000);
    const forged = `${encode({ invitationId: 'inv-1' })}.${issuedAt}.Zm9yZ2Vk`;
    await expect(verifyCookieValue(forged, { ...baseOptions, now: NOW })).resolves.toBeNull();
  });
});

describe('ttlSeconds', () => {
  it('clamps to the onboarding max age', () => {
    const expires = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    expect(ttlSeconds(expires, ONBOARDING_CONTEXT_MAX_AGE, NOW)).toBe(1800);
  });

  it('uses the remaining invitation time when shorter', () => {
    const expires = new Date(NOW.getTime() + 600 * 1000);
    expect(ttlSeconds(expires, ONBOARDING_CONTEXT_MAX_AGE, NOW)).toBe(600);
  });

  it('returns exactly the max age at the boundary', () => {
    const expires = new Date(NOW.getTime() + ONBOARDING_CONTEXT_MAX_AGE * 1000);
    expect(ttlSeconds(expires, ONBOARDING_CONTEXT_MAX_AGE, NOW)).toBe(ONBOARDING_CONTEXT_MAX_AGE);
  });

  it('throws for an already expired invitation', () => {
    const expires = new Date(NOW.getTime() - 1000);
    expect(() => ttlSeconds(expires, ONBOARDING_CONTEXT_MAX_AGE, NOW)).toThrow(RangeError);
  });
});
