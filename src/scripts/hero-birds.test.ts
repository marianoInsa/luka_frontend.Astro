import { describe, expect, it } from 'vitest';

import {
  PART_RAMPS,
  approach,
  birdBounds,
  blurTarget,
  clampBirdInside,
  createFlock,
  createRng,
  glyphForShade,
  overlapRatio,
  resizeFlock,
  resolveBirdCount,
  sampleBird,
  settleFlock,
  stepFlock,
  type Bird,
} from './hero-birds-model';
import {
  BIRD_CANVAS_PADDING,
  advanceClock,
  birdFrame,
  birdStyle,
  blurLimit,
  canAnimate,
  canvasTransform,
  createControllerRegistry,
  createScheduler,
  glyphForInk,
  layoutHeroBirds,
  localToWorld,
  mountBirdCanvases,
  paintBirdFrame,
  opacityForOverlap,
  paintFlock,
  quantizeBlur,
  shouldSettle,
  stageHeight,
  toLayerRects,
  type BirdContext,
  type BirdLayout,
  type SchedulerFlags,
} from './hero-birds';

const TAU = Math.PI * 2;

function makeBird(overrides: Partial<Bird> = {}): Bird {
  return {
    id: 1,
    x: 400,
    y: 300,
    heading: 0,
    speed: 30,
    phase: 0,
    flapRate: 1.6,
    length: 100,
    depth: 0.8,
    seed: 0.5,
    flap: 0,
    ...overrides,
  };
}

/** World AABB of the local canvas box after the CSS rotation. */
function worldBoxOf(box: BirdLayout): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const cos = Math.cos(box.bird.heading);
  const sin = Math.sin(box.bird.heading);
  const corners = [
    [box.left, box.top],
    [box.left + box.width, box.top],
    [box.left, box.top + box.height],
    [box.left + box.width, box.top + box.height],
  ].map(([lx, ly]) => ({
    x: box.bird.x + lx * cos - ly * sin,
    y: box.bird.y + lx * sin + ly * cos,
  }));
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

