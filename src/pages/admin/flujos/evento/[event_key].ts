import type { APIRoute } from 'astro';
import { flowAdminClient, flowAdminErrorPayload, flowAdminGate, jsonResponse } from '../../../../lib/flow-admin';

export const prerender = false;

/** Abre el recurso compartido; si todavía no existe, preselecciona su plantilla. */
export const GET: APIRoute = async (context) => {
  const denied = flowAdminGate(context.locals.authUserId);
  if (denied) return denied;
  const eventKey = context.params.event_key || '';
  try {
    const flows = await flowAdminClient.list();
    const flow = flows.find((item) => item.event_key === eventKey && item.status !== 'archived');
    return context.redirect(flow ? `/admin/flujos/${encodeURIComponent(flow.id)}` : `/admin/flujos/nuevo?event=${encodeURIComponent(eventKey)}`, 303);
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return jsonResponse(body, status);
  }
};
