/**
 * Animated ASCII flock for the landing Hero.
 *
 * Each bird owns a transparent canvas rasterized in its own local space
 * (heading 0). The canvas is rotated with CSS around the bird center, so one
 * tight box works for every heading and the raster never clips the tail, the
 * head or the wing tips. Glyph cells stay on an integer grid in local space.
 *
 * The flight loop runs on a fixed 1/60 s step (max 4 substeps, dt clamped to
 * 0.1 s) so motion is frame-rate independent and a resumed tab never jumps.
 * Every bird is repainted on every frame; the transform is updated with the
 * subpixel position and heading. Blur is applied only to the canvas of a bird
 * that overlaps Hero content; its opacity fades with the raw overlap, so text
 * keeps WCAG AA contrast even when the deadband leaves the raster sharp.
 *
 * The silhouette comes from `hero-birds-model`: green body/wings/tail, gray
 * head and chest, short hooked orange beak, no crest, very long tapered tail.
 */

import {
  BIRD_LOCAL_BOUNDS,
  approach,
  blurTarget,
  clampBirdInside,
  createFlock,
  glyphForShade,
  resizeFlock,
  resolveBirdCount,
  sampleBird,
  settleFlock,
  stepFlock,
  type Bird,
  type BirdPart,
  type Rect,
} from './hero-birds-model';

export interface HeroBirdsController {
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface Clock {
  last: number | null;
  accumulator: number;
}

/** Minimal 2D context surface, so tests can paint with a fake recorder. */
export interface BirdContext {
  fillStyle: unknown;
  font: string;
  textAlign: string;
  textBaseline: string;
  clearRect(x: number, y: number, width: number, height: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  fillRect(x: number, y: number, width: number, height: number): void;
  fillText(text: string, x: number, y: number): void;
}

export interface BirdHandle {
  canvas: HTMLCanvasElement;
  ctx: BirdContext;
}

/** Conditions that pause the loop. */
export interface SchedulerFlags {
  userPaused: boolean;
  hidden: boolean;
  inView: boolean;
  reduced: boolean;
}

export interface SchedulerDeps {
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
  /** Advance one frame; the scheduler reschedules around it. */
  step(time: number): void;
  /** Called when the loop starts, so the clock can drop stale time. */
  reset(): void;
}

export interface Scheduler {
  flags: SchedulerFlags;
  /** Start or stop the loop to match the flags; returns whether it runs. */
  sync(): boolean;
  running(): boolean;
  destroy(): void;
}

export interface ControllerRegistry<T extends { destroy(): void }> {
  current: T | null;
  install(next: T): void;
  release(item: T): void;
}

/** The loop only runs when nothing is pausing it. */
export function canAnimate(flags: SchedulerFlags): boolean {
  return !flags.userPaused && !flags.hidden && flags.inView && !flags.reduced;
}

/**
 * Reduced motion settles the flock once, but never over a frame the visitor
 * paused on purpose: the last frame stays exactly as it was.
 */
export function shouldSettle(flags: SchedulerFlags): boolean {
  return flags.reduced && !flags.userPaused;
}

/**
 * Single RAF loop driven by flags. `sync()` is idempotent, so repeated
 * observers, media changes or button clicks can never start a second loop.
 */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const flags: SchedulerFlags = {
    userPaused: false,
    hidden: false,
    inView: true,
    reduced: false,
  };
  let frameId: number | null = null;
  let dead = false;

  function frame(time: number): void {
    frameId = null;
    if (dead || !canAnimate(flags)) return;

    deps.step(time);
    if (!dead && canAnimate(flags) && frameId === null) frameId = deps.request(frame);
  }

  function sync(): boolean {
    if (dead) return false;

    const run = canAnimate(flags);
    if (run) {
      if (frameId === null) {
        deps.reset();
        frameId = deps.request(frame);
      }
    } else if (frameId !== null) {
      deps.cancel(frameId);
      frameId = null;
    }

    return run;
  }

  function destroy(): void {
    dead = true;
    if (frameId !== null) {
      deps.cancel(frameId);
      frameId = null;
    }
  }

