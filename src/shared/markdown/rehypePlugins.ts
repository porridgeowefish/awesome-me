import type { Element, ElementContent, Root } from 'hast';
import { visit } from 'unist-util-visit';
import { createSlugger, texToText, type TocItem } from './slug';

function isMath(node: Element): boolean {
  const cls = node.properties?.className;
  return Array.isArray(cls) && cls.some((c) => String(c).startsWith('language-math') || String(c).startsWith('math-'));
}

function textOf(node: ElementContent | Root): string {
  if (node.type === 'text') return node.value;
  if (node.type === 'element' && isMath(node)) return texToText(node.children.map(textOf).join(''));
  if (node.type === 'element' || node.type === 'root') return node.children.map((c) => textOf(c as ElementContent)).join('');
  return '';
}

/**
 * Give every heading a stable id AND report the outline from the very same pass, so the table
 * of contents can never disagree with the rendered ids. Runs after sanitize, before KaTeX.
 */
export function rehypeHeadingIds(options: { onToc?: (items: TocItem[]) => void; minDepth?: number; maxDepth?: number } = {}) {
  const { onToc, minDepth = 2, maxDepth = 3 } = options;
  return (tree: Root) => {
    const slug = createSlugger();
    const toc: TocItem[] = [];
    visit(tree, 'element', (node: Element) => {
      const m = /^h([1-6])$/.exec(node.tagName);
      if (!m) return;
      const text = textOf(node).replace(/\s+/g, ' ').trim();
      const id = slug(text);
      node.properties = { ...node.properties, id };
      const depth = Number(m[1]);
      if (depth >= minDepth && depth <= maxDepth) toc.push({ id, text, depth });
    });
    onToc?.(toc);
  };
}

/** Rewrite relative src/poster so content bundles can reference their own ./assets/. */
export function rehypeResolveUrls(options: { resolve: (url: string) => string }) {
  const ATTRS = ['src', 'poster'];
  return (tree: Root) => {
    visit(tree, 'element', (node: Element) => {
      for (const attr of ATTRS) {
        const v = node.properties?.[attr];
        if (typeof v === 'string' && v) node.properties[attr] = options.resolve(v);
      }
    });
  };
}
