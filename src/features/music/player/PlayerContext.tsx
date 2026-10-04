import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useSiteContent } from '@/shared/content/runtime';
import type { Track } from '@/shared/content/types';
import { publicUrl } from '@/shared/lib/url';
import { safeStorage } from '@/shared/lib/storage';
import { applySavedOrder, currentTrack, initialPlayerState, playerReducer, playMode, type PlayerState, type PlayMode } from './playerReducer';

/**
 * One <audio> element for the whole site (not part of any page), so music keeps playing
 * while visitors browse. MP4 files are accepted too — only their audio is played.
 */

interface PlayerControls {
  state: PlayerState;
  current: Track | null;
  tracks: Track[];
  play: (index?: number) => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  mode: PlayMode;
  setMode: (mode: PlayMode) => void;
  /** Reorder the playlist (indices into `tracks`); the order is remembered per visitor. */
  move: (from: number, to: number) => void;
}

interface PlayerTime {
  currentTime: number;
  duration: number;
}

const ControlsContext = createContext<PlayerControls | null>(null);
const TimeContext = createContext<PlayerTime>({ currentTime: 0, duration: 0 });

const VOLUME_KEY = 'player.volume';
const ORDER_KEY = 'player.order';

/** Stored values are untrusted (other apps on the same origin, manual edits). */
function sanitizeVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { music: musicIndex, settings } = useSiteContent();
  const [state, dispatch] = useReducer(playerReducer, initialPlayerState, (s): PlayerState => ({
    ...s,
    volume: sanitizeVolume(safeStorage.get<unknown>(VOLUME_KEY, settings.player.volume), settings.player.volume),
    repeat: settings.player.mode === 'one' ? 'one' : 'all', shuffle: settings.player.mode === 'shuffle',
  }));
  const [time, setTime] = useState<PlayerTime>({ currentTime: 0, duration: 0 });
  const mediaRef = useRef<HTMLAudioElement | null>(null);
  const wantPlay = useRef(false);

  // Create the persistent media element once (it does not need to be in the DOM).
  if (typeof document !== 'undefined' && !mediaRef.current) {
    const media = document.createElement('audio');
    media.preload = 'none'; // don't download anything until the visitor presses play
    mediaRef.current = media;
  }

  useEffect(() => () => mediaRef.current?.pause(), []);

  useEffect(() => {
    const playing = currentTrack(state);
    if (playing && !musicIndex.tracks.some(t => t.id === playing.id && t.src === playing.src)) { wantPlay.current = false; mediaRef.current?.pause(); }
    dispatch({ type: 'syncQueue', queue: applySavedOrder(musicIndex.tracks, safeStorage.get<unknown>(ORDER_KEY, null)) });
  }, [musicIndex.tracks]);

  const current = currentTrack(state);

  // remember a custom playlist order (only once the visitor changed it)
  const orderTouched = useRef(false);
  useEffect(() => {
    if (orderTouched.current) safeStorage.set(ORDER_KEY, state.queue.map((t) => t.id));
  }, [state.queue]);

  // Wire media element events → state.
  useEffect(() => {
    const m = mediaRef.current!;
    let lastTick = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - lastTick < 250) return;
      lastTick = now;
      setTime({ currentTime: m.currentTime, duration: m.duration || 0 });
    };
    const onMeta = () => setTime({ currentTime: m.currentTime, duration: m.duration || 0 });
    const onPlay = () => dispatch({ type: 'status', status: 'playing' });
    const onPause = () => {
      if (!m.ended) dispatch({ type: 'status', status: 'paused' });
    };
    const onEnded = () => dispatch({ type: 'next', auto: true });
    const onError = () => {
      wantPlay.current = false;
      dispatch({ type: 'status', status: 'error', error: '这首暂时无法播放（文件缺失或格式不受支持）' });
    };
    const onWaiting = () => dispatch({ type: 'status', status: 'loading' });
    const onPlaying = () => dispatch({ type: 'status', status: 'playing' });
    const pairs: [string, EventListener][] = [
      ['timeupdate', onTime],
      ['loadedmetadata', onMeta],
      ['durationchange', onMeta],
      ['play', onPlay],
      ['pause', onPause],
      ['ended', onEnded],
      ['error', onError],
      ['waiting', onWaiting],
      ['playing', onPlaying],
    ];
    pairs.forEach(([e, fn]) => m.addEventListener(e, fn));
    return () => pairs.forEach(([e, fn]) => m.removeEventListener(e, fn));
  }, []);

  // Load the current track whenever it (or the restart nonce) changes.
  useEffect(() => {
    const m = mediaRef.current!;
    if (!current) {
      m.pause();
      m.removeAttribute('src');
      return;
    }
    const src = publicUrl(current.src);
    if (!m.src.endsWith(src)) {
      m.src = src;
      setTime({ currentTime: 0, duration: 0 });
    } else {
      m.currentTime = 0;
    }
    if (wantPlay.current) {
      m.play().catch((err: DOMException) => {
        if (err.name === 'AbortError') return; // superseded by a newer load()/pause() — not an error
        // Autoplay policies: stay paused instead of failing loudly.
        dispatch({ type: 'status', status: err.name === 'NotAllowedError' ? 'paused' : 'error', error: err.message });
      });
    }
  }, [current?.src, state.nonce]);

  useEffect(() => {
    const m = mediaRef.current!;
    m.volume = state.volume;
    m.muted = state.muted;
    safeStorage.set(VOLUME_KEY, state.volume);
  }, [state.volume, state.muted]);

  // Media Session → lock screen / hardware media keys.
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? '',
      album: current.album ?? '',
      artwork: current.cover ? [{ src: publicUrl(current.cover) }] : [],
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => dispatch({ type: 'next' }));
    navigator.mediaSession.setActionHandler('previoustrack', () => dispatch({ type: 'prev' }));
  }, [current]);

  const play = useCallback(
    (index?: number) => {
      wantPlay.current = true;
      const m = mediaRef.current!;
      if (index !== undefined && index !== state.order[state.position]) {
        dispatch({ type: 'select', index });
        return; // the load effect will call play()
      }
      if (!m.getAttribute('src') && state.queue.length) {
        dispatch({ type: 'select', index: index ?? 0 });
        return;
      }
      m.play().catch(() => dispatch({ type: 'status', status: 'paused' }));
    },
    [state.order, state.position, state.queue.length],
  );

  const pause = useCallback(() => {
    wantPlay.current = false;
    mediaRef.current?.pause();
  }, []);

  const controls = useMemo<PlayerControls>(
    () => ({
      state,
      current,
      tracks: state.queue,
      play,
      pause,
      toggle: () => (mediaRef.current && !mediaRef.current.paused ? pause() : play()),
      next: () => {
        wantPlay.current = true;
        dispatch({ type: 'next' });
      },
      prev: () => {
        const m = mediaRef.current!;
        if (m.currentTime > 3) m.currentTime = 0;
        else {
          wantPlay.current = true;
          dispatch({ type: 'prev' });
        }
      },
      seek: (s) => {
        const m = mediaRef.current!;
        if (Number.isFinite(m.duration)) m.currentTime = Math.min(Math.max(0, s), m.duration);
      },
      setVolume: (v) => dispatch({ type: 'volume', volume: v }),
      toggleMute: () => dispatch({ type: 'toggleMute' }),
      mode: playMode(state),
      setMode: (mode) => dispatch({ type: 'setMode', mode }),
      move: (from, to) => {
        orderTouched.current = true;
        dispatch({ type: 'move', from, to });
      },
    }),
    [state, current, play, pause],
  );

  return (
    <ControlsContext.Provider value={controls}>
      <TimeContext.Provider value={time}>{children}</TimeContext.Provider>
    </ControlsContext.Provider>
  );
}

export function usePlayer(): PlayerControls {
  const ctx = useContext(ControlsContext);
  if (!ctx) throw new Error('usePlayer must be used inside <PlayerProvider>');
  return ctx;
}

export const usePlayerTime = () => useContext(TimeContext);
