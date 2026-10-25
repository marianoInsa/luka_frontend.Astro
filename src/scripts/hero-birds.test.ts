import { describe, expect, it } from 'vitest';

import {
  BIRD_LOCAL_BOUNDS,
  MIN_BLUR,
  PART_RAMPS,
  TURN_RATE,
  approach,
  arrivalRadius,
  birdBounds,
  birdReach,
  blurTarget,
  clampBirdInside,
  createFlock,
  createRng,
  glyphForShade,
  overlapRatio,
  resizeFlock,
  resolveBirdCount,
  safeFlightRect,
  sampleBird,
  seedFlight,
  settleFlock,
  stepFlock,
  type Bird,
} from './hero-birds-model';
import {
  BIRD_CANVAS_PADDING,
  BIRD_SIZE_SCALE,
  OBSTACLES,
  advanceBirds,
  advanceClock,
  birdFrame,
  birdStyle,
  blurLimit,
  canAnimate,
  canvasTransform,
  createControllerRegistry,
  createLoadSeed,
  createScheduler,
  glyphForInk,
  layoutHeroBirds,
  localToWorld,
  mountBirdCanvases,
  paintBirdFrame,
  opacityForOverlap,
  paintFlock,
  quantizeBlur,
  resizeBirds,
  settleLevel,
  shouldSettle,
  stageHeight,
  toLayerRects,
  visibleViewportHeight,
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
    targetU: 0.5,
    targetV: 0.5,
    zone: -1,
    zoneSeed: 0x5eed,
    leg: 0,
    ...overrides,
  };
}

