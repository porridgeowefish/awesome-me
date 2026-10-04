import { useCallback, useEffect, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { publicUrl } from '@/shared/lib/url';
import { safeStorage } from '@/shared/lib/storage';
import { useCurrentTheme } from '@/shared/hooks/useTheme';
import { Icon } from '@/shared/ui/Icon';
import { createRunner, step, WORLD, type Phase, type RunnerEvent, type RunnerState } from './engine/runner';
import { createRenderer } from './renderer';
import { sfx } from './sfx';
import './game.css';

const HISCORE_KEY = 'game.runner.hiscore';
const SOUND_KEY = 'game.sound';
const JUMP_KEYS = new Set([' ', 'ArrowUp', 'w', 'W']);
const DUCK_KEYS = new Set(['ArrowDown', 's', 'S']);

/**
 * React adapter around the pure runner engine: owns the canvas, the rAF loop and input
 * devices (keyboard while focused, mouse/touch on the board, on-screen buttons on phones).
 * React state only changes on game events, never per frame.
 */
export function TrailRunner() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [initial] = useState(() => createRunner(Date.now() >>> 0));
  const gameRef = useRef<RunnerState>(initial);
  const input = useRef({ jump: false, duck: false });
  /** A one-frame jump press from buttons — consumed by the loop, independent of timers. */
  const tapRef = useRef(false);
  const headRef = useRef<HTMLImageElement | null>(null);
  const theme = useCurrentTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const [phase, setPhase] = useState<Phase>('ready');
  const [lastScore, setLastScore] = useState(0);
  const [hiscore, setHiscore] = useState(() => {
    const v = safeStorage.get<unknown>(HISCORE_KEY, 0);
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  });
  const [sound, setSound] = useState(() => safeStorage.get(SOUND_KEY, true) === true);
  const soundRef = useRef(sound);
  soundRef.current = sound;

  useEffect(() => {
    const img = new Image();
    img.src = publicUrl('images/me/pixel-head.png');
    headRef.current = img;
  }, []);

  const onEvents = useCallback((events: RunnerEvent[]) => {
    for (const e of events) {
      if (soundRef.current) {
        if (e.type === 'jump') sfx.jump();
        if (e.type === 'milestone') sfx.milestone();
        if (e.type === 'over') sfx.over();
      }
      if (e.type === 'start') setPhase('playing');
      if (e.type === 'over') {
        setPhase('over');
        setLastScore(e.score);
        setHiscore((h) => {
          const next = Math.max(h, e.score);
          if (next !== h) safeStorage.set(HISCORE_KEY, next);
          return next;
        });
      }
    }
  }, []);

  // main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const g = gameRef.current;
    const render = createRenderer();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = WORLD.width * dpr;
    canvas.height = WORLD.height * dpr;
    let raf = 0;
    let last = performance.now();
    let lastDraw = 0;
    let visible = true;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - last) / 1000;
      last = now;
      if (!visible || document.hidden) return; // frozen while off-screen, resumes where it was
      const events = step(g, dt, { jump: input.current.jump || tapRef.current, duck: input.current.duck });
      tapRef.current = false;
      if (events.length) onEvents(events);
      // ready / game-over screens only need a few frames per second
      if (g.phase !== 'playing' && now - lastDraw < 100) return;
      lastDraw = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(ctx, g, { head: headRef.current }, themeRef.current === 'dark', now);
    };
    raf = requestAnimationFrame(frame);
    const io = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    io.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
  }, [onEvents]);

  /** Simulate a short tap of the jump key (used by buttons/overlay). */
  const tapJump = useCallback(() => {
    tapRef.current = true;
    if (soundRef.current && gameRef.current.phase !== 'playing') sfx.start();
    boardRef.current?.focus({ preventScroll: true });
  }, []);

  const onKey = (down: boolean) => (e: RKeyboardEvent) => {
    if (JUMP_KEYS.has(e.key)) {
      e.preventDefault();
      input.current.jump = down;
    } else if (DUCK_KEYS.has(e.key)) {
      e.preventDefault();
      input.current.duck = down;
    }
  };

  const toggleSound = () =>
    setSound((s) => {
      safeStorage.set(SOUND_KEY, !s);
      return !s;
    });

  return (
    <div className="runner">
      <div className="runner-hud">
        <span>
          <em>HI</em> {String(hiscore).padStart(5, '0')}
        </span>
        <span className="runner-hint">空格 / ↑ 跳（按住跳更高） · ↓ 下蹲</span>
        <button className="runner-sound" onClick={toggleSound} aria-label={sound ? '关闭音效' : '打开音效'} title={sound ? '关闭音效' : '打开音效'}>
          <Icon name={sound ? 'volume' : 'mute'} size={15} />
        </button>
      </div>

      <div
        ref={boardRef}
        className="runner-board"
        tabIndex={0}
        role="application"
        aria-label="山野快跑小游戏：空格或上方向键跳跃，下方向键下蹲"
        onKeyDown={onKey(true)}
        onKeyUp={onKey(false)}
        onBlur={() => (input.current = { jump: false, duck: false })}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.focus({ preventScroll: true });
          input.current.jump = true;
        }}
        onPointerUp={() => (input.current.jump = false)}
        onPointerCancel={() => (input.current.jump = false)}
        onPointerLeave={() => (input.current.jump = false)}
      >
        <canvas ref={canvasRef} />
        {phase !== 'playing' && (
          <div className="runner-overlay">
            {phase === 'ready' ? (
              <>
                <strong>山野快跑</strong>
                <p>跳过石头和松树，低头躲开飞鸟，跑得越远越快。</p>
                <button className="runner-start" onClick={tapJump}>
                  START
                </button>
              </>
            ) : (
              <>
                <strong>GAME OVER</strong>
                <p>
                  本局 {lastScore} 分{lastScore >= hiscore && lastScore > 0 ? ' · 新纪录！' : ''}
                </p>
                <button className="runner-start" onClick={tapJump}>
                  再跑一次
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="runner-pad">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            input.current.jump = true;
          }}
          onPointerUp={() => (input.current.jump = false)}
          onPointerLeave={() => (input.current.jump = false)}
          aria-label="跳"
        >
          <Icon name="up" size={18} /> 跳
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            input.current.duck = true;
          }}
          onPointerUp={() => (input.current.duck = false)}
          onPointerLeave={() => (input.current.duck = false)}
          aria-label="蹲"
        >
          <Icon name="down" size={18} /> 蹲
        </button>
      </div>
    </div>
  );
}
