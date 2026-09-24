import { describe, expect, it } from 'vitest';

import type { Sql } from './db';
import {
  DEFAULT_CATEGORIES,
  hashToken,
  normalizeDisplayName,
  parseIdentity,
  validateRegistrationToken,
} from './onboarding';

const AUTH_USER_ID = '76aecc76-0e88-4bae-a08f-c3c3297ed20a';
const unusedSql = {} as unknown as Sql;

describe('hashToken', () => {
  it('returns the sha256 hex of the token', async () => {
    await expect(hashToken('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('rejects tokens longer than 4096 characters', async () => {
    await expect(hashToken('a'.repeat(4097))).rejects.toThrow(RangeError);
  });
});

describe('normalizeDisplayName', () => {
  it('replaces control characters and collapses whitespace', () => {
    expect(normalizeDisplayName('  Ana\u0000   María\nPérez  ', 'x@example.com')).toBe(
      'Ana María Pérez',
    );
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeDisplayName('  Juan \t\t  Pérez  ', 'x@example.com')).toBe('Juan Pérez');
  });

  it('falls back to the email local part when the value has no usable text', () => {
    expect(normalizeDisplayName('\u0000\n', 'persona.segura@example.com')).toBe('persona.segura');
  });

  it('falls back to "Usuario Luka" when neither value nor email local part is usable', () => {
    expect(normalizeDisplayName(null, '@example.com')).toBe('Usuario Luka');
    expect(normalizeDisplayName(undefined, '')).toBe('Usuario Luka');
  });

  it('caps the result at 120 characters', () => {
    const normalized = normalizeDisplayName('A'.repeat(200), 'x@example.com');
    expect(normalized).toHaveLength(120);
    expect(normalized).toBe('A'.repeat(120));
  });
});

describe('parseIdentity', () => {
  it('accepts google and returns the normalized email and uuid', () => {
    expect(
      parseIdentity({
        authUserId: AUTH_USER_ID.toUpperCase(),
        provider: 'google',
        email: '  Persona@Example.COM  ',
      }),
    ).toEqual({ authUserId: AUTH_USER_ID, email: 'persona@example.com' });
  });

  it('rejects providers other than google', () => {
    expect(
      parseIdentity({ authUserId: AUTH_USER_ID, provider: 'email', email: 'a@example.com' }),
    ).toBeNull();
  });

  it('rejects malformed uuids', () => {
    expect(
      parseIdentity({ authUserId: 'no-es-uuid', provider: 'google', email: 'a@example.com' }),
    ).toBeNull();
    expect(parseIdentity({ authUserId: '', provider: 'google', email: 'a@example.com' })).toBeNull();
  });

  it.each([
    'sin-arroba',
    'dos@arrobas@example.com',
    'per\r\nsona@example.com',
    'per\u0000sona@example.com',
    '@example.com',
    'persona@',
  ])('rejects the invalid email %j', (email) => {
    expect(parseIdentity({ authUserId: AUTH_USER_ID, provider: 'google', email })).toBeNull();
  });

  it('rejects emails longer than 320 characters', () => {
    const email = `${'a'.repeat(310)}@example.com`;
    expect(parseIdentity({ authUserId: AUTH_USER_ID, provider: 'google', email })).toBeNull();
  });
});

describe('validateRegistrationToken', () => {
  it('rejects missing, blank and oversized tokens without touching the database', async () => {
    await expect(validateRegistrationToken(unusedSql, null)).resolves.toEqual({ status: 'invalid' });
    await expect(validateRegistrationToken(unusedSql, '   ')).resolves.toEqual({
      status: 'invalid',
    });
    await expect(validateRegistrationToken(unusedSql, 'a'.repeat(4097))).resolves.toEqual({
      status: 'invalid',
    });
  });
});

describe('DEFAULT_CATEGORIES', () => {
  it('matches the Python list exactly, including "Educacion"', () => {
    expect([...DEFAULT_CATEGORIES]).toEqual([
      'Servicios',
      'Comida',
      'Transporte',
      'Ocio',
      'Vivienda',
      'Salud',
      'Ingresos',
      'Educacion',
      'Ropa',
    ]);
  });
});
