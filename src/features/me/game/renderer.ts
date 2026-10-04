import { isNight, RUNNER, WORLD, type Obstacle, type RunnerState } from './engine/runner';
import { BIRD_DOWN, BIRD_UP, drawBitmap, PINE, ROCK } from './sprites';

/**
 * Canvas renderer for the runner. Reads the engine state, never mutates it.
 * Keeps only cosmetic state of its own (day/night cross-fade, score blink).
 */

interface Palette {
  skyTop: string;
  skyBottom: string;
  far: string;
  snow: string;
  near: string;
  ground: string;
  groundLine: string;
  pebble: string;
  cloud: string;
  ink: string;
  rock: Record<string, string>;
  pine: Record<string, string>;
  bird: Record<string, string>;
}

const DAY: Palette = {
  skyTop: '#bcdcff',
  skyBottom: '#f6f1e6',
  far: '#9fc0e8',
  snow: '#ffffff',
  near: '#a9d39a',
  ground: '#e8dfca',
  groundLine: '#5b5547',
  pebble: '#b9ad92',
  cloud: '#ffffff',
  ink: '#1d2330',
  rock: { h: '#c9c2b4', '#': '#9d9585', s: '#6f685b' },
  pine: { l: '#7cc24a', g: '#3f9b4a', d: '#2b6e36', b: '#7a4b2a' },
  bird: { '#': '#3b4352', o: '#ef7a2b', w: '#ffffff', k: '#1d2330' },
};

const NIGHT: Palette = {
  skyTop: '#0d1530',
  skyBottom: '#25304d',
  far: '#2b3a63',
  snow: '#c9d6f2',
  near: '#1f3b37',
  ground: '#1b2131',
  groundLine: '#9aa6c4',
  pebble: '#3b4560',
  cloud: '#46557d',
  ink: '#e8ecf6',
  rock: { h: '#7a8199', '#': '#555c73', s: '#3a4054' },
  pine: { l: '#4f8a5a', g: '#2f6a45', d: '#1f4a33', b: '#5a3a24' },
  bird: { '#': '#c9d2e6', o: '#f59450', w: '#ffffff', k: '#0d1530' },
};

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

function mixPalette(t: number): Palette {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DAY) as (keyof Palette)[]) {
    const a = DAY[key];
    const b = NIGHT[key];
    if (typeof a === 'string') out[key] = mixHex(a, b as string, t);
    else out[key] = Object.fromEntries(Object.keys(a).map((k) => [k, mixHex(a[k], (b as Record<string, string>)[k], t)]));
  }
  return out as unknown as Palette;
}

/** Deterministic pseudo-noise for scenery (no allocation per frame). */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export interface RenderAssets {
  head: HTMLImageElement | null;
}

