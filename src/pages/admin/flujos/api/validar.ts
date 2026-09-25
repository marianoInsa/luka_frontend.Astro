import type { APIRoute } from 'astro';

import {
  flowAdminClient,
  flowAdminErrorPayload,
  flowAdminGate,
  jsonResponse,
  readFlowPayload,
} from '../../../../lib/flow-admin';

// Espejo de validate_conversation_flow_proxy (app/main.py:836).
export const prerender = false;

export const POST: APIRoute = async (context) => {
  const denied = flowAdminGate(context.locals.authUserId);
  if (denied) return denied;

  const payload = await readFlowPayload(context.request);
  if (payload instanceof Response) return payload;

  try {
    return jsonResponse(await flowAdminClient.validate(payload));
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return jsonResponse(body, status);
  }
};
