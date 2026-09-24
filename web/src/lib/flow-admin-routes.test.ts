import type { APIContext } from 'astro';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as createFlow } from '../pages/admin/flujos/api/index';
import { POST as validar } from '../pages/admin/flujos/api/validar';
import {
  DELETE as discardDraft,
  PUT as saveDraft,
} from '../pages/admin/flujos/api/[flow_id]/borrador';
import { POST as publicar } from '../pages/admin/flujos/api/[flow_id]/publicar';
import { POST as retirar } from '../pages/admin/flujos/api/[flow_id]/retirar';

// Tests de ruta de los proxies de F4 (espejo de
// tests/test_conversation_flow_admin.py): gate 403, forwarding al backend,
// 201 en create, contrato de errores y no filtración del secreto.

const ADMIN_ID = 'aaaa-1111';
const FLOW_ID = '11111111-1111-1111-1111-111111111111';
const BASE = 'https://backend.example';
const API_KEY = 'server-only-key';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  process.env.FLOW_ADMIN_AUTH_USER_IDS = ADMIN_ID;
  process.env.LUKA_BACKEND_URL = BASE;
  process.env.FLOW_ADMIN_API_KEY = API_KEY;
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FLOW_ADMIN_AUTH_USER_IDS;
  delete process.env.LUKA_BACKEND_URL;
  delete process.env.FLOW_ADMIN_API_KEY;
});

function context(request: Request, authUserId = ADMIN_ID): APIContext {
  return {
    request,
    locals: { authUserId },
    params: { flow_id: FLOW_ID },
  } as unknown as APIContext;
}

function jsonRequest(path: string, payload: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const allEndpoints = [
  { name: 'validar', run: (ctx: APIContext) => validar(ctx), path: '/admin/flujos/api/validar' },
  { name: 'crear', run: (ctx: APIContext) => createFlow(ctx), path: '/admin/flujos/api' },
  { name: 'guardar borrador', run: (ctx: APIContext) => saveDraft(ctx), path: '/admin/flujos/api/x/borrador' },
  { name: 'descartar borrador', run: (ctx: APIContext) => discardDraft(ctx), path: '/admin/flujos/api/x/borrador' },
  { name: 'publicar', run: (ctx: APIContext) => publicar(ctx), path: '/admin/flujos/api/x/publicar' },
  { name: 'retirar', run: (ctx: APIContext) => retirar(ctx), path: '/admin/flujos/api/x/retirar' },
];

describe('gate de admin (espejo de require_flow_admin_user)', () => {
  it('responde 403 sin sesión habilitada y no toca el backend', async () => {
    for (const endpoint of allEndpoints) {
      const response = await endpoint.run(context(jsonRequest(endpoint.path, {}), 'intruso'));

      expect(response.status, endpoint.name).toBe(403);
      expect(await response.json()).toEqual({ detail: 'Acceso administrativo requerido' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('proxies', () => {
  it('validar reenvía el payload y devuelve el JSON del backend', async () => {
    const payload = { event_key: 'dashboard.link.sent', definition: { start_node: 'a', nodes: [] } };
    fetchMock.mockResolvedValue(jsonResponse({ definition: payload.definition }));

    const response = await validar(context(jsonRequest('/admin/flujos/api/validar', payload)));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ definition: payload.definition });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/admin/conversation-flows/validate`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(payload));
    expect(init.headers).toEqual({ Authorization: `Bearer ${API_KEY}`, Accept: 'application/json' });
  });

  it('crear responde 201 aunque el backend devuelva 200 y no filtra el secreto', async () => {
    const payload = { slug: 'dashboard-link', name: 'Enlace', event_key: 'x', definition: {} };
    fetchMock.mockResolvedValue(jsonResponse({ id: FLOW_ID, name: 'Enlace' }, 200));

    const response = await createFlow(context(jsonRequest('/admin/flujos/api', payload)));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toEqual({ id: FLOW_ID, name: 'Enlace' });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/admin/conversation-flows`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it('guardar borrador reenvía flow_id y payload', async () => {
    const payload = { name: 'Actualizado', definition: { start_node: 'a', nodes: [] } };
    fetchMock.mockResolvedValue(jsonResponse({ id: FLOW_ID }));

    const response = await saveDraft(
      context(new Request(`http://localhost/admin/flujos/api/${FLOW_ID}/borrador`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })),
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/admin/conversation-flows/${FLOW_ID}/draft`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify(payload));
  });

  it('descartar borrador, publicar y retirar usan el método y la ruta del backend', async () => {
    const cases = [
      { endpoint: discardDraft, method: 'DELETE', suffix: 'draft', body: undefined },
      { endpoint: publicar, method: 'POST', suffix: 'publish', body: '{}' },
      { endpoint: retirar, method: 'POST', suffix: 'archive', body: '{}' },
    ] as const;

    for (const call of cases) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse({ id: FLOW_ID }));

      const request = new Request(`http://localhost/admin/flujos/api/${FLOW_ID}/x`, {
        method: 'POST',
        body: call.body,
      });
      const response = await call.endpoint(context(request));

      expect(response.status).toBe(200);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}/admin/conversation-flows/${FLOW_ID}/${call.suffix}`);
      expect(init.method).toBe(call.method);
    }
  });

  it('los errores de validación del backend viajan con status, message y errors', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          detail: {
            message: 'El recorrido no es válido.',
            errors: [{ path: 'nodes.0.body', message: 'campo requerido' }],
          },
        },
        422,
      ),
    );

    const response = await validar(
      context(jsonRequest('/admin/flujos/api/validar', { event_key: 'e', definition: {} })),
    );

    expect(response.status).toBe(422);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      message: 'El recorrido no es válido.',
      errors: [{ path: 'nodes.0.body', message: 'campo requerido' }],
    });
    expect(text).not.toContain(API_KEY);
  });

  it('sin configuración server-side responde 503 con el mensaje de configuración', async () => {
    delete process.env.FLOW_ADMIN_API_KEY;

    const response = await validar(
      context(jsonRequest('/admin/flujos/api/validar', { event_key: 'e', definition: {} })),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      message: 'La administración de flujos no está configurada.',
      errors: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un body que no es JSON objeto responde 400 sin llamar al backend', async () => {
    const malformed = new Request('http://localhost/admin/flujos/api/validar', {
      method: 'POST',
      body: 'no-json',
    });
    const notObject = new Request('http://localhost/admin/flujos/api/validar', {
      method: 'POST',
      body: '[1,2]',
    });

    for (const request of [malformed, notObject]) {
      const response = await validar(context(request));
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ detail: 'JSON inválido.' });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