/** Shortest signed rotation from `from` to `to`, in (-PI, PI]. */
function angleOff(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
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

describe('flight geometry', () => {
  it('uses the rotated silhouette radius as the safe inset', () => {
    const length = 100;
    const longitudinal = Math.max(-BIRD_LOCAL_BOUNDS.uMin, BIRD_LOCAL_BOUNDS.uMax);
    expect(birdReach(length)).toBeCloseTo(
      Math.hypot(longitudinal, BIRD_LOCAL_BOUNDS.vHalf) * length,
      9,
    );
    expect(birdReach(Number.NaN)).toBeGreaterThan(0);
  });

  it('insets the safe rect by the bird reach on both axes', () => {
    const rect = safeFlightRect(100, 1200, 700);
    const reach = birdReach(100) + 2;

    expect(rect.x).toBeCloseTo(reach, 9);
    expect(rect.y).toBeCloseTo(reach, 9);
    expect(rect.width).toBeCloseTo(1200 - 2 * reach, 9);
    expect(rect.height).toBeCloseTo(700 - 2 * reach, 9);
    expect(safeFlightRect(100, 0, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('never arrives faster than two turn radii', () => {
    for (const speed of [0, 10, 40, 80]) {
      expect(arrivalRadius(speed)).toBeGreaterThanOrEqual((2 * speed) / TURN_RATE);
    }
  });
});

describe('seedFlight', () => {
  it('is deterministic and changes with the seed', () => {
    const a = createFlock(3, 1200, 700, 4);
    const b = createFlock(3, 1200, 700, 4);
    const c = createFlock(3, 1200, 700, 5);

    seedFlight(a, 1200, 700, 4);
    seedFlight(b, 1200, 700, 4);
    seedFlight(c, 1200, 700, 5);

    expect(a).toEqual(b);
    expect(a.map((bird) => bird.targetU)).not.toEqual(c.map((bird) => bird.targetU));
  });

  it('keeps every spawn and waypoint finite in a degenerate stage', () => {
    const birds = createFlock(2, 0, 0, 4);
    seedFlight(birds, 0, 0, 4);

    for (const bird of birds) {
      expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
      expect(bird.targetU).toBeGreaterThanOrEqual(0);
      expect(bird.targetU).toBeLessThanOrEqual(1);
      expect(bird.targetV).toBeGreaterThanOrEqual(0);
      expect(bird.targetV).toBeLessThanOrEqual(1);
    }
  });
});

describe('createLoadSeed', () => {
  it('returns a fresh finite 32-bit seed', () => {
    const seeds = new Set<number>();
    for (let index = 0; index < 8; index += 1) {
      const seed = createLoadSeed();
      expect(Number.isFinite(seed)).toBe(true);
      expect(seed).toBeGreaterThan(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      seeds.add(seed);
    }
    expect(seeds.size).toBeGreaterThan(1);
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

describe('createFlock waypoint setup', () => {
  it('spawns every bird inside its safe flight rectangle', () => {
    const width = 1200;
    const height = 700;
    const birds = createFlock(3, width, height, 5);

    for (const bird of birds) {
      const rect = safeFlightRect(bird.length, width, height);
      expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
      expect(bird.targetU).toBeGreaterThanOrEqual(0);
      expect(bird.targetU).toBeLessThanOrEqual(1);
      expect(bird.targetV).toBeGreaterThanOrEqual(0);
      expect(bird.targetV).toBeLessThanOrEqual(1);
      expect(bird.leg).toBe(1);
      expect(bird.zone).toBeGreaterThanOrEqual(0);
      expect(bird.zone).toBeLessThan(9);
    }
  });

  it('points each bird at its first waypoint', () => {
    const width = 1200;
    const height = 700;
    for (const bird of createFlock(3, width, height, 5)) {
      const rect = safeFlightRect(bird.length, width, height);
      const targetX = rect.x + bird.targetU * rect.width;
      const targetY = rect.y + bird.targetV * rect.height;
      const aim = Math.atan2(targetY - bird.y, targetX - bird.x);

      expect(Math.cos(bird.heading - aim)).toBeGreaterThan(0.999);
      expect(Number.isFinite(bird.heading)).toBe(true);
    }
  });

  it('spreads the flock across the safe rectangle', () => {
    const width = 1200;
    const height = 700;
    const birds = createFlock(3, width, height, 5);
    const xs = birds.map((bird) => bird.x).sort((a, b) => a - b);
    const ys = birds.map((bird) => bird.y).sort((a, b) => a - b);

    expect(xs[2] - xs[0]).toBeGreaterThan(width * 0.15);
    expect(ys[2] - ys[0]).toBeGreaterThan(0);

    const zones = new Set(
      birds.map((bird) => {
        const rect = safeFlightRect(bird.length, width, height);
        const column = Math.min(2, Math.floor(((bird.x - rect.x) / rect.width) * 3));
        const row = Math.min(2, Math.floor(((bird.y - rect.y) / rect.height) * 3));
        return row * 3 + column;
      }),
    );
    expect(zones.size).toBe(3);
  });

  it('changes routes with the seed', () => {
    const a = createFlock(3, 1200, 700, 1);
    const b = createFlock(3, 1200, 700, 2);

    expect(a.map((bird) => [bird.targetU, bird.targetV, bird.zoneSeed])).not.toEqual(
      b.map((bird) => [bird.targetU, bird.targetV, bird.zoneSeed]),
    );
  });
});

describe('waypoint flight', () => {
  const WIDTH = 1200;
  const HEIGHT = 700;
  const DT = 1 / 60;
  const FRAMES = 90 * 60;

  interface Trace {
    minX: number[];
    maxX: number[];
    minY: number[];
    maxY: number[];
    zones: Set<number>[];
    legs: number[];
    signsX: Set<number>[];
    signsY: Set<number>[];
    maxHeadingStep: number;
    teleports: number;
    outside: number;
    broken: number;
  }

  function flight(seed: number): { birds: Bird[]; trace: Trace } {
    const birds = createFlock(3, WIDTH, HEIGHT, seed);
    const trace: Trace = {
      minX: birds.map((bird) => bird.x),
      maxX: birds.map((bird) => bird.x),
      minY: birds.map((bird) => bird.y),
      maxY: birds.map((bird) => bird.y),
      zones: birds.map(() => new Set<number>()),
      legs: birds.map(() => 0),
      signsX: birds.map(() => new Set<number>()),
      signsY: birds.map(() => new Set<number>()),
      maxHeadingStep: 0,
      teleports: 0,
      outside: 0,
      broken: 0,
    };
    const previousHeading = birds.map((bird) => bird.heading);
    const previousX = birds.map((bird) => bird.x);
    const previousY = birds.map((bird) => bird.y);

    for (let frame = 0; frame < FRAMES; frame += 1) {
      stepFlock(birds, DT, WIDTH, HEIGHT);

      for (let index = 0; index < birds.length; index += 1) {
        const bird = birds[index];
        const dx = bird.x - previousX[index];
        const dy = bird.y - previousY[index];
        const headingStep = Math.abs(angleOff(previousHeading[index], bird.heading));
        if (Math.abs(dx) > 1e-3) trace.signsX[index].add(Math.sign(dx));
        if (Math.abs(dy) > 1e-3) trace.signsY[index].add(Math.sign(dy));

        trace.maxHeadingStep = Math.max(trace.maxHeadingStep, headingStep);
        if (headingStep > 1.8 * DT + 1e-9) trace.broken += 1;
        if (!(Math.abs(bird.heading) <= Math.PI + 1e-9)) trace.broken += 1;
        if (Math.hypot(dx, dy) > Math.max(bird.speed, 1) * DT + 1e-6) trace.teleports += 1;
        if (!Number.isFinite(bird.x + bird.y + bird.heading + bird.flap)) trace.broken += 1;

        const bounds = birdBounds(bird);
        if (
          bounds.x < -1e-6 ||
          bounds.y < -1e-6 ||
          bounds.x + bounds.width > WIDTH + 1e-6 ||
          bounds.y + bounds.height > HEIGHT + 1e-6
        ) {
          trace.outside += 1;
        }

        trace.minX[index] = Math.min(trace.minX[index], bird.x);
        trace.maxX[index] = Math.max(trace.maxX[index], bird.x);
        trace.minY[index] = Math.min(trace.minY[index], bird.y);
        trace.maxY[index] = Math.max(trace.maxY[index], bird.y);
        trace.zones[index].add(bird.zone);
        trace.legs[index] = bird.leg;

        previousHeading[index] = bird.heading;
        previousX[index] = bird.x;
        previousY[index] = bird.y;
      }
    }

    return { birds, trace };
  }

  it('covers both axes, several zones and both directions', () => {
    const { birds, trace } = flight(23);

    expect(trace.broken).toBe(0);
    expect(trace.teleports).toBe(0);
    expect(trace.outside).toBe(0);

    birds.forEach((_bird, index) => {
      expect(trace.maxX[index] - trace.minX[index]).toBeGreaterThan(WIDTH * 0.3);
      expect(trace.maxY[index] - trace.minY[index]).toBeGreaterThan(HEIGHT * 0.2);
      expect(trace.zones[index].size).toBeGreaterThanOrEqual(3);
      expect(trace.legs[index]).toBeGreaterThanOrEqual(3);
      expect(trace.signsX[index].size).toBe(2);
      expect(trace.signsY[index].size).toBe(2);
    });
  });

  it('turns at the limited angular rate instead of snapping', () => {
    const { trace } = flight(23);

    expect(trace.maxHeadingStep).toBeLessThanOrEqual(1.8 * DT + 1e-9);
    expect(trace.maxHeadingStep).toBeGreaterThan(1.8 * DT * 0.6);
  });

  it('is deterministic for the same seed', () => {
    const a = createFlock(3, WIDTH, HEIGHT, 31);
    const b = createFlock(3, WIDTH, HEIGHT, 31);

    for (let frame = 0; frame < 600; frame += 1) {
      stepFlock(a, DT, WIDTH, HEIGHT);
      stepFlock(b, DT, WIDTH, HEIGHT);
    }

    expect(a).toEqual(b);
  });

  it('ignores an invalid dt', () => {
    const birds = createFlock(2, 800, 600, 3);
    const before = birds.map((bird) => ({ ...bird }));

    stepFlock(birds, 0, 800, 600);
    stepFlock(birds, Number.NaN, 800, 600);
    stepFlock(birds, -1, 800, 600);
    stepFlock(birds, Number.POSITIVE_INFINITY, 800, 600);

    expect(birds).toEqual(before);
  });

  it('stays finite on a zero-height stage', () => {
    const birds = createFlock(2, 800, 0, 3);

    for (let frame = 0; frame < 120; frame += 1) {
      stepFlock(birds, DT, 800, 0);
      for (const bird of birds) {
        expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
        expect(bird.y).toBe(0);
      }
    }
  });
});

describe('waypoint integration', () => {
  const DT = 1 / 60;
  const FRAMES = 90 * 60;

  /** Layer width and visible stage for each viewport (no DOM in the test). */
  const VIEWPORTS: Array<[number, number]> = [
    [1440, 900],
    [800, 900],
    [390, 844],
    [844, 329],
    [390, 552],
    [390, 450],
    [320, 800],
  ];

  interface Flight {
    travelX: number;
    travelY: number;
    zones: number;
    legs: number;
    outsideFrames: number;
    maxDepth: number;
    corrections: number;
    maxCorrection: number;
    maxHeadingStep: number;
    maxPositionStep: number;
    maxSpeed: number;
    stallFrames: number;
    teleports: number;
    outside: number;
    broken: number;
    signsX: Set<number>;
    signsY: Set<number>;
  }

  function flightOf(width: number, height: number): Flight[] {
    const birds = layoutHeroBirds(width, height, 1, 0, 11).birds.map((box) => box.bird);
    const stats = birds.map((bird) => ({
      minX: bird.x,
      maxX: bird.x,
      minY: bird.y,
      maxY: bird.y,
      zones: new Set<number>(),
      legs: bird.leg,
      outsideFrames: 0,
      maxDepth: 0,
      corrections: 0,
      maxCorrection: 0,
      maxHeadingStep: 0,
      maxPositionStep: 0,
      maxSpeed: bird.speed,
      stallFrames: 0,
      teleports: 0,
      outside: 0,
      broken: 0,
      signsX: new Set<number>(),
      signsY: new Set<number>(),
    }));

    for (let frame = 0; frame < FRAMES; frame += 1) {
      const beforeX = birds.map((bird) => bird.x);
      const beforeY = birds.map((bird) => bird.y);
      const beforeHeading = birds.map((bird) => bird.heading);
      const beforeSpeed = birds.map((bird) => bird.speed);

      stepFlock(birds, DT, width, height);
      // Snapshot after physics and before the net: the AABB is measured on the
      // raw position, so "no clipping" cannot be tautological.
      const raw = birds.map((bird) => ({ ...bird }));
      const moved = birds.map((bird) => ({ x: bird.x, y: bird.y }));
      for (const bird of birds) clampBirdInside(bird, width, height, 0);

      birds.forEach((bird, index) => {
        const entry = stats[index];
        const bounds = birdBounds(raw[index]);
        const reach = Math.max(beforeSpeed[index], bird.speed) * DT + 1e-6;
        const correction = Math.hypot(bird.x - moved[index].x, bird.y - moved[index].y);
        const dx = bird.x - beforeX[index];
        const dy = bird.y - beforeY[index];

        entry.corrections += correction > 1e-6 ? 1 : 0;
        entry.maxCorrection = Math.max(entry.maxCorrection, correction);
        entry.maxHeadingStep = Math.max(
          entry.maxHeadingStep,
          Math.abs(angleOff(beforeHeading[index], bird.heading)),
        );
        entry.maxPositionStep = Math.max(
          entry.maxPositionStep,
          Math.abs(bird.x - beforeX[index]),
          Math.abs(bird.y - beforeY[index]),
        );
        entry.maxSpeed = Math.max(entry.maxSpeed, bird.speed);
        if (Math.hypot(dx, dy) < 0.2 * Math.max(bird.speed, 1) * DT) entry.stallFrames += 1;
        entry.minX = Math.min(entry.minX, bird.x);
        entry.maxX = Math.max(entry.maxX, bird.x);
        entry.minY = Math.min(entry.minY, bird.y);
        entry.maxY = Math.max(entry.maxY, bird.y);
        entry.zones.add(bird.zone);
        entry.legs = bird.leg;
        if (Math.abs(dx) > 1e-3) entry.signsX.add(Math.sign(dx));
        if (Math.abs(dy) > 1e-3) entry.signsY.add(Math.sign(dy));

        const depth = Math.max(
          0,
          -bounds.x,
          bounds.x + bounds.width - width,
          -bounds.y,
          bounds.y + bounds.height - height,
        );
        entry.maxDepth = Math.max(entry.maxDepth, depth);
        if (depth > 1e-6) entry.outsideFrames += 1;

        if (Math.abs(dx) > reach || Math.abs(dy) > reach) entry.teleports += 1;
        if (!(bird.x >= 0 && bird.x <= width && bird.y >= 0 && bird.y <= height)) {
          entry.outside += 1;
        }
        if (!Number.isFinite(bird.x + bird.y + bird.heading + bird.flap)) entry.broken += 1;
      });
    }

    return stats.map((entry) => ({
      travelX: (entry.maxX - entry.minX) / width,
      travelY: (entry.maxY - entry.minY) / height,
      zones: entry.zones.size,
      legs: entry.legs,
      outsideFrames: entry.outsideFrames,
      maxDepth: entry.maxDepth,
      corrections: entry.corrections,
      maxCorrection: entry.maxCorrection,
      maxHeadingStep: entry.maxHeadingStep,
      maxPositionStep: entry.maxPositionStep,
      maxSpeed: entry.maxSpeed,
      stallFrames: entry.stallFrames,
      teleports: entry.teleports,
      outside: entry.outside,
      broken: entry.broken,
      signsX: entry.signsX,
      signsY: entry.signsY,
    }));
  }

  it('runs stepFlock plus the edge clamp in the production tick', () => {
    const width = 1200;
    const height = 792;
    const ticked = layoutHeroBirds(width, height, 1, 0, 7).birds.map((box) => box.bird);
    const reference = ticked.map((bird) => ({ ...bird }));

    advanceBirds(ticked, 900, width, height);
    for (let step = 0; step < 900; step += 1) stepFlock(reference, DT, width, height);
    for (const bird of reference) clampBirdInside(bird, width, height, 0);

    expect(ticked).toEqual(reference);
  });

  it.each(VIEWPORTS)('keeps the centre inside and finite at %s×%s', (width, height) => {
    for (const flight of flightOf(width, height)) {
      expect(flight.broken).toBe(0);
      expect(flight.outside).toBe(0);
      expect(flight.teleports).toBe(0);
      expect(flight.maxPositionStep).toBeLessThanOrEqual(flight.maxSpeed * DT + 1e-6);
      expect(flight.maxPositionStep).toBeGreaterThan(0);
      expect(flight.stallFrames).toBe(0);
      expect(flight.maxHeadingStep).toBeLessThanOrEqual(1.8 * DT + 1e-9);
    }
  });

  it.each(VIEWPORTS)('never clips the silhouette at %s×%s', (width, height) => {
    for (const flight of flightOf(width, height)) {
      expect(flight.outsideFrames).toBe(0);
      expect(flight.maxDepth).toBe(0);
      // The clamp is only a net: the flight rectangle must do all the work.
      expect(flight.corrections).toBe(0);
      expect(flight.maxCorrection).toBe(0);
    }
  });

  it.each(VIEWPORTS)('covers the deck at %s×%s', (width, height) => {
    const flights = flightOf(width, height);

    expect(flights.length).toBeGreaterThan(0);
    for (const flight of flights) {
      expect(flight.travelX).toBeGreaterThan(0.22);
      expect(flight.travelY).toBeGreaterThan(0.12);
      expect(flight.zones).toBeGreaterThanOrEqual(3);
      expect(flight.legs).toBeGreaterThanOrEqual(3);
      expect(flight.legs).toBeLessThanOrEqual(60);
      expect(flight.signsX.size).toBe(2);
      expect(flight.signsY.size).toBe(2);
    }
  });

  it.each([
    { name: '844×390', width: 844, layer: 1399, top: 61, viewport: 390, cap: Infinity },
    { name: '390×844', width: 390, layer: 1569, top: 52, viewport: 844, cap: 552 },
  ])('keeps every centre on screen at $name', ({ width, layer, top, viewport, cap }) => {
    const stage = stageHeight(layer, visibleViewportHeight(top, layer, viewport), cap);
    const birds = layoutHeroBirds(width, stage, 1, 0, 11).birds.map((box) => box.bird);

    for (let frame = 0; frame < 90 * 60; frame += 1) {
      advanceBirds(birds, 1, width, stage);
      for (const bird of birds) {
        expect(bird.y).toBeGreaterThanOrEqual(0);
        expect(bird.y).toBeLessThanOrEqual(stage);
        // Centre inside the window, not just inside the layer.
        expect(top + bird.y).toBeLessThanOrEqual(viewport);
      }
    }
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

  it('picks a new waypoint on arrival', () => {
    const bird = makeBird({ x: 400, y: 300, length: 100, targetU: 0.5, targetV: 0.5 });
    const before = bird.leg;
    const zone = bird.zone;

    stepFlock([bird], 1 / 60, 800, 600);

    expect(bird.leg).toBeGreaterThan(before);
    expect(bird.zone).not.toBe(zone);
    expect(bird.targetU).toBeGreaterThanOrEqual(0);
    expect(bird.targetU).toBeLessThanOrEqual(1);
    expect(bird.targetV).toBeGreaterThanOrEqual(0);
    expect(bird.targetV).toBeLessThanOrEqual(1);
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

  it('keeps waypoint fractions and never introduces NaN', () => {
    const birds = createFlock(2, 1200, 700, 4);
    const routes = birds.map((bird) => ({
      targetU: bird.targetU,
      targetV: bird.targetV,
      zoneSeed: bird.zoneSeed,
      zone: bird.zone,
      leg: bird.leg,
    }));
    const grown = resizeFlock(birds, 3, 900, 600);

    expect(grown).toHaveLength(3);
    expect(
      grown.slice(0, 2).map((bird) => ({
        targetU: bird.targetU,
        targetV: bird.targetV,
        zoneSeed: bird.zoneSeed,
        zone: bird.zone,
        leg: bird.leg,
      })),
    ).toEqual(routes);
    for (const bird of grown) {
      const rect = safeFlightRect(bird.length, 900, 600);
      expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
      expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
    }

    for (let frame = 0; frame < 300; frame += 1) stepFlock(grown, 1 / 60, 900, 600);
    for (const bird of grown) {
      expect(Number.isFinite(bird.y)).toBe(true);
      expect(Math.abs(bird.targetU)).toBeLessThanOrEqual(1);
      expect(Math.abs(bird.targetV)).toBeLessThanOrEqual(1);
    }
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

  it('leaves a safe still frame after the four-second settle', () => {
    for (const [width, height] of [
      [1440, 900],
      [800, 900],
      [390, 844],
    ] as const) {
      const layout = layoutHeroBirds(width, height, 1, 4);
      const again = layoutHeroBirds(width, height, 1, 4);

      expect(layout.birds.length).toBeGreaterThan(0);
      expect(layout.birds.map((box) => box.bird)).toEqual(again.birds.map((box) => box.bird));

      for (const box of layout.birds) {
        const bird = box.bird;
        const bounds = birdBounds(bird);
        const rect = safeFlightRect(bird.length, width, height);

        expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
        expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
        expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
        expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
        expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
        expect(bounds.x).toBeGreaterThanOrEqual(8 - 1e-6);
        expect(bounds.y).toBeGreaterThanOrEqual(8 - 1e-6);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8 + 1e-6);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height - 8 + 1e-6);
      }
    }
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

  it('blurs visibly from a single covered cell, whatever the fraction', () => {
    // One ink cell over a 4.5k-cell bird is a 0.02 % overlap: still not sharp.
    const oneCell = 1 / 4500;

    for (const limit of [1.25, 2, 3]) {
      const raw = blurTarget(oneCell, limit);
      expect(raw).toBeGreaterThan(0);
      expect(raw).toBeLessThanOrEqual(limit);
      expect(quantizeBlur(raw, MIN_BLUR)).toBeGreaterThan(0);
    }
  });

  it('keeps the minimum below the ramp and the cap at maxBlur', () => {
    expect(blurTarget(0.01, 2.5)).toBeGreaterThanOrEqual(MIN_BLUR);
    expect(blurTarget(1, 2.5)).toBe(2.5);
    expect(blurTarget(1, 0.2)).toBeLessThanOrEqual(0.2);
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
      expect(box.height).toBeLessThan(1.5 * box.bird.length);
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
    expect(a.birds.map((box) => box.bird)).toEqual(b.birds.map((box) => box.bird));
  });

  it('changes the route with the seed', () => {
    const a = layoutHeroBirds(1440, 900, 1, 0, 1);
    const b = layoutHeroBirds(1440, 900, 1, 0, 2);
    const route = (layout: typeof a) =>
      layout.birds.map((box) => [box.bird.targetU, box.bird.targetV, box.bird.zoneSeed]);

    expect(route(a)).not.toEqual(route(b));
  });

  it('renders every bird at 80% of the pre-waypoint length', () => {
    for (const [width, height] of [
      [1440, 900],
      [844, 329],
      [390, 552],
    ] as const) {
      const layout = layoutHeroBirds(width, height, 1);
      const diagonal = Math.hypot(
        Math.max(-BIRD_LOCAL_BOUNDS.uMin, BIRD_LOCAL_BOUNDS.uMax),
        BIRD_LOCAL_BOUNDS.vHalf,
      );
      const cruise = 50 * Math.min(1.15, Math.max(0.85, width / 1200));
      const verticalCap = (0.38 * height - (2 * cruise) / TURN_RATE) / diagonal;
      const shortCap = height < 520 ? height * 0.26 : Number.POSITIVE_INFINITY;
      const widthCap = width * 0.26;
      const base = Math.min(
        Math.max(
          Math.min(Math.min(width, height) * 0.34, shortCap, widthCap, verticalCap),
          88,
        ),
        280,
      );

      for (const box of layout.birds) {
        const previous = base * (0.7 + 0.3 * box.bird.depth);
        expect(box.bird.length).toBeCloseTo(previous * BIRD_SIZE_SCALE, 6);
      }
    }
  });

  it('normalizes waypoint fractions and keeps every centre in its flight rect', () => {
    const layout = layoutHeroBirds(1440, 900, 1);

    for (const box of layout.birds) {
      const bird = box.bird;
      const rect = safeFlightRect(bird.length, 1440, 900);
      expect(bird.targetU).toBeGreaterThanOrEqual(0);
      expect(bird.targetU).toBeLessThanOrEqual(1);
      expect(bird.targetV).toBeGreaterThanOrEqual(0);
      expect(bird.targetV).toBeLessThanOrEqual(1);
      expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-6);
      expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-6);
      expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-6);
      expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-6);
    }
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
  it('caps handheld stages low and desktop at 3 px', () => {
    expect(blurLimit(390, 844)).toBe(1.5);
    expect(blurLimit(719, 800)).toBe(1.5);
    expect(blurLimit(390, 530)).toBe(1.5);
    // A landscape phone is 844 wide but only 390 tall: keep it readable.
    expect(blurLimit(844, 390)).toBe(2);
    expect(blurLimit(720, 768)).toBe(3);
    expect(blurLimit(1440, 792)).toBe(3);
    // Without a height the previous width-only behaviour is kept.
    expect(blurLimit(390)).toBe(1.5);
    expect(blurLimit(1440)).toBe(3);
  });

  it('never grows with the width', () => {
    for (const [width, height] of [
      [320, 800],
      [390, 844],
      [719, 900],
      [720, 768],
      [800, 900],
      [844, 390],
      [1440, 900],
      [2560, 1200],
    ]) {
      const limit = blurLimit(width, height);

      expect(limit).toBeGreaterThan(0);
      expect(limit).toBeLessThanOrEqual(3);
      if (height < 520) expect(limit).toBeLessThanOrEqual(2);
      else if (width < 720) expect(limit).toBeLessThanOrEqual(1.5);
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

  it('never rounds a covered frame down to zero', () => {
    expect(quantizeBlur(0.02)).toBe(0);
    expect(quantizeBlur(0.02, MIN_BLUR)).toBe(MIN_BLUR);
    expect(quantizeBlur(MIN_BLUR, MIN_BLUR)).toBe(MIN_BLUR);
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
      expect(value).toBeGreaterThanOrEqual(0.45);
      expect(value).toBeLessThanOrEqual(1);
      previous = value;
    }
    expect(opacityForOverlap(1)).toBe(0.45);
    expect(opacityForOverlap(0.5)).toBe(0.45);
  });

  it('stays readable at the floor and only dims on real text overlap', () => {
    // A light graze over a text edge keeps most of the opacity, so the ASCII
    // is not a permanent smudge; heavy overlap still reaches the floor.
    expect(opacityForOverlap(0.02)).toBeGreaterThan(0.8);
    expect(opacityForOverlap(0.08)).toBe(0.45);
    expect(opacityForOverlap(0.6)).toBe(0.45);
  });

  it('starts blurring and dimming on the same graze', () => {
    expect(blurTarget(0.2, 2.5)).toBeGreaterThan(0);
    expect(opacityForOverlap(0.2)).toBeLessThan(1);
  });

  it('keeps the floor configurable and clamped', () => {
    expect(opacityForOverlap(1, 0.55)).toBe(0.55);
    expect(opacityForOverlap(1, -2)).toBe(0);
    expect(opacityForOverlap(1, 3)).toBe(1);
  });
});

describe('visibleViewportHeight', () => {
  it('drops the part of the layer that sits under the fold', () => {
    // Landscape phone: the Hero starts 61 px below the top of the window.
    expect(visibleViewportHeight(61, 1399, 390)).toBe(329);
    // Portrait phone: the layer is taller than the window, the nav eats 52 px.
    expect(visibleViewportHeight(52, 1569, 844)).toBe(792);
    // Desktop: the layer itself ends before the window does.
    expect(visibleViewportHeight(61, 792, 900)).toBe(792);
  });

  it('stays sane when the hero is scrolled or the inputs are broken', () => {
    expect(visibleViewportHeight(-120, 900, 800)).toBe(800);
    expect(visibleViewportHeight(Number.NaN, 900, 800)).toBe(800);
    expect(visibleViewportHeight(61, 1399, 0)).toBe(1399);
    expect(visibleViewportHeight(500, 400, 390)).toBe(0);
    expect(stageHeight(1399, visibleViewportHeight(61, 1399, 390))).toBe(329);
  });
});

describe('obstacles', () => {
  it('blurs the bird behind every Hero component', () => {
    const selectors = OBSTACLES.map((obstacle) => obstacle.selector);

    expect(selectors).toContain('.hero__copy h1');
    expect(selectors).toContain('.hero__copy > p');
    // The whole CTA row: primary, ghost and the pause control.
    expect(selectors).toContain('.hero__actions');
    // The product cards paint above the layer; the bird must still soften.
    expect(selectors).toContain('.mini-dash');
    expect(selectors).toContain('.phone');
    for (const obstacle of OBSTACLES) expect(obstacle.weight).toBe(1);
    // Text and glass fade the bird; the opaque cards only blur it.
    expect(OBSTACLES.find((o) => o.selector === '.hero__copy h1')?.contrast).toBe(true);
    expect(OBSTACLES.find((o) => o.selector === '.hero__copy > p')?.contrast).toBe(true);
    // The row softens the whole flock; only the transparent controls fade it.
    expect(OBSTACLES.find((o) => o.selector === '.hero__actions')?.contrast).toBe(false);
    expect(OBSTACLES.find((o) => o.selector === '.hero__actions .btn--ghost')?.contrast).toBe(true);
    expect(OBSTACLES.find((o) => o.selector === '.hero__actions .hero__motion')?.contrast).toBe(true);
    expect(OBSTACLES.find((o) => o.selector === '.mini-dash')?.contrast).toBe(false);
    expect(OBSTACLES.find((o) => o.selector === '.phone')?.contrast).toBe(false);
  });

  it('leaves no card or control out of the list', () => {
    const selectors = OBSTACLES.map((obstacle) => obstacle.selector);

    // A component that hides the bird without blurring it would be a hole.
    for (const selector of ['.hero__copy h1', '.hero__copy > p', '.mini-dash', '.phone', '.hero__actions']) {
      expect(selectors.some((entry) => selector === entry || entry.includes(selector))).toBe(true);
    }
  });
});

describe('resizeBirds', () => {
  it('keeps waypoint fractions and clamps the centre into the new rect', () => {
    const width = 1440;
    const height = 792;
    const birds = layoutHeroBirds(width, height, 1, 0, 9).birds.map((box) => box.bird);

    for (let frame = 0; frame < 300; frame += 1) advanceBirds(birds, 1, width, height);

    const before = birds.map((bird) => ({
      targetU: bird.targetU,
      targetV: bird.targetV,
      zoneSeed: bird.zoneSeed,
      zone: bird.zone,
      leg: bird.leg,
      heading: bird.heading,
    }));
    const nextWidth = 800;
    const nextHeight = 900;
    const resized = resizeBirds(
      birds,
      2,
      nextWidth,
      nextHeight,
      nextWidth / width,
      nextHeight / height,
      9,
    );

    expect(resized).toHaveLength(2);
    resized.forEach((bird, index) => {
      const old = before[index];
      const rect = safeFlightRect(bird.length, nextWidth, nextHeight);

      expect(bird.targetU).toBe(old.targetU);
      expect(bird.targetV).toBe(old.targetV);
      expect(bird.zoneSeed).toBe(old.zoneSeed);
      expect(bird.zone).toBe(old.zone);
      expect(bird.leg).toBe(old.leg);
      expect(bird.heading).toBe(old.heading);
      expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
      expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
    });
  });

  it('spawns extra birds inside the new safe rect', () => {
    const birds = layoutHeroBirds(800, 900, 1, 0, 3).birds.map((box) => box.bird);
    const grown = resizeBirds(birds, 3, 390, 844, 390 / 800, 844 / 900, 3);
    const extra = grown.slice(birds.length);

    expect(extra).toHaveLength(1);
    for (const bird of extra) {
      const rect = safeFlightRect(bird.length, 390, 844);
      expect(bird.x).toBeGreaterThanOrEqual(rect.x - 1e-9);
      expect(bird.x).toBeLessThanOrEqual(rect.x + rect.width + 1e-9);
      expect(bird.y).toBeGreaterThanOrEqual(rect.y - 1e-9);
      expect(bird.y).toBeLessThanOrEqual(rect.y + rect.height + 1e-9);
      expect(Number.isFinite(bird.targetU + bird.targetV + bird.zoneSeed)).toBe(true);
    }
  });
});

describe('settleLevel', () => {
  it('leaves a horizontal still frame instead of a diagonal', () => {
    for (const [width, height] of [
      [1440, 792],
      [800, 900],
      [390, 552],
    ] as const) {
      const birds = layoutHeroBirds(width, height, 1).birds.map((box) => box.bird);

      settleLevel(birds, width, height, 4);

      for (const bird of birds) {
        expect(Number.isFinite(bird.x + bird.y + bird.heading)).toBe(true);
        expect(Math.abs(Math.cos(bird.heading))).toBeGreaterThan(0.9);
      }
    }
  });

  it('is deterministic', () => {
    const a = layoutHeroBirds(1440, 792, 1).birds.map((box) => box.bird);
    const b = layoutHeroBirds(1440, 792, 1).birds.map((box) => box.bird);

    settleLevel(a, 1440, 792, 4);
    settleLevel(b, 1440, 792, 4);

    expect(a).toEqual(b);
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

  it('blurs as soon as a single cell sits over content', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.4 });
    const frame = birdFrame(bird, 1);
    const { ctx } = fakeContext();
    const cell = frame.cellWidth;
    const oneCell = {
      x: bird.x - cell / 2,
      y: bird.y - cell / 2,
      width: cell,
      height: cell,
      weight: 1,
    };

    const stats = paintBirdFrame(ctx, frame, [oneCell]);
    const overlap = stats.covered / stats.cells;

    expect(stats.covered).toBeGreaterThan(0);
    expect(overlap).toBeLessThan(0.08);
    // A graze this light used to quantize to none; the target floor now keeps
    // it visible even through the plain quantizer.
    const px = quantizeBlur(blurTarget(overlap, 3));
    expect(px).toBeGreaterThan(0);
    expect(px).toBeGreaterThanOrEqual(MIN_BLUR);
  });

  it('separates blur coverage from contrast coverage', () => {
    const bird = makeBird({ x: 300, y: 200, heading: 0.4 });
    const frame = birdFrame(bird, 1);
    const { ctx } = fakeContext();
    const bounds = birdBounds(bird);
    const area = {
      x: bounds.x - frame.cellWidth,
      y: bounds.y - frame.cellWidth,
      width: bounds.width + frame.cellWidth * 2,
      height: bounds.height + frame.cellWidth * 2,
    };

    const card = paintBirdFrame(ctx, frame, [{ ...area, weight: 1, contrast: false }]);
    const text = paintBirdFrame(ctx, frame, [{ ...area, weight: 1, contrast: true }]);

    // An opaque card blurs the bird but does not need to fade it.
    expect(card.covered).toBe(card.cells);
    expect(card.coveredText).toBe(0);
    // Text needs both.
    expect(text.covered).toBe(text.cells);
    expect(text.coveredText).toBe(text.cells);
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
