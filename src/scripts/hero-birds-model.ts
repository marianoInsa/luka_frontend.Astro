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
  /** Current waypoint, as fractions of the centre-safe flight rectangle. */
  targetU: number;
  targetV: number;
  /** Zone of the current waypoint, 0..8. */
  zone: number;
  /** Stable seed for the zone tour and waypoint jitter. */
  zoneSeed: number;
  /** Waypoints selected so far; drives the zone tour. */
  leg: number;
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

/** Hard cap on the heading rate, shared by every waypoint turn. */
export const TURN_RATE = 1.8;
/** The flight rectangle is split into 3×3 zones for stratified waypoints. */
const ZONE_SIDE = 3;
const ZONE_COUNT = ZONE_SIDE * ZONE_SIDE;
/** Extra room between the safe rect and the canvas edge. */
const FLIGHT_PAD = 2;
/** Keep random waypoints off the exact safe-rect border. */
const TARGET_INSET = 4;
/** Arrival radius floor, even for a very slow bird. */
const ARRIVAL_MIN = 6;
/** Arrival radius in turn radii; below 2 the bird can orbit a waypoint. */
const ARRIVAL_TURNS = 2;
/** Waypoint legs shorter than this would leave the bird hovering. */
const MIN_LEG_SHARE = 0.25;
const MAX_LEG_SHARE = 0.8;
/** Cruise speed per depth, scaled down on narrow stages. */
const CRUISE_BASE = 26;
const CRUISE_DEPTH = 24;
const CRUISE_REFERENCE = 1200;
const CRUISE_MIN_SCALE = 0.85;
const CRUISE_MAX_SCALE = 1.15;

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

/** Cruising speed in px/s: depth adds pace, narrow stages cruise slower. */
export function cruiseSpeed(depth: number, width: number): number {
  const scale = clamp(width / CRUISE_REFERENCE, CRUISE_MIN_SCALE, CRUISE_MAX_SCALE);
  return (CRUISE_BASE + CRUISE_DEPTH * clamp(depth, 0, 1)) * scale;
}

/**
 * Radius of the smallest circle around the bird centre that contains the whole
 * rotated silhouette. A centre inside `[R, width-R] × [R, height-R]` cannot
 * clip at any heading.
 */
export function birdReach(length: number): number {
  const size = Number.isFinite(length) && length > 0 ? length : 1;
  const longitudinal = Math.max(-BIRD_LOCAL_BOUNDS.uMin, BIRD_LOCAL_BOUNDS.uMax);
  return Math.hypot(longitudinal, BIRD_LOCAL_BOUNDS.vHalf) * size;
}

/** Centre-safe flight rectangle for one bird at its current length. */
export function safeFlightRect(length: number, width: number, height: number): Rect {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const reach = birdReach(length) + FLIGHT_PAD;
  const innerWidth = Math.max(0, w - 2 * reach);
  const innerHeight = Math.max(0, h - 2 * reach);

  return {
    x: (w - innerWidth) / 2,
    y: (h - innerHeight) / 2,
    width: innerWidth,
    height: innerHeight,
  };
}

/** Radar that catches a waypoint without orbiting it: at least two turn radii. */
export function arrivalRadius(speed: number): number {
  const velocity = Number.isFinite(speed) ? Math.max(0, speed) : 0;
  return Math.max(ARRIVAL_MIN, (ARRIVAL_TURNS * velocity) / TURN_RATE);
}

function normalizeHeading(heading: number): number {
  if (!Number.isFinite(heading)) return 0;
  let angle = heading % TAU;
  if (angle > Math.PI) angle -= TAU;
  if (angle <= -Math.PI) angle += TAU;
  return angle;
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

    birds.push({
      id: i + 1,
      x: 0,
      y: 0,
      heading: 0,
      speed: 24 + rng() * 30,
      phase: rng() * TAU,
      flapRate: 1.4 + rng() * 0.6,
      length,
      depth,
      seed: rng(),
      flap: 0,
      targetU: 0.5,
      targetV: 0.5,
      zone: -1,
      zoneSeed: 1,
      leg: 0,
    });
  }

  seedFlight(birds, w, h, seed);

  return birds;
}

