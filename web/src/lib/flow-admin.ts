import { envValue } from './env';

// Espejo de app/services/conversation_flow_admin.py:is_flow_admin (CSV,
// case-insensitive). El panel completo se porta en F4.
export function isFlowAdmin(authUserId: string): boolean {
  const configured = envValue('FLOW_ADMIN_AUTH_USER_IDS') ?? '';
  const allowed = new Set(
    configured
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowed.size > 0 && allowed.has(authUserId.trim().toLowerCase());
}

export interface FlowAdminValidationError {
  path: string;
  message: string;
}

export interface FlowAdminEventPolicy {
  event_key: string;
  variables: string[];
  actions: string[];
  terminal_only: boolean;
}

export interface FlowAdminContract {
  events: FlowAdminEventPolicy[];
  node_types: string[];
}

export interface FlowAdminVersion {
  version_number: number;
}

export interface FlowSummary {
  id: string;
  slug: string;
  name: string;
  event_key: string;
  status: string;
  draft?: FlowAdminVersion | null;
  published?: FlowAdminVersion | null;
}

export interface FlowRecord extends FlowSummary {
  draft?: (FlowAdminVersion & { definition?: unknown }) | null;
  published?: (FlowAdminVersion & { definition?: unknown }) | null;
}

export class FlowAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FlowAdminConfigError';
  }
}

export class FlowAdminApiError extends Error {
  readonly statusCode: number;
  readonly errors: FlowAdminValidationError[];

  constructor(statusCode: number, message: string, errors: FlowAdminValidationError[] = []) {
    super(message);
    this.name = 'FlowAdminApiError';
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

// Espejo de ConversationFlowAdminClient._settings.
function settings(): { baseUrl: string; apiKey: string } {
  const baseUrl = (envValue('LUKA_BACKEND_URL') ?? '').trim().replace(/\/+$/, '');
  const apiKey = (envValue('FLOW_ADMIN_API_KEY') ?? '').trim();
  if (!baseUrl || !apiKey) {
    throw new FlowAdminConfigError('La administración de flujos no está configurada.');
  }
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    throw new FlowAdminConfigError('LUKA_BACKEND_URL no es válida.');
  }
  return { baseUrl, apiKey };
}

// Espejo de ConversationFlowAdminClient._request.
async function request<T>(
  method: string,
  path: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const { baseUrl, apiKey } = settings();

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new FlowAdminApiError(503, 'No se pudo contactar al backend de Luka.');
  }

  if (response.ok) {
    return (await response.json()) as T;
  }

  let message = 'El backend rechazó la operación.';
  let errors: FlowAdminValidationError[] = [];
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const detail = (body as Record<string, unknown>).detail;
      if (typeof detail === 'string') {
        message = detail;
      } else if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
        const raw = detail as Record<string, unknown>;
        message = String(raw.message || 'El backend rechazó la operación.');
        if (Array.isArray(raw.errors)) {
          errors = raw.errors
            .filter(
              (item): item is Record<string, unknown> =>
                Boolean(item) && typeof item === 'object' && !Array.isArray(item),
            )
            .map((item) => ({
              path: String(item.path || 'definition'),
              message: String(item.message || 'Error de validación'),
            }));
        }
      }
    }
  } catch {
    // Body sin JSON: quedan el mensaje y los errores por defecto.
  }
  throw new FlowAdminApiError(response.status, message, errors);
}

// Espejo de app/services/conversation_flow_admin.py:ConversationFlowAdminClient.
export const flowAdminClient = {
  contracts(): Promise<FlowAdminContract> {
    return request('GET', '/admin/conversation-flows/contracts');
  },
  list(): Promise<FlowSummary[]> {
    return request('GET', '/admin/conversation-flows');
  },
  get(flowId: string): Promise<FlowRecord> {
    return request('GET', `/admin/conversation-flows/${flowId}`);
  },
  create(payload: Record<string, unknown>): Promise<FlowRecord> {
    return request('POST', '/admin/conversation-flows', payload);
  },
  validate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request('POST', '/admin/conversation-flows/validate', payload);
  },
  saveDraft(flowId: string, payload: Record<string, unknown>): Promise<FlowRecord> {
    return request('PUT', `/admin/conversation-flows/${flowId}/draft`, payload);
  },
  discardDraft(flowId: string): Promise<FlowRecord> {
    return request('DELETE', `/admin/conversation-flows/${flowId}/draft`);
  },
  publish(flowId: string): Promise<FlowRecord> {
    return request('POST', `/admin/conversation-flows/${flowId}/publish`);
  },
  archive(flowId: string): Promise<FlowRecord> {
    return request('POST', `/admin/conversation-flows/${flowId}/archive`);
  },
};

export type FlowAdminLoadResult<T> =
  | ({ ok: true } & T)
  | { ok: false; status: number; message: string };

// Listado de la página /admin/flujos; en error se renderiza la lista con la
// alerta y el status del backend (espejo de _flow_admin_page_error).
export async function loadFlowAdminList(): Promise<FlowAdminLoadResult<{ flows: FlowSummary[] }>> {
  try {
    return { ok: true, flows: await flowAdminClient.list() };
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return { ok: false, status, message: body.message };
  }
}

// Datos del editor: contrato solo para el flujo nuevo; get + contracts en
// paralelo para el existente (espejo de asyncio.gather en app/main.py:912).
export async function loadFlowAdminEditor(
  flowId: string | null,
): Promise<FlowAdminLoadResult<{ flow: FlowRecord | null; contract: FlowAdminContract }>> {
  try {
    if (flowId === null) {
      return { ok: true, flow: null, contract: await flowAdminClient.contracts() };
    }
    const [flow, contract] = await Promise.all([
      flowAdminClient.get(flowId),
      flowAdminClient.contracts(),
    ]);
    return { ok: true, flow, contract };
  } catch (exc) {
    const { status, body } = flowAdminErrorPayload(exc);
    return { ok: false, status, message: body.message };
  }
}

// Espejo de app/main.py:_flow_admin_error_response.
export function flowAdminErrorPayload(exc: unknown): {
  status: number;
  body: { message: string; errors: FlowAdminValidationError[] };
} {
  if (exc instanceof FlowAdminApiError) {
    return { status: exc.statusCode, body: { message: exc.message, errors: exc.errors } };
  }
  // str(exc) de Python no antepone el nombre de la clase.
  return { status: 503, body: { message: exc instanceof Error ? exc.message : String(exc), errors: [] } };
}

// Espejo de `| tojson` de Jinja para embeber JSON en un <script>.
export function jsonForScript(value: unknown): string {
  return (JSON.stringify(value) ?? 'null')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Espejo de require_flow_admin_user (app/main.py): HTTPException(403) sin tocar
// el backend. Devuelve null si el usuario está habilitado.
export function flowAdminGate(authUserId: string): Response | null {
  if (isFlowAdmin(authUserId)) return null;
  return jsonResponse({ detail: 'Acceso administrativo requerido' }, 403);
}

// FastAPI valida el body como dict (422 si no lo es); acá se responde 400 con
// el mismo espíritu para no filtrar el SyntaxError del parseo.
export async function readFlowPayload(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return jsonResponse({ detail: 'JSON inválido.' }, 400);
    }
    return value as Record<string, unknown>;
  } catch {
    return jsonResponse({ detail: 'JSON inválido.' }, 400);
  }
}