describe('createRng', () => {
  it('returns the same sequence for equal seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a(), a(), a(), a()];

    expect(first).toEqual([b(), b(), b(), b()]);
  });

  it('returns a different sequence for a different seed', () => {
    const a = createRng(1);
    const b = createRng(2);

    expect(a()).not.toBe(b());
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(7);

    for (let i = 0; i < 200; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('resolveBirdCount', () => {
  it.each([
    [390, 1],
    [719, 1],
    [720, 2],
    [800, 2],
    [959, 2],
    [960, 3],
    [1440, 3],
  ])('maps %s px to %s birds', (width, expected) => {
    expect(resolveBirdCount(width)).toBe(expected);
  });
});

describe('createFlock', () => {
  it('creates the requested birds with sequential ids', () => {
    const birds = createFlock(3, 1200, 700, 9);

    expect(birds).toHaveLength(3);
    expect(birds.map((bird) => bird.id)).toEqual([1, 2, 3]);
  });

  it('is deterministic for the same seed', () => {
    expect(createFlock(2, 900, 600, 17)).toEqual(createFlock(2, 900, 600, 17));
  });

  it('keeps positions, speeds, lengths and depths inside their ranges', () => {
    const birds = createFlock(3, 1440, 800, 5);

    for (const bird of birds) {
      expect(Number.isFinite(bird.x)).toBe(true);
      expect(Number.isFinite(bird.y)).toBe(true);
      expect(bird.x).toBeGreaterThanOrEqual(0);
      expect(bird.x).toBeLessThanOrEqual(1440);
      expect(bird.y).toBeGreaterThanOrEqual(0);
      expect(bird.y).toBeLessThanOrEqual(800);
      expect(bird.speed).toBeGreaterThanOrEqual(18);
      expect(bird.speed).toBeLessThanOrEqual(64);
      expect(bird.depth).toBeGreaterThanOrEqual(0.45);
      expect(bird.depth).toBeLessThan(1);
      expect(bird.length).toBeGreaterThan(0);
      expect(bird.length).toBeLessThanOrEqual(140);
      expect(bird.flapRate).toBeGreaterThanOrEqual(1.4);
      expect(bird.flapRate).toBeLessThanOrEqual(2);
      expect(Number.isFinite(bird.phase)).toBe(true);
    }
  });

  it('gives each bird an independent flap phase', () => {
    const rates = new Set(createFlock(3, 1000, 700, 4).map((bird) => bird.flapRate));

    expect(rates.size).toBeGreaterThan(1);
  });
});

describe('stepFlock', () => {
  it('moves birds and keeps heading continuous', () => {
    const birds = createFlock(3, 900, 500, 11);
    const before = birds.map((bird) => ({ x: bird.x, y: bird.y, heading: bird.heading }));

    stepFlock(birds, 1 / 60, 900, 500);

    birds.forEach((bird, index) => {
      const start = before[index];
      expect(Math.hypot(bird.x - start.x, bird.y - start.y)).toBeGreaterThan(0);
      expect(Math.abs(bird.heading - start.heading)).toBeLessThan(0.12);
      expect(Number.isFinite(bird.heading)).toBe(true);
    });
  });

  it('stays inside the bounds without wrapping or NaN', () => {
    const birds = createFlock(3, 800, 600, 3);

    for (let frame = 0; frame < 900; frame += 1) {
      stepFlock(birds, 1 / 60, 800, 600);
    }

    for (const bird of birds) {
      expect(Number.isFinite(bird.x)).toBe(true);
      expect(Number.isFinite(bird.y)).toBe(true);
      expect(Number.isFinite(bird.flap)).toBe(true);
      expect(bird.x).toBeGreaterThanOrEqual(0);
      expect(bird.x).toBeLessThanOrEqual(800);
      expect(bird.y).toBeGreaterThanOrEqual(0);
      expect(bird.y).toBeLessThanOrEqual(600);
      expect(Math.abs(bird.flap)).toBeLessThanOrEqual(1);
    }
  });

  it('turns a bird away from the edge instead of letting it leave', () => {
    const bird = makeBird({ x: 4, y: 300, heading: Math.PI, speed: 40 });

    for (let frame = 0; frame < 240; frame += 1) {
      stepFlock([bird], 1 / 60, 800, 600);
    }

    expect(bird.x).toBeGreaterThan(30);
    expect(Math.cos(bird.heading)).toBeGreaterThan(-0.2);
  });

  it('advances the wing phase at the flap rate', () => {
    const bird = makeBird({ phase: 0, flapRate: 1.5 });

    for (let frame = 0; frame < 60; frame += 1) {
      stepFlock([bird], 1 / 60, 800, 600);
    }

    expect(bird.phase).toBeGreaterThan(TAU * 1.4);
    expect(bird.phase).toBeLessThan(TAU * 2);
  });
});

describe('resizeFlock', () => {
  it('shrinks the flock and preserves the surviving ids', () => {
    const birds = createFlock(3, 1000, 600, 6);
    const resized = resizeFlock(birds, 1, 800, 500);

    expect(resized).toHaveLength(1);
    expect(resized[0].id).toBe(birds[0].id);
    expect(resized[0].x).toBeGreaterThanOrEqual(0);
    expect(resized[0].x).toBeLessThanOrEqual(800);
    expect(resized[0].y).toBeGreaterThanOrEqual(0);
    expect(resized[0].y).toBeLessThanOrEqual(500);
  });

  it('grows the flock and keeps the existing ids', () => {
    const birds = createFlock(2, 1000, 600, 6);
    const resized = resizeFlock(birds, 3, 1400, 700);
    const ids = resized.map((bird) => bird.id);

    expect(resized).toHaveLength(3);
    expect(ids).toEqual(expect.arrayContaining([birds[0].id, birds[1].id]));
    expect(new Set(ids).size).toBe(3);
    for (const bird of resized) {
      expect(Number.isFinite(bird.x)).toBe(true);
      expect(Number.isFinite(bird.y)).toBe(true);
    }
  });

  it('rescales bird lengths when the viewport grows', () => {
    const birds = createFlock(2, 390, 700, 8);
    const before = birds.map((bird) => bird.length);
    const resized = resizeFlock(birds, 2, 1440, 800);
    const base = 112;

    resized.forEach((bird, index) => {
      expect(bird.id).toBe(birds[index].id);
      expect(bird.length).toBeCloseTo(base * (0.62 + 0.38 * bird.depth), 6);
      expect(bird.length).toBeGreaterThan(before[index]);
      expect(Number.isFinite(bird.length)).toBe(true);
      expect(Number.isFinite(bird.speed)).toBe(true);
      expect(bird.x).toBeGreaterThanOrEqual(0);
      expect(bird.x).toBeLessThanOrEqual(1440);
      expect(bird.y).toBeGreaterThanOrEqual(0);
      expect(bird.y).toBeLessThanOrEqual(800);
    });
  });

  it('handles an empty flock', () => {
    expect(resizeFlock([], 2, 1000, 600)).toHaveLength(2);
  });
});

describe('settleFlock', () => {
  it('advances state deterministically without a render loop', () => {
    const a = createFlock(2, 800, 400, 3);
    const b = createFlock(2, 800, 400, 3);
    const start = a.map((bird) => ({ x: bird.x, y: bird.y }));

    settleFlock(a, 800, 400, 2);
    settleFlock(b, 800, 400, 2);

    expect(a).toEqual(b);
    expect(a[0].x).not.toBe(start[0].x);
    expect(a.every((bird) => Number.isFinite(bird.x) && Number.isFinite(bird.y))).toBe(true);
  });

  it('caps very long settles at 600 steps', () => {
    const capped = createFlock(2, 800, 400, 3);
    const reference = createFlock(2, 800, 400, 3);

    settleFlock(capped, 800, 400, 100);
    for (let frame = 0; frame < 600; frame += 1) {
      stepFlock(reference, 1 / 60, 800, 400);
    }

    expect(capped).toEqual(reference);
  });

  it('treats Infinity as the 600-step cap without hanging', () => {
    const capped = createFlock(2, 800, 400, 3);
    const reference = createFlock(2, 800, 400, 3);

    settleFlock(capped, 800, 400, Number.POSITIVE_INFINITY);
    for (let frame = 0; frame < 600; frame += 1) {
      stepFlock(reference, 1 / 60, 800, 400);
    }

    expect(capped).toEqual(reference);
  });
});

describe('birdBounds', () => {
  it('contains the center and returns finite dimensions', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.7 });

    const rect = birdBounds(bird);

    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(Number.isFinite(rect.x + rect.y + rect.width + rect.height)).toBe(true);
    expect(bird.x).toBeGreaterThanOrEqual(rect.x);
    expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width);
    expect(bird.y).toBeGreaterThanOrEqual(rect.y);
    expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height);
  });

  it('contains the full silhouette including the live wing span at full flap', () => {
    for (const heading of [0, Math.PI / 4]) {
      const bird = makeBird({ x: 400, y: 300, heading, flap: 1 });
      const rect = birdBounds(bird);
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      let maxLateral = 0;
      let hits = 0;

      for (let dx = -80; dx <= 60; dx += 2) {
        for (let dy = -60; dy <= 60; dy += 2) {
          const sample = sampleBird(bird, bird.x + dx, bird.y + dy);
          if (!sample) continue;
          hits += 1;
          maxLateral = Math.max(maxLateral, Math.abs(-dx * sin + dy * cos));
          expect(bird.x + dx).toBeGreaterThanOrEqual(rect.x - 1e-9);
          expect(bird.x + dx).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
          expect(bird.y + dy).toBeGreaterThanOrEqual(rect.y - 1e-9);
          expect(bird.y + dy).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
        }
      }

      const tipU = -5;
      const tipV = 54.7;
      const tipX = bird.x + tipU * cos - tipV * sin;
      const tipY = bird.y + tipU * sin + tipV * cos;
      expect(sampleBird(bird, tipX, tipY)).not.toBeNull();
      expect(tipX).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(tipX).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(tipY).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(tipY).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
      expect(hits).toBeGreaterThan(100);
      expect(maxLateral).toBeGreaterThan(46);
    }
  });
});

describe('overlapRatio', () => {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };

  it('returns 0 for disjoint rectangles', () => {
    expect(overlapRatio(bounds, [{ x: 200, y: 200, width: 10, height: 10 }])).toBe(0);
  });

  it('returns 1 when an obstacle contains the bounds', () => {
    expect(overlapRatio(bounds, [{ x: -10, y: -10, width: 200, height: 200 }])).toBe(1);
  });

  it('returns about 0.5 for half overlap', () => {
    expect(overlapRatio(bounds, [{ x: 50, y: 0, width: 100, height: 100 }])).toBeCloseTo(0.5, 5);
  });

  it('clamps the accumulated overlap to 0..1', () => {
    const obstacles = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 100, height: 100 },
    ];

    expect(overlapRatio(bounds, obstacles)).toBe(1);
    expect(overlapRatio({ x: 0, y: 0, width: 0, height: 100 }, obstacles)).toBe(0);
  });

  it('counts overlapping obstacles once, not as a sum of areas', () => {
    const wide = { x: 0, y: 0, width: 200, height: 100 };
    const obstacles = [
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 50, y: 0, width: 100, height: 100 },
    ];

    expect(overlapRatio(wide, obstacles)).toBeCloseTo(0.75, 6);
  });
});

describe('blurTarget', () => {
  it('is zero without overlap', () => {
    expect(blurTarget(0, 5)).toBe(0);
  });

  it('grows monotonically and never exceeds maxBlur', () => {
    let previous = -1;

    for (let overlap = 0; overlap <= 1.0001; overlap += 0.05) {
      const blur = blurTarget(overlap, 5);
      expect(blur).toBeGreaterThanOrEqual(0);
      expect(blur).toBeLessThanOrEqual(5);
      expect(blur).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = blur;
    }

    expect(blurTarget(0.5, 5)).toBeGreaterThan(0);
  });

  it('returns zero for a zero budget', () => {
    expect(blurTarget(0.8, 0)).toBe(0);
  });

  it('stays at zero inside the deadband and blurs after it', () => {
    expect(blurTarget(0.1, 2.5, 0.15)).toBe(0);
    expect(blurTarget(0.15, 2.5, 0.15)).toBe(0);
    expect(blurTarget(0.3, 2.5, 0.15)).toBeGreaterThan(0);
    expect(blurTarget(1, 2.5, 0.15)).toBe(2.5);
  });
});

