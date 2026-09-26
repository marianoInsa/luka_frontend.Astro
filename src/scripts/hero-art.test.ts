import { afterEach, describe, expect, it, vi } from 'vitest';

import { runSequence } from './hero-art';

const STEP = 100;

afterEach(() => {
  vi.useRealTimers();
});

describe('runSequence', () => {
  it('aplica cada segmento en orden, uno por step', () => {
    vi.useFakeTimers();
    const applied: number[] = [];

    runSequence(3, STEP, (index) => applied.push(index));

    expect(applied).toEqual([0]);
    vi.advanceTimersByTime(STEP);
    expect(applied).toEqual([0, 1]);
    vi.advanceTimersByTime(STEP);
    expect(applied).toEqual([0, 1, 2]);
  });

  it('se detiene tras el último segmento, sin reset ni repetición', () => {
    vi.useFakeTimers();
    const applied: number[] = [];

    runSequence(2, STEP, (index) => applied.push(index));
    vi.advanceTimersByTime(STEP * 20);

    expect(applied).toEqual([0, 1]);
  });
});
