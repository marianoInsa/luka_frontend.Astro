import type { AstroCookies } from 'astro';

import { envValue } from './env';

export const ONBOARDING_COOKIE = 'luka_onboarding';
export const PENDING_AUTH_COOKIE = 'luka_pending_google';
export const ONBOARDING_CONTEXT_MAX_AGE = 30 * 60;
export const PENDING_AUTH_MAX_AGE = 15 * 60;

export const ONBOARDING_SALT = 'luka-onboarding-context-v1';
export const PENDING_AUTH_SALT = 'luka-pending-google-auth-v1';

const DEV_SECRET = 'super-secret-dev-key-change-in-prod';
const PLACEHOLDER_SECRET = 'change-me-to-a-random-secret-in-production';
const MAX_COOKIE_LENGTH = 4096;
const CLOCK_SKEW_SECONDS = 60;

const encoder = new TextEncoder();

export interface SignedCookieOptions {
  secret: string;
  salt: string;
  maxAgeSeconds: number;
  now?: Date;
}

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function hmacKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    [usage],
  );
}

function signedMessage(salt: string, payload: string, issuedAt: number): string {
  return `${salt}\n${payload}\n${issuedAt}`;
}

export async function signCookieValue(
  payload: unknown,
  options: SignedCookieOptions,
): Promise<string> {
  const issuedAt = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const encoded = base64urlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(options.secret, 'sign'),
    encoder.encode(signedMessage(options.salt, encoded, issuedAt)),
  );
  return `${encoded}.${issuedAt}.${base64urlEncode(new Uint8Array(signature))}`;
}

export async function verifyCookieValue<T = Record<string, unknown>>(
  raw: string | null | undefined,
  options: SignedCookieOptions,
): Promise<T | null> {
  if (!raw || raw.length > MAX_COOKIE_LENGTH) return null;

  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [encoded, timestamp, signature] = parts;
  const issuedAt = Number(timestamp);
  if (!Number.isInteger(issuedAt)) return null;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (issuedAt > nowSeconds + CLOCK_SKEW_SECONDS) return null;
  if (nowSeconds - issuedAt > options.maxAgeSeconds) return null;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(options.secret, 'verify'),
      base64urlDecode(signature),
      encoder.encode(signedMessage(options.salt, encoded, issuedAt)),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64urlDecode(encoded)));
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export function ttlSeconds(
  expiresAt: Date | string,
  maxAgeSeconds: number,
  now: Date = new Date(),
): number {
  const expires = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  const remaining = Math.floor((expires.getTime() - now.getTime()) / 1000);
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new RangeError('expiry is in the past');
  }
  return Math.min(maxAgeSeconds, remaining);
}

export function getAuthSecret(): string {
  const secret = envValue('SECRET_KEY') || DEV_SECRET;
  const appEnv = (envValue('APP_ENV') ?? 'development').trim().toLowerCase();
  if (
    appEnv === 'production' &&
    (secret === DEV_SECRET || secret === PLACEHOLDER_SECRET || secret.length < 32)
  ) {
    throw new Error('A production SECRET_KEY is required');
  }
  return secret;
}

export function resolveCookieSecure(): boolean {
  const appEnv = (envValue('APP_ENV') ?? 'development').trim().toLowerCase();
  return envValue('AUTH_COOKIE_SECURE')?.trim().toLowerCase() === 'true' || appEnv === 'production';
}

export async function setSignedCookie(
  cookies: AstroCookies,
  name: string,
  payload: unknown,
  options: SignedCookieOptions & { secure: boolean },
): Promise<void> {
  const value = await signCookieValue(payload, options);
  cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: options.maxAgeSeconds,
    secure: options.secure,
  });
}

export async function readSignedCookie<T>(
  cookies: AstroCookies,
  name: string,
  options: SignedCookieOptions,
): Promise<T | null> {
  return verifyCookieValue<T>(cookies.get(name)?.value, options);
}

export function clearCookie(cookies: AstroCookies, name: string, secure: boolean): void {
  cookies.delete(name, { httpOnly: true, sameSite: 'lax', path: '/', secure });
}