describe('approach', () => {
  it('converges toward the target without materially overshooting', () => {
    let value = 0;

    for (let frame = 0; frame < 180; frame += 1) {
      value = approach(value, 1, 1 / 60, 4);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }

    expect(value).toBeGreaterThan(0.99);
  });

  it('does nothing when already at the target or with no time', () => {
    expect(approach(1, 1, 1 / 60, 4)).toBe(1);
    expect(approach(0, 1, 0, 4)).toBe(0);
    expect(approach(0, 1, 1 / 60, 0)).toBe(0);
  });
});

describe('sampleBird', () => {
  it('hits the body at the center', () => {
    const bird = makeBird();
    const sample = sampleBird(bird, bird.x, bird.y);

    expect(sample).not.toBeNull();
    expect(sample?.part).toBe('body');
    expect(sample?.shade).toBeGreaterThanOrEqual(0);
    expect(sample?.shade).toBeLessThanOrEqual(1);
  });

  it('misses far outside the bird', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x + 500, bird.y + 500)).toBeNull();
    expect(sampleBird(bird, bird.x - 300, bird.y)).toBeNull();
  });

  it('hits the beak in front and the eye beside the head', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x + 38, bird.y)?.part).toBe('beak');
    expect(sampleBird(bird, bird.x + 29.5, bird.y + 4)?.part).toBe('eye');
    expect(sampleBird(bird, bird.x + 29.5, bird.y - 4)?.part).toBe('eye');
  });

  it('puts wings symmetrically on both sides when flap is zero', () => {
    const bird = makeBird({ flap: 0 });

    expect(sampleBird(bird, bird.x, bird.y + 30)?.part).toBe('wing');
    expect(sampleBird(bird, bird.x, bird.y - 30)?.part).toBe('wing');
  });

  it('keeps the long tail behind the body', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x - 55, bird.y + 4)?.part).toBe('tail');
  });

  it('marks the outer rim as edge', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x - 88, bird.y + 9)?.part).toBe('edge');
  });

  it('rotates with the heading', () => {
    const bird = makeBird({ heading: Math.PI / 2 });
    const beak = sampleBird(bird, bird.x, bird.y + 38);
    const tail = sampleBird(bird, bird.x + 4, bird.y - 55);

    expect(beak?.part).toBe('beak');
    expect(tail?.part).toBe('tail');
  });
});

describe('glyphForShade', () => {
  const parts = Object.keys(PART_RAMPS) as Array<keyof typeof PART_RAMPS>;

  it('returns one character from the part ramp for every shade', () => {
    for (const part of parts) {
      for (const shade of [-1, 0, 0.25, 0.5, 0.75, 1, 2]) {
        const glyph = glyphForShade(shade, part);
        expect(glyph).toHaveLength(1);
        expect(PART_RAMPS[part]).toContain(glyph);
      }
    }
  });

  it('moves along the ramp as the shade changes', () => {
    expect(glyphForShade(0, 'body')).not.toBe(glyphForShade(1, 'body'));
  });

  it('never returns undefined for a NaN shade', () => {
    const glyph = glyphForShade(Number.NaN, 'body');

    expect(typeof glyph).toBe('string');
    expect(glyph).toHaveLength(1);
    expect(PART_RAMPS.body).toContain(glyph);
  });
});

describe('layoutHeroBirds', () => {
  const viewports: Array<[number, number, 1 | 2 | 3]> = [
    [1440, 900, 3],
    [800, 900, 2],
    [390, 844, 1],
    [320, 800, 1],
  ];

  it.each(viewports)('lays out %s×%s with %s canvas boxes', (width, height, count) => {
    const layout = layoutHeroBirds(width, height, 1);

    expect(layout.width).toBe(width);
    expect(layout.height).toBe(height);
    expect(layout.count).toBe(count);
    expect(layout.count).toBe(resolveBirdCount(width));
    expect(layout.birds).toHaveLength(count);
  });

  it.each(viewports)('keeps finite positive boxes and cells at %s×%s', (width, height) => {
    const layout = layoutHeroBirds(width, height, 1);

    for (const box of layout.birds) {
      for (const value of [
        box.left,
        box.top,
        box.originX,
        box.originY,
        box.width,
        box.height,
        box.pixelWidth,
        box.pixelHeight,
        box.cellWidth,
        box.cellHeight,
        box.columns,
        box.rows,
      ]) {
        expect(Number.isFinite(value)).toBe(true);
      }

      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.pixelWidth).toBeGreaterThan(0);
      expect(box.pixelHeight).toBeGreaterThan(0);
      expect(box.cellWidth).toBeGreaterThanOrEqual(8);
      expect(box.cellWidth).toBeLessThanOrEqual(13);
      expect(box.cellHeight).toBe(box.cellWidth);
      expect(box.columns).toBe(Math.ceil(box.width / box.cellWidth));
      expect(box.rows).toBe(Math.ceil(box.height / box.cellHeight));
      expect(box.columns * box.cellWidth).toBeGreaterThanOrEqual(box.width);
      expect(box.rows * box.cellHeight).toBeGreaterThanOrEqual(box.height);
    }
  });

  it.each(viewports)('contains every bird bounds at %s×%s', (width, height) => {
    const layout = layoutHeroBirds(width, height, 1);

    for (const box of layout.birds) {
      const bounds = birdBounds(box.bird);
      const world = worldBoxOf(box);

      expect(world.x).toBeLessThanOrEqual(bounds.x + 1e-6);
      expect(world.y).toBeLessThanOrEqual(bounds.y + 1e-6);
      expect(world.x + world.width).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1e-6);
      expect(world.y + world.height).toBeGreaterThanOrEqual(bounds.y + bounds.height - 1e-6);
    }
  });

  it.each(viewports)('keeps every silhouette inside the layer at %s×%s', (width, height) => {
    const layout = layoutHeroBirds(width, height, 1);

    for (const box of layout.birds) {
      const bounds = birdBounds(box.bird);
      const margin = 8;

      expect(bounds.x).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(bounds.y).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(layout.width - margin + 1e-6);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(layout.height - margin + 1e-6);
    }
  });

  it('fits a cell-aligned local canvas around the silhouette', () => {
    const layout = layoutHeroBirds(1440, 900, 1);

    for (const box of layout.birds) {
      expect(box.width % box.cellWidth).toBe(0);
      expect(box.height % box.cellHeight).toBe(0);
      expect(box.columns).toBe(box.width / box.cellWidth);
      expect(box.rows).toBe(box.height / box.cellHeight);
      expect(box.left).toBeLessThan(0);
      expect(box.top).toBeLessThan(0);
      expect(box.originX).toBe(-box.left);
      expect(box.originY).toBe(-box.top);
      expect(box.originX).toBeGreaterThan(0);
      expect(box.originX).toBeLessThan(box.width);
      expect(box.originY).toBeGreaterThan(0);
      expect(box.originY).toBeLessThan(box.height);
      // The old square used hypot(1.38L, 1.22L) ≈ 1.84L per side.
      expect(box.width).toBeLessThan(1.6 * box.bird.length);
      expect(box.height).toBeLessThan(1.4 * box.bird.length);
    }
  });

  it('shrinks the flock on very narrow layers so nothing clips', () => {
    const narrow = layoutHeroBirds(320, 800, 1);
    const wider = layoutHeroBirds(390, 844, 1);

    expect(narrow.birds[0].bird.length).toBeLessThan(wider.birds[0].bird.length);

    for (const box of narrow.birds) {
      const bounds = birdBounds(box.bird);

      expect(box.width).toBeLessThan(320 - 8);
      expect(bounds.x).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(320 - 8 + 1e-6);
      expect(bounds.y).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(800 - 8 + 1e-6);
    }
  });

  it('caps the effective DPR at 2 and falls back to 1', () => {
    for (const [width, height] of viewports) {
      expect(layoutHeroBirds(width, height, 3).dpr).toBe(2);
      expect(layoutHeroBirds(width, height, 2).dpr).toBe(2);
      expect(layoutHeroBirds(width, height, 1.5).dpr).toBe(1.5);
      expect(layoutHeroBirds(width, height, 0).dpr).toBe(1);
      expect(layoutHeroBirds(width, height, Number.NaN).dpr).toBe(1);
    }
  });

  it('scales the backing store with the capped DPR', () => {
    const layout = layoutHeroBirds(1440, 900, 3);

    for (const box of layout.birds) {
      expect(box.pixelWidth).toBe(Math.max(1, Math.round(box.width * 2)));
      expect(box.pixelHeight).toBe(Math.max(1, Math.round(box.height * 2)));
    }
  });

  it('is deterministic for equal inputs', () => {
    const a = layoutHeroBirds(1440, 900, 1);
    const b = layoutHeroBirds(1440, 900, 1);
    const shape = (layout: typeof a) =>
      layout.birds.map((box) => [box.left, box.top, box.width, box.height, box.cellWidth]);

    expect(shape(a)).toEqual(shape(b));
  });
});

