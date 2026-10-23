import { envValue } from './env';

export type QuoteType = 'oficial' | 'mep' | 'blue';

export interface Quote {
  compra: number | null;
  venta: number | null;
  fuente: string;
  as_of: string;
  fetched_at: string;
  stale: boolean;
}

export type Quotes = Partial<Record<QuoteType, Quote>>;

export const EMPTY_QUOTES: Quotes = {};

const TIPOS: QuoteType[] = ['oficial', 'mep', 'blue'];

// Distingue "venta null, ignorar la quote" de "campo inválido, respuesta inválida".
const SKIP = Symbol('skip');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseQuote(value: unknown): Quote | typeof SKIP | null {
  if (!isRecord(value)) return null;
  const { compra, venta, fuente, as_of, fetched_at, stale } = value;
  if (
    typeof fuente !== 'string' ||
    typeof as_of !== 'string' ||
    typeof fetched_at !== 'string' ||
    typeof stale !== 'boolean'
  ) {
    return null;
  }

  const ventaNumber = toNumber(venta);
  if (ventaNumber === null) return venta === null ? SKIP : null;
  if (compra === null) {
    return { compra: null, venta: ventaNumber, fuente, as_of, fetched_at, stale };
  }
  const compraNumber = toNumber(compra);
  if (compraNumber === null) return null;
  return { compra: compraNumber, venta: ventaNumber, fuente, as_of, fetched_at, stale };
}

/**
 * Cotizaciones USD del backend (`/api/cotizaciones`). Degrada a vacío ante
 * cualquier fallo: el dashboard sigue con el capital en moneda original.
 */
export async function getCotizaciones(
  fetchImpl: typeof fetch = fetch,
  baseUrl = envValue('LUKA_BACKEND_URL'),
): Promise<Quotes> {
  const base = (baseUrl ?? '').trim().replace(/\/+$/, '');
  if (!base) return EMPTY_QUOTES;

  try {
    const response = await fetchImpl(`${base}/api/cotizaciones?tipos=${TIPOS.join(',')}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return EMPTY_QUOTES;

    const body: unknown = await response.json();
    if (!isRecord(body) || !isRecord(body.quotes)) return EMPTY_QUOTES;

    const quotes: Quotes = {};
    for (const tipo of TIPOS) {
      const raw = body.quotes[tipo];
      if (raw === undefined) continue;
      const parsed = parseQuote(raw);
      if (parsed === null) return EMPTY_QUOTES;
      if (parsed === SKIP) continue;
      quotes[tipo] = parsed;
    }
    return quotes;
  } catch {
    return EMPTY_QUOTES;
  }
}

const QUOTE_TIME_FORMAT = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
});

export function formatQuoteTime(iso: string): string {
  return QUOTE_TIME_FORMAT.format(new Date(iso));
}
