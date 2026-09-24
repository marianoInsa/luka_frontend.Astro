import type { APIRoute } from 'astro';

import {
  AUTH_FLOW_MESSAGES,
  clearOnboardingCookies,
  compareIdentities,
  extractGoogleProfileName,
  extractVerifiedGoogleIdentity,
  finalizeResultResponse,
  htmlResponse,
  isOnboardingPayload,
  isTerminalAuthSessionError,
  parsePendingIdentity,
  pendingBindingMatches,
} from '../../lib/auth-flow';
import { getDb } from '../../lib/db';
import {
  finalizeOnboarding,
  type FinalizationResult,
  type VerifiedIdentity,
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
} from '../../lib/signed-cookies';
import {
  SupabaseConfigurationError,
  createSupabaseServerClient,
} from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const secure = resolveCookieSecure();
  const fail = (message: string, status: number, clear = false) => {
    if (clear) clearOnboardingCookies(cookies, request, secure);
    return htmlResponse(renderAuthErrorPage(message), status);
  };

  let secret: string;
  try {
    secret = getAuthSecret();
  } catch {
    return fail(AUTH_FLOW_MESSAGES.unavailable, 503);
  }

  const rawOnboarding = cookies.get(ONBOARDING_COOKIE)?.value ?? null;
  const context = await readSignedCookie<unknown>(cookies, ONBOARDING_COOKIE, {
    secret,
    salt: ONBOARDING_SALT,
    maxAgeSeconds: ONBOARDING_CONTEXT_MAX_AGE,
  });
  const onboarding = isOnboardingPayload(context) ? context : null;
  const pending = parsePendingIdentity(
    await readSignedCookie<unknown>(cookies, PENDING_AUTH_COOKIE, {
      secret,
      salt: PENDING_AUTH_SALT,
      maxAgeSeconds: PENDING_AUTH_MAX_AGE,
    }),
  );
  const pendingIdentity =
    onboarding && rawOnboarding && pending && (await pendingBindingMatches(pending, rawOnboarding))
      ? pending
      : null;
  if (!onboarding || !pendingIdentity) {
    return fail(AUTH_FLOW_MESSAGES.continuarSessionExpired, 400, true);
  }

  const responseHeaders = new Headers();
  let supabase;
  try {
    supabase = createSupabaseServerClient({ request, cookies, responseHeaders });
  } catch (error) {
    if (error instanceof SupabaseConfigurationError) {
      return fail(AUTH_FLOW_MESSAGES.unavailable, 503);
    }
    return fail(AUTH_FLOW_MESSAGES.supabaseUnreachable, 502);
  }

  let freshIdentity: VerifiedIdentity | null;
  let profileName: unknown;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    freshIdentity = extractVerifiedGoogleIdentity(data);
    profileName = extractGoogleProfileName(data);
  } catch (error) {
    if (isTerminalAuthSessionError(error)) {
      return fail(AUTH_FLOW_MESSAGES.googleSessionExpired, 401, true);
    }
    return fail(AUTH_FLOW_MESSAGES.transientRevalidation, 502);
  }
  if (!freshIdentity) {
    return fail(AUTH_FLOW_MESSAGES.identityInvalid, 401, true);
  }

  if (!compareIdentities(freshIdentity, pendingIdentity)) {
    return fail(AUTH_FLOW_MESSAGES.identityChanged, 409, true);
  }

  let result: FinalizationResult;
  try {
    result = await finalizeOnboarding(
      getDb(),
      onboarding.invitationId,
      onboarding.agreementVersionId,
      freshIdentity,
      profileName,
    );
  } catch {
    result = { status: 'database_error' };
  }

  return finalizeResultResponse(result.status, { cookies, request, secure });
};
