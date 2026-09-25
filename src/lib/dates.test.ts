import { describe, expect, it } from 'vitest';

import { defaultDateRange, isValidDateParam, todayLocal } from './dates';

describe('isValidDateParam', () => {
  it('acepta YYYY-MM-DD con fecha real de calendario', () => {
    expect(isValidDateParam('2026-05-10')).toBe(true);
    expect(isValidDateParam('2024-02-29')).toBe(true);
    expect(isValidDateParam('2026-01-01')).toBe(true);
    expect(isValidDateParam('2026-12-31')).toBe(true);
  });

  it('rechaza días inexistentes y padding incorrecto', () => {
    expect(isValidDateParam('2026-02-30')).toBe(false);
    expect(isValidDateParam('2026-02-29')).toBe(false);
    expect(isValidDateParam('2026-8-1')).toBe(false);
    expect(isValidDateParam('2026-13-01')).toBe(false);
    expect(isValidDateParam('2026-00-10')).toBe(false);
    expect(isValidDateParam('2026-05-00')).toBe(false);
    expect(isValidDateParam('26-05-10')).toBe(false);
    expect(isValidDateParam('2026-05-10T00:00:00')).toBe(false);
  });

  it('rechaza valores que no son string', () => {
    expect(isValidDateParam(null)).toBe(false);
    expect(isValidDateParam(undefined)).toBe(false);
    expect(isValidDateParam(20260510)).toBe(false);
    expect(isValidDateParam(new Date())).toBe(false);
  });
});

describe('todayLocal', () => {
  it('devuelve la fecha local con padding', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayLocal(new Date(2026, 8, 24, 0, 0))).toBe('2026-09-24');
  });
});

describe('defaultDateRange', () => {
  it('sin fechas usa el mes en curso', () => {
    expect(defaultDateRange(null, null, '2026-09-24')).toEqual({
      from: '2026-09-01',
      to: '2026-09-24',
    });
    expect(defaultDateRange(undefined, undefined, '2026-09-24')).toEqual({
      from: '2026-09-01',
      to: '2026-09-24',
    });
  });

  it('conserva la fecha válida cuando la otra es inválida', () => {
    expect(defaultDateRange('2026-05-01', 'no-es-fecha', '2026-09-24')).toEqual({
      from: '2026-05-01',
      to: null,
    });
    expect(defaultDateRange('2026-02-30', '2026-05-31', '2026-09-24')).toEqual({
      from: null,
      to: '2026-05-31',
    });
  });

  it('respeta ambas fechas válidas', () => {
    expect(defaultDateRange('2026-05-01', '2026-05-31', '2026-09-24')).toEqual({
      from: '2026-05-01',
      to: '2026-05-31',
    });
  });
});
