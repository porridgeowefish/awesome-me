import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { siteDefaults } from '../../src/data/siteDefaults';
import { siteSchema } from '../../src/contracts/content';

const state = vi.hoisted(() => ({ play: undefined as undefined | { game: boolean; avatar: boolean } }));
vi.mock('@/shared/content/runtime', () => ({
  useSiteContent: () => ({ profile: { name: 'Example', headline: 'Demo' }, copy: (key: string) => key, settings: { play: state.play } }),
}));
vi.mock('@/features/me/game/TrailRunner', () => ({ TrailRunner: () => createElement('div', null, 'RUNNER_TEST') }));
vi.mock('@/features/me/avatar/PixelAvatar', () => ({ PixelAvatar: () => null }));
vi.mock('@/features/me/profile/ProfileSection', () => ({ ProfileSection: () => null }));
import MePage from '../../src/features/me/MePage';

afterEach(() => { state.play = undefined; });
describe('optional game in an open-source installation', () => {
  it('starts with the game disabled in seed data and schema defaults', () => {
    expect(siteDefaults.play.game).toBe(false);
    const { play: _play, ...legacy } = siteDefaults;
    expect(siteSchema.parse(legacy).play.game).toBe(false);
  });
  it('keeps the game hidden when older site settings omit the play switch', () => {
    expect(renderToStaticMarkup(createElement(MePage))).not.toContain('RUNNER_TEST');
  });
  it('honors explicit opt-in and opt-out', () => {
    state.play = { game: true, avatar: false };
    expect(renderToStaticMarkup(createElement(MePage))).toContain('RUNNER_TEST');
    state.play.game = false;
    expect(renderToStaticMarkup(createElement(MePage))).not.toContain('RUNNER_TEST');
  });
});
