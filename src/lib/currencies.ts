export const CURRENCIES = ['ARS', 'USD', 'BRL', 'EUR'] as const;

export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_LABELS: Record<Currency, string> = {
  ARS: 'Pesos',
  USD: 'Dólares',
  BRL: 'Reales',
  EUR: 'Euros',
};

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  ARS: '$',
  USD: 'u$s',
  BRL: 'R$',
  EUR: '€',
};

export function parseCurrency(value: string | null | undefined): Currency {
  const normalized = (value ?? '').trim().toUpperCase();
  return (CURRENCIES as readonly string[]).includes(normalized)
    ? (normalized as Currency)
    : 'ARS';
}

export function currencySymbol(value: string): string {
  return CURRENCY_SYMBOLS[parseCurrency(value)];
}

export function isCurrency(value: string): value is Currency {
  return (CURRENCIES as readonly string[]).includes(value);
}
