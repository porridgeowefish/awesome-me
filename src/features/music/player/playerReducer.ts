import type { Track } from '@/shared/content/types';

/** Pure player state machine — no DOM here, so it is fully unit-testable. */
export type RepeatMode = 'all' | 'one';
/** What the UI offers: 列表循环 (default, head-to-tail) / 单曲循环 / 随机. */
export type PlayMode = 'loop' | 'one' | 'shuffle';
export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface PlayerState {
  queue: Track[];
  /** Index into `order`, not into `queue`. */
  position: number;
  /** Play order (indices into queue) — identity or shuffled. */
  order: number[];
  status: PlayStatus;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  error: string | null;
  /** Bumped whenever the same track should restart (repeat-one, replay). */
  nonce: number;
}

export type PlayerAction =
  | { type: 'setQueue'; queue: Track[] }
  | { type: 'syncQueue'; queue: Track[] }
  | { type: 'select'; index: number }
  | { type: 'next'; auto?: boolean }
  | { type: 'prev' }
  | { type: 'status'; status: PlayStatus; error?: string }
  | { type: 'setMode'; mode: PlayMode; seed?: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'volume'; volume: number }
  | { type: 'toggleMute' };

export const initialPlayerState: PlayerState = {
  queue: [],
  position: 0,
  order: [],
  status: 'idle',
  repeat: 'all',
  shuffle: false,
  volume: 0.8,
  muted: false,
  error: null,
  nonce: 0,
};

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Deterministic Fisher–Yates (seeded) so tests are reproducible; keeps `first` at the front. */
export function shuffledOrder(n: number, first: number, seed = Date.now()): number[] {
  const rest = identity(n).filter((i) => i !== first);
  let s = seed >>> 0 || 1;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return n ? [first, ...rest] : [];
}

export function playMode(state: PlayerState): PlayMode {
  if (state.shuffle) return 'shuffle';
  return state.repeat === 'one' ? 'one' : 'loop';
}

/** Sort tracks by a previously saved list of ids; unknown ids are ignored, new tracks go last. */
export function applySavedOrder(tracks: Track[], ids: unknown): Track[] {
  if (!Array.isArray(ids)) return tracks;
  const rank = new Map(ids.map((id, i) => [String(id), i]));
  return tracks
    .map((t, i) => ({ t, i }))
    .sort((a, b) => (rank.get(a.t.id) ?? Infinity) - (rank.get(b.t.id) ?? Infinity) || a.i - b.i)
    .map((x) => x.t);
}

export function currentTrack(state: PlayerState): Track | null {
  const idx = state.order[state.position];
  return idx === undefined ? null : (state.queue[idx] ?? null);
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  const n = state.queue.length;
  switch (action.type) {
    case 'syncQueue': {
      if (JSON.stringify(state.queue) === JSON.stringify(action.queue)) return state;
      const playing = currentTrack(state);
      const index = playing ? action.queue.findIndex(t => t.id === playing.id && t.src === playing.src) : -1;
      const retained = index >= 0;
      const order = state.shuffle ? shuffledOrder(action.queue.length, retained ? index : 0) : identity(action.queue.length);
      return { ...state, queue: action.queue, order, position: retained ? order.indexOf(index) : 0, status: retained ? state.status : 'idle', error: retained ? state.error : null, nonce: retained ? state.nonce : state.nonce + 1 };
    }
    case 'setQueue': {
      const order = identity(action.queue.length);
      return { ...state, queue: action.queue, order, position: 0, status: 'idle', error: null, shuffle: false };
    }
    case 'select': {
      if (action.index < 0 || action.index >= n) return state;
      const order = state.shuffle ? shuffledOrder(n, action.index) : identity(n);
      return { ...state, order, position: order.indexOf(action.index), status: 'loading', error: null, nonce: state.nonce + 1 };
    }
    case 'next': {
      if (!n) return state;
      if (action.auto && state.repeat === 'one') return { ...state, status: 'loading', nonce: state.nonce + 1 };
      const last = state.position >= n - 1; // the list always wraps: head-to-tail loop
      return { ...state, position: last ? 0 : state.position + 1, status: 'loading', error: null, nonce: state.nonce + 1 };
    }
    case 'prev': {
      if (!n) return state;
      return { ...state, position: state.position <= 0 ? n - 1 : state.position - 1, status: 'loading', error: null, nonce: state.nonce + 1 };
    }
    case 'status':
      return { ...state, status: action.status, error: action.status === 'error' ? (action.error ?? '无法播放') : null };
    case 'setMode': {
      const playing = state.order[state.position] ?? 0;
      const shuffle = action.mode === 'shuffle';
      const repeat: RepeatMode = action.mode === 'one' ? 'one' : 'all';
      if (!n) return { ...state, shuffle, repeat };
      const order = shuffle ? (state.shuffle ? state.order : shuffledOrder(n, playing, action.seed)) : identity(n);
      return { ...state, shuffle, repeat, order, position: order.indexOf(playing) };
    }
    case 'move': {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= n || to >= n) return state;
      const playingTrack = currentTrack(state);
      const queue = state.queue.slice();
      const [item] = queue.splice(from, 1);
      queue.splice(to, 0, item);
      const playingIndex = playingTrack ? queue.indexOf(playingTrack) : 0;
      const order = state.shuffle ? shuffledOrder(n, playingIndex, state.nonce + n) : identity(n);
      return { ...state, queue, order, position: Math.max(0, order.indexOf(playingIndex)) };
    }
    case 'volume':
      return { ...state, volume: Math.min(1, Math.max(0, action.volume)), muted: false };
    case 'toggleMute':
      return { ...state, muted: !state.muted };
    default:
      return state;
  }
}