export function createRenderer() {
  let night = 0; // 0 = day … 1 = night, eased
  let lastTime = 0;

  return function render(ctx: CanvasRenderingContext2D, s: RunnerState, assets: RenderAssets, siteDark: boolean, now: number) {
    const dt = lastTime ? Math.min(0.1, (now - lastTime) / 1000) : 0;
    lastTime = now;
    const target = siteDark || isNight(s.score) ? 1 : 0;
    night += (target - night) * Math.min(1, dt * 2.5);
    const p = mixPalette(night);
    const { width: W, height: H, groundY: G } = WORLD;
    ctx.imageSmoothingEnabled = false;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, G);
    sky.addColorStop(0, p.skyTop);
    sky.addColorStop(1, p.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // stars + moon / sun
    if (night > 0.05) {
      ctx.globalAlpha = night;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 40; i++) {
        const twinkle = Math.sin(now / 400 + i) > 0.6 ? 2 : 1;
        ctx.fillRect(Math.floor(hash(i) * W), Math.floor(hash(i + 99) * G * 0.6), twinkle, twinkle);
      }
      ctx.globalAlpha = 1;
    }
    const orbX = W - 110;
    const orbY = 46;
    ctx.fillStyle = mixHex('#ffd36b', '#f1f4ff', night);
    ctx.fillRect(orbX, orbY, 24, 24);
    ctx.fillRect(orbX - 4, orbY + 4, 32, 16);
    ctx.fillRect(orbX + 4, orbY - 4, 16, 32);
    if (night > 0.5) {
      ctx.fillStyle = p.skyTop;
      ctx.fillRect(orbX + 10, orbY - 2, 16, 18); // crescent bite
    }

    const d = s.distance;

    // far mountains (parallax 0.08) with snow caps
    const step = 4;
    for (let x = 0; x < W; x += step) {
      const wx = (x + d * 0.08) / 90;
      const h = 70 + Math.sin(wx) * 26 + Math.sin(wx * 2.3 + 1) * 14 + Math.sin(wx * 0.37) * 18;
      const top = Math.round((G - 18 - h) / step) * step;
      ctx.fillStyle = p.far;
      ctx.fillRect(x, top, step, G - top);
      if (h > 92) {
        ctx.fillStyle = p.snow;
        ctx.fillRect(x, top, step, Math.min(8, (h - 92) * 0.8 + 2));
      }
    }
    // near hills (parallax 0.25)
    for (let x = 0; x < W; x += step) {
      const wx = (x + d * 0.25) / 60;
      const h = 22 + Math.sin(wx) * 10 + Math.sin(wx * 1.7 + 2) * 7;
      const top = Math.round((G - h) / step) * step;
      ctx.fillStyle = p.near;
      ctx.fillRect(x, top, step, G - top);
    }

    // clouds (parallax 0.15)
    ctx.fillStyle = p.cloud;
    for (let i = 0; i < 4; i++) {
      const span = W + 160;
      const cx = ((i * 211 - d * 0.15 - s.time * 6) % span + span) % span - 80;
      const cy = 30 + hash(i + 7) * 60;
      ctx.fillRect(cx, cy, 44, 8);
      ctx.fillRect(cx + 8, cy - 8, 24, 8);
      ctx.fillRect(cx + 4, cy + 8, 36, 4);
    }

    // ground band + line + scrolling pebbles
    ctx.fillStyle = p.ground;
    ctx.fillRect(0, G, W, H - G);
    ctx.fillStyle = p.groundLine;
    ctx.fillRect(0, G, W, 2);
    ctx.fillStyle = p.pebble;
    const tile = 24;
    const offset = d % tile;
    for (let x = -offset, k = Math.floor(d / tile); x < W; x += tile, k++) {
      const r = hash(k);
      ctx.fillRect(x + r * 18, G + 6 + Math.floor(r * 4) * 6, 4 + Math.floor(r * 3) * 2, 2);
      if (r > 0.6) ctx.fillRect(x + r * 10, G + 3, 2, 2);
    }

    // obstacles
    for (const o of s.obstacles) drawObstacle(ctx, o, p, s.time);

    // runner
    drawRunner(ctx, s, assets, p);

    // score (classic top-right counter), blinking at every 100
    const blinking = s.phase === 'playing' && s.score % 100 > 95;
    ctx.font = '13px Silkscreen, monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = p.ink;
    if (!blinking || Math.floor(now / 120) % 2) ctx.fillText(String(s.score).padStart(5, '0'), W - 16, 24);
  };
}

function drawObstacle(ctx: CanvasRenderingContext2D, o: Obstacle, p: Palette, t: number) {
  switch (o.kind) {
    case 'rock':
    case 'boulder':
      drawBitmap(ctx, ROCK, o.x, o.y, o.w, o.h, p.rock);
      break;
    case 'pine':
      drawBitmap(ctx, PINE, o.x, o.y, o.w, o.h, p.pine);
      break;
    case 'pines':
      drawBitmap(ctx, PINE, o.x, o.y + 6, o.w / 2, o.h - 6, p.pine);
      drawBitmap(ctx, PINE, o.x + o.w / 2, o.y, o.w / 2, o.h, p.pine);
      break;
    case 'bird':
      drawBitmap(ctx, Math.floor(t * 6) % 2 ? BIRD_UP : BIRD_DOWN, o.x, o.y, o.w, o.h, p.bird);
      break;
  }
}

const SKIN = '#f0b37e';
const SHIRT = '#262832';
const STRAP = '#4a4e5c';
const TEE = '#b8bccb';
const PANTS = '#1c1d22';
const SHOE = '#ef7a2b';

