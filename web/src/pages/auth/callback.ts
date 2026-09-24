import type { APIRoute } from 'astro';

import {
  AUTH_FLOW_MESSAGES,
  clearGoogleAuthCookies,
  clearOnboardingCookies,
  extractVerifiedGoogleIdentity,
  hasCodeVerifierCookie,
  htmlResponse,
  isOnboardingPayload,
} from '../../lib/auth-flow';
import { getDb } from '../../lib/db';
import {
  hashToken,
  validateRegistrationContext,
  type RegistrationValidation,
} from '../../lib/onboarding';
import { renderAuthErrorPage } from '../../lib/registro';
import {
  ONBOARDING_CONTEXT_MAX_AGE,
  ONBOARDING_COOKIE,
  ONBOARDING_SALT,
  PENDING_AUTH_COOKIE,
  PENDING_AUTH_MAX_AGE,
  PENDING_AUTH_SALT,
  getAuthSecret,
  readSignedCookie,
  resolveCookieSecure,
  setSignedCookie,
} from '../../lib/signed-cookies';
import {
  SupabaseConfigurationError,
  createSupabaseServerClient,
} from '../../lib/supabase';

export const prerender = false;

const MAX_CODE_LENGTH = 4096;

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const secure = resolveCookieSecure();
  const fail = (message: string, status: number, scope: 'google' | 'all' | false = false) => {
    if (scope === 'all') clearOnboardingCookies(cookies, request, secure);
    else if (scope === 'google') clearGoogleAuthCookies(cookies, request, secure);
    return htmlResponse(renderAuthErrorPage(message), status);
  };

  const error = url.searchParams.get('error');
  if (error) {
    return fail(
      error === 'access_denied' ? AUTH_FLOW_MESSAGES.cancelled : AUTH_FLOW_MESSAGES.googleFailed,
      400,
      'google',
    );
  }

  const code = url.searchParams.get('code');
  if (!code || code.length > MAX_CODE_LENGTH) {
    return fail(AUTH_FLOW_MESSAGES.invalidResponse, 400, 'google');
  }

  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return fail(AUTH_FLOW_MESSAGES.unavailable, 503, 'google');
  }

  const rawOnboarding = cookies.get(ONBOARDING_COOKIE)?.value ?? null;
  const context = await readSignedCookie<unknown>(cookies, ONBOARDING_COOKIE, {
    secret,
    salt: ONBOARDING_SALT,
    maxAgeSeconds: ONBOARDING_CONTEXT_MAX_AGE,
  });
  const onboarding = isOnboardingPayload(context) ? context : null;
  if (!rawOnboarding || !onboarding) {
    return fail(AUTH_FLOW_MESSAGES.sessionExpired, 400, 'all');
  }

  let registration: RegistrationValidation;
  try {
    registration = await validateRegistrationContext(
      getDb(),
      onboarding.invitationId,
      onboarding.agreementVersionId,
    );
  } catch {
    registration = { status: 'error' };
  }
  if (registration.status === 'expired') {
    return fail(AUTH_FLOW_MESSAGES.oauthExpired, 400, 'all');
  }
  if (registration.status !== 'valid') {
    return fail(AUTH_FLOW_MESSAGES.callbackContextInvalid, 400, 'all');
  }

  if (!hasCodeVerifierCookie(request)) {
    return fail(AUTH_FLOW_MESSAGES.googleSessionExpired, 400, 'google');
  }

  const responseHeaders = new Headers();
  let supabase;
  try {
    supabase = createSupabaseServerClient({ request, cookies, responseHeaders });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return fail(AUTH_FLOW_MESSAGES.unavailable, 503, 'google');
    }
    return fail(AUTH_FLOW_MESSAGES.exchangeFailed, 400, 'google');
  }

  try {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    const session = data?.session;
    if (!session?.access_token) throw new Error('Missing exchanged session');

    const { data: userData, error: userError } = await supabase.auth.getUser(session.access_token);
    if (userError) throw userError;
    const identity = extractVerifiedGoogleIdentity(userData);
    if (!identity) throw new Error('Authenticated identity is not a verified Google user');

    await setSignedCookie(
      cookies,
      PENDING_AUTH_COOKIE,
      {
        authUserId: identity.authUserId,
        provider: identity.provider,
        email: identity.email,
        onboardingHash: await hashToken(rawOnboarding),
      },
      { secret, salt: PENDING_AUTH_SALT, maxAgeSeconds: PENDING_AUTH_MAX_AGE, secure },
    );

    responseHeaders.set('Location', '/registro/continuar');
    responseHeaders.set('Cache-Control', 'private, no-store');
    return new Response(null, { status: 303, headers: responseHeaders });
  } catch {
    return fail(AUTH_FLOW_MESSAGES.exchangeFailed, 400, 'google');
  }
};
