import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FlowAdminApiError,
  FlowAdminConfigError,
  flowAdminClient,
  flowAdminErrorPayload,
  isFlowAdmin,
  jsonForScript,
  loadFlowAdminEditor,
  loadFlowAdminList,
} from './flow-admin';

const KEY = 'FLOW_ADMIN_AUTH_USER_IDS';
const BACKEND_URL = 'LUKA_BACKEND_URL';
const API_KEY = 'FLOW_ADMIN_API_KEY';

const BASE = 'https://backend.example';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  process.env[BACKEND_URL] = BASE;
  process.env[API_KEY] = 'test-key';
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[KEY];
  delete process.env[BACKEND_URL];
  delete process.env[API_KEY];
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function captureApiError(run: () => Promise<unknown>): Promise<FlowAdminApiError> {
  try {
    await run();
  } catch (exc) {
    if (exc instanceof FlowAdminApiError) return exc;
    throw exc;
  }
  throw new Error('se esperaba un FlowAdminApiError');
}

describe('isFlowAdmin (espejo de conversation_flow_admin.is_flow_admin)', () => {
  it('acepta ids del CSV sin importar mayúsculas ni espacios', () => {
    process.env[KEY] = ' AAAA-1111 , bbbb-2222 ';
    expect(isFlowAdmin('aaaa-1111')).toBe(true);
    expect(isFlowAdmin('BBBB-2222')).toBe(true);
    expect(isFlowAdmin('cccc-3333')).toBe(false);
  });

  it('sin configurar no habilita a nadie', () => {
    delete process.env[KEY];
    expect(isFlowAdmin('aaaa-1111')).toBe(false);
  });

  it('un CSV vacío o solo comas no habilita a nadie', () => {
    process.env[KEY] = ' , ';
    expect(isFlowAdmin('')).toBe(false);
    expect(isFlowAdmin('aaaa-1111')).toBe(false);
  });
});

