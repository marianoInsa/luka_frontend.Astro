import { defineMiddleware } from 'astro:middleware';

import { SESSION_COOKIE, decodeSessionToken } from './lib/session';

// Mismas áreas privadas que en FastAPI pasan por get_current_user: el 401 se
// convierte en 303 a /login (paridad con app/main.py:unauthorized_handler).
const PROTECTED_PREFIXES = ['/app', '/dashboard', '/partials', '/api/graficos', '/exportar', '/admin'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  const needsSession = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!needsSession) return next();

  const raw = context.cookies.get(SESSION_COOKIE)?.value;
  let authUserId: string | null = null;
  if (raw) {
    try {
      authUserId = await decodeSessionToken(raw);
    } catch {
      // SECRET_KEY inválida en producción: sesión no verificable → /login.
      authUserId = null;
    }
  }
  if (!authUserId) return context.redirect('/login', 303);

  context.locals.authUserId = authUserId;
  return next();
});
