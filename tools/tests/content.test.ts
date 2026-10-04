import { describe, expect, it } from 'vitest';
import { buildEssayIndex, countWords, resolveBundleUrl } from '../build/content/essays.ts';
import { buildMusicIndex, parseFileName } from '../build/content/music.ts';

const essay = (dir: string, fm: string, body = '正文内容足够长的一段话。') => ({
  dir,
  raw: `---\n${fm}\n---\n\n${body}`,
  mtime: new Date('2026-01-01'),
});

describe('essay index', () => {
  it('builds metadata, a sorted list and a folder tree with counts', () => {
    const idx = buildEssayIndex(
      [
        essay('A/x', 'title: X\ndate: 2026-03-01\ntags: [t1]'),
        essay('A/sub/y', 'title: Y\ndate: 2026-05-01\ncover: ./assets/c.png'),
        essay('B/z', 'title: Z\ndate: 2025-01-01\nfeatured: true'),
      ],
      new Map([['B', { order: 1, title: '乙' }]]),
      'content/essays',
    );
    expect(idx.essays.map((e) => e.title)).toEqual(['Y', 'X', 'Z']);
    expect(idx.tree.count).toBe(3);
    expect(idx.tree.children.map((c) => c.name)).toEqual(['乙', 'A']); // ordered by _meta
    expect(idx.tree.children[1].children[0].count).toBe(1);
    const y = idx.essays[0];
    expect(y.cover).toBe('content/essays/A/sub/y/assets/c.png');
    expect(y.bodyUrl).toBe('content/essays/A/sub/y/index.md');
    expect(idx.essays.find((e) => e.title === 'Z')?.featured).toBe(true);
  });

  it('falls back gracefully on missing metadata and skips drafts', () => {
    const idx = buildEssayIndex(
      [essay('A/no-title', 'tags: x', '# 来自正文的标题\n\n内容内容内容内容'), essay('A/draft', 'title: D\ndraft: true')],
      new Map(),
      'content/essays',
    );
    expect(idx.essays).toHaveLength(1);
    expect(idx.essays[0].title).toBe('来自正文的标题');
    expect(idx.essays[0].date).toBe('2026-01-01');
    expect(idx.warnings.length).toBeGreaterThan(0);
  });

  it('detects features used by the body', () => {
    const idx = buildEssayIndex([essay('A/f', 'title: F', '```mermaid\ngraph TD\n```\n\n$$x$$\n\n<svg></svg>')], new Map(), 'c');
    expect(idx.essays[0].features).toMatchObject({ mermaid: true, math: true });
  });

  it('counts CJK characters as words', () => {
    expect(countWords('你好 world')).toBe(3);
  });

  it('leaves absolute URLs untouched', () => {
    expect(resolveBundleUrl('c', 'a', 'https://x.com/a.png')).toBe('https://x.com/a.png');
  });
});

describe('music index', () => {
  it('discovers media, sidecars, covers and honours playlist order', () => {
    const files = ['b.mp3', 'a - Song.mp4', 'a - Song.jpg', 'b.json', 'playlist.json', 'notes.txt'];
    const json: Record<string, unknown> = { 'b.json': { title: 'Bee', artist: 'Me' }, 'playlist.json': ['b.mp3', 'missing.mp3'] };
    const idx = buildMusicIndex({ files, readJson: (f) => json[f] }, 'content/music');
    expect(idx.tracks.map((t) => t.title)).toEqual(['Bee', 'Song']);
    expect(idx.tracks[1]).toMatchObject({ artist: 'a', cover: 'content/music/a - Song.jpg', src: 'content/music/a - Song.mp4' });
    expect(idx.warnings.some((w) => w.includes('missing.mp3'))).toBe(true);
  });

  it('parses "artist - title" file names', () => {
    expect(parseFileName('01 - 林俊杰 - 江南.mp3')).toEqual({ artist: '林俊杰', title: '江南' });
    expect(parseFileName('demo.mp3')).toEqual({ title: 'demo' });
  });
});