describe('flowAdminClient (espejo de ConversationFlowAdminClient)', () => {
  const payload = { name: 'Flow' };

  it('llama a cada endpoint con método, URL, headers y body', async () => {
    const cases: Array<{
      run: () => Promise<unknown>;
      method: string;
      path: string;
      body?: string;
    }> = [
      {
        run: () => flowAdminClient.contracts(),
        method: 'GET',
        path: '/admin/conversation-flows/contracts',
      },
      { run: () => flowAdminClient.list(), method: 'GET', path: '/admin/conversation-flows' },
      { run: () => flowAdminClient.get('flow-1'), method: 'GET', path: '/admin/conversation-flows/flow-1' },
      {
        run: () => flowAdminClient.create(payload),
        method: 'POST',
        path: '/admin/conversation-flows',
        body: '{"name":"Flow"}',
      },
      {
        run: () => flowAdminClient.validate(payload),
        method: 'POST',
        path: '/admin/conversation-flows/validate',
        body: '{"name":"Flow"}',
      },
      {
        run: () => flowAdminClient.saveDraft('flow-1', payload),
        method: 'PUT',
        path: '/admin/conversation-flows/flow-1/draft',
        body: '{"name":"Flow"}',
      },
      {
        run: () => flowAdminClient.discardDraft('flow-1'),
        method: 'DELETE',
        path: '/admin/conversation-flows/flow-1/draft',
      },
      { run: () => flowAdminClient.publish('flow-1'), method: 'POST', path: '/admin/conversation-flows/flow-1/publish' },
      { run: () => flowAdminClient.archive('flow-1'), method: 'POST', path: '/admin/conversation-flows/flow-1/archive' },
    ];

    for (const call of cases) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

      await call.run();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE}${call.path}`);
      expect(init.method).toBe(call.method);
      expect(init.headers).toEqual({ Authorization: 'Bearer test-key', Accept: 'application/json' });
      expect(init.body).toBe(call.body);
      expect(init.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('devuelve el JSON del backend tal cual', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ flows: [{ id: 'f1' }] }));
    await expect(flowAdminClient.contracts()).resolves.toEqual({ flows: [{ id: 'f1' }] });

    fetchMock.mockResolvedValue(jsonResponse([{ id: 'f1' }]));
    await expect(flowAdminClient.list()).resolves.toEqual([{ id: 'f1' }]);
  });

  it('un 422 con detail objeto dispara FlowAdminApiError con message y errors normalizados', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          detail: {
            message: 'El flujo no es válido.',
            errors: [{ path: 'steps.0', message: 'Falta el mensaje' }, {}, 'no-object'],
          },
        },
        422,
      ),
    );

    const error = await captureApiError(() => flowAdminClient.create(payload));

    expect(error).toBeInstanceOf(FlowAdminApiError);
    expect(error.name).toBe('FlowAdminApiError');
    expect(error.statusCode).toBe(422);
    expect(error.message).toBe('El flujo no es válido.');
    expect(error.errors).toEqual([
      { path: 'steps.0', message: 'Falta el mensaje' },
      { path: 'definition', message: 'Error de validación' },
    ]);
  });

  it('un detail objeto sin message conserva el mensaje por defecto', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: { errors: [] } }, 400));

    const error = await captureApiError(() => flowAdminClient.get('f1'));

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('El backend rechazó la operación.');
    expect(error.errors).toEqual([]);
  });

  it('un detail string se usa como mensaje', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Flujo inexistente.' }, 404));

    const error = await captureApiError(() => flowAdminClient.get('nope'));

    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Flujo inexistente.');
    expect(error.errors).toEqual([]);
  });

  it('un body no-JSON o no-objeto cae al mensaje por defecto', async () => {
    fetchMock.mockResolvedValue(new Response('<html>boom</html>', { status: 500 }));
    const notJson = await captureApiError(() => flowAdminClient.list());
    expect(notJson.statusCode).toBe(500);
    expect(notJson.message).toBe('El backend rechazó la operación.');
    expect(notJson.errors).toEqual([]);

    fetchMock.mockResolvedValue(jsonResponse('solo un string', 500));
    const notObject = await captureApiError(() => flowAdminClient.list());
    expect(notObject.statusCode).toBe(500);
    expect(notObject.message).toBe('El backend rechazó la operación.');
  });

  it('si fetch rechaza, responde 503 de backend inalcanzable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const network = await captureApiError(() => flowAdminClient.publish('f1'));
    expect(network.statusCode).toBe(503);
    expect(network.message).toBe('No se pudo contactar al backend de Luka.');
    expect(network.errors).toEqual([]);

    fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'TimeoutError'));
    const timeout = await captureApiError(() => flowAdminClient.list());
    expect(timeout.statusCode).toBe(503);
    expect(timeout.message).toBe('No se pudo contactar al backend de Luka.');
  });

  describe('configuración', () => {
    it('exige LUKA_BACKEND_URL y FLOW_ADMIN_API_KEY', async () => {
      delete process.env[BACKEND_URL];
      await expect(flowAdminClient.contracts()).rejects.toBeInstanceOf(FlowAdminConfigError);
      await expect(flowAdminClient.contracts()).rejects.toThrow(
        'La administración de flujos no está configurada.',
      );

      process.env[BACKEND_URL] = BASE;
      delete process.env[API_KEY];
      await expect(flowAdminClient.contracts()).rejects.toThrow(
        'La administración de flujos no está configurada.',
      );

      process.env[API_KEY] = '   ';
      await expect(flowAdminClient.contracts()).rejects.toThrow(
        'La administración de flujos no está configurada.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rechaza una URL que no sea http(s)', async () => {
      process.env[BACKEND_URL] = 'ftp://backend.example';
      await expect(flowAdminClient.list()).rejects.toThrow('LUKA_BACKEND_URL no es válida.');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('quita las barras finales de la base', async () => {
      process.env[BACKEND_URL] = 'https://backend.example///';
      fetchMock.mockResolvedValue(jsonResponse([]));

      await flowAdminClient.list();

      expect(fetchMock).toHaveBeenCalledWith(
        'https://backend.example/admin/conversation-flows',
        expect.anything(),
      );
    });
  });
});

describe('flowAdminErrorPayload (espejo de _flow_admin_error_response)', () => {
  it('reproduce el status y el body de un FlowAdminApiError', () => {
    const error = new FlowAdminApiError(422, 'Flujo inválido.', [
      { path: 'steps', message: 'Falta' },
    ]);

    expect(flowAdminErrorPayload(error)).toEqual({
      status: 422,
      body: { message: 'Flujo inválido.', errors: [{ path: 'steps', message: 'Falta' }] },
    });
  });

  it('cualquier otro error cae a 503 con str(exc) (solo el mensaje)', () => {
    const config = new FlowAdminConfigError('La administración de flujos no está configurada.');
    expect(flowAdminErrorPayload(config)).toEqual({
      status: 503,
      body: { message: 'La administración de flujos no está configurada.', errors: [] },
    });

    expect(flowAdminErrorPayload(new Error('boom'))).toEqual({
      status: 503,
      body: { message: 'boom', errors: [] },
    });

    expect(flowAdminErrorPayload('texto')).toEqual({
      status: 503,
      body: { message: 'texto', errors: [] },
    });
  });
});

describe('cargadores de página (espejo de _flow_admin_page_error)', () => {
  it('loadFlowAdminList devuelve los flows o el error mapeado', async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ id: 'f1' }]));
    await expect(loadFlowAdminList()).resolves.toEqual({ ok: true, flows: [{ id: 'f1' }] });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'boom' }, 502));
    await expect(loadFlowAdminList()).resolves.toEqual({
      ok: false,
      status: 502,
      message: 'boom',
    });
  });

  it('loadFlowAdminEditor(null) solo pide el contrato', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ events: [], node_types: [] }));

    const result = await loadFlowAdminEditor(null);

    expect(result).toEqual({ ok: true, flow: null, contract: { events: [], node_types: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/admin/conversation-flows/contracts`);
  });

  it('loadFlowAdminEditor(id) pide get + contrato en paralelo', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.endsWith('/contracts')
          ? jsonResponse({ events: [], node_types: [] })
          : jsonResponse({ id: 'f1', name: 'Flow' }),
      ),
    );

    const result = await loadFlowAdminEditor('f1');

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.flow).toEqual({ id: 'f1', name: 'Flow' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('loadFlowAdminEditor mapea la falta de configuración a 503', async () => {
    delete process.env[API_KEY];

    await expect(loadFlowAdminEditor('f1')).resolves.toEqual({
      ok: false,
      status: 503,
      message: 'La administración de flujos no está configurada.',
    });
  });
});

describe('jsonForScript (espejo de tojson)', () => {
  it('escapa <, >, &, U+2028 y U+2029 y conserva el valor', () => {
    const value = {
      text: '<script>&"x"</script>',
      lines: 'a\u2028b\u2029c',
      nested: [1, null, true],
    };

    const encoded = jsonForScript(value);

    expect(encoded).not.toMatch(/[<>&\u2028\u2029]/);
    expect(encoded).toContain('\\u003c');
    expect(JSON.parse(encoded)).toEqual(value);
  });
});