describe('monk parakeet silhouette', () => {
  it('keeps a very long tail behind the body', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x - 88, bird.y + 4)?.part).toBe('tail');
  });

  it('splits the tail into two rectrices', () => {
    const bird = makeBird();

    expect(sampleBird(bird, bird.x - 60, bird.y)).toBeNull();
    expect(sampleBird(bird, bird.x - 60, bird.y + 4)?.part).toBe('tail');
    expect(sampleBird(bird, bird.x - 60, bird.y - 4)?.part).toBe('tail');
  });

  it('rounds the head instead of a rectangular block', () => {
    const bird = makeBird();
    const halfHeight = (u: number) => {
      let v = 0;
      while (v < 40 && sampleBird(bird, bird.x + u, bird.y + v)) v += 0.5;
      return v - 0.5;
    };

    const center = halfHeight(25.5);

    expect(center).toBeGreaterThan(8);
    expect(halfHeight(21.5)).toBeGreaterThan(center * 0.8);
    expect(halfHeight(33.5)).toBeLessThan(center * 0.75);
  });

  it('splits each wing tip into separated primaries', () => {
    const bird = makeBird();
    let runs = 0;
    let previous = false;

    for (let v = 12; v <= 58; v += 1) {
      const hit = sampleBird(bird, bird.x - 12, bird.y + v)?.part === 'wing';
      if (hit && !previous) runs += 1;
      previous = hit;
    }

    expect(runs).toBeGreaterThanOrEqual(2);
  });
});

describe('glyphForInk', () => {
  const parts = Object.keys(PART_RAMPS) as Array<keyof typeof PART_RAMPS>;

  it('always returns a visible dense glyph', () => {
    for (const shade of [0, 0.25, 0.5, 0.75, 1]) {
      for (const part of parts) {
        const glyph = glyphForInk(shade, part);

        expect(glyph).not.toBe(' ');
        expect(PART_RAMPS[part]).toContain(glyph);
      }
    }
  });

  it('gets denser as the shade drops', () => {
    for (const part of parts) {
      const dark = PART_RAMPS[part].indexOf(glyphForInk(0, part));
      const lit = PART_RAMPS[part].indexOf(glyphForInk(1, part));

      expect(dark).toBeGreaterThanOrEqual(0);
      expect(dark).toBeLessThanOrEqual(lit);
    }
  });
});

