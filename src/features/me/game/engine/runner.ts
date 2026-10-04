/**
 * Pure game logic for "山野快跑" — an endless runner in the spirit of the classic offline
 * dinosaur game: run, jump over rocks and pine trees, duck under birds, go faster and faster.
 *
 * No DOM and no timers: `step(state, dt, input)` advances the simulation deterministically
 * (seeded RNG), so the rules are unit-tested and the renderer only ever reads the state.
 * Units are logical pixels of a WORLD.width × WORLD.height canvas; y grows downwards.
 */

export const WORLD = { width: 640, height: 280, groundY: 240 } as const;

export const RUNNER = {
  x: 64,
  standW: 30,
  standH: 46,
  duckW: 42,
  duckH: 28,
} as const;

const PHYSICS = {
  gravity: 2800,
  jumpVelocity: 680,
  /** Gravity multiplier while the jump key is held on the way up → variable jump height. */
  holdGravity: 0.6,
  /** Gravity multiplier when ducking in the air → fast fall. */
  fastFall: 3,
  startSpeed: 330,
  maxSpeed: 800,
  acceleration: 7, // px/s per second
  /** Points per pixel run. */
  scoreRate: 0.1,
  birdsFromScore: 250,
  restartCooldown: 0.45,
} as const;

export type ObstacleKind = 'rock' | 'boulder' | 'pine' | 'pines' | 'bird';

export interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  /** Top edge. */
  y: number;
  w: number;
  h: number;
}

export interface Runner {
  y: number; // feet position (bottom edge)
  vy: number;
  ducking: boolean;
  onGround: boolean;
}

export type Phase = 'ready' | 'playing' | 'over';

export interface RunnerState {
  phase: Phase;
  runner: Runner;
  obstacles: Obstacle[];
  speed: number;
  distance: number;
  score: number;
  /** Seconds since the run started (drives animations). */
  time: number;
  /** Distance left until the next obstacle spawns. */
  nextGap: number;
  /** Seconds since game over (restart is ignored for a short moment). */
  overFor: number;
  jumpWasDown: boolean;
  nextId: number;
  seed: number;
}

export interface RunnerInput {
  /** Jump key / tap currently held. */
  jump: boolean;
  /** Duck key currently held. */
  duck: boolean;
}

export type RunnerEvent = { type: 'start' } | { type: 'jump' } | { type: 'milestone'; score: number } | { type: 'over'; score: number };

const SIZES: Record<ObstacleKind, { w: number; h: number }> = {
  rock: { w: 24, h: 20 },
  boulder: { w: 36, h: 30 },
  pine: { w: 22, h: 46 },
  pines: { w: 44, h: 46 },
  bird: { w: 34, h: 22 },
};

/** Bottom edge of a bird above the ground: low → jump over, mid → duck under, high → just run. */
export const BIRD_LANES = { low: 4, mid: 28, high: 62 } as const;

