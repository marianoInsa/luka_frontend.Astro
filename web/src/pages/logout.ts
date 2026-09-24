import type { APIRoute } from 'astro';

import { clearSessionCookie } from '../lib/session';

export const prerender = false;

// Paridad con app/main.py:logout: borra luka_session y redirige a /login.
export const GET: APIRoute = ({ cookies }) => {
  clearSessionCookie(cookies);
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/login',
      'Cache-Control': 'private, no-store',
    },
  });
};