/** The pixel-art "me": the real head sprite on a small procedurally drawn trail-running body. */
function drawRunner(ctx: CanvasRenderingContext2D, s: RunnerState, assets: RenderAssets, p: Palette) {
  const r = s.runner;
  const x = RUNNER.x;
  const frame = s.phase === 'playing' && r.onGround ? Math.floor(s.time * 12) % 2 : 0;
  const head = assets.head?.complete && assets.head.naturalWidth ? assets.head : null;

  ctx.save();
  if (s.phase === 'over') {
    ctx.translate(x + 15, r.y);
    ctx.rotate(-0.18);
    ctx.translate(-(x + 15), -r.y);
  }

  if (r.ducking) {
    const top = r.y - RUNNER.duckH;
    // stretched body, head forward
    ctx.fillStyle = PANTS;
    ctx.fillRect(x + 2, top + 18, 10, 6);
    ctx.fillRect(x + 10 + frame * 2, top + 20, 8, 6);
    ctx.fillStyle = SHOE;
    ctx.fillRect(x, top + 24, 8, 4);
    ctx.fillRect(x + 14 + frame * 2, top + 24, 8, 4);
    ctx.fillStyle = SHIRT;
    ctx.fillRect(x + 6, top + 10, 20, 10);
    ctx.fillStyle = TEE;
    ctx.fillRect(x + 10, top + 16, 12, 3);
    ctx.fillStyle = STRAP;
    ctx.fillRect(x + 12, top + 10, 2, 8);
    ctx.fillStyle = SKIN;
    ctx.fillRect(x + 22, top + 16, 6, 3);
    if (head) ctx.drawImage(head, x + 20, top - 2, 22, 23);
  } else {
    const top = r.y - RUNNER.standH;
    const airborne = !r.onGround;
    // legs
    ctx.fillStyle = PANTS;
    if (airborne) {
      ctx.fillRect(x + 8, top + 36, 6, 6);
      ctx.fillRect(x + 16, top + 34, 6, 6);
    } else if (frame === 0) {
      ctx.fillRect(x + 8, top + 36, 5, 8);
      ctx.fillRect(x + 17, top + 36, 5, 5);
    } else {
      ctx.fillRect(x + 8, top + 36, 5, 5);
      ctx.fillRect(x + 17, top + 36, 5, 8);
    }
    ctx.fillStyle = SHOE;
    if (airborne) {
      ctx.fillRect(x + 6, top + 41, 8, 4);
      ctx.fillRect(x + 18, top + 39, 8, 4);
    } else if (frame === 0) {
      ctx.fillRect(x + 6, top + 43, 9, 3);
      ctx.fillRect(x + 18, top + 40, 8, 3);
    } else {
      ctx.fillRect(x + 6, top + 40, 8, 3);
      ctx.fillRect(x + 17, top + 43, 9, 3);
    }
    // torso + running vest
    ctx.fillStyle = SHIRT;
    ctx.fillRect(x + 7, top + 25, 16, 12);
    ctx.fillStyle = TEE;
    ctx.fillRect(x + 10, top + 31, 10, 4);
    ctx.fillStyle = STRAP;
    ctx.fillRect(x + 9, top + 25, 2, 7);
    ctx.fillRect(x + 19, top + 25, 2, 7);
    // arms swing opposite to legs
    ctx.fillStyle = SKIN;
    if (airborne) {
      ctx.fillRect(x + 3, top + 26, 4, 3);
      ctx.fillRect(x + 23, top + 24, 4, 3);
    } else {
      ctx.fillRect(x + (frame ? 4 : 23), top + 29, 4, 5);
      ctx.fillRect(x + (frame ? 23 : 4), top + 27, 3, 4);
    }
    if (head) ctx.drawImage(head, x + 2, top - 1, 27, 28);
    else {
      ctx.fillStyle = SKIN;
      ctx.fillRect(x + 6, top + 4, 18, 18);
    }
  }
  ctx.restore();

  if (s.phase === 'over') {
    // little "ouch" stars
    ctx.fillStyle = p.ink;
    const t = s.overFor * 10;
    for (let i = 0; i < 3; i++) {
      const a = t + (i * Math.PI * 2) / 3;
      ctx.fillRect(x + 15 + Math.cos(a) * 16, r.y - 52 + Math.sin(a) * 5, 3, 3);
    }
  }
}
