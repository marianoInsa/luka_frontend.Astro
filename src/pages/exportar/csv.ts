import type { APIRoute } from 'astro';

import { createCsvStream } from '../../lib/csv';
import { getUserByAuthId } from '../../lib/dashboard';
import { defaultDateRange } from '../../lib/dates';
import { getDb } from '../../lib/db';

export const prerender = false;

// Paridad con app/main.py:exportar_csv: mismas columnas, mismo orden y
// streaming sin cargar todo en memoria (keyset pagination).
export const GET: APIRoute = async (context) => {
  const sql = getDb();
  const user = await getUserByAuthId(sql, context.locals.authUserId);
  if (!user) return context.redirect('/login', 303);

  const { from, to } = defaultDateRange(
    context.url.searchParams.get('date_from'),
    context.url.searchParams.get('date_to'),
  );

  return new Response(createCsvStream(sql, user.id, from, to), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=transacciones.csv',
    },
  });
};
