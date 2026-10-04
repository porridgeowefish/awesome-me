import { describe, expect, it } from 'vitest';
import { convertObsidian, extractDate, extractTitle, safeFileName, summarize } from '../scripts/lib/obsidian.mjs';

describe('obsidian import', () => {
  it('rewrites wiki images, links, highlights and callouts', () => {
    const { markdown, images } = convertObsidian(
      '![[Pasted image 1.png]]\n![[x.png|300]]\n见 [[Note|别名]] 和 [[Other#H]]\n==重点== 与 A <==> B\n> [!tip] 提示\n```\n==code== ![[keep.png]]\n```',
    );
    expect(markdown).toContain('![](./assets/Pasted-image-1.png)');
    expect(markdown).toContain('<img src="./assets/x.png" width="300"');
    expect(markdown).toContain('见 别名 和 Other');
    expect(markdown).toContain('<mark>重点</mark>');
    expect(markdown).toContain('A <==> B');
    expect(markdown).toContain('> **提示**');
    expect(markdown).toContain('==code== ![[keep.png]]'); // code blocks untouched
    expect(images.map((i: { original: string }) => i.original)).toEqual(['Pasted image 1.png', 'x.png']);
  });

  it('extracts title, date and summary', () => {
    expect(extractTitle('# 标题\n\n正文').title).toBe('标题');
    expect(extractDate('**学习日期**：2026-3-6')).toBe('2026-03-06');
    expect(summarize('# t\n\n这是第一段比较长的正文内容。\n\n```\ncode\n```')).toBe('这是第一段比较长的正文内容。');
  });

  it('makes file names URL safe', () => {
    expect(safeFileName('Pasted image 2025#1.png')).toBe('Pasted-image-20251.png');
  });
});
