import { getSiteContent } from '@/shared/content/runtime';
import type { EssayMeta, FolderNode } from '@/shared/content/types';
import { publicUrl, safeDecode } from '@/shared/lib/url';

/**
 * Read-side access to essays (Repository pattern). UI components never touch the virtual
 * module or fetch() directly, so the storage could later move to a CMS/API without UI changes.
 */
const index = () => getSiteContent().essays;
const bodyCache = new Map<string, Promise<string>>();

export const essayRepository = {
  all(): EssayMeta[] {
    return index().essays;
  },

  tree(): FolderNode {
    return index().tree;
  },

  get(id: string): EssayMeta | undefined {
    return index().essays.find(e => e.id === id);
  },

  /** Essays inside `folder` (including sub-folders); "" = everything. */
  inFolder(folder: string): EssayMeta[] {
    if (!folder) return index().essays;
    return index().essays.filter((e) => {
      const p = e.folder.join('/');
      return p === folder || p.startsWith(`${folder}/`);
    });
  },

  search(list: EssayMeta[], query: string): EssayMeta[] {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const terms = q.split(/\s+/);
    return list.filter((e) => {
      const hay = [e.title, e.subtitle, e.summary, e.tags.join(' '), e.folder.join(' ')].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  },

  /** Headline essay: the first one marked `featured`, otherwise the newest. */
  featured(): EssayMeta | undefined {
    return index().essays.find((e) => e.featured) ?? index().essays[0];
  },

  /** Previous / next essay in the global (date-sorted) order. */
  neighbours(id: string): { prev?: EssayMeta; next?: EssayMeta } {
    const list = index().essays;
    const i = list.findIndex((e) => e.id === id);
    return i < 0 ? {} : { prev: list[i + 1], next: list[i - 1] };
  },

  /** Fetch (and memoise) the markdown body. Strips YAML frontmatter. */
  body(meta: EssayMeta): Promise<string> {
    const cacheKey = `${getSiteContent().revision}:${meta.id}`;
    let p = bodyCache.get(cacheKey);
    if (!p) {
      p = fetch(publicUrl(meta.bodyUrl))
        .then((r) => {
          if (!r.ok) throw new Error(`文章加载失败（HTTP ${r.status}）`);
          return r.text();
        })
        .then((text) => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, ''));
      p.catch(() => bodyCache.delete(cacheKey)); // allow retry after failures
      if (bodyCache.size > 50) bodyCache.clear();
      bodyCache.set(cacheKey, p);
    }
    return p;
  },
};

/** URL path of an essay page (each segment encoded: folder names may contain #, ? or spaces). */
export const essayHref = (e: Pick<EssayMeta, 'id'>) => `/essays/${e.id.split('/').map(encodeURIComponent).join('/')}`;

const ESSAYS_PREFIX = 'content/essays/';

/**
 * Turns links written inside an essay into app routes when they point at another essay:
 *   ../other-essay/            ../other-essay/index.md          /essays/分类/slug
 */
export function essayRouteResolver(current: EssayMeta) {
  return (href: string): string | null => {
    const clean = href.split('#')[0].split('?')[0];
    if (!clean) return null;
    if (clean.startsWith('/essays/')) return clean;
    if (/^([a-z]+:)?\/\//i.test(clean) || clean.startsWith('/')) return null;
    const parts = current.bodyUrl.split('/').slice(0, -1);
    for (const seg of clean.split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(safeDecode(seg));
    }
    if (parts[parts.length - 1] === 'index.md') parts.pop();
    const path = parts.join('/');
    if (!path.startsWith(ESSAYS_PREFIX)) return null;
    const target = essayRepository.get(path.slice(ESSAYS_PREFIX.length));
    return target ? essayHref(target) : null;
  };
}