/** Stable 0..8 permutation for one zone cycle. */
function zonePermutation(seed: number, cycle: number): number[] {
  const rng = createRng((seed ^ Math.imul(cycle + 1, 0x9e3779b1)) >>> 0);
  const zones = Array.from({ length: ZONE_COUNT }, (_, index) => index);
  for (let index = zones.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const value = zones[index];
    zones[index] = zones[swap];
    zones[swap] = value;
  }
  return zones;
}

function zoneAt(seed: number, leg: number): number {
  const safeLeg = Number.isFinite(leg) && leg >= 0 ? Math.floor(leg) : 0;
  const cycle = Math.floor(safeLeg / ZONE_COUNT);
  return zonePermutation(seed, cycle)[safeLeg % ZONE_COUNT];
}

function chooseZone(bird: Bird, leg: number): number {
  const seed = Number.isFinite(bird.zoneSeed) ? bird.zoneSeed >>> 0 : 1;
  const zone = zoneAt(seed, leg);
  if (zone !== bird.zone || ZONE_COUNT < 2) return zone;

  const cycle = Math.floor(leg / ZONE_COUNT);
  const index = leg % ZONE_COUNT;
  return zonePermutation(seed, cycle)[(index + 1) % ZONE_COUNT];
}

/** Random point inside one zone, avoiding a leg shorter than `minLeg`. */
function pointInZone(
  zone: number,
  rect: Rect,
  avoidX: number,
  avoidY: number,
  minLeg: number,
  rng: () => number,
): { x: number; y: number } {
  const column = zone % ZONE_SIDE;
  const row = Math.floor(zone / ZONE_SIDE);
  const zoneWidth = rect.width / ZONE_SIDE;
  const zoneHeight = rect.height / ZONE_SIDE;

  if (!(zoneWidth > 0) || !(zoneHeight > 0)) {
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }

  const inset = Math.min(TARGET_INSET, zoneWidth * 0.2, zoneHeight * 0.2);
  const left = rect.x + column * zoneWidth + inset;
  const top = rect.y + row * zoneHeight + inset;
  const right = rect.x + (column + 1) * zoneWidth - inset;
  const bottom = rect.y + (row + 1) * zoneHeight - inset;
  let best = { x: left, y: top };
  let bestDistance = -1;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const x = left + rng() * Math.max(0, right - left);
    const y = top + rng() * Math.max(0, bottom - top);
    const distance = Math.hypot(x - avoidX, y - avoidY);
    if (distance > bestDistance) {
      best = { x, y };
      bestDistance = distance;
    }
    if (distance >= minLeg) return { x, y };
  }

  for (const x of [left, right]) {
    for (const y of [top, bottom]) {
      const distance = Math.hypot(x - avoidX, y - avoidY);
      if (distance > bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }

  return best;
}

function targetPoint(bird: Bird, rect: Rect): { x: number; y: number } {
  return {
    x: rect.x + clamp(bird.targetU, 0, 1) * rect.width,
    y: rect.y + clamp(bird.targetV, 0, 1) * rect.height,
  };
}

function ensureFlightState(bird: Bird): void {
  if (!Number.isFinite(bird.targetU)) bird.targetU = 0.5;
  if (!Number.isFinite(bird.targetV)) bird.targetV = 0.5;
  if (!Number.isFinite(bird.zoneSeed)) {
    const seed = Math.floor((Number.isFinite(bird.seed) ? bird.seed : 0.5) * 0xffffffff);
    bird.zoneSeed = ((seed ^ Math.imul(bird.id || 1, 0x9e3779b1)) >>> 0) || 1;
  }
  if (!Number.isFinite(bird.zone)) bird.zone = -1;
  if (!Number.isFinite(bird.leg) || bird.leg < 0) bird.leg = 0;
}

/** Arrival radius, widened for a waypoint that sits close to an edge. */
function arrivalFor(bird: Bird, rect: Rect, target: { x: number; y: number }): number {
  const base = arrivalRadius(bird.speed);
  const turnRadius = bird.speed / TURN_RATE;
  const guard = 2 * turnRadius + 8;
  const edge = Math.min(
    target.x - rect.x,
    rect.x + rect.width - target.x,
    target.y - rect.y,
    rect.y + rect.height - target.y,
  );
  return Math.max(base, guard - Math.max(0, Math.min(edge, guard)));
}

function chooseWaypoint(bird: Bird, rect: Rect): void {
  const diagonal = Math.hypot(rect.width, rect.height);
  const leg = (Number.isFinite(bird.leg) ? Math.max(0, Math.floor(bird.leg)) : 0) + 1;
  bird.leg = leg;

  if (!(diagonal > 1e-6)) {
    bird.zone = chooseZone(bird, leg);
    bird.targetU = 0.5;
    bird.targetV = 0.5;
    return;
  }

  const zone = chooseZone(bird, leg);
  bird.zone = zone;
  const minLeg = Math.min(
    MAX_LEG_SHARE * diagonal,
    Math.max(arrivalRadius(bird.speed), MIN_LEG_SHARE * diagonal),
  );
  const rng = createRng((bird.zoneSeed ^ Math.imul(leg, 0x85ebca6b)) >>> 0);
  const point = pointInZone(zone, rect, bird.x, bird.y, minLeg, rng);
  bird.targetU = clamp((point.x - rect.x) / rect.width, 0, 1);
  bird.targetV = clamp((point.y - rect.y) / rect.height, 0, 1);
}

/**
 * Spawn the flock in distinct 3×3 zones and give every bird its first 2D
 * waypoint. Positions, zones and headings are deterministic from `seed`.
 */
export function seedFlight(birds: Bird[], width: number, height: number, seed = 1): void {
  const w = Number.isFinite(width) ? Math.max(0, width) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const fleetSeed = (seed >>> 0) || 1;
  const spawnOrder = zonePermutation(fleetSeed, 0);

  birds.forEach((bird, index) => {
    const length = bird.length > 0 ? bird.length : 1;
    const rect = safeFlightRect(length, w, h);
    bird.zoneSeed =
      ((fleetSeed ^ Math.imul(bird.id || index + 1, 0x9e3779b1)) >>> 0) || 1;
    bird.leg = 0;
    const spawnZone = spawnOrder[index % ZONE_COUNT];
    const rng = createRng((bird.zoneSeed ^ 0x51ed270b) >>> 0);
    const spawn = pointInZone(spawnZone, rect, rect.x - 1, rect.y - 1, 0, rng);
    bird.x = spawn.x;
    bird.y = spawn.y;
    bird.zone = spawnZone;
    chooseWaypoint(bird, rect);

    const target = targetPoint(bird, rect);
    const dx = target.x - bird.x;
    const dy = target.y - bird.y;
    bird.heading = Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dy, dx) : 0;
  });
}

