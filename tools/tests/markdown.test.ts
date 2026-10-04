import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import { sanitizeSchema } from '@/shared/markdown/schema';
import { rehypeHeadingIds, rehypeResolveUrls } from '@/shared/markdown/rehypePlugins';
import { classifyLink } from '@/shared/markdown/linkResolver';
import type { TocItem } from '@/shared/markdown/slug';
import { publicUrl, resolveRelative } from '@/shared/lib/url';

/** Same plugin order as MarkdownRenderer. */
async function render(md: string) {
  let toc: TocItem[] = [];
  const html = String(
    await unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath, { singleDollarTextMath: true })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeRaw)
      .use(rehypeSanitize, sanitizeSchema)
      .use(rehypeHeadingIds, { onToc: (t: TocItem[]) => (toc = t) })
      .use(rehypeKatex)
      .use(rehypeResolveUrls, { resolve: (u: string) => resolveRelative('content/essays/分类/a/index.md', u) })
      .use(rehypeStringify)
      .process(md),
  );
  return { html, toc };
}

describe('markdown pipeline', () => {
  it('outline ids always match rendered heading ids (incl. inline math & duplicates)', async () => {
    const { html, toc } = await render('## 地址转换 ($\\rightarrow$ 物理)\n\n## 重复\n\n## 重复\n\n### 小节');
    expect(toc.map((t) => t.text)).toEqual(['地址转换 (→ 物理)', '重复', '重复', '小节']);
    for (const item of toc) expect(html).toContain(`id="${item.id}"`);
    expect(new Set(toc.map((t) => t.id)).size).toBe(4);
  });

  it('strips scripts, event handlers, javascript: URLs and iframes but keeps rich text', async () => {
    const { html } = await render(
      '<script>alert(1)</script><img src="x.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a><iframe src="//evil"></iframe>\n\n<mark>hi</mark> <font color="red">red</font> <kbd>K</kbd>',
    );
    expect(html).not.toMatch(/<script|onerror|javascript:|<iframe/i);
    expect(html).toContain('<mark>hi</mark>');
    expect(html).toContain('<font color="red">red</font>');
    expect(html).toContain('<kbd>K</kbd>');
  });

  it('keeps inline SVG but drops its scripts', async () => {
    const { html } = await render('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/><script>x()</script></svg>');
    expect(html).toContain('<svg');
    expect(html).toContain('<rect');
    expect(html).not.toContain('<script');
  });

  it('resolves bundle-relative images to encoded public URLs', async () => {
    const { html } = await render('![a](./assets/图 1.png)'.replace(' ', '%20'));
    expect(html).toContain('src="/content/essays/%E5%88%86%E7%B1%BB/a/assets/%E5%9B%BE%201.png"');
  });
});

describe('links', () => {
  const base = 'content/essays/分类/a/index.md';
  it('classifies anchors, routes, external and file links', () => {
    expect(classifyLink('#intro', base)).toEqual({ kind: 'anchor', id: 'intro' });
    expect(classifyLink('#/essays/x', base)).toEqual({ kind: 'route', to: '/essays/x' });
    expect(classifyLink('https://a.com', base).kind).toBe('external');
    expect(classifyLink('../../b', base, () => '/essays/分类/b')).toEqual({ kind: 'route', to: '/essays/分类/b' });
    expect(classifyLink('./assets/f.pdf', base)).toEqual({ kind: 'file', href: '/content/essays/%E5%88%86%E7%B1%BB/a/assets/f.pdf' });
  });

  it('publicUrl encodes each segment exactly once', () => {
    expect(publicUrl('content/music/a b#1.mp3')).toBe('/content/music/a%20b%231.mp3');
    expect(publicUrl('content/music/a%20b.mp3')).toBe('/content/music/a%20b.mp3');
    expect(publicUrl('https://x.com/a b')).toBe('https://x.com/a b');
  });
});
