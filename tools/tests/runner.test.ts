import { describe, expect, it } from 'vitest';
import { BIRD_LANES, createRunner, isNight, RUNNER, runnerBox, step, WORLD, type RunnerInput, type RunnerState } from '@/features/me/game/engine/runner';

const idle: RunnerInput = { jump: false, duck: false };
const tick = (s: RunnerState, seconds: number, input: RunnerInput = idle) => {
  const events = [];
  for (let t = 0; t < seconds; t += 1 / 60) events.push(...step(s, 1 / 60, input));
  return events;
};
const press = (s: RunnerState) => [...step(s, 1 / 60, { jump: true, duck: false }), ...step(s, 1 / 60, idle)];
/** Start a run (the starting tap also jumps, like the original) and wait until we've landed. */
const startAndLand = (seed = 1) => {
  const s = createRunner(seed);
  press(s);
  s.nextGap = 1e9;
  tick(s, 0.8);
  s.obstacles = [];
  return s;
};

describe('runner engine', () => {
  it('waits on the ready screen until the first jump', () => {
    const s = createRunner(1);
    tick(s, 1);
    expect(s.phase).toBe('ready');
    expect(s.distance).toBe(0);
    expect(press(s).map((e) => e.type)).toContain('start');
    expect(s.phase).toBe('playing');
  });

  it('jumps and lands back on the ground', () => {
    const s = startAndLand();
    expect(s.runner.onGround).toBe(true);
    const events = press(s);
    expect(events.map((e) => e.type)).toContain('jump');
    let peak: number = WORLD.groundY;
    for (let i = 0; i < 90; i++) {
      step(s, 1 / 60, idle);
      peak = Math.min(peak, s.runner.y);
    }
    expect(WORLD.groundY - peak).toBeGreaterThan(60); // high enough to clear the tallest obstacle (46px)
    expect(s.runner.onGround).toBe(true);
    expect(s.runner.y).toBe(WORLD.groundY);
  });

  it('holding jump jumps higher (variable jump height)', () => {
    const height = (hold: boolean) => {
      const s = startAndLand();
      step(s, 1 / 60, { jump: true, duck: false });
      let peak: number = WORLD.groundY;
      for (let i = 0; i < 90; i++) {
        step(s, 1 / 60, { jump: hold, duck: false });
        peak = Math.min(peak, s.runner.y);
      }
      return WORLD.groundY - peak;
    };
    expect(height(true)).toBeGreaterThan(height(false) + 20);
  });

  it('hitting an obstacle ends the run; restart only after a short cooldown', () => {
    const s = startAndLand();
    s.obstacles = [{ id: 99, kind: 'rock', x: RUNNER.x + 10, y: WORLD.groundY - 20, w: 24, h: 20 }];
    const events = tick(s, 0.05);
    expect(events.map((e) => e.type)).toContain('over');
    expect(s.phase).toBe('over');
    press(s); // too soon
    expect(s.phase).toBe('over');
    tick(s, 0.5);
    press(s);
    expect(s.phase).toBe('playing');
    expect(s.score).toBe(0);
  });

  it('ducking passes under a mid-lane bird, standing does not', () => {
    const bird = () => ({ id: 1, kind: 'bird' as const, x: RUNNER.x - 2, y: WORLD.groundY - BIRD_LANES.mid - 22, w: 34, h: 22 });
    const ducking = startAndLand();
    ducking.obstacles = [bird()];
    step(ducking, 1 / 60, { jump: false, duck: true });
    expect(ducking.phase).toBe('playing');

    const standing = startAndLand();
    standing.obstacles = [bird()];
    step(standing, 1 / 60, idle);
    expect(standing.phase).toBe('over');
  });

  it('speeds up over time and scores by distance', () => {
    const s = createRunner(2);
    press(s);
    const v0 = s.speed;
    s.obstacles = [];
    for (let i = 0; i < 600; i++) {
      s.obstacles = []; // keep the track clear for this test
      step(s, 1 / 60, idle);
    }
    expect(s.speed).toBeGreaterThan(v0);
    expect(s.score).toBe(Math.floor(s.distance * 0.1));
  });

  it('spawns obstacles with clearable gaps and birds only after the threshold', () => {
    const s = createRunner(3);
    press(s);
    const seen: { kind: string; score: number; x: number }[] = [];
    let lastX = -Infinity;
    let minGap = Infinity;
    for (let i = 0; i < 60 * 120; i++) {
      const before = s.obstacles.length ? s.obstacles[s.obstacles.length - 1].id : 0;
      s.phase = 'playing'; // invincible for this test
      step(s, 1 / 60, idle);
      const last = s.obstacles[s.obstacles.length - 1];
      if (last && last.id !== before) {
        seen.push({ kind: last.kind, score: s.score, x: last.x });
        if (lastX !== -Infinity) minGap = Math.min(minGap, s.distance - lastX);
        lastX = s.distance;
      }
    }
    expect(seen.length).toBeGreaterThan(20);
    expect(seen.filter((o) => o.kind === 'bird').every((o) => o.score >= 250)).toBe(true);
    expect(minGap).toBeGreaterThanOrEqual(240);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const s = createRunner(42);
      press(s);
      for (let i = 0; i < 1200; i++) {
        s.phase = 'playing';
        step(s, 1 / 60, { jump: i % 50 === 0, duck: false });
      }
      return s.obstacles.map((o) => [o.kind, Math.round(o.x)]);
    };
    expect(run()).toEqual(run());
  });

  it('huge frame gaps are clamped', () => {
    const s = createRunner(1);
    press(s);
    step(s, 10, idle);
    expect(s.distance).toBeLessThan(s.speed * 0.1); // two 1/60 steps + one clamped 0.05 step
  });

  it('day/night alternates every 700 points', () => {
    expect([0, 699, 700, 1399, 1400].map(isNight)).toEqual([false, false, true, true, false]);
  });

  it('duck hitbox is lower than standing hitbox', () => {
    const standing = runnerBox({ y: WORLD.groundY, vy: 0, ducking: false, onGround: true });
    const duck = runnerBox({ y: WORLD.groundY, vy: 0, ducking: true, onGround: true });
    expect(duck.y).toBeGreaterThan(standing.y);
  });
});