  return { flags, sync, running: () => frameId !== null, destroy };
}

/** Module-level guard: installing a controller destroys the previous one. */
export function createControllerRegistry<
  T extends { destroy(): void },
>(): ControllerRegistry<T> {
  let current: T | null = null;

  return {
    get current(): T | null {
      return current;
    },
    install(next: T): void {
      if (current) current.destroy();
      current = next;
    },
    release(item: T): void {
      if (current === item) current = null;
    },
  };
}

const SEED = 0x5eed;
const CELL_MIN = 8;
const CELL_MAX = 13;
const SHADE_LEVELS = 8;
/** Room around the silhouette for the blur halo. */
export const BIRD_CANVAS_PADDING = 16;
const EDGE_MARGIN = 8;
const SETTLE_SECONDS = 4;
const INK = '18, 12, 22';
const FONT_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

const STEP = 1 / 60;
const MAX_STEPS = 4;
const MAX_DELTA = 0.1;
const BLUR_STEP = 0.5;
const BLUR_RATE = 6;
/** Mobile budget: a 2.5 px blur still keeps the ASCII readable. */
const BLUR_MIN = 2.5;
const BLUR_MAX = 6;
/** Viewport-height drift a mobile URL bar can cause without a real relayout. */
const URL_BAR_SLACK = 96;
/** Mobile needs a wider deadband: the copy fills almost the whole stage. */
const MOBILE_DEADBAND = 0.28;
const DESKTOP_DEADBAND = 0;

/**
 * Hero content a bird must not cover with sharp ink. Text weighs 1; the
 * product cards are opaque and paint above the layer, so a bird behind them
 * is hidden and only their silhouette edge is worth softening.
 */
const OBSTACLES: ReadonlyArray<{ selector: string; weight: number }> = [
  { selector: '.hero__copy h1', weight: 1 },
  { selector: '.hero__copy > p', weight: 1 },
  // Opaque buttons and cards hide or barely tint the bird; text nodes win.
  { selector: '.hero__actions', weight: 0.45 },
  { selector: '.mini-dash', weight: 0.15 },
  { selector: '.phone', weight: 0.15 },
];

/** Color blocks per part, as `r, g, b`. Green, gray and orange only. */
const PALETTE: Record<BirdPart, string> = {
  body: '116, 176, 82',
  wing: '96, 156, 66',
  chest: '186, 192, 198',
  tail: '74, 132, 56',
  beak: '240, 154, 62',
  eye: '186, 192, 198',
  edge: '128, 152, 100',
};

const INK_STYLE = `rgba(${INK}, 0.92)`;

/**
 * Precomputed cell fills: 8 shade levels per part. Building the colour string
 * per cell costs more than the fill itself, so the table is built once.
 */
const CELL_STYLES: Record<BirdPart, string[]> = Object.fromEntries(
  (Object.keys(PALETTE) as BirdPart[]).map((part) => [
    part,
    Array.from({ length: SHADE_LEVELS }, (_, level) => {
      const alpha = 0.55 + 0.32 * (level / (SHADE_LEVELS - 1));
      return `rgba(${PALETTE[part]}, ${alpha.toFixed(3)})`;
    }),
  ]),
) as Record<BirdPart, string[]>;

const registry = createControllerRegistry<HeroBirdsController>();

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

/** Readable bird size for the render; depth still drives perspective. */
function displayLength(width: number, height: number, depth: number): number {
  // Very narrow layers need a smaller bird or the silhouette clips the layer.
  const floor = clamp(width * 0.45, 110, 180);
  const base = clamp(Math.min(width, height) * 0.34, floor, 280);
  return base * (0.7 + 0.3 * clamp(depth, 0, 1));
}

/**
 * Dense ink glyph for the colour block. Biases the model ramp toward dense
 * characters so the cell texture reads at 8 px instead of going blank.
 */
export function glyphForInk(shade: number, part: BirdPart): string {
  const value = Number.isFinite(shade) ? clamp(shade, 0, 1) : 0;
  return glyphForShade(0.15 + 0.45 * value, part);
}

function effectiveDpr(raw: number): number {
  const value = Number.isFinite(raw) && raw > 0 ? raw : 1;
  return Math.min(2, value);
}

/**
 * Height of the visible flight stage: the Hero layer, capped by the viewport
 * so a tall stacked Hero does not park the flock below the fold, and by the
 * top of a stacked art column when the opaque cards would hide the flock.
 */
export function stageHeight(
  height: number,
  viewportHeight: number,
  stackedTop = Number.POSITIVE_INFINITY,
): number {
  const layer = Number.isFinite(height) && height > 0 ? height : 0;
  const viewport =
    Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : layer;
  const stack = Number.isFinite(stackedTop) && stackedTop > 0 ? stackedTop : Infinity;

  return Math.min(layer, viewport, stack);
}

/**
 * Blur budget in px: at most 2.5 px on mobile, 6 px on wider screens.
 */
export function blurLimit(width: number): number {
  return width < 720 ? BLUR_MIN : BLUR_MAX;
}

/** Half-pixel blur, snapped to zero below a quarter pixel. */
export function quantizeBlur(value: number): number {
  if (!Number.isFinite(value) || value < BLUR_STEP / 2) return 0;
  return Math.round(value / BLUR_STEP) * BLUR_STEP;
}

/** Canvas style for a blur amount; `will-change` only while blurred. */
export function birdStyle(
  blur: number,
  opacity: number,
): { filter: string; willChange: string; opacity: string } {
  const px = Number.isFinite(blur) && blur > 0 ? blur : 0;
  const alpha = Number.isFinite(opacity) ? clamp(opacity, 0, 1) : 1;

  return {
    filter: px > 0 ? `blur(${px}px)` : 'none',
    willChange: px > 0 ? 'filter' : 'auto',
    opacity: String(Math.round(alpha * 100) / 100),
  };
}

/** Lowest bird opacity while it sits behind text; measured for WCAG AA. */
const BIRD_MIN_OPACITY = 0.4;
/** Raw overlap that already reaches the floor. */
const OPACITY_RAMP = 0.12;

/**
 * Dim the bird from its raw content overlap, independent of the blur. The
 * blur deadband keeps light grazes sharp so the ASCII reads, but text
 * contrast still needs the bird itself to fade as soon as it covers content.
 */
export function opacityForOverlap(
  overlap: number,
  floor = BIRD_MIN_OPACITY,
  ramp = OPACITY_RAMP,
): number {
  const min = clamp(Number.isFinite(floor) ? floor : BIRD_MIN_OPACITY, 0, 1);
  const span = Number.isFinite(ramp) && ramp > 0 ? ramp : OPACITY_RAMP;
  const t = clamp(Number.isFinite(overlap) ? overlap / span : 0, 0, 1);
  const eased = t * t * (3 - 2 * t);

  return min + (1 - min) * (1 - eased);
}

/**
 * Fixed-step accumulator. Returns how many 1/60 s steps to run, clamps long
 * frames to `maxDelta`, and drops the backlog after `maxSteps` so a stalled
 * tab does not replay a burst of motion.
 */
export function advanceClock(
  clock: Clock,
  now: number,
  step = STEP,
  maxSteps = MAX_STEPS,
  maxDelta = MAX_DELTA,
): number {
  if (clock.last === null || !Number.isFinite(clock.last)) {
    clock.last = now;
    return 0;
  }

  let delta = (now - clock.last) / 1000;
  clock.last = now;
  if (!Number.isFinite(delta) || delta < 0) delta = 0;
  if (delta > maxDelta) delta = maxDelta;

  clock.accumulator += delta;
  let steps = 0;
  while (clock.accumulator >= step && steps < maxSteps) {
    clock.accumulator -= step;
    steps += 1;
  }
  if (clock.accumulator >= step) clock.accumulator = 0;

  return steps;
}

export interface BirdLayout {
  /** World-space bird: position, heading and flap. */
  bird: Bird;
  /** Same bird at the origin with heading 0, used for sampling. */
  local: Bird;
  width: number;
  height: number;
  /** Backing store size, already multiplied by the capped DPR. */
  pixelWidth: number;
  pixelHeight: number;
  cellWidth: number;
  cellHeight: number;
  columns: number;
  rows: number;
  /** Box origin relative to the bird center, in local px. */
  left: number;
  top: number;
  /** Bird center inside the box, in px; the CSS transform-origin. */
  originX: number;
  originY: number;
}

export interface HeroBirdsLayout {
  width: number;
  height: number;
  count: number;
  dpr: number;
  birds: BirdLayout[];
}

/**
 * Local-space canvas box for one bird: the silhouette at heading 0 plus a
 * small padding for the blur halo, grown to whole glyph cells. Its CSS
 * rotation is what puts the bird on its heading, so the box stays tight.
 */
export function birdFrame(bird: Bird, dpr = 1): BirdLayout {
  const ratio = effectiveDpr(dpr);
  const cell = clamp(Math.round(bird.length / 30), CELL_MIN, CELL_MAX);
  const length = bird.length > 0 ? bird.length : 1;
  const pad = BIRD_CANVAS_PADDING;
  const left = BIRD_LOCAL_BOUNDS.uMin * length - pad;
  const top = -BIRD_LOCAL_BOUNDS.vHalf * length - pad;
  const columns = Math.max(1, Math.ceil((BIRD_LOCAL_BOUNDS.uMax * length + pad - left) / cell));
  const rows = Math.max(1, Math.ceil((BIRD_LOCAL_BOUNDS.vHalf * length + pad - top) / cell));
  const width = columns * cell;
  const height = rows * cell;

  return {
    bird,
    local: { ...bird, x: 0, y: 0, heading: 0 },
    width,
    height,
    pixelWidth: Math.max(1, Math.round(width * ratio)),
    pixelHeight: Math.max(1, Math.round(height * ratio)),
    cellWidth: cell,
    cellHeight: cell,
    columns,
    rows,
    left,
    top,
    originX: -left,
    originY: -top,
  };
}

/** Map a local point of one bird to world space. */
export function localToWorld(
  bird: Bird,
  localX: number,
  localY: number,
): { x: number; y: number } {
  const cos = Math.cos(bird.heading);
  const sin = Math.sin(bird.heading);

  return {
    x: bird.x + localX * cos - localY * sin,
    y: bird.y + localX * sin + localY * cos,
  };
}

/**
 * CSS placement for one bird: the canvas is rotated around the bird center
 * and translated so that center lands on the bird position.
 */
export function canvasTransform(frame: BirdLayout): {
  transform: string;
  origin: string;
  originX: number;
  originY: number;
} {
  const { bird, originX, originY } = frame;

  return {
    transform: `translate3d(${bird.x - originX}px, ${bird.y - originY}px, 0) rotate(${bird.heading}rad)`,
    origin: `${originX}px ${originY}px`,
    originX,
    originY,
  };
}

/**
 * Pure layout of the flock: spawn, optional settle, readable length, edge
 * clamp and one canvas box per bird. No DOM access.
 */export function layoutHeroBirds(
  width: number,
  height: number,
  rawDpr = 1,
  settleSeconds = 0,
): HeroBirdsLayout {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const dpr = effectiveDpr(rawDpr);
  const count = resolveBirdCount(w);
  const birds = createFlock(count, w, h, SEED);

  for (const bird of birds) bird.length = displayLength(w, h, bird.depth);
  if (settleSeconds > 0) settleFlock(birds, w, h, settleSeconds);
  for (const bird of birds) clampBirdInside(bird, w, h, EDGE_MARGIN);

  return { width: w, height: h, count, dpr, birds: birds.map((bird) => birdFrame(bird, dpr)) };
}

/** Rectangles in layer space, dropping elements with no box. */
export function toLayerRects<T extends Rect>(layerRect: Rect, rects: T[]): T[] {
  const mapped: T[] = [];

  for (const rect of rects) {
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    mapped.push({ ...rect, x: rect.x - layerRect.x, y: rect.y - layerRect.y });
  }

  return mapped;
}

/**
 * Cache Hero obstacle boxes relative to the birds layer. Runs on mount, on
 * font load, on resize and after layout transitions, never inside the loop.
 */
function measureObstacles(layer: HTMLElement, root: Element): Obstacle[] {
  const base = layer.getBoundingClientRect();
  const rects: Obstacle[] = [];

  for (const { selector, weight } of OBSTACLES) {
    for (const element of root.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect();
      rects.push({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        weight,
      });
    }
  }

  return toLayerRects(base, rects);
}

/**
 * Repaint one bird into its canvas. Only the AABB rows/columns are visited,
 * and each cell is sampled once at its centre: the animated loop repaints
 * every frame, so a supersampled cell would cost more than it shows at 8 px.
 */
export interface Obstacle extends Rect {
  /** 1 for text surfaces, lower for opaque cards that hide the bird. */
  weight: number;
}

export interface FrameStats {
  /** Silhouette cells painted. */
  cells: number;
  /** Cells whose box intersects cached Hero content. */
  covered: number;
}

/**
 * Repaint one bird into its canvas. The raster is in the bird's local space,
 * so the whole grid is visited once and every cell is sampled at its center:
 * the loop repaints every frame and a supersampled cell costs more than it
 * shows at 8 px.
 *
 * Returns how many cells were painted and how many of those sit on content.
 * Overlap is measured in world space, with the cell center rotated by the
 * heading, so the ink ratio drives the blur on the real silhouette.
 */
export function paintBirdFrame(
  ctx: BirdContext,
  frame: BirdLayout,
  obstacles: Obstacle[] = [],
): FrameStats {
  const cell = frame.cellWidth;
  const half = cell / 2;

  ctx.clearRect(0, 0, frame.width, frame.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${cell - 1}px ${FONT_STACK}`;

  let cells = 0;
  let covered = 0;

  for (let row = 0; row < frame.rows; row += 1) {
    for (let col = 0; col < frame.columns; col += 1) {
      const left = col * cell;
      const top = row * cell;
      const localX = frame.left + left + half;
      const localY = frame.top + top + half;
      const sampled = sampleBird(frame.local, localX, localY);
      if (!sampled) continue;

      cells += 1;
      if (obstacles.length > 0) {
        const world = localToWorld(frame.bird, localX, localY);
        let weight = 0;
        for (const obstacle of obstacles) {
          const onX = world.x - half < obstacle.x + obstacle.width && world.x + half > obstacle.x;
          const onY = world.y - half < obstacle.y + obstacle.height && world.y + half > obstacle.y;
          if (onX && onY && obstacle.weight > weight) weight = obstacle.weight;
        }
        covered += weight;
      }

      const level = Math.round(clamp(sampled.shade, 0, 1) * (SHADE_LEVELS - 1));
      ctx.fillStyle = CELL_STYLES[sampled.part][level];
      ctx.fillRect(left, top, cell, cell);

      ctx.fillStyle = INK_STYLE;
      ctx.fillText(glyphForInk(sampled.shade, sampled.part), left + half, top + half + 0.5);
    }
  }

  return { cells, covered };
}

/**
 * Paint every bird once. Kept separate from the controller so a regression
 * that skips a bird (the old round-robin) fails a test instead of drifting.
 */
export function paintFlock(
  handles: ReadonlyArray<{ ctx: BirdContext }>,
  frames: ReadonlyArray<BirdLayout>,
  obstacles: Obstacle[] = [],
): FrameStats[] {
  return frames.map((frame, index) => {
    const handle = handles[index];
    if (!handle) return { cells: 0, covered: 0 };

    return paintBirdFrame(handle.ctx, frame, obstacles);
  });
}

/**
 * Create, configure and paint one canvas per bird, reusing the handles that
 * already exist. Reuse keeps a resize from churning three canvases and their
 * contexts; surplus canvases are only removed after every new context exists,
 * so a failed mount leaves the current flock untouched and returns `null`.
 */
export function mountBirdCanvases(
  host: { appendChild(node: HTMLCanvasElement): unknown },
  layout: HeroBirdsLayout,
  create: () => { canvas: HTMLCanvasElement; ctx: BirdContext },
  existing: BirdHandle[] = [],
  paint = true,
): BirdHandle[] | null {
  const keep = Math.min(existing.length, layout.birds.length);
  const created: BirdHandle[] = [];

  try {
    for (let index = keep; index < layout.birds.length; index += 1) created.push(create());
  } catch {
    for (const handle of created) {
      handle.canvas.width = 0;
      handle.canvas.height = 0;
    }
    return null;
  }

  const handles: BirdHandle[] = [];

  layout.birds.forEach((box, index) => {
    const handle: BirdHandle = index < keep ? existing[index] : created[index - keep];
    const canvas = handle.canvas;
    const place = canvasTransform(box);

    canvas.setAttribute('aria-hidden', 'true');
    if (canvas.width !== box.pixelWidth) canvas.width = box.pixelWidth;
    if (canvas.height !== box.pixelHeight) canvas.height = box.pixelHeight;
    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;
    canvas.style.transformOrigin = place.origin;
    canvas.style.transform = place.transform;
    canvas.style.pointerEvents = 'none';
    canvas.style.background = 'transparent';
    canvas.style.filter = 'none';
    canvas.style.willChange = 'auto';
    canvas.style.opacity = '1';

    handle.ctx.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
    if (paint) paintBirdFrame(handle.ctx, box);
    handles.push(handle);
  });

  for (const handle of created) host.appendChild(handle.canvas);
  for (let index = keep; index < existing.length; index += 1) {
    const extra = existing[index];
    extra.canvas.width = 0;
    extra.canvas.height = 0;
    extra.canvas.remove();
  }

  return handles;
}

function createSurface(): { canvas: HTMLCanvasElement; ctx: BirdContext } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');

  return { canvas, ctx };
}

/**
 * Start the flock. Returns a controller, or `null` when the DOM or the canvas
 * context is unavailable; the Hero is left untouched in that case.
 */
export function startHeroBirds(): HeroBirdsController | null {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;

  const found = document.querySelector<HTMLElement>('[data-hero-birds]');
  if (!found) return null;

  const startWidth = found.clientWidth;
  const startHeight = found.clientHeight;
  if (!(startWidth > 0) || !(startHeight > 0)) return null;

  registry.current?.destroy();

  const layer: HTMLElement = found;
  const hero = layer.closest<HTMLElement>('.hero') ?? layer;
  const button = hero.querySelector<HTMLButtonElement>('[data-hero-motion]');
  const label = button?.querySelector<HTMLElement>('span') ?? null;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = startWidth;
  let height = startHeight;
  // Birds fly in the part of the Hero the visitor can actually see; a tall
  // stacked Hero would otherwise keep the flock below the fold. A single bird
  // also stays above the stacked art, where the opaque phone cannot hide it.
  let stage = stageHeight(height, window.innerHeight, stageCapFor(startWidth));
  let dpr = effectiveDpr(window.devicePixelRatio || 1);
  let birds: Bird[] = [];
  let handles: BirdHandle[] = [];
  let obstacles: Obstacle[] = [];
  let blur: number[] = [];
  let overlap: number[] = [];
  let applied: string[] = [];
  let placed: string[] = [];
  const clock: Clock = { last: null, accumulator: 0 };
  let resizeFrame: number | null = null;
  let destroyed = false;
  let io: IntersectionObserver | null = null;
  let ro: ResizeObserver | null = null;
  let resQuery: MediaQueryList | null = null;

  const scheduler = createScheduler({
    request: (callback) => requestAnimationFrame(callback),
    cancel: (id) => cancelAnimationFrame(id),
    step: tick,
    reset: () => {
      clock.last = null;
      clock.accumulator = 0;
    },
  });
  const flags = scheduler.flags;

  function scheduleResize(): void {
    if (resizeFrame !== null || destroyed) return;

    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      if (!destroyed) resize();
    });
  }

  /**
   * Top of the art column, in layer coordinates, when it stacks below the
   * copy (mobile and tablet). `Infinity` on the side-by-side desktop layout.
   * Measured on mount and resize, never inside the loop.
   */
  function stackedArtTop(): number {
    const copy = hero.querySelector<HTMLElement>('.hero__copy');
    const art = hero.querySelector<HTMLElement>('.hero__art');
    if (!copy || !art) return Number.POSITIVE_INFINITY;

    const base = layer.getBoundingClientRect();
    const copyBox = copy.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();

    return artBox.top >= copyBox.bottom ? artBox.top - base.top : Number.POSITIVE_INFINITY;
  }

  /**
   * With a single bird the opaque phone can hide it for the whole viewport,
   * so that layout stops the flock above the stacked art. With two or three
   * birds the rest of the flock keeps the Hero alive.
   */
  function stageCapFor(currentWidth: number): number {
    return resolveBirdCount(currentWidth) === 1 ? stackedArtTop() : Number.POSITIVE_INFINITY;
  }

  function clearCanvases(): void {
    for (const handle of handles) {
      handle.canvas.width = 0;
      handle.canvas.height = 0;
      handle.canvas.remove();
    }
    handles = [];
  }

  function mount(layout: HeroBirdsLayout): boolean {
    // The caller always renders right after mounting, so skip the extra pass.
    const next = mountBirdCanvases(layer, layout, createSurface, handles, false);
    if (!next) return false;

    handles = next;
    birds = layout.birds.map((box) => box.bird);
    blur = birds.map(() => 0);
    overlap = birds.map(() => 0);
    applied = birds.map(() => '');
    placed = birds.map(() => '');

    return true;
  }

  function refreshObstacles(): void {
    obstacles = measureObstacles(layer, hero);
  }

  /** Reposition and repaint every bird; the raster is local, CSS rotates it. */
  function render(dt: number): void {
    const limit = blurLimit(width);
    const frames = birds.map((bird) => birdFrame(bird, dpr));
    const stats = paintFlock(handles, frames, obstacles);

    for (let index = 0; index < birds.length; index += 1) {
      const handle = handles[index];
      if (!handle) continue;

      const frame = frames[index];
      const place = canvasTransform(frame);

      if (place.transform !== placed[index]) {
        placed[index] = place.transform;
        handle.canvas.style.transformOrigin = place.origin;
        handle.canvas.style.transform = place.transform;
      }

      overlap[index] = stats[index].cells > 0 ? stats[index].covered / stats[index].cells : 0;

      const deadband = width < 720 ? MOBILE_DEADBAND : DESKTOP_DEADBAND;
      const target = blurTarget(overlap[index], limit, deadband);
      blur[index] = dt > 0 ? approach(blur[index], target, dt, BLUR_RATE) : target;

      const px = quantizeBlur(blur[index]);
      const style = birdStyle(px, opacityForOverlap(overlap[index]));
      const key = `${style.filter}|${style.opacity}`;
      if (key === applied[index]) continue;

      applied[index] = key;
      handle.canvas.style.filter = style.filter;
      handle.canvas.style.willChange = style.willChange;
      handle.canvas.style.opacity = style.opacity;
    }
  }

  function tick(now: number): void {
    if (destroyed) return;

    const steps = advanceClock(clock, now);
    if (steps === 0) return;

    for (let step = 0; step < steps; step += 1) stepFlock(birds, STEP, width, stage);
    for (const bird of birds) clampBirdInside(bird, width, stage, EDGE_MARGIN);

    render(steps * STEP);
  }

  function updateButton(): void {
    if (!button) return;

    if (label) label.textContent = flags.userPaused ? 'Reanudar animación' : 'Pausar animación';
    button.dataset.paused = String(flags.userPaused);
    button.disabled = flags.reduced;
    button.hidden = flags.reduced;
    // The page only adds `hero-js` on load without reduced motion, so a
    // runtime switch needs the explicit display both ways.
    button.style.display = flags.reduced ? 'none' : 'inline-flex';
  }

  function sync(): void {
    if (destroyed) return;

    scheduler.sync();
    updateButton();
  }

  function settleStatic(): void {
    settleFlock(birds, width, stage, SETTLE_SECONDS);
    for (const bird of birds) clampBirdInside(bird, width, stage, EDGE_MARGIN);
    render(0);
  }

  function resize(): void {
    if (destroyed) return;

    const nextWidth = layer.clientWidth;
    const nextHeight = layer.clientHeight;
    if (!(nextWidth > 0) || !(nextHeight > 0)) return;

    const nextCap = stageCapFor(nextWidth);
    const nextStage = stageHeight(nextHeight, window.innerHeight, nextCap);
    const nextDpr = effectiveDpr(window.devicePixelRatio || 1);
    const sameBox =
      Math.abs(nextWidth - width) < 1 && Math.abs(nextHeight - height) < 1 && nextDpr === dpr;
    // A mobile URL bar only moves `innerHeight`; do not rebuild the flock for
    // it. Real layer box or DPR changes always fall through.
    if (sameBox && Math.abs(nextStage - stage) < URL_BAR_SLACK) {
      refreshObstacles();
      // With no loop running, the cached rectangles would never repaint.
      if (!canAnimate(flags)) render(0);
      return;
    }

    // Snapshot: `resizeFlock` mutates the birds, so a failed mount must roll
    // back to the last good frame and let the next observation retry.
    const previous = {
      width,
      height,
      stage,
      dpr,
      birds: birds.map((bird) => ({ ...bird })),
      blur: [...blur],
      overlap: [...overlap],
      applied: [...applied],
      placed: [...placed],
    };
    const scaleX = nextWidth / width;
    const scaleY = nextStage / stage;
    const count = resolveBirdCount(nextWidth);
    const before = birds.length;
    const resized = resizeFlock(birds, count, nextWidth, nextStage);
    const kept = Math.min(before, count);

    for (let index = 0; index < resized.length; index += 1) {
      const bird = resized[index];
      if (index < kept) {
        bird.x *= scaleX;
        bird.y *= scaleY;
      }
      bird.length = displayLength(nextWidth, nextStage, bird.depth);
      clampBirdInside(bird, nextWidth, nextStage, EDGE_MARGIN);
    }

    const boxes = resized.map((bird) => birdFrame(bird, nextDpr));
    const layout: HeroBirdsLayout = {
      width: nextWidth,
      height: nextHeight,
      count: boxes.length,
      dpr: nextDpr,
      birds: boxes,
    };
    const old = { width, height, stage, dpr };
    width = nextWidth;
    height = nextHeight;
    stage = nextStage;
    dpr = nextDpr;

    if (!mount(layout)) {
      width = old.width;
      height = old.height;
      stage = old.stage;
      dpr = old.dpr;
      birds = previous.birds;
      blur = previous.blur;
      overlap = previous.overlap;
      applied = previous.applied;
      placed = previous.placed;
      return;
    }

    refreshObstacles();
    render(0);
  }

  function onReduceChange(): void {
    flags.reduced = reduceQuery.matches;
    if (shouldSettle(flags)) settleStatic();
    sync();
  }

  function onVisibility(): void {
    flags.hidden = document.hidden;
    sync();
  }

  function onClick(): void {
    flags.userPaused = !flags.userPaused;
    sync();
  }

  function onTransitionEnd(): void {
    refreshObstacles();
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;

    scheduler.destroy();
    if (resizeFrame !== null) {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = null;
    }
    io?.disconnect();
    ro?.disconnect();
    resQuery?.removeEventListener('change', onResolution);
    reduceQuery.removeEventListener('change', onReduceChange);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('astro:before-swap', destroy);
    window.removeEventListener('resize', scheduleResize);
    button?.removeEventListener('click', onClick);
    hero.removeEventListener('transitionend', onTransitionEnd);
    clearCanvases();

    registry.release(controller);
  }

  const initial: HeroBirdsLayout = layoutHeroBirds(width, stage, dpr);
  if (!mount(initial)) return null;

  refreshObstacles();

  io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (entries) => {
            for (const entry of entries) flags.inView = entry.isIntersecting;
            sync();
          },
          { threshold: 0 },
        );
  io?.observe(layer);

  ro =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          scheduleResize();
        });
  ro?.observe(layer);

  /** Re-armed on every change: a DPR switch has a different query object. */
  function watchResolution(): void {
    resQuery?.removeEventListener('change', onResolution);
    resQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    resQuery.addEventListener('change', onResolution);
  }

  function onResolution(): void {
    watchResolution();
    scheduleResize();
  }

  flags.reduced = reduceQuery.matches;
  flags.hidden = document.hidden;

  watchResolution();
  reduceQuery.addEventListener('change', onReduceChange);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('astro:before-swap', destroy);
  window.addEventListener('resize', scheduleResize);
  button?.addEventListener('click', onClick);
  hero.addEventListener('transitionend', onTransitionEnd);

  if (document.fonts?.ready) {
    document.fonts.ready
      .then(() => {
        if (destroyed) return;
        refreshObstacles();
        scheduleResize();
      })
      .catch(() => {});
  }

  const controller: HeroBirdsController = {
    pause(): void {
      flags.userPaused = true;
      sync();
    },
    resume(): void {
      flags.userPaused = false;
      sync();
    },
    destroy,
  };
  registry.install(controller);

  if (flags.reduced) settleStatic();
  else render(0);
  sync();

  return controller;
}
