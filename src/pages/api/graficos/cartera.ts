import type { APIRoute } from 'astro';

import { getPortfolioByCurrency, getUserByAuthId } from '../../../lib/dashboard';
import { defaultDateRange } from '../../../lib/dates';
import { getDb } from '../../../lib/db';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const sql = getDb();
  const user = await getUserByAuthId(sql, context.locals.authUserId);
  if (!user) return context.redirect('/login', 303);

  const { from, to } = defaultDateRange(
    context.url.searchParams.get('date_from'),
    context.url.searchParams.get('date_to'),
  );
  const data = await getPortfolioByCurrency(sql, user.id, from, to);
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
};
