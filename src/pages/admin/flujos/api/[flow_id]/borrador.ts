import type { APIRoute } from 'astro';

import {
  flowAdminClient,
  flowAdminErrorPayload,
  flowAdminGate,
  jsonResponse,
  readFlowPayload,
} from '../../../../../lib/flow-admin';

// Espejo de save/discard_conversation_flow_proxy (app/main.py:858-878).
export const prerender = false;

export const PUT: APIRoute = async (context) => {
  const denied = flowAdminGate(context.locals.authUserId);
  if (denied) return denied;

  const payload = await readFlowPayload(context.request);
  if (payload instanceof Response) return payload;

  try {
    return jsonResponse(await flowAdminClient.saveDraft(context.params.flow_id as string, payload));
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return jsonResponse(body, status);
  }
};

export const DELETE: APIRoute = async (context) => {
  const denied = flowAdminGate(context.locals.authUserId);
  if (denied) return denied;

  try {
    return jsonResponse(await flowAdminClient.discardDraft(context.params.flow_id as string));
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return jsonResponse(body, status);
  }
};