/**
 * Advance flight one step. Each bird steers toward its waypoint, turns at the
 * shared rate cap and picks a new stratified destination on arrival. The centre
 * stays inside `safeFlightRect`, so the rotated silhouette cannot leave the
 * layer; the full-box clamp remains a safety net that should never correct.
 */
export function stepFlock(birds: Bird[], dt: number, width: number, height: number): void {
  if (!(dt > 0) || !Number.isFinite(dt)) return;

  const step = Math.min(dt, 0.1);
  const w = Math.max(0, width);
  const h = Math.max(0, height);

  for (const bird of birds) {
    ensureFlightState(bird);
    if (!Number.isFinite(bird.speed) || bird.speed < 0) bird.speed = 0;

    const length = bird.length > 0 ? bird.length : 1;
    bird.phase += TAU * bird.flapRate * step;
    const glide = 0.5 + 0.5 * Math.sin(bird.phase * 0.113 + bird.seed * TAU);
    bird.flap = Math.sin(bird.phase) * (0.35 + 0.65 * glide);

    const cruise = cruiseSpeed(bird.depth, w);
    bird.speed += (cruise - bird.speed) * Math.min(1, step * 0.9);

    const rect = safeFlightRect(length, w, h);
    let target = targetPoint(bird, rect);
    let dx = target.x - bird.x;
    let dy = target.y - bird.y;
    let distance = Math.hypot(dx, dy);
    let arrival = arrivalFor(bird, rect, target);

    const canSteer = rect.width > 1e-6 || rect.height > 1e-6;
    if (canSteer && !(distance > arrival)) {
      chooseWaypoint(bird, rect);
      target = targetPoint(bird, rect);
      dx = target.x - bird.x;
      dy = target.y - bird.y;
      distance = Math.hypot(dx, dy);
      arrival = arrivalFor(bird, rect, target);
    }

    // Boundary guard: close to an edge and heading outward, aim at the centre
    // for a moment instead of letting the envelope stop the body. The enlarged
    // arrival radius already turns the bird before a waypoint on the border.
    let aimX = target.x;
    let aimY = target.y;
    if (distance > arrival) {
      const turnRadius = bird.speed / TURN_RATE;
      const guard = 2 * turnRadius + 8;
      const escapeLeft = bird.x - rect.x < guard && Math.cos(bird.heading) < -0.05;
      const escapeRight = rect.x + rect.width - bird.x < guard && Math.cos(bird.heading) > 0.05;
      const escapeTop = bird.y - rect.y < guard && Math.sin(bird.heading) < -0.05;
      const escapeBottom = rect.y + rect.height - bird.y < guard && Math.sin(bird.heading) > 0.05;

      if (escapeLeft || escapeRight || escapeTop || escapeBottom) {
        aimX = rect.x + rect.width / 2;
        aimY = rect.y + rect.height / 2;
      }
    }

    const desired = distance > 1e-9 ? Math.atan2(aimY - bird.y, aimX - bird.x) : bird.heading;
    const delta = angleDiff(bird.heading, desired);
    bird.heading = normalizeHeading(
      bird.heading + clamp(delta, -TURN_RATE * step, TURN_RATE * step),
    );

    // Hard flight envelope: keep the centre in the safe rect. The silhouette
    // clamp still runs after the step, but this envelope means it never fires.
    const nextX = bird.x + Math.cos(bird.heading) * bird.speed * step;
    const nextY = bird.y + Math.sin(bird.heading) * bird.speed * step;
    bird.x = clamp(nextX, rect.x, rect.x + rect.width);
    bird.y = clamp(nextY, rect.y, rect.y + rect.height);
  }
}

