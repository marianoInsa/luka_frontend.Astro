import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { EMPTY_QUOTES, formatQuoteTime, getCotizaciones } from './quotes';

const BASE = 'https://backend.example';
const URL = `${BASE}/api/cotizaciones?tipos=oficial,mep,blue`;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  delete process.env.LUKA_BACKEND_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.LUKA_BACKEND_URL;
});

function quote(overrides: Record<string, unknown> = {}) {
  return {
    compra: '1500.00',
    venta: '1550.00',
    fuente: 'DolarAPI',
    as_of: '2026-10-23T13:00:00-03:00',
    fetched_at: '2026-10-23T16:05:00+00:00',
    stale: false,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getCotizaciones', () => {
  it('pide las tres cotizaciones y parsea los strings numéricos', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        quotes: {
          oficial: quote(),
          mep: quote({ compra: '1480.50', fuente: 'DolarAPI MEP' }),
          blue: quote({ compra: '1600.00', stale: true }),
        },
      }),
    );

    await expect(getCotizaciones(fetchMock, BASE)).resolves.toEqual({
      oficial: {
        compra: 1500,
        venta: 1550,
        fuente: 'DolarAPI',
        as_of: '2026-10-23T13:00:00-03:00',
        fetched_at: '2026-10-23T16:05:00+00:00',
        stale: false,
      },
      mep: {
        compra: 1480.5,
        venta: 1550,
        fuente: 'DolarAPI MEP',
        as_of: '2026-10-23T13:00:00-03:00',
        fetched_at: '2026-10-23T16:05:00+00:00',
        stale: false,
      },
      blue: {
        compra: 1600,
        venta: 1550,
        fuente: 'DolarAPI',
        as_of: '2026-10-23T13:00:00-03:00',
        fetched_at: '2026-10-23T16:05:00+00:00',
        stale: true,
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      URL,
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('usa LUKA_BACKEND_URL cuando no se pasa baseUrl', async () => {
    process.env.LUKA_BACKEND_URL = BASE;
    fetchMock.mockResolvedValue(jsonResponse({ quotes: { blue: quote() } }));

    await getCotizaciones(fetchMock);

    expect(fetchMock).toHaveBeenCalledWith(URL, expect.anything());
  });

  it('sin LUKA_BACKEND_URL devuelve vacío sin llamar al backend', async () => {
    await expect(getCotizaciones(fetchMock)).resolves.toBe(EMPTY_QUOTES);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un 503 devuelve vacío', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'cotizaciones_no_disponibles' }, 503));
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('un error de red devuelve vacío', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('un timeout devuelve vacío', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError'));
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('un body que no es JSON devuelve vacío', async () => {
    fetchMock.mockResolvedValue(new Response('no-json', { status: 200 }));
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('un JSON sin quotes devuelve vacío', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('devuelve solo el subset disponible (200 parcial)', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ quotes: { blue: quote({ compra: '1700.00' }) } }));
    const result = await getCotizaciones(fetchMock, BASE);
    expect(Object.keys(result)).toEqual(['blue']);
    expect(result.blue?.compra).toBe(1700);
  });

  it('acepta compra null', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ quotes: { oficial: quote({ compra: null }) } }));
    const result = await getCotizaciones(fetchMock, BASE);
    expect(result.oficial).toMatchObject({ compra: null, venta: 1550 });
  });

  it('ignora una quote sin venta', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ quotes: { oficial: quote({ venta: null }), blue: quote({ compra: '1600.00' }) } }),
    );
    const result = await getCotizaciones(fetchMock, BASE);
    expect(Object.keys(result)).toEqual(['blue']);
  });

  it('un campo inválido en una quote devuelve vacío', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ quotes: { oficial: quote({ compra: 'no-es-un-numero' }) } }),
    );
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });

  it('nunca lanza', async () => {
    fetchMock.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(getCotizaciones(fetchMock, BASE)).resolves.toBe(EMPTY_QUOTES);
  });
});

describe('formatQuoteTime', () => {
  it('formatea en hora de Buenos Aires', () => {
    expect(formatQuoteTime('2026-10-23T16:05:00+00:00')).toBe('23/10, 13:05');
  });
});
