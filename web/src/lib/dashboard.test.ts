import { describe, expect, it } from 'vitest';

import { dayDiff, pythonRound } from './dashboard';

describe('pythonRound', () => {
  it('redondea half-even igual que Python', () => {
    expect(pythonRound(2.5)).toBe(2);
    expect(pythonRound(3.5)).toBe(4);
    expect(pythonRound(-2.5)).toBe(-2);
    expect(pythonRound(-3.5)).toBe(-4);
    expect(pythonRound(12.5)).toBe(12);
  });

  it('redondea los casos no empates', () => {
    expect(pythonRound(40)).toBe(40);
    expect(pythonRound(39.6)).toBe(40);
    expect(pythonRound(39.4)).toBe(39);
    expect(pythonRound(0.5)).toBe(0);
    expect(pythonRound(1.5)).toBe(2);
  });
});

describe('dayDiff', () => {
  it('devuelve 0 para el mismo día', () => {
    expect(dayDiff('2026-05-10', '2026-05-10')).toBe(0);
  });

  it('cuenta el rango de días', () => {
    expect(dayDiff('2026-05-01', '2026-05-31')).toBe(30);
    expect(dayDiff('2026-05-31', '2026-05-01')).toBe(-30);
  });

  it('cruza meses y años', () => {
    expect(dayDiff('2026-01-31', '2026-02-01')).toBe(1);
    expect(dayDiff('2025-12-31', '2026-01-01')).toBe(1);
    expect(dayDiff('2024-02-28', '2024-03-01')).toBe(2);
  });
});