/**
 * Resize the flock to `count` birds. Surviving ids are preserved and their
 * positions clamp into the new centre-safe rect; extra birds come from a seeded
 * spawn. Waypoint fractions are kept, so a resize reprojects the destination.
 */
export function resizeFlock(
  birds: Bird[],
  count: number,
  width: number,
  height: number,
  seed = 0x5eed,
): Bird[] {
  const target = Math.max(0, Math.floor(count));
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const kept = birds.slice(0, target);

  for (const bird of kept) {
    ensureFlightState(bird);
    bird.length = lengthFor(w, h, bird.depth);
    const rect = safeFlightRect(bird.length, w, h);
    bird.x = clamp(bird.x, rect.x, rect.x + rect.width);
    bird.y = clamp(bird.y, rect.y, rect.y + rect.height);
  }

  if (kept.length >= target) return kept;

  const extra = createFlock(target - kept.length, w, h, seed + target * 131);
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
 * Blur budget for a bird: any covered cell yields at least `minBlur`, so a
 * bird that grazes a component is never sharp behind it. The ramp still
 * reaches `maxBlur` as the content covers more of the silhouette.
 */
export const MIN_BLUR = 0.5;

export function blurTarget(overlap: number, maxBlur: number, minBlur = MIN_BLUR): number {
  if (!(maxBlur > 0) || !(overlap > 0)) return 0;

  const floor = clamp(Number.isFinite(minBlur) ? minBlur : MIN_BLUR, 0, maxBlur);
  const t = clamp(overlap, 0, 1);
  const ramp = t * t * (3 - 2 * t) * maxBlur;

  return clamp(Math.max(floor, ramp), 0, maxBlur);
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
