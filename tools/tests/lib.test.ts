import { describe, expect, it } from 'vitest';
import { ringOffset } from '@/shared/lib/ring';
import { createSlugger, texToText } from '@/shared/markdown/slug';

describe('ringOffset', () => {
  it('wraps around both directions', () => {
    expect([0, 1, 2, 3, 4].map((i) => ringOffset(i, 0, 5))).toEqual([0, 1, 2, -2, -1]);
    expect(ringOffset(0, 4, 5)).toBe(1);
    expect(ringOffset(0, 0, 0)).toBe(0);
  });
});

describe('toc', () => {
  it('slugs keep CJK and are de-duplicated', () => {
    const s = createSlugger();
    expect(s('一、核心 概念')).toBe('一核心-概念');
    expect(s('一、核心 概念')).toBe('一核心-概念-1');
  });
  it('turns inline TeX into readable text', () => {
    expect(texToText('\\rightarrow')).toBe('→');
    expect(texToText('O(n^{2})')).toBe('O(n2)');
  });
});
