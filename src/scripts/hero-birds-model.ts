/**
 * Pure procedural model for the monk parakeet ("cotorra argentina") hero.
 *
 * Top-down silhouette in local units of `bird.length`: rounded grey head and
 * grey chest, short hooked orange beak, dark eye, broad green wings with three
 * separated primary tips, green body, and a very long tapered tail split into
 * two rectrices. No crest, no DOM, no canvas.
 *
 * Shade convention: 0 is dark and samples the densest glyph, 1 is lit and
 * samples the sparsest one. The ramps are the documented ASCII sets below.
 */

export type BirdPart = 'body' | 'wing' | 'chest' | 'tail' | 'beak' | 'eye' | 'edge';

export interface Bird {
  id: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  phase: number;
  flapRate: number;
  length: number;
  depth: number;
  seed: number;
  /** Instantaneous wing bank in -1..1; 0 keeps both wings symmetric. */
  flap: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ShapeSample {
  part: BirdPart;
  shade: number;
}

/** Dense → sparse. */
export const PART_RAMPS: Record<BirdPart, string> = {
  body: '@#%*x+=:-. ',
  wing: '@#%*x+=;:. ',
  chest: '@#*+=-:. ',
  tail: '@#%*+=-:. ',
  beak: '@#*+=:. ',
  eye: '@Oo',
  edge: '#*+=;:,.`',
};

const TAU = Math.PI * 2;
const STEPS_PER_SECOND = 60;

// Local outline constants, in units of bird.length.
const BEAK_BASE = 0.315;
const BEAK_TIP = 0.45;
const TAIL_BASE = -0.2;
const TAIL_TIP = -0.9;
const TAIL_SPLIT = -0.34;
const WING_SPAN = 0.5;
const RIM = 0.012;

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function angleDiff(from: number, to: number): number {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** Deterministic mulberry32 generator. */
export function createRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One bird below 720 px, two below 960 px, three above. */
export function resolveBirdCount(viewportWidth: number): 1 | 2 | 3 {
  if (viewportWidth < 720) return 1;
  if (viewportWidth < 960) return 2;
  return 3;
}

/** Base body length for the current frame; shared by spawn and resize. */
function lengthFor(width: number, height: number, depth: number): number {
  const minSide = Math.min(width, height) || 720;
  const base = clamp(minSide * 0.17, 54, 112);
  return base * (0.62 + 0.38 * clamp(depth, 0, 1));
}

export function createFlock(count: number, width: number, height: number, seed = 1): Bird[] {
  const total = Math.max(0, Math.floor(count));
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const rng = createRng(seed);
  const birds: Bird[] = [];

  for (let i = 0; i < total; i += 1) {
    const depth = 0.45 + rng() * 0.55;
    const length = lengthFor(w, h, depth);
    const marginX = Math.min(w / 2, length * 0.9);
    const marginY = Math.min(h / 2, length * 0.9);

    birds.push({
      id: i + 1,
      x: marginX + rng() * Math.max(0, w - marginX * 2),
      y: marginY + rng() * Math.max(0, h - marginY * 2),
      heading: rng() * TAU,
      speed: 24 + rng() * 30,
      phase: rng() * TAU,
      flapRate: 1.4 + rng() * 0.6,
      length,
      depth,
      seed: rng(),
      flap: 0,
    });
  }

  return birds;
}

/** Soft push back toward the interior; 0 while inside the margin. */
function boundaryPush(value: number, margin: number, size: number): number {
  if (margin <= 0) return 0;
  if (value < margin) return (1 - clamp(value / margin, 0, 1)) * 1.6;
  if (value > size - margin) return -(1 - clamp((size - value) / margin, 0, 1)) * 1.6;
  return 0;
}

/**
 * Advance flight one step. Heading stays continuous and turns back from the
 * frame edges (no wrap), the wing phase runs independently per bird, and the
 * glide envelope rides on top of it so the stroke is not a perfect sine.
 */
export function stepFlock(birds: Bird[], dt: number, width: number, height: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;

  const step = Math.min(dt, 0.1);
  const w = Math.max(0, width);
  const h = Math.max(0, height);

  for (const bird of birds) {
    const length = bird.length > 0 ? bird.length : 1;

    bird.phase += TAU * bird.flapRate * step;
    const glide = 0.5 + 0.5 * Math.sin(bird.phase * 0.113 + bird.seed * TAU);
    bird.flap = Math.sin(bird.phase) * (0.35 + 0.65 * glide);

    const wander =
      Math.sin(bird.phase * 0.21 + bird.seed * TAU) * 0.35 +
      Math.sin(bird.phase * 0.07 + bird.id) * 0.2;

    let dirX = Math.cos(bird.heading) + Math.cos(bird.heading + wander) * 0.18;
    let dirY = Math.sin(bird.heading) + Math.sin(bird.heading + wander) * 0.18;

    const margin = Math.max(length * 0.6, 24);
    const marginX = Math.min(margin, w * 0.3);
    const marginY = Math.min(margin, h * 0.3);
    dirX += boundaryPush(bird.x, marginX, w);
    dirY += boundaryPush(bird.y, marginY, h);

    if (Math.hypot(dirX, dirY) > 1e-6) {
      const desired = Math.atan2(dirY, dirX);
      bird.heading += clamp(angleDiff(bird.heading, desired), -1.8 * step, 1.8 * step);
    }

    const cruise = 26 + 24 * clamp(bird.depth, 0, 1);
    bird.speed += (cruise - bird.speed) * Math.min(1, step * 0.9);

    bird.x = clamp(bird.x + Math.cos(bird.heading) * bird.speed * step, 0, w);
    bird.y = clamp(bird.y + Math.sin(bird.heading) * bird.speed * step, 0, h);
  }
}

/**
 * Resize the flock to `count` birds. Surviving ids are preserved and their
 * positions clamp into the new frame; extra birds come from a seeded spawn.
 */
export function resizeFlock(birds: Bird[], count: number, width: number, height: number): Bird[] {
  const target = Math.max(0, Math.floor(count));
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const kept = birds.slice(0, target);

  for (const bird of kept) {
    bird.x = clamp(bird.x, 0, w);
    bird.y = clamp(bird.y, 0, h);
    bird.length = lengthFor(w, h, bird.depth);
  }

  if (kept.length >= target) return kept;

  const extra = createFlock(target - kept.length, w, h, 0x5eed + target * 131);
  let nextId = kept.reduce((max, bird) => Math.max(max, bird.id), 0) + 1;
  for (const bird of extra) {
    bird.id = nextId;
    nextId += 1;
    kept.push(bird);
  }

  return kept;
}

/** Advance a fixed number of 60 Hz steps with no RAF, for reduced motion. */
export function settleFlock(birds: Bird[], width: number, height: number, seconds: number): void {
  let steps = 0;
  if (Number.isFinite(seconds)) {
    steps = clamp(Math.round(seconds * STEPS_PER_SECOND), 0, 600);
  } else if (seconds === Number.POSITIVE_INFINITY) {
    steps = 600;
  }
  for (let i = 0; i < steps; i += 1) stepFlock(birds, 1 / STEPS_PER_SECOND, width, height);
}

/** Local-space extents of the silhouette, in units of `bird.length`. */
export const BIRD_LOCAL_BOUNDS = {
  uMin: TAIL_TIP - 0.02,
  uMax: BEAK_TIP + 0.01,
  vHalf: WING_SPAN * 1.18 + 0.02,
} as const;

/** World-space box that contains the whole bird, wings and tail included. */
export function birdBounds(bird: Bird): Rect {
  const cos = Math.cos(bird.heading);
  const sin = Math.sin(bird.heading);
  const length = bird.length > 0 ? bird.length : 1;
  const uMin = BIRD_LOCAL_BOUNDS.uMin * length;
  const uMax = BIRD_LOCAL_BOUNDS.uMax * length;
  const vMax = BIRD_LOCAL_BOUNDS.vHalf * length;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const u of [uMin, uMax]) {
    for (const v of [-vMax, vMax]) {
      const x = bird.x + u * cos - v * sin;
      const y = bird.y + u * sin + v * cos;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Shift the bird so its whole AABB stays inside the layer with `margin`. */
export function clampBirdInside(bird: Bird, width: number, height: number, margin: number): void {
  const m = Number.isFinite(margin) ? Math.max(0, margin) : 0;
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const frame = birdBounds(bird);
  const left = frame.x - bird.x;
  const right = frame.x + frame.width - bird.x;
  const top = frame.y - bird.y;
  const bottom = frame.y + frame.height - bird.y;

  bird.x = clamp(bird.x, m - left, Math.max(m - left, w - right - m));
  bird.y = clamp(bird.y, m - top, Math.max(m - top, h - bottom - m));
}


/** Area of the union of the rectangles, with xs already clipped. */
function unionArea(rects: Rect[]): number {
  if (rects.length === 0) return 0;

  const xs: number[] = [];
  for (const rect of rects) {
    xs.push(rect.x, rect.x + rect.width);
  }
  xs.sort((a, b) => a - b);

  let covered = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const width = x1 - x0;
    if (!(width > 0)) continue;

    const middle = (x0 + x1) / 2;
    const spans: Array<[number, number]> = [];
    for (const rect of rects) {
      if (rect.x <= middle && rect.x + rect.width >= middle) {
        spans.push([rect.y, rect.y + rect.height]);
      }
    }
    if (spans.length === 0) continue;

    spans.sort((a, b) => a[0] - b[0]);
    let top = spans[0][1];
    let height = top - spans[0][0];
    for (let s = 1; s < spans.length; s += 1) {
      const [start, end] = spans[s];
      if (start > top) {
        height += end - start;
        top = end;
      } else if (end > top) {
        height += end - top;
        top = end;
      }
    }
    covered += width * height;
  }

  return covered;
}

/** Fraction of `bounds` covered by the union of obstacles, clamped to 0..1. */
export function overlapRatio(bounds: Rect, obstacles: Rect[]): number {
  const area = bounds.width * bounds.height;
  if (!(area > 0)) return 0;

  const clipped: Rect[] = [];
  for (const obstacle of obstacles) {
    const x = Math.max(bounds.x, obstacle.x);
    const y = Math.max(bounds.y, obstacle.y);
    const right = Math.min(bounds.x + bounds.width, obstacle.x + obstacle.width);
    const bottom = Math.min(bounds.y + bounds.height, obstacle.y + obstacle.height);
    if (right > x && bottom > y) clipped.push({ x, y, width: right - x, height: bottom - y });
  }

  return clamp(unionArea(clipped) / area, 0, 1);
}

/**
 * Blur budget for a bird: a deadband ignores light grazes so the bird stays
 * sharp in the gaps, then a smooth ramp reaches `maxBlur` on real text.
 */
export function blurTarget(overlap: number, maxBlur: number, deadband = 0.15): number {
  if (!(maxBlur > 0)) return 0;

  const dead = clamp(Number.isFinite(deadband) ? deadband : 0, 0, 1);
  if (dead >= 1) return 0;

  const t = clamp((clamp(overlap, 0, 1) - dead) / (1 - dead), 0, 1);
  return clamp(t * t * (3 - 2 * t) * maxBlur, 0, maxBlur);
}

/** Exponential approach that never overshoots the target. */
export function approach(current: number, target: number, dt: number, rate: number): number {
  if (!(dt > 0) || !(rate > 0)) return current;
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

function insideEllipse(
  nu: number,
  nv: number,
  cu: number,
  cv: number,
  rx: number,
  ry: number,
  rim: number,
): boolean {
  const ex = rx - rim;
  const ey = ry - rim;
  if (ex <= 0 || ey <= 0) return false;
  const a = (nu - cu) / ex;
  const b = (nv - cv) / ey;
  return a * a + b * b <= 1;
}

/** Silhouette test in local units. `rim` shrinks every primitive inward. */
function hitPart(nu: number, nv: number, rim: number, flap: number): BirdPart | null {
  if (nu >= BEAK_BASE + rim && nu <= BEAK_TIP - rim) {
    const t = (nu - BEAK_BASE) / (BEAK_TIP - BEAK_BASE);
    const half = 0.06 * (1 - t) + 0.008 - rim;
    if (half > 0 && Math.abs(nv) <= half) return 'beak';
  }

  const eyeRadius = 0.021 - rim;
  if (eyeRadius > 0) {
    for (let side = 0; side < 2; side += 1) {
      const du = nu - 0.295;
      const dv = nv - (side === 0 ? 0.042 : -0.042);
      if (du * du + dv * dv <= eyeRadius * eyeRadius) return 'eye';
    }
  }

  // Round grey head overlapping the body, so the union pinches at the neck
  // instead of reading as one rectangular grey block.
  if (insideEllipse(nu, nv, 0.255, 0, 0.095, 0.092, rim)) return 'chest';
  if (insideEllipse(nu, nv, -0.03, 0, 0.23, 0.105, rim)) {
    return nu > 0.05 ? 'chest' : 'body';
  }

  const side = nv >= 0 ? 1 : -1;
  const span = WING_SPAN * (1 + side * 0.18 * flap);
  const lateral = Math.abs(nv);
  if (lateral <= span - rim) {
    const t = lateral / span;
    const lead = 0.18 - 0.12 * t - 0.02 * t * t;
    const chord = 0.36 - 0.18 * Math.pow(t, 1.2);
    if (nu <= lead - rim && nu >= lead - chord + rim) {
      // The outer trailing edge splits into three primary tips. The notches
      // stop before the leading edge so the wing stays one connected shape.
      if (t > 0.58) {
        const finger = ((t - 0.58) / 0.42) * 3;
        if (finger % 1 < 0.5 && nu < lead - chord * 0.7) return null;
      }
      return 'wing';
    }
  }

  if (nu <= TAIL_BASE && nu >= TAIL_TIP + rim) {
    const t = clamp((TAIL_BASE - nu) / (TAIL_BASE - TAIL_TIP), 0, 1);
    const half = 0.12 + (0.1 - 0.12) * t - rim;
    if (half > 0 && Math.abs(nv) <= half) {
      // Two rectrices from the split point to the tip.
      if (nu < TAIL_SPLIT) {
        const gap = 0.016 + 0.01 * t;
        if (Math.abs(nv) < gap) return null;
      }
      return 'tail';
    }
  }

  return null;
}

function shadeFor(part: BirdPart, nu: number, nv: number, bird: Bird): number {
  const offset = bird.seed * TAU;
  let shade: number;

  switch (part) {
    case 'body':
      shade = 0.58 + 0.16 * Math.sin(nu * 11 + nv * 4 + offset);
      break;
    case 'chest':
      shade = 0.38 + 0.12 * Math.sin(nv * 26 + nu * 7 + offset);
      break;
    case 'wing':
      shade = 0.62 + 0.2 * Math.sin(Math.abs(nv) * 17 + nu * 6 + offset);
      break;
    case 'tail':
      shade = 0.55 + 0.15 * Math.sin(nu * 19 + offset);
      break;
    case 'beak':
      shade = 0.82 + 0.07 * Math.sin(offset);
      break;
    case 'eye':
      shade = 0.08;
      break;
    default:
      shade = 0.45;
  }

  return clamp(shade * (0.82 + 0.18 * clamp(bird.depth, 0, 1)), 0, 1);
}

/**
 * Sample the bird in world space. Returns null outside the silhouette; the
 * outer rim of every primitive is reported as `edge` for anti-aliased glyphs.
 */
export function sampleBird(bird: Bird, worldX: number, worldY: number): ShapeSample | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;

  const length = bird.length > 0 ? bird.length : 1;
  const dx = (worldX - bird.x) / length;
  const dy = (worldY - bird.y) / length;
  const cos = Math.cos(bird.heading);
  const sin = Math.sin(bird.heading);
  const nu = dx * cos + dy * sin;
  const nv = -dx * sin + dy * cos;
  const flap = clamp(bird.flap, -1, 1);

  const part = hitPart(nu, nv, 0, flap);
  if (!part) return null;

  if (part !== 'eye' && hitPart(nu, nv, RIM, flap) === null) {
    return { part: 'edge', shade: shadeFor('edge', nu, nv, bird) };
  }

  return { part, shade: shadeFor(part, nu, nv, bird) };
}

/** Pick one glyph from the part ramp; shade 0 is dense, 1 is sparse. */
export function glyphForShade(shade: number, part: BirdPart): string {
  const ramp = PART_RAMPS[part] ?? PART_RAMPS.body;
  const value = Number.isFinite(shade) ? clamp(shade, 0, 1) : 0;
  const index = clamp(Math.round(value * (ramp.length - 1)), 0, ramp.length - 1);
  return ramp[index];
}