describe('advanceClock', () => {
  const STEP = 1 / 60;

  it('does not advance on the first frame after a reset', () => {
    const clock = { last: null as number | null, accumulator: 0 };

    expect(advanceClock(clock, 1000)).toBe(0);
    expect(clock.accumulator).toBe(0);
    expect(clock.last).toBe(1000);
  });

  it('advances one fixed step per 1/60 s', () => {
    const clock = { last: null as number | null, accumulator: 0 };

    advanceClock(clock, 0);
    expect(advanceClock(clock, 1000 / 60)).toBe(1);
    expect(advanceClock(clock, 2000 / 60)).toBe(1);
  });

  it('clamps a long frame to four substeps and drops the backlog', () => {
    const clock = { last: null as number | null, accumulator: 0 };

    advanceClock(clock, 0);
    expect(advanceClock(clock, 5000)).toBe(4);
    expect(clock.accumulator).toBeLessThan(STEP);
  });

  it('clamps the delta to 0.1 s', () => {
    const clock = { last: null as number | null, accumulator: 0 };

    advanceClock(clock, 0);
    advanceClock(clock, 100);
    expect(clock.accumulator).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('ignores backwards and non-finite timestamps', () => {
    const clock = { last: 1000 as number | null, accumulator: 0 };

    expect(advanceClock(clock, 900)).toBe(0);
    expect(advanceClock(clock, Number.NaN)).toBe(0);
    expect(Number.isFinite(clock.accumulator)).toBe(true);
  });

  it('restarts without a jump after a pause reset', () => {
    const clock = { last: 9999 as number | null, accumulator: 0.5 };

    clock.last = null;
    clock.accumulator = 0;
    expect(advanceClock(clock, 20000)).toBe(0);
    expect(advanceClock(clock, 20000 + 1000 / 60)).toBe(1);
  });
});

describe('blurLimit', () => {
  it('caps mobile at 2.5 px and desktop at 3–6 px', () => {
    expect(blurLimit(390)).toBe(2.5);
    expect(blurLimit(719)).toBe(2.5);
    expect(blurLimit(720)).toBe(6);
    expect(blurLimit(1440)).toBe(6);
  });

  it('stays inside the brief range for every width', () => {
    for (const width of [320, 390, 719, 720, 800, 1440, 2560]) {
      const limit = blurLimit(width);

      expect(limit).toBeGreaterThanOrEqual(2.5);
      expect(limit).toBeLessThanOrEqual(6);
      if (width < 720) expect(limit).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('stageHeight', () => {
  it('caps a tall stacked Hero at the visible viewport', () => {
    expect(stageHeight(1569, 844)).toBe(844);
    expect(stageHeight(1393, 900)).toBe(900);
  });

  it('keeps a Hero shorter than the viewport as it is', () => {
    expect(stageHeight(792, 900)).toBe(792);
  });

  it('falls back to the layer height without a usable viewport', () => {
    expect(stageHeight(900, 0)).toBe(900);
    expect(stageHeight(900, Number.NaN)).toBe(900);
    expect(stageHeight(0, 900)).toBe(0);
  });

  it('stops above the art column when it stacks below the copy', () => {
    expect(stageHeight(1569, 844, 600)).toBe(600);
    expect(stageHeight(1393, 900, 432)).toBe(432);
  });

  it('ignores an unusable or non-limiting stacked top', () => {
    expect(stageHeight(1569, 844, Number.POSITIVE_INFINITY)).toBe(844);
    expect(stageHeight(1569, 844, Number.NaN)).toBe(844);
    expect(stageHeight(1569, 844, 0)).toBe(844);
    expect(stageHeight(1569, 844, -40)).toBe(844);
    expect(stageHeight(792, 900, 2000)).toBe(792);
  });

  it('does not move when only the mobile URL bar changes height', () => {
    expect(stageHeight(1569, 844, 552)).toBe(552);
    expect(stageHeight(1569, 780, 552)).toBe(552);
    expect(stageHeight(1569, 700, 552)).toBe(552);
  });
});

describe('quantizeBlur', () => {
  it('snaps to half pixels and to zero below the threshold', () => {
    expect(quantizeBlur(0.1)).toBe(0);
    expect(quantizeBlur(0.24)).toBe(0);
    expect(quantizeBlur(0.3)).toBe(0.5);
    expect(quantizeBlur(2.74)).toBe(2.5);
    expect(quantizeBlur(3.76)).toBe(4);
  });

  it('never returns a negative or non-finite blur', () => {
    expect(quantizeBlur(-3)).toBe(0);
    expect(quantizeBlur(Number.NaN)).toBe(0);
    expect(quantizeBlur(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('birdStyle', () => {
  it('uses no filter and no will-change at zero blur', () => {
    expect(birdStyle(0, 1)).toEqual({ filter: 'none', willChange: 'auto', opacity: '1' });
  });

  it('sets blur and will-change only while blurred', () => {
    expect(birdStyle(3.5, 0.8)).toEqual({
      filter: 'blur(3.5px)',
      willChange: 'filter',
      opacity: '0.8',
    });
  });

  it('rounds the opacity to two decimals', () => {
    expect(birdStyle(2, 0.912345).opacity).toBe('0.91');
  });
});

describe('opacityForOverlap', () => {
  it('leaves the bird fully opaque when it touches no content', () => {
    expect(opacityForOverlap(0)).toBe(1);
    expect(opacityForOverlap(-1)).toBe(1);
  });

  it('dims monotonically and respects the floor', () => {
    let previous = 2;
    for (let overlap = 0; overlap <= 1.0001; overlap += 0.02) {
      const value = opacityForOverlap(overlap);
      expect(value).toBeLessThanOrEqual(previous + 1e-9);
      expect(value).toBeGreaterThanOrEqual(0.4);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(opacityForOverlap(1)).toBe(0.4);
    expect(opacityForOverlap(0.5)).toBe(0.4);
  });

  it('dims even when the deadband keeps the blur at zero', () => {
    expect(blurTarget(0.2, 2.5, 0.28)).toBe(0);
    expect(opacityForOverlap(0.2)).toBeLessThan(1);
  });

  it('keeps the floor configurable and clamped', () => {
    expect(opacityForOverlap(1, 0.6)).toBe(0.6);
    expect(opacityForOverlap(1, -2)).toBe(0);
    expect(opacityForOverlap(1, 3)).toBe(1);
  });
});

describe('localToWorld', () => {
  it('maps the bird center to its world position', () => {
    const bird = makeBird({ x: 123, y: 456, heading: 2.1 });
    const world = localToWorld(bird, 0, 0);

    expect(world.x).toBeCloseTo(123, 6);
    expect(world.y).toBeCloseTo(456, 6);
  });

  it('rotates local offsets by the heading', () => {
    const bird = makeBird({ x: 100, y: 200, heading: Math.PI / 2 });
    const world = localToWorld(bird, 10, 0);

    expect(world.x).toBeCloseTo(100, 6);
    expect(world.y).toBeCloseTo(210, 6);
  });
});

describe('clampBirdInside', () => {
  it('keeps the whole silhouette inside the layer', () => {
    for (const heading of [0, 1.2, Math.PI, 4.4]) {
      const bird = makeBird({ x: 4, y: 3, heading });

      clampBirdInside(bird, 800, 600, 8);

      const bounds = birdBounds(bird);
      expect(bounds.x).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(bounds.y).toBeGreaterThanOrEqual(8 - 1e-6);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(800 - 8 + 1e-6);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(600 - 8 + 1e-6);
      expect(Number.isFinite(bird.x + bird.y)).toBe(true);
    }
  });

  it('leaves an already contained bird untouched', () => {
    const bird = makeBird({ x: 400, y: 300, heading: 0.3 });
    const before = { x: bird.x, y: bird.y };

    clampBirdInside(bird, 800, 600, 8);

    expect(bird.x).toBe(before.x);
    expect(bird.y).toBe(before.y);
  });
});

describe('canvas padding', () => {
  it('leaves room for the blur halo', () => {
    expect(BIRD_CANVAS_PADDING).toBeGreaterThanOrEqual(12);
  });
});

describe('birdFrame', () => {
  it('fits a cell-aligned local box that covers the silhouette at any heading', () => {
    for (const heading of [0, 0.9, 2.4, 4.8]) {
      const bird = makeBird({ heading, flap: 1 });
      const frame = birdFrame(bird, 2);
      const world = worldBoxOf(frame);
      const bounds = birdBounds(bird);

      expect(frame.width % frame.cellWidth).toBe(0);
      expect(frame.height % frame.cellHeight).toBe(0);
      expect(frame.columns).toBe(frame.width / frame.cellWidth);
      expect(frame.rows).toBe(frame.height / frame.cellHeight);
      expect(frame.pixelWidth).toBe(Math.round(frame.width * 2));
      expect(frame.pixelHeight).toBe(Math.round(frame.height * 2));
      expect(frame.originX).toBe(-frame.left);
      expect(frame.originY).toBe(-frame.top);
      expect(world.x).toBeLessThanOrEqual(bounds.x + 1e-6);
      expect(world.y).toBeLessThanOrEqual(bounds.y + 1e-6);
      expect(world.x + world.width).toBeGreaterThanOrEqual(bounds.x + bounds.width - 1e-6);
      expect(world.y + world.height).toBeGreaterThanOrEqual(bounds.y + bounds.height - 1e-6);
    }
  });

  it('keeps the local box tight instead of a rotated square', () => {
    const frame = birdFrame(makeBird({ heading: 0.7 }), 1);
    const side = Math.hypot(frame.width, frame.height);
    const slack = 2 * BIRD_CANVAS_PADDING + frame.cellWidth;

    expect(frame.width).toBeLessThanOrEqual(1.38 * frame.bird.length + slack);
    expect(frame.height).toBeLessThanOrEqual(1.22 * frame.bird.length + slack);
    expect(frame.width * frame.height).toBeLessThan(0.7 * side * side);
  });

  it('renders the local bird without position or heading', () => {
    const bird = makeBird({ x: 320, y: 210, heading: 1.2 });
    const frame = birdFrame(bird, 1);

    expect(frame.local.x).toBe(0);
    expect(frame.local.y).toBe(0);
    expect(frame.local.heading).toBe(0);
    expect(frame.local.length).toBe(bird.length);
    expect(frame.local.flap).toBe(bird.flap);
  });

  it('keeps the frame size stable while the wing flaps', () => {
    const a = birdFrame(makeBird({ flap: -1 }), 1);
    const b = birdFrame(makeBird({ flap: 1 }), 1);

    expect(a.width).toBe(b.width);
    expect(a.pixelWidth).toBe(b.pixelWidth);
  });

  it('caps the backing store DPR at 2', () => {
    const layout = layoutHeroBirds(1440, 900, 3);

    for (const box of layout.birds) {
      expect(box.pixelWidth).toBe(Math.round(box.width * 2));
    }
  });
});

describe('canvasTransform', () => {
  it('rotates the canvas around the bird center and translates it there', () => {
    const bird = makeBird({ x: 320, y: 210, heading: 1.1 });
    const frame = birdFrame(bird, 1);
    const place = canvasTransform(frame);

    expect(place.origin).toBe(`${frame.originX}px ${frame.originY}px`);
    expect(place.transform).toBe(
      `translate3d(${bird.x - frame.originX}px, ${bird.y - frame.originY}px, 0) rotate(${bird.heading}rad)`,
    );
  });

  it('writes the origin in canvas pixels, inside the box', () => {
    const frame = birdFrame(makeBird({ heading: 2 }), 1);
    const place = canvasTransform(frame);

    expect(place.originX).toBe(frame.originX);
    expect(place.originY).toBe(frame.originY);
    expect(place.originX).toBeGreaterThan(0);
    expect(place.originX).toBeLessThan(frame.width);
    expect(place.originY).toBeGreaterThan(0);
    expect(place.originY).toBeLessThan(frame.height);
  });
});

function fakeContext(): {
  ctx: BirdContext;
  calls: { clear: number[][]; rects: number[][]; texts: string[]; transforms: number[][] };
} {
  const calls = {
    clear: [] as number[][],
    rects: [] as number[][],
    texts: [] as string[],
    transforms: [] as number[][],
  };
  const ctx: BirdContext = {
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    clearRect: (x, y, width, height) => calls.clear.push([x, y, width, height]),
    setTransform: (...args) => calls.transforms.push(args),
    fillRect: (x, y, width, height) => calls.rects.push([x, y, width, height]),
    fillText: (text) => calls.texts.push(text),
  };

  return { ctx, calls };
}

function fakeCanvas(): {
  width: number;
  height: number;
  style: Record<string, string>;
  attrs: Record<string, string>;
  removed: boolean;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  remove(): void;
} {
  const attrs: Record<string, string> = {};
  return {
    width: 0,
    height: 0,
    removed: false,
    style: {
      position: '',
      left: '',
      top: '',
      width: '',
      height: '',
      transform: '',
      transformOrigin: '',
      filter: '',
      opacity: '',
      willChange: '',
      pointerEvents: '',
      background: '',
    },
    attrs,
    setAttribute(name: string, value: string): void {
      attrs[name] = value;
    },
    getAttribute(name: string): string | null {
      return attrs[name] ?? null;
    },
    remove(): void {
      this.removed = true;
      this.width = 0;
      this.height = 0;
    },
  };
}

interface FakeSurface {
  canvas: HTMLCanvasElement;
  fakeCanvas: ReturnType<typeof fakeCanvas>;
  ctx: BirdContext;
  calls: ReturnType<typeof fakeContext>['calls'];
}

function makeSurface(): FakeSurface {
  const canvas = fakeCanvas();
  const { ctx, calls } = fakeContext();

  return { canvas: canvas as unknown as HTMLCanvasElement, fakeCanvas: canvas, ctx, calls };
}

describe('paintBirdFrame', () => {
  it('clears the frame and paints integer glyph cells inside it', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.4, flap: 0.5 });
    const frame = birdFrame(bird, 1);
    const { ctx, calls } = fakeContext();

    paintBirdFrame(ctx, frame);

    expect(calls.clear).toEqual([[0, 0, frame.width, frame.height]]);
    expect(calls.rects.length).toBeGreaterThan(50);
    expect(calls.texts.length).toBe(calls.rects.length);

    for (const [x, y, width, height] of calls.rects) {
      expect(Number.isFinite(x + y + width + height)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + width).toBeLessThanOrEqual(frame.width + 1e-6);
      expect(y + height).toBeLessThanOrEqual(frame.height + 1e-6);
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(y)).toBe(true);
      expect(width).toBe(frame.cellWidth);
      expect(height).toBe(frame.cellHeight);
    }

    for (const text of calls.texts) {
      expect(typeof text).toBe('string');
      expect(text).toHaveLength(1);
    }
  });

  it('reports the painted cells and how many touch cached content', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.4 });
    const frame = birdFrame(bird, 1);
    const { ctx } = fakeContext();
    const bounds = birdBounds(bird);
    const pad = frame.cellWidth * 2;
    const area = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    };

    const clear = paintBirdFrame(ctx, frame);
    const all = paintBirdFrame(ctx, frame, [{ ...area, weight: 1 }]);
    const card = paintBirdFrame(ctx, frame, [{ ...area, weight: 0.25 }]);
    const none = paintBirdFrame(ctx, frame, [
      { x: 2000, y: 2000, width: 10, height: 10, weight: 1 },
    ]);

    expect(clear.cells).toBeGreaterThan(50);
    expect(clear.covered).toBe(0);
    expect(all.covered).toBe(all.cells);
    expect(card.covered).toBeCloseTo(all.cells * 0.25, 6);
    expect(none.covered).toBe(0);
  });

  it('keeps the strongest weight when obstacles overlap', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.4 });
    const frame = birdFrame(bird, 1);
    const { ctx } = fakeContext();
    const bounds = birdBounds(bird);
    const pad = frame.cellWidth * 2;
    const area = {
      x: bounds.x - pad,
      y: bounds.y - pad,
      width: bounds.width + pad * 2,
      height: bounds.height + pad * 2,
    };

    const both = paintBirdFrame(ctx, frame, [
      { ...area, weight: 0.25 },
      { ...area, weight: 1 },
      { ...area, weight: 0.5 },
    ]);

    expect(both.covered).toBe(both.cells);
  });

  it('repaints a moved bird without leaving stale cells', () => {
    const bird = makeBird({ x: 300, y: 200 });
    const { ctx, calls } = fakeContext();

    paintBirdFrame(ctx, birdFrame(bird, 1));
    bird.x += 40;
    paintBirdFrame(ctx, birdFrame(bird, 1));

    expect(calls.clear).toHaveLength(2);
    expect(calls.rects.length).toBeGreaterThan(100);
  });
});

describe('paintFlock', () => {
  it('repaints every bird on every call', () => {
    const layout = layoutHeroBirds(1440, 900, 1);
    const surfaces = layout.birds.map(() => {
      const fake = fakeContext();
      return { ctx: fake.ctx, calls: fake.calls };
    });

    const first = paintFlock(surfaces, layout.birds);
    const second = paintFlock(surfaces, layout.birds);

    expect(first).toHaveLength(layout.birds.length);
    expect(second).toHaveLength(layout.birds.length);
    surfaces.forEach(({ calls }) => {
      expect(calls.clear).toHaveLength(2);
      expect(calls.rects.length).toBeGreaterThan(100);
      expect(calls.texts.length).toBeGreaterThan(100);
    });
    first.forEach((stats) => expect(stats.cells).toBeGreaterThan(50));
  });

  it('scores content overlap once per bird', () => {
    const layout = layoutHeroBirds(800, 900, 1);
    const surfaces = layout.birds.map(() => fakeContext());
    const bounds = layout.birds.map((box) => birdBounds(box.bird));
    const obstacles = bounds.map((rect) => ({ ...rect, weight: 1 }));

    const stats = paintFlock(surfaces, layout.birds, obstacles);

    stats.forEach((entry) => expect(entry.covered).toBe(entry.cells));
  });
});

describe('mountBirdCanvases', () => {
  it('mounts one transparent, painted, rotated canvas per bird', () => {
    const layout = layoutHeroBirds(1440, 900, 2);
    const appended: unknown[] = [];
    const host = {
      appendChild: (node: HTMLCanvasElement): unknown => {
        appended.push(node);
        return node;
      },
    };
    const surfaces: FakeSurface[] = [];
    const create = () => {
      const surface = makeSurface();
      surfaces.push(surface);
      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const handles = mountBirdCanvases(host, layout, create);

    expect(handles).not.toBeNull();
    expect(handles).toHaveLength(3);
    expect(appended).toHaveLength(3);

    handles?.forEach((handle, index) => {
      const box = layout.birds[index];
      const place = canvasTransform(box);

      expect(handle.canvas.getAttribute('aria-hidden')).toBe('true');
      expect(handle.canvas.width).toBe(box.pixelWidth);
      expect(handle.canvas.height).toBe(box.pixelHeight);
      expect(handle.canvas.style.position).toBe('absolute');
      expect(handle.canvas.style.width).toBe(`${box.width}px`);
      expect(handle.canvas.style.height).toBe(`${box.height}px`);
      expect(handle.canvas.style.pointerEvents).toBe('none');
      expect(handle.canvas.style.background).toBe('transparent');
      expect(handle.canvas.style.filter).toBe('none');
      expect(handle.canvas.style.willChange).not.toBe('filter');
      expect(handle.canvas.style.transformOrigin).toBe(place.origin);
      expect(handle.canvas.style.transform).toBe(place.transform);
      expect(surfaces[index].calls.transforms).toEqual([[2, 0, 0, 2, 0, 0]]);
      expect(surfaces[index].calls.clear).toHaveLength(1);
      expect(surfaces[index].calls.rects.length).toBeGreaterThan(0);
    });
  });

  it('mounts the mobile count at 390 px', () => {
    const layout = layoutHeroBirds(390, 844, 1);
    const host = { appendChild: (node: HTMLCanvasElement): unknown => node };
    const handles = mountBirdCanvases(host, layout, () => {
      const surface = makeSurface();

      return { canvas: surface.canvas, ctx: surface.ctx };
    });

    expect(handles).toHaveLength(1);
  });

  it('reuses the existing canvases when the count does not change', () => {
    const first = layoutHeroBirds(1440, 900, 1);
    const second = layoutHeroBirds(1000, 900, 1);
    const appended: unknown[] = [];
    const host = {
      appendChild: (node: HTMLCanvasElement): unknown => {
        appended.push(node);
        return node;
      },
    };
    let created = 0;
    const surfaces: FakeSurface[] = [];
    const create = () => {
      created += 1;
      const surface = makeSurface();
      surfaces.push(surface);

      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const handles = mountBirdCanvases(host, first, create);
    expect(handles).toHaveLength(3);
    const before = handles?.map((handle) => handle.canvas);
    const paintsBefore = surfaces.map((surface) => surface.calls.rects.length);

    const again = mountBirdCanvases(host, second, create, handles ?? []);

    expect(created).toBe(3);
    expect(appended).toHaveLength(3);
    expect(again?.map((handle) => handle.canvas)).toEqual(before);
    surfaces.forEach((surface, index) => {
      expect(surface.calls.rects.length).toBeGreaterThan(paintsBefore[index]);
    });
    again?.forEach((handle, index) => {
      const box = second.birds[index];
      expect(handle.canvas.width).toBe(box.pixelWidth);
      expect(handle.canvas.style.transform).toBe(canvasTransform(box).transform);
    });
  });

  it('removes and zeroes the surplus canvases when the count shrinks', () => {
    const wide = layoutHeroBirds(1440, 900, 1);
    const narrow = layoutHeroBirds(390, 844, 1);
    const host = { appendChild: (node: HTMLCanvasElement): unknown => node };
    const surfaces: FakeSurface[] = [];
    const create = () => {
      const surface = makeSurface();
      surfaces.push(surface);

      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const handles = mountBirdCanvases(host, wide, create) ?? [];
    const next = mountBirdCanvases(host, narrow, create, handles);

    expect(next).toHaveLength(1);
    expect(next?.[0].canvas).toBe(handles[0].canvas);
    for (const handle of handles.slice(1)) {
      expect((handle.canvas as unknown as ReturnType<typeof fakeCanvas>).removed).toBe(true);
      expect(handle.canvas.width).toBe(0);
      expect(handle.canvas.height).toBe(0);
    }
  });

  it('creates only the missing canvases when the count grows', () => {
    const narrow = layoutHeroBirds(390, 844, 1);
    const wide = layoutHeroBirds(1440, 900, 1);
    const appended: unknown[] = [];
    const host = {
      appendChild: (node: HTMLCanvasElement): unknown => {
        appended.push(node);
        return node;
      },
    };
    let created = 0;
    const create = () => {
      created += 1;
      const surface = makeSurface();

      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const small = mountBirdCanvases(host, narrow, create) ?? [];
    const grown = mountBirdCanvases(host, wide, create, small);

    expect(created).toBe(3);
    expect(appended).toHaveLength(3);
    expect(grown).toHaveLength(3);
    expect(grown?.[0].canvas).toBe(small[0].canvas);
  });

  it('can configure without painting when the caller paints next', () => {
    const layout = layoutHeroBirds(390, 844, 1);
    const host = { appendChild: (node: HTMLCanvasElement): unknown => node };
    const surfaces: FakeSurface[] = [];
    const create = () => {
      const surface = makeSurface();
      surfaces.push(surface);

      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const handles = mountBirdCanvases(host, layout, create, [], false);

    expect(handles).toHaveLength(1);
    expect(handles?.[0].canvas.width).toBe(layout.birds[0].pixelWidth);
    expect(surfaces[0].calls.rects).toHaveLength(0);
    expect(surfaces[0].calls.clear).toHaveLength(0);
  });

  it('leaves the current canvases alone when a new context cannot be created', () => {
    const narrow = layoutHeroBirds(390, 844, 1);
    const wide = layoutHeroBirds(1440, 900, 1);
    const appended: unknown[] = [];
    const host = {
      appendChild: (node: HTMLCanvasElement): unknown => {
        appended.push(node);
        return node;
      },
    };
    const surfaces: FakeSurface[] = [];
    let created = 0;
    const create = () => {
      created += 1;
      if (created > 2) throw new Error('2d context unavailable');
      const surface = makeSurface();
      surfaces.push(surface);

      return { canvas: surface.canvas, ctx: surface.ctx };
    };

    const handles = mountBirdCanvases(host, narrow, create) ?? [];
    const rejected = mountBirdCanvases(host, wide, create, handles);

    expect(rejected).toBeNull();
    expect(appended).toHaveLength(1);
    expect(handles[0].canvas.width).toBeGreaterThan(0);
    expect(surfaces).toHaveLength(2);
    expect(surfaces[1].fakeCanvas.width).toBe(0);
    expect(surfaces[1].fakeCanvas.height).toBe(0);
  });
});

describe('shouldSettle', () => {
  const flags = { userPaused: false, hidden: false, inView: true, reduced: false };

  it('settles when reduced motion turns on', () => {
    expect(shouldSettle({ ...flags, reduced: true })).toBe(true);
  });

  it('never settles over a frame the user paused', () => {
    expect(shouldSettle({ ...flags, reduced: true, userPaused: true })).toBe(false);
  });

  it('does nothing while motion is allowed', () => {
    expect(shouldSettle(flags)).toBe(false);
    expect(shouldSettle({ ...flags, userPaused: true })).toBe(false);
  });
});

describe('canAnimate', () => {
  const running: SchedulerFlags = {
    userPaused: false,
    hidden: false,
    inView: true,
    reduced: false,
  };

  it('runs only when nothing pauses the flock', () => {
    expect(canAnimate(running)).toBe(true);
  });

  it.each([
    ['userPaused', { userPaused: true }],
    ['hidden', { hidden: true }],
    ['inView', { inView: false }],
    ['reduced', { reduced: true }],
  ] as const)('stops when %s pauses it', (_name, patch) => {
    expect(canAnimate({ ...running, ...patch })).toBe(false);
  });

  it('needs every flag clear before it runs', () => {
    expect(canAnimate({ userPaused: true, hidden: true, inView: false, reduced: true })).toBe(
      false,
    );
    expect(canAnimate({ userPaused: false, hidden: true, inView: false, reduced: true })).toBe(
      false,
    );
  });
});

describe('createScheduler', () => {
  function harness() {
    let nextId = 1;
    const requests: Array<(time: number) => void> = [];
    const cancelled: number[] = [];
    const steps: number[] = [];
    let resets = 0;

    const scheduler = createScheduler({
      request: (callback) => {
        requests.push(callback);
        return nextId++;
      },
      cancel: (id) => cancelled.push(id),
      step: (time) => steps.push(time),
      reset: () => {
        resets += 1;
      },
    });

    return { scheduler, requests, cancelled, steps, resets: () => resets };
  }

  it('starts one frame request and never duplicates it', () => {
    const { scheduler, requests, resets } = harness();

    expect(scheduler.sync()).toBe(true);
    expect(requests).toHaveLength(1);
    expect(scheduler.running()).toBe(true);

    scheduler.sync();
    scheduler.sync();
    expect(requests).toHaveLength(1);
    expect(resets()).toBe(1);
  });

  it('reschedules exactly once per frame and steps with the timestamp', () => {
    const { scheduler, requests, steps } = harness();
    scheduler.sync();

    requests[0](16.5);

    expect(steps).toEqual([16.5]);
    expect(requests).toHaveLength(2);
    expect(scheduler.running()).toBe(true);
  });

  it.each(['userPaused', 'hidden', 'reduced'] as const)(
    'cancels the frame when %s flags pause it',
    (flag) => {
      const { scheduler, requests, cancelled } = harness();
      scheduler.sync();
      const id = 1;

      scheduler.flags[flag] = true;
      expect(scheduler.sync()).toBe(false);
      expect(cancelled).toEqual([id]);
      expect(scheduler.running()).toBe(false);

      scheduler.flags[flag] = false;
      expect(scheduler.sync()).toBe(true);
      expect(requests).toHaveLength(2);
    },
  );

  it('pauses and resumes without a jump via reset', () => {
    const { scheduler, resets } = harness();
    scheduler.sync();
    expect(resets()).toBe(1);

    scheduler.flags.inView = false;
    scheduler.sync();
    scheduler.flags.inView = true;
    scheduler.sync();

    expect(resets()).toBe(2);
  });

  it('ignores a frame that fires after cancel', () => {
    const { scheduler, requests, steps } = harness();
    scheduler.sync();
    const stale = requests[0];

    scheduler.flags.hidden = true;
    scheduler.sync();
    stale(20);

    expect(steps).toEqual([]);
    expect(scheduler.running()).toBe(false);
  });

  it('stops for good on destroy', () => {
    const { scheduler, requests, cancelled } = harness();
    scheduler.sync();

    scheduler.destroy();

    expect(cancelled).toEqual([1]);
    expect(scheduler.sync()).toBe(false);

    requests[0](30);
    expect(scheduler.running()).toBe(false);
    expect(requests).toHaveLength(1);
  });
});

describe('createControllerRegistry', () => {
  it('destroys the previous controller when a new one is installed', () => {
    const registry = createControllerRegistry<{ destroy(): void }>();
    const destroyed: string[] = [];
    const first = { destroy: () => destroyed.push('first') };
    const second = { destroy: () => destroyed.push('second') };

    registry.install(first);
    registry.install(second);

    expect(destroyed).toEqual(['first']);
    expect(registry.current).toBe(second);
  });

  it('does not clear a newer controller when an old one releases', () => {
    const registry = createControllerRegistry<{ destroy(): void }>();
    const first = { destroy: () => {} };
    const second = { destroy: () => {} };

    registry.install(first);
    registry.install(second);
    registry.release(first);

    expect(registry.current).toBe(second);

    registry.release(second);
    expect(registry.current).toBeNull();
  });
});

describe('toLayerRects', () => {
  it('moves rectangles into layer space and drops empty ones', () => {
    const layer = { x: 100, y: 50, width: 800, height: 600 };
    const rects = [
      { x: 120, y: 80, width: 200, height: 40 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: 10, height: 0 },
    ];

    expect(toLayerRects(layer, rects)).toEqual([{ x: 20, y: 30, width: 200, height: 40 }]);
  });
});
