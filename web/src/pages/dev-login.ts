import type { APIRoute } from 'astro';

import { getMockAuthUserId, mockAuthEnabled } from '../lib/login';
import { renderAuthErrorPage } from '../lib/registro';
import { setSessionCookie } from '../lib/session';

export const prerender = false;

// Paridad con app/main.py:dev_login: solo con APP_ENV=development y
// ENABLE_MOCK_AUTH=true; fuera de eso responde 404.
export const GET: APIRoute = async ({ cookies }) => {
  if (!mockAuthEnabled()) {
    return new Response(renderAuthErrorPage('Ruta no disponible.'), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
      },
    });
  }

  await setSessionCookie(cookies, getMockAuthUserId());
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/app',
      'Cache-Control': 'private, no-store',
    },
  });
};
