import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { formatTime } from '@/shared/lib/format';
import { publicUrl } from '@/shared/lib/url';
import { Icon, type IconName } from '@/shared/ui/Icon';
import { usePlayer, usePlayerTime } from './player/PlayerContext';
import type { PlayMode } from './player/playerReducer';
import './nav-player.css';
import { useSiteContent } from '@/shared/content/runtime';

const MODES: { mode: PlayMode; label: string; icon: IconName }[] = [
  { mode: 'loop', label: '列表循环', icon: 'repeat' },
  { mode: 'one', label: '单曲循环', icon: 'repeatOne' },
  { mode: 'shuffle', label: '随机播放', icon: 'shuffle' },
];

/**
 * Top-bar music control: a play/pause button with a slim progress bar. The ▾ button opens a
 * popover to pick tracks, reorder the playlist, switch play mode and adjust volume.
 * The list plays head-to-tail on a loop by default.
 */
export function NavPlayer() {
  const { settings } = useSiteContent();
  const player = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // close on outside click / Esc, return focus to the trigger
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!player.tracks.length || !settings.player.visible) return null;

  const { state, current } = player;
  const playing = state.status === 'playing' || state.status === 'loading';
  const pct = duration ? (currentTime / duration) * 100 : 0;
  const shown = current ?? player.tracks[0];

  return (
    <div className="nav-player" ref={rootRef}>
      <button className={`np-play ${playing ? 'is-playing' : ''}`} onClick={player.toggle} aria-label={playing ? `${interfaceText("暂停")}：${shown.title}` : `${interfaceText("播放")}：${shown.title}`}>
        <Icon name={playing ? interfaceIcon('music.pause','pause') : interfaceIcon('music.play','play')} solid size={14} />
      </button>
      <button
        ref={triggerRef}
        className="np-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={interfaceText("打开播放列表")}
        title={shown.title}
      >
        <span className="np-meta">
          <span className="np-title">{state.status === 'error' ? interfaceText("播放出错") : shown.title}</span>
          <span className="np-bar" aria-hidden>
            <i style={{ width: `${pct}%` }} />
          </span>
        </span>
        <Icon name={open ? interfaceIcon('music.collapse','up') : interfaceIcon('music.expand','down')} size={14} />
      </button>
      {open && <PlayerPanel id={panelId} />}
    </div>
  );
}

function PlayerPanel({ id }: { id: string }) {
  const { copy, settings } = useSiteContent();
  const player = usePlayer();
  const { state, current, tracks } = player;
  const playingIndex = current ? tracks.indexOf(current) : -1;
  const isPlaying = state.status === 'playing' || state.status === 'loading';
  const firstRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="np-panel" id={id} role="dialog" aria-label={interfaceText("音乐播放器")}>
      <div className="np-modes" role="radiogroup" aria-label={interfaceText("播放模式")}>
        {MODES.map((m, i) => (
          <button
            key={m.mode}
            ref={i === 0 ? firstRef : undefined}
            role="radio"
            aria-checked={player.mode === m.mode}
            className={player.mode === m.mode ? 'on' : ''}
            onClick={() => player.setMode(m.mode)}
          >
            <Icon name={interfaceIcon(`music.${m.mode}`,m.icon)} size={14} />
            {copy(`music.${m.mode}`)}
          </button>
        ))}
      </div>

      <div className="np-now">
        <div className={`np-disc ${state.status === 'playing' ? 'spinning' : ''}`} aria-hidden>
          <img src={publicUrl(current?.cover ?? settings.player.fallbackCover)} alt="" className={current?.cover ? '' : 'pixel'} />
        </div>
        <div className="np-now-meta">
          <strong>{current?.title ?? tracks[0].title}</strong>
          <span>{state.error ?? ([current?.artist, current?.album].filter(Boolean).join(' · ') || '—')}</span>
        </div>
      </div>

      <Seek />

      <div className="np-controls">
        <button className="icon-btn" onClick={player.prev} aria-label={interfaceText("上一首")}>
          <Icon name={interfaceIcon("navplayer.prev.0","prev")} solid size={16} />
        </button>
        <button className="np-big" onClick={player.toggle} aria-label={isPlaying ? interfaceText("暂停") : interfaceText("播放")}>
          <Icon name={isPlaying ? interfaceIcon('music.pause','pause') : interfaceIcon('music.play','play')} solid size={18} />
        </button>
        <button className="icon-btn" onClick={player.next} aria-label={interfaceText("下一首")}>
          <Icon name={interfaceIcon("navplayer.next.1","next")} solid size={16} />
        </button>
        <Volume />
      </div>

      <ol className="np-list" aria-label={interfaceText("播放列表")}>
        {tracks.map((t, i) => {
          const active = i === playingIndex && state.status !== 'idle';
          return (
            <li key={t.id} className={active ? 'active' : ''}>
              <button className="np-track" onClick={() => (active ? player.toggle() : player.play(i))} aria-current={active ? 'true' : undefined}>
                <span className="np-no">{active && isPlaying ? <Eq /> : String(i + 1).padStart(2, '0')}</span>
                <span className="np-track-meta">
                  <strong>{t.title}</strong>
                  <span>{t.artist ?? copy('music.unknownArtist')}</span>
                </span>
              </button>
              <span className="np-order">
                <button onClick={() => player.move(i, i - 1)} disabled={i === 0} aria-label={`${interfaceText("上移")} ${t.title}`}>
                  <Icon name={interfaceIcon("navplayer.up.2","up")} size={13} />
                </button>
                <button onClick={() => player.move(i, i + 1)} disabled={i === tracks.length - 1} aria-label={`${interfaceText("下移")} ${t.title}`}>
                  <Icon name={interfaceIcon("navplayer.down.3","down")} size={13} />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Seek() {
  const { seek } = usePlayer();
  const { currentTime, duration } = usePlayerTime();
  return (
    <div className="np-seek">
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label={interfaceText("播放进度")}
        style={{ '--pct': `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties}
      />
      <div className="np-times">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

function Volume() {
  const { state, setVolume, toggleMute } = usePlayer();
  const v = state.muted ? 0 : state.volume;
  return (
    <div className="np-volume">
      <button className="icon-btn" onClick={toggleMute} aria-label={state.muted ? interfaceText("取消静音") : interfaceText("静音")}>
        <Icon name={v === 0 ? interfaceIcon('music.mute','mute') : interfaceIcon('music.volume','volume')} size={16} />
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={v}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label={interfaceText("音量")}
        style={{ '--pct': `${v * 100}%` } as CSSProperties}
      />
    </div>
  );
}

function Eq() {
  return (
    <span className="np-eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

