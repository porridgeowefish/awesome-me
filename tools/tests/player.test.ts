import { describe, expect, it } from 'vitest';
import { applySavedOrder, currentTrack, initialPlayerState, playerReducer, playMode, shuffledOrder, type PlayerState } from '@/features/music/player/playerReducer';
import type { Track } from '@/shared/content/types';

const tracks: Track[] = ['a', 'b', 'c'].map((id) => ({ id, title: id, src: `${id}.mp3` }));
const withQueue = (): PlayerState => playerReducer(initialPlayerState, { type: 'setQueue', queue: tracks });

describe('player reducer', () => {
  it('retains the playing track and playback nonce when runtime content is reordered or edited', () => {
    let s = playerReducer(withQueue(), { type: 'select', index: 1 });
    s = playerReducer(s, { type: 'status', status: 'playing' });
    const nonce = s.nonce;
    s = playerReducer(s, { type: 'syncQueue', queue: [tracks[2], { ...tracks[1], title: 'New title' }, tracks[0]] });
    expect(currentTrack(s)?.id).toBe('b'); expect(s.status).toBe('playing'); expect(s.nonce).toBe(nonce);
    s = playerReducer(s, { type: 'syncQueue', queue: [tracks[0]] });
    expect(s.status).toBe('idle'); expect(currentTrack(s)?.id).toBe('a');
  });
  it('defaults to head-to-tail looping', () => {
    let s = playerReducer(withQueue(), { type: 'select', index: 2 });
    expect(playMode(s)).toBe('loop');
    s = playerReducer(s, { type: 'next', auto: true });
    expect(currentTrack(s)?.id).toBe('a');
    s = playerReducer(s, { type: 'prev' });
    expect(currentTrack(s)?.id).toBe('c');
  });

  it('single-track mode restarts the same track on auto-advance, but manual next still moves on', () => {
    let s = playerReducer(withQueue(), { type: 'select', index: 1 });
    s = playerReducer(s, { type: 'setMode', mode: 'one' });
    const nonce = s.nonce;
    s = playerReducer(s, { type: 'next', auto: true });
    expect(currentTrack(s)?.id).toBe('b');
    expect(s.nonce).toBe(nonce + 1);
    s = playerReducer(s, { type: 'next' });
    expect(currentTrack(s)?.id).toBe('c');
  });

  it('shuffle keeps the current track and visits every track', () => {
    let s = playerReducer(withQueue(), { type: 'select', index: 1 });
    s = playerReducer(s, { type: 'setMode', mode: 'shuffle', seed: 7 });
    expect(playMode(s)).toBe('shuffle');
    expect(currentTrack(s)?.id).toBe('b');
    expect([...s.order].sort()).toEqual([0, 1, 2]);
    s = playerReducer(s, { type: 'setMode', mode: 'loop' });
    expect(s.order).toEqual([0, 1, 2]);
    expect(currentTrack(s)?.id).toBe('b');
  });

  it('reordering keeps the playing track and changes what comes next', () => {
    let s = playerReducer(withQueue(), { type: 'select', index: 0 }); // a
    s = playerReducer(s, { type: 'move', from: 2, to: 1 }); // a, c, b
    expect(s.queue.map((t) => t.id)).toEqual(['a', 'c', 'b']);
    expect(currentTrack(s)?.id).toBe('a');
    s = playerReducer(s, { type: 'next' });
    expect(currentTrack(s)?.id).toBe('c');
    s = playerReducer(s, { type: 'move', from: 1, to: 0 }); // move the playing track itself
    expect(currentTrack(s)?.id).toBe('c');
    expect(playerReducer(s, { type: 'move', from: 0, to: 9 })).toBe(s); // out of range → no-op
  });

  it('applies a saved order, ignoring unknown ids and appending new tracks', () => {
    expect(applySavedOrder(tracks, ['c', 'zzz', 'a']).map((t) => t.id)).toEqual(['c', 'a', 'b']);
    expect(applySavedOrder(tracks, 'garbage')).toBe(tracks);
  });

  it('handles an empty playlist gracefully', () => {
    let s = playerReducer(initialPlayerState, { type: 'next' });
    s = playerReducer(s, { type: 'setMode', mode: 'shuffle' });
    s = playerReducer(s, { type: 'move', from: 0, to: 1 });
    expect(currentTrack(s)).toBeNull();
  });

  it('shuffledOrder is a permutation that starts with the given track', () => {
    const o = shuffledOrder(10, 4, 123);
    expect(o[0]).toBe(4);
    expect([...o].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('clamps volume', () => {
    expect(playerReducer(initialPlayerState, { type: 'volume', volume: 3 }).volume).toBe(1);
  });
});
