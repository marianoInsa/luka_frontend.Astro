import { parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

import {
  hashToken,
  parseIdentity,
  type FinalizationStatus,
  type VerifiedIdentity,
} from './onboarding';
import { renderAuthErrorPage, renderRegistrationCompletedPage } from './registro';
import { ONBOARDING_COOKIE, PENDING_AUTH_COOKIE, clearCookie } from './signed-cookies';

// Mensajes copiados literalmente de app/main.py (/auth/callback,
// /registro/continuar y /registro/finalizar).
export const AUTH_FLOW_MESSAGES = {
  cancelled: 'La autenticación con Google fue cancelada. Intentá nuevamente.',
  googleFailed: 'Google no pudo completar la autenticación. Intentá nuevamente.',
  invalidResponse: 'No recibimos una respuesta válida de Google. Intentá nuevamente.',
  unavailable: 'La autenticación no está disponible temporalmente. Intentá más tarde.',
  sessionExpired: 'Tu sesión de registro venció. Volvé a abrir el enlace de WhatsApp.',
  oauthExpired: 'El enlace venció durante Google OAuth. Solicitá uno nuevo por WhatsApp.',
  callbackContextInvalid: 'Tu sesión de registro ya no es válida. Volvé a abrir el enlace.',
  googleSessionExpired: 'Tu sesión con Google venció. Volvé a iniciar la autenticación.',
  exchangeFailed: 'No pudimos validar la sesión de Google. Iniciá la autenticación nuevamente.',
  continuarSessionExpired:
    'Tu sesión de registro venció. Volvé a iniciar desde el enlace de WhatsApp.',
  continuarInvalid: 'El registro ya no está disponible. Volvé a abrir el enlace de WhatsApp.',
  supabaseUnreachable:
    'No pudimos contactar a Supabase para revalidar tu sesión. Intentá nuevamente.',
  identityInvalid: 'La identidad de Google ya no es válida. Volvé a iniciar el registro.',
  transientRevalidation:
    'No pudimos revalidar Google por un error transitorio. Intentá nuevamente.',
  identityChanged:
    'La identidad de Google cambió durante el registro. No se realizó ningún cambio.',
  finalizeExpired: 'El enlace de registro venció. Solicitá uno nuevo por WhatsApp.',
  finalizeConsumed: 'Este enlace de registro ya fue utilizado.',
  termsChanged:
    'Los términos cambiaron. Volvé a comenzar para leer y aceptar la nueva versión.',
  identityConflict:
    'No pudimos vincular la cuenta porque algunos datos ya están asociados a otra identidad. No se realizó ningún cambio.',
  databaseError:
    'No pudimos completar el registro por un error transitorio. Intentá nuevamente.',
  finalizeDefault: 'El registro ya no está disponible. Solicitá un nuevo enlace por WhatsApp.',
} as const;

export interface OnboardingPayload {
  invitationId: string;
  agreementVersionId: string;
}

export interface PendingAuthPayload {
  authUserId: string;
  provider: string;
  email: string;
  onboardingHash: string;
}

export function isOnboardingPayload(value: unknown): value is OnboardingPayload {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.invitationId === 'string' && typeof candidate.agreementVersionId === 'string';
}

// Espejo de load_pending_auth_context: la cookie debe traer una identidad
// Google completa antes de compararla con la firma del contexto.
export function parsePendingIdentity(value: unknown): PendingAuthPayload | null {
  if (value === null || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.provider !== 'google') return null;
  if (typeof candidate.authUserId !== 'string' || !candidate.authUserId) return null;
  if (typeof candidate.email !== 'string' || !candidate.email) return null;
  if (typeof candidate.onboardingHash !== 'string' || !candidate.onboardingHash) return null;
  return {
    authUserId: candidate.authUserId,
    provider: candidate.provider,
    email: candidate.email,
    onboardingHash: candidate.onboardingHash,
  };
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

// Espejo de create/load_pending_auth_context: el hash sha256 de la cookie
// cruda de onboarding ata la identidad pendiente a este registro.
export async function pendingBindingMatches(
  pending: PendingAuthPayload,
  rawOnboardingCookie: string,
): Promise<boolean> {
  return constantTimeEquals(pending.onboardingHash, await hashToken(rawOnboardingCookie));
}

// Compara la identidad fresca de Supabase contra la pendiente con las mismas
// reglas del backend: uuid canónico, provider google y email en minúsculas.
export function compareIdentities(fresh: VerifiedIdentity, pending: VerifiedIdentity): boolean {
  const left = parseIdentity(fresh);
  const right = parseIdentity(pending);
  return (
    left !== null && right !== null && left.authUserId === right.authUserId && left.email === right.email
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readUser(userResponse: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(userResponse)?.user);
}

// Espejo de extract_verified_google_identity (app/services/supabase_auth.py):
// exige uuid válido, email confirmado y provider google tanto en app_metadata
// como en identities.
export function extractVerifiedGoogleIdentity(userResponse: unknown): VerifiedIdentity | null {
  const user = readUser(userResponse);
  if (!user) return null;

  const appMetadata = asRecord(user.app_metadata);
  const identities = Array.isArray(user.identities) ? user.identities : [];
  const identityProviders = new Set(identities.map((identity) => asRecord(identity)?.provider));
  const isGoogle = appMetadata?.provider === 'google' && identityProviders.has('google');

  const candidate = parseIdentity({
    authUserId: typeof user.id === 'string' ? user.id : '',
    provider: 'google',
    email: typeof user.email === 'string' ? user.email : '',
  });
  if (!candidate || !user.email_confirmed_at || !isGoogle) return null;

  return { authUserId: candidate.authUserId, provider: 'google', email: candidate.email };
}

// Espejo de extract_google_profile_name: solo perfil, nunca autorización.
export function extractGoogleProfileName(userResponse: unknown): unknown {
  const user = readUser(userResponse);
  const metadata = user ? asRecord(user.user_metadata) : null;
  if (!metadata) return null;
  return metadata.full_name || metadata.name;
}

const TERMINAL_AUTH_ERROR_NAMES = new Set([
  'AuthInvalidCredentialsError',
  'AuthInvalidJwtError',
  'AuthSessionMissingError',
  'AuthPKCECodeVerifierMissingError',
]);

// Espejo de is_terminal_auth_session_error: reintentar con la misma sesión
// no puede funcionar.
export function isTerminalAuthSessionError(error: unknown): boolean {
  const candidate = asRecord(error);
  if (!candidate) return false;
  if (typeof candidate.name === 'string' && TERMINAL_AUTH_ERROR_NAMES.has(candidate.name)) {
    return true;
  }
  return (
    candidate.name === 'AuthApiError' &&
    typeof candidate.status === 'number' &&
    [400, 401, 403].includes(candidate.status)
  );
}

export interface FinalizeFailure {
  status: number;
  message: string;
  clear: boolean;
}

const FINALIZE_FAILURES: Partial<Record<FinalizationStatus, FinalizeFailure>> = {
  invitation_expired: { status: 410, message: AUTH_FLOW_MESSAGES.finalizeExpired, clear: true },
  invitation_consumed: { status: 409, message: AUTH_FLOW_MESSAGES.finalizeConsumed, clear: true },
  agreement_not_found: { status: 409, message: AUTH_FLOW_MESSAGES.termsChanged, clear: true },
  agreement_changed: { status: 409, message: AUTH_FLOW_MESSAGES.termsChanged, clear: true },
  identity_conflict: { status: 409, message: AUTH_FLOW_MESSAGES.identityConflict, clear: true },
  database_error: { status: 503, message: AUTH_FLOW_MESSAGES.databaseError, clear: false },
};

const FINALIZE_DEFAULT: FinalizeFailure = {
  status: 400,
  message: AUTH_FLOW_MESSAGES.finalizeDefault,
  clear: true,
};

// Mapeo de app/main.py: success se maneja aparte; database_error es transitorio
// y no borra cookies; el resto de los estados terminales sí.
export function mapFinalizationFailure(status: FinalizationStatus): FinalizeFailure | null {
  if (status === 'success') return null;
  return FINALIZE_FAILURES[status] ?? FINALIZE_DEFAULT;
}

function requestCookieNames(request: Request): string[] {
  return parseCookieHeader(request.headers.get('cookie') ?? '').map(({ name }) => name);
}

const SUPABASE_COOKIE_PATTERN = /^sb-.*(-auth-token|code-verifier)(\.\d+)?$/;

export function hasCodeVerifierCookie(request: Request): boolean {
  return requestCookieNames(request).some((name) => name.includes('code-verifier'));
}

export function clearSupabaseAuthCookies(
  cookies: AstroCookies,
  request: Request,
  secure: boolean,
): void {
  for (const name of requestCookieNames(request)) {
    if (SUPABASE_COOKIE_PATTERN.test(name)) clearCookie(cookies, name, secure);
  }
}

export function clearGoogleAuthCookies(
  cookies: AstroCookies,
  request: Request,
  secure: boolean,
): void {
  clearCookie(cookies, PENDING_AUTH_COOKIE, secure);
  clearSupabaseAuthCookies(cookies, request, secure);
}

export function clearOnboardingCookies(
  cookies: AstroCookies,
  request: Request,
  secure: boolean,
): void {
  clearCookie(cookies, ONBOARDING_COOKIE, secure);
  clearGoogleAuthCookies(cookies, request, secure);
}

export function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
    },
  });
}

export interface AuthFlowContext {
  cookies: AstroCookies;
  request: Request;
  secure: boolean;
}

export function finalizeResultResponse(
  status: FinalizationStatus,
  context: AuthFlowContext,
): Response {
  const failure = mapFinalizationFailure(status);
  if (!failure) {
    clearOnboardingCookies(context.cookies, context.request, context.secure);
    return htmlResponse(renderRegistrationCompletedPage(), 200);
  }
  if (failure.clear) {
    clearOnboardingCookies(context.cookies, context.request, context.secure);
  }
  return htmlResponse(renderAuthErrorPage(failure.message), failure.status);
}
