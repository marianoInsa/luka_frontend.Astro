import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

import { envValue } from './env';
import { resolveCookieSecure } from './signed-cookies';

export class SupabaseConfigurationError extends Error {}

export interface SupabaseServerConfig {
  url: string;
  publishableKey: string;
  callbackUrl: string;
}

export function getSupabaseServerConfig(): SupabaseServerConfig {
  const url = (envValue('SUPABASE_URL') ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (envValue('PUBLIC_SUPABASE_PUBLISHABLE_KEY') ?? '').trim();
  const appBaseUrl = (envValue('APP_BASE_URL') ?? '').trim().replace(/\/+$/, '');
  if (!url) throw new SupabaseConfigurationError('SUPABASE_URL is not set');
  if (!publishableKey) {
    throw new SupabaseConfigurationError('PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set');
  }
  if (!appBaseUrl) throw new SupabaseConfigurationError('APP_BASE_URL is not set');
  return { url, publishableKey, callbackUrl: `${appBaseUrl}/auth/callback` };
}

export interface SupabaseServerClientContext {
  request: Request;
  cookies: AstroCookies;
  responseHeaders?: Headers;
}

export function createSupabaseServerClient({
  request,
  cookies,
  responseHeaders,
}: SupabaseServerClientContext) {
  const { url, publishableKey } = getSupabaseServerConfig();
  return createServerClient(url, publishableKey, {
    // @supabase/ssr defaults to httpOnly:false without secure; the Python flow
    // stored these session cookies as httpOnly/lax/secure (set_private_cookie).
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
      secure: resolveCookieSecure(),
    },
    cookies: {
      getAll: () => parseCookieHeader(request.headers.get('Cookie') ?? ''),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(name, value, options);
        }
        for (const [name, value] of Object.entries(headers)) {
          responseHeaders?.set(name, value);
        }
      },
    },
  });
}
