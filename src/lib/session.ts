import type { AstroCookies } from 'astro';

import {
  base64urlDecode,
  base64urlEncode,
  getAuthSecret,
  resolveCookieSecure,
} from './signed-cookies';

export const SESSION_COOKIE = 'luka_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

// Parity with itsdangerous URLSafeTimedSerializer(secret, salt="session"):
// key = SHA1(salt + b"signer" + secret) ("django-concat"), HMAC-SHA1 signature.
const SESSION_SALT = 'session';
const MAX_TOKEN_LENGTH = 4096;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface SessionTokenOptions {
  secret?: string;
  now?: Date;
  maxAgeSeconds?: number;
}

function currentSeconds(now?: Date): number {
  return Math.floor((now ?? new Date()).getTime() / 1000);
}

// itsdangerous int_to_bytes: struct.pack(">Q", ts).lstrip(b"\x00") → 4 bytes until 2106.
function timestampBytes(seconds: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, seconds, false);
  return bytes;
}

function timestampSeconds(encoded: string): number | null {
  const bytes = base64urlDecode(encoded);
  if (bytes.length > 8) return null;
  let seconds = 0;
  for (const byte of bytes) seconds = seconds * 256 + byte;
  return seconds;
}

async function sessionKey(secret: string, usage: KeyUsage): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    encoder.encode(`${SESSION_SALT}signer${secret}`),
  );
  return crypto.subtle.importKey('raw', digest, { name: 'HMAC', hash: 'SHA-1' }, false, [
    usage,
  ]);
}

export async function createSessionToken(
  authUserId: string,
  options: { secret?: string; now?: Date } = {},
): Promise<string> {
  const secret = options.secret ?? getAuthSecret();
  const payload = base64urlEncode(encoder.encode(JSON.stringify(authUserId)));
  const timestamp = base64urlEncode(timestampBytes(currentSeconds(options.now)));
  const message = `${payload}.${timestamp}`;
  const signature = await crypto.subtle.sign(
    'HMAC',
    await sessionKey(secret, 'sign'),
    encoder.encode(message),
  );
  return `${message}.${base64urlEncode(new Uint8Array(signature))}`;
}

export async function decodeSessionToken(
  raw: string | null | undefined,
  options: SessionTokenOptions = {},
): Promise<string | null> {
  if (!raw || raw.length > MAX_TOKEN_LENGTH) return null;

  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [payload, timestamp, signature] = parts;

  const secret = options.secret ?? getAuthSecret();

  // Signature first (constant-time compare inside WebCrypto), then timestamp,
  // then payload — same order as TimestampSigner.unsign + Serializer.loads.
  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await sessionKey(secret, 'verify'),
      base64urlDecode(signature),
      encoder.encode(`${payload}.${timestamp}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const issuedAt = timestampSeconds(timestamp);
  if (issuedAt === null) return null;
  const age = currentSeconds(options.now) - issuedAt;
  if (age > (options.maxAgeSeconds ?? SESSION_MAX_AGE) || age < 0) return null;

  try {
    // ponytail: no compressed payloads — itsdangerous only zlibs a leading "."
    // payload, and the only signed value is a UUID, far below the threshold.
    const value: unknown = JSON.parse(decoder.decode(base64urlDecode(payload)));
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(
  cookies: AstroCookies,
  authUserId: string,
): Promise<void> {
  const token = await createSessionToken(authUserId);
  cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
    secure: resolveCookieSecure(),
  });
}

export function clearSessionCookie(cookies: AstroCookies): void {
  cookies.delete(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: resolveCookieSecure(),
  });
}
