import { describe, expect, it } from 'vitest';

import { formatDecimals, formatInt, formatPlainInt } from './format';

describe('formatInt ("{:,.0f}")', () => {
  it('agrupa miles', () => {
    expect(formatInt(1300)).toBe('1,300');
    expect(formatInt(1234567.89)).toBe('1,234,568');
    expect(formatInt(0)).toBe('0');
  });

  it('redondea half-even como Python', () => {
    expect(formatInt(2.5)).toBe('2');
    expect(formatInt(3.5)).toBe('4');
    expect(formatInt(25400)).toBe('25,400');
  });

  it('mantiene el signo negativo', () => {
    expect(formatInt(-1234.2)).toBe('-1,234');
  });
});

describe('formatPlainInt ("%.0f")', () => {
  it('no agrupa miles', () => {
    expect(formatPlainInt(4000)).toBe('4000');
    expect(formatPlainInt(12345.6)).toBe('12346');
    expect(formatPlainInt(2.5)).toBe('2');
  });
});

describe('formatDecimals ("{:,.2f}")', () => {
  it('dos decimales con separador de miles', () => {
    expect(formatDecimals(1300)).toBe('1,300.00');
    expect(formatDecimals(1234.5)).toBe('1,234.50');
    expect(formatDecimals(0.1)).toBe('0.10');
  });

  it('mantiene el signo negativo', () => {
    expect(formatDecimals(-2.5)).toBe('-2.50');
  });
});
