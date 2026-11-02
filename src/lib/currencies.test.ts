import { describe, expect, it } from 'vitest';

import {
  CURRENCIES,
  currencySymbol,
  isCurrency,
  parseCurrency,
} from './currencies';

describe('currencies', () => {
  it('acepta las cuatro monedas curadas', () => {
    expect(CURRENCIES).toEqual(['ARS', 'USD', 'BRL', 'EUR']);
  });

  it('normaliza mayúsculas y cae a ARS ante valores inválidos', () => {
    expect(parseCurrency('brl')).toBe('BRL');
    expect(parseCurrency('EUR')).toBe('EUR');
    expect(parseCurrency('JPY')).toBe('ARS');
    expect(parseCurrency(null)).toBe('ARS');
  });

  it('resuelve símbolos por moneda', () => {
    expect(currencySymbol('ARS')).toBe('$');
    expect(currencySymbol('USD')).toBe('u$s');
    expect(currencySymbol('BRL')).toBe('R$');
    expect(currencySymbol('EUR')).toBe('€');
  });

  it('distingue monedas soportadas', () => {
    expect(isCurrency('BRL')).toBe(true);
    expect(isCurrency('JPY')).toBe(false);
  });
});