function rng(state: RunnerState): number {
  // mulberry32
  let t = (state.seed = (state.seed + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createRunner(seed = 20260101): RunnerState {
  return {
    phase: 'ready',
    runner: { y: WORLD.groundY, vy: 0, ducking: false, onGround: true },
    obstacles: [],
    speed: PHYSICS.startSpeed,
    distance: 0,
    score: 0,
    time: 0,
    nextGap: 420,
    overFor: 0,
    jumpWasDown: false,
    nextId: 1,
    seed,
  };
}

/** Runner hit box (slightly forgiving so near misses feel fair). */
export function runnerBox(r: Runner) {
  const w = r.ducking ? RUNNER.duckW : RUNNER.standW;
  const h = r.ducking ? RUNNER.duckH : RUNNER.standH;
  const inset = 4;
  return { x: RUNNER.x + inset, y: r.y - h + inset, w: w - inset * 2, h: h - inset };
}

function obstacleBox(o: Obstacle) {
  const inset = o.kind === 'bird' ? 4 : 3;
  return { x: o.x + inset, y: o.y + inset, w: o.w - inset * 2, h: o.h - inset };
}

const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function isNight(score: number): boolean {
  return Math.floor(score / 700) % 2 === 1;
}

function spawn(state: RunnerState) {
  const r = rng(state);
  let kind: ObstacleKind;
  if (state.score >= PHYSICS.birdsFromScore && r < 0.22) kind = 'bird';
  else if (r < 0.45) kind = 'rock';
  else if (r < 0.65) kind = 'pine';
  else if (r < 0.85) kind = 'boulder';
  else kind = 'pines';
  const { w, h } = SIZES[kind];
  let y = WORLD.groundY - h;
  if (kind === 'bird') {
    const lanes = [BIRD_LANES.low, BIRD_LANES.mid, BIRD_LANES.high];
    y = WORLD.groundY - lanes[Math.floor(rng(state) * lanes.length)] - h;
  }
  state.obstacles.push({ id: state.nextId++, kind, x: WORLD.width + 10, y, w, h });
  // gaps grow with speed so every pattern stays physically clearable
  const minGap = Math.max(240, state.speed * 0.72);
  state.nextGap = minGap + rng(state) * state.speed * 0.9;
}

function reset(state: RunnerState) {
  const fresh = createRunner(state.seed);
  Object.assign(state, fresh);
}

export function step(state: RunnerState, dt: number, input: RunnerInput): RunnerEvent[] {
  const events: RunnerEvent[] = [];
  dt = Math.min(Math.max(dt, 0), 0.05); // background tabs must not teleport anything
  const pressed = input.jump && !state.jumpWasDown;
  state.jumpWasDown = input.jump;

  if (state.phase === 'over') {
    state.overFor += dt;
    if (pressed && state.overFor >= PHYSICS.restartCooldown) {
      reset(state);
      state.phase = 'playing';
      state.jumpWasDown = true;
      events.push({ type: 'start' });
    }
    return events;
  }

  if (state.phase === 'ready') {
    if (!pressed) return events;
    state.phase = 'playing';
    events.push({ type: 'start' });
  }

  state.time += dt;
  const r = state.runner;

  // --- runner physics
  if (pressed && r.onGround) {
    r.vy = -PHYSICS.jumpVelocity;
    r.onGround = false;
    events.push({ type: 'jump' });
  }
  r.ducking = input.duck && r.onGround;
  if (!r.onGround) {
    let g = PHYSICS.gravity;
    if (input.jump && r.vy < 0) g *= PHYSICS.holdGravity;
    if (input.duck) g *= PHYSICS.fastFall;
    r.vy += g * dt;
    r.y += r.vy * dt;
    if (r.y >= WORLD.groundY) {
      r.y = WORLD.groundY;
      r.vy = 0;
      r.onGround = true;
      r.ducking = input.duck;
    }
  }

  // --- world scrolling
  state.speed = Math.min(PHYSICS.maxSpeed, state.speed + PHYSICS.acceleration * dt);
  const dx = state.speed * dt;
  state.distance += dx;
  const before = state.score;
  state.score = Math.floor(state.distance * PHYSICS.scoreRate);
  if (Math.floor(before / 100) < Math.floor(state.score / 100)) events.push({ type: 'milestone', score: Math.floor(state.score / 100) * 100 });

  for (const o of state.obstacles) o.x -= o.kind === 'bird' ? dx * 1.08 : dx;
  state.obstacles = state.obstacles.filter((o) => o.x + o.w > -20);

  state.nextGap -= dx;
  if (state.nextGap <= 0) spawn(state);

  // --- collisions
  const box = runnerBox(r);
  if (state.obstacles.some((o) => overlap(box, obstacleBox(o)))) {
    state.phase = 'over';
    state.overFor = 0;
    events.push({ type: 'over', score: state.score });
  }
  return events;
}
