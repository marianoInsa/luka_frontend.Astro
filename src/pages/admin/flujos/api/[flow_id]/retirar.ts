import type { APIRoute } from 'astro';

import {
  flowAdminClient,
  flowAdminErrorPayload,
  flowAdminGate,
  jsonResponse,
} from '../../../../../lib/flow-admin';

// Espejo de archive_conversation_flow_proxy (app/main.py:892).
export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = flowAdminGate(context.locals.authUserId);
  if (denied) return denied;

  try {
    return jsonResponse(await flowAdminClient.archive(context.params.flow_id as string));
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return jsonResponse(body, status);
  }
};
