import type { APIRoute } from 'astro';

import { getDb } from '../../lib/db';
import { validateRegistrationContext, type RegistrationValidation } from '../../lib/onboarding';
import { AUTH_ERROR_MESSAGES, isTermsAccepted, renderAuthErrorPage } from '../../lib/registro';
import {
  ONBOARDING_CONTEXT_MAX_AGE,
  ONBOARDING_COOKIE,
  ONBOARDING_SALT,
  PENDING_AUTH_COOKIE,
  clearCookie,
  getAuthSecret,
  readSignedCookie,
  resolveCookieSecure,
} from '../../lib/signed-cookies';
import {
  SupabaseConfigurationError,
  createSupabaseServerClient,
  getSupabaseServerConfig,
} from '../../lib/supabase';

export const prerender = false;

interface OnboardingCookiePayload {
  invitationId: string;
  agreementVersionId: string;
  invitationExpiresAt: string;
}

export const POST: APIRoute = async ({ request, cookies }) => {
  const secure = resolveCookieSecure();
  const clearOnboarding = () => {
    clearCookie(cookies, ONBOARDING_COOKIE, secure);
    clearCookie(cookies, PENDING_AUTH_COOKIE, secure);
  };
  const fail = (message: string, status: number, clear = false) => {
    if (clear) clearOnboarding();
    return new Response(renderAuthErrorPage(message), {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  };

  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return fail(AUTH_ERROR_MESSAGES.unavailable, 503);
  }

  const payload = await readSignedCookie<OnboardingCookiePayload>(cookies, ONBOARDING_COOKIE, {
    secret,
    salt: ONBOARDING_SALT,
    maxAgeSeconds: ONBOARDING_CONTEXT_MAX_AGE,
  });
  if (
    !payload ||
    typeof payload.invitationId !== 'string' ||
    typeof payload.agreementVersionId !== 'string'
  ) {
    return fail(AUTH_ERROR_MESSAGES.sessionExpired, 400, true);
  }

  const formData = await request.formData().catch(() => null);
  if (!isTermsAccepted(formData?.get('terms_accepted'))) {
    return fail(AUTH_ERROR_MESSAGES.termsRequired, 400);
  }

  let registration: RegistrationValidation;
  try {
    registration = await validateRegistrationContext(
      getDb(),
      payload.invitationId,
      payload.agreementVersionId,
    );
  } catch {
    registration = { status: 'error' };
  }
  if (registration.status === 'expired') {
    return fail(AUTH_ERROR_MESSAGES.invitationExpired, 400, true);
  }
  if (registration.status === 'terms_unavailable') {
    return fail(AUTH_ERROR_MESSAGES.termsChanged, 400, true);
  }
  if (registration.status !== 'valid') {
    return fail(AUTH_ERROR_MESSAGES.invalidRegistration, 400, true);
  }

  const responseHeaders = new Headers();
  let oauthUrl: string;
  try {
    const { callbackUrl } = getSupabaseServerConfig();
    const supabase = createSupabaseServerClient({ request, cookies, responseHeaders });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl },
    });
    if (error || !data?.url) throw error ?? new Error('Missing OAuth redirect URL');
    oauthUrl = data.url;
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      clearCookie(cookies, PENDING_AUTH_COOKIE, secure);
      return fail(AUTH_ERROR_MESSAGES.unavailable, 503);
    }
    return fail(AUTH_ERROR_MESSAGES.googleFailed, 502);
  }

  responseHeaders.set('Location', oauthUrl);
  responseHeaders.set('Cache-Control', 'private, no-store');
  return new Response(null, { status: 303, headers: responseHeaders });
};
