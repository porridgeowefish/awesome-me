import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { EssayIndex, EssayMeta, FolderNode } from '../../../src/shared/content/types.ts';

/**
 * Essays are "page bundles": every directory that contains an `index.md` is one essay.
 *   content/essays/<folder>/<sub-folder>/<slug>/index.md
 *   content/essays/<folder>/<sub-folder>/<slug>/assets/*
 * Folders may carry an optional `_meta.json` → { "title"?: string, "order"?: number }.
 */

const ESSAY_FILE = 'index.md';
const META_FILE = '_meta.json';

export interface FolderMeta {
  title?: string;
  order?: number;
}

export interface RawEssay {
  /** Path of the bundle directory relative to the essays root, using "/" separators. */
  dir: string;
  raw: string;
  mtime: Date;
}

// ---------------------------------------------------------------- pure functions

const CJK = /[㐀-鿿豈-﫿]/g;

/** Rough word count that treats each CJK character as a word. */
export function countWords(md: string): number {
  const text = md.replace(/```[\s\S]*?```/g, ' ').replace(/<[^>]+>/g, ' ');
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.replace(CJK, ' ').match(/[A-Za-z0-9]+/g)?.length ?? 0;
  return cjk + latin;
}

function toIsoDate(value: unknown, fallback: Date): string {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback.toISOString().slice(0, 10);
}

function firstParagraph(md: string, max = 90): string {
  const line = md
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 8 && !/^(#|!\[|<|\||---|\$\$|>)/.test(l));
  const text = (line ?? '').replace(/[*_`~]/g, '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Resolve a path written inside an essay (./assets/x.png) to a public URL path. */
export function resolveBundleUrl(publicPrefix: string, dir: string, rel: string): string {
  if (/^(https?:)?\/\//i.test(rel) || rel.startsWith('data:')) return rel;
  if (rel.startsWith('/')) return rel.slice(1);
  return path.posix.normalize(path.posix.join(publicPrefix, dir, rel));
}

export function parseEssay(input: RawEssay, publicPrefix: string, warnings: string[]): EssayMeta | null {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(input.raw, {}); // options object disables gray-matter's content cache (stale results in dev)
  } catch (err) {
    warnings.push(`[essays] ${input.dir}: frontmatter 解析失败 (${(err as Error).message})，已跳过`);
    return null;
  }
  const fm = parsed.data as Record<string, unknown>;
  const body = parsed.content;
  const segments = input.dir.split('/');
  const slug = segments[segments.length - 1];

  if (fm.draft === true) return null;

  const title =
    (typeof fm.title === 'string' && fm.title.trim()) ||
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    slug;
  if (!fm.title) warnings.push(`[essays] ${input.dir}: 缺少 title，已使用 "${title}"`);

  const words = countWords(body);
  const tags = Array.isArray(fm.tags) ? fm.tags.map(String) : typeof fm.tags === 'string' ? [fm.tags] : [];

  return {
    id: input.dir,
    title,
    subtitle: typeof fm.subtitle === 'string' ? fm.subtitle : undefined,
    summary: typeof fm.summary === 'string' && fm.summary ? fm.summary : firstParagraph(body),
    date: toIsoDate(fm.date, input.mtime),
    tags,
    folder: segments.slice(0, -1),
    bodyUrl: resolveBundleUrl(publicPrefix, input.dir, ESSAY_FILE),
    cover: typeof fm.cover === 'string' && fm.cover ? resolveBundleUrl(publicPrefix, input.dir, fm.cover) : undefined,
    featured: fm.featured === true || fm.featured === 'true',
    wordCount: words,
    readingMinutes: Math.max(1, Math.round(words / 400)),
    features: {
      mermaid: /```mermaid/.test(body),
      math: /\$\$|\$[^$\n]+\$/.test(body),
    },
  };
}

/** Build the folder tree from essay folder paths + optional folder metadata. */
export function buildTree(essays: EssayMeta[], folderMeta: Map<string, FolderMeta>): FolderNode {
  const root: FolderNode = { path: '', name: '全部', order: 0, count: 0, children: [] };
  const byPath = new Map<string, FolderNode>([['', root]]);

  const ensure = (segments: string[]): FolderNode => {
    const key = segments.join('/');
    const existing = byPath.get(key);
    if (existing) return existing;
    const parent = ensure(segments.slice(0, -1));
    const meta = folderMeta.get(key) ?? {};
    const node: FolderNode = {
      path: key,
      name: meta.title ?? segments[segments.length - 1],
      order: meta.order ?? Number.MAX_SAFE_INTEGER,
      count: 0,
      children: [],
    };
    parent.children.push(node);
    byPath.set(key, node);
    return node;
  };

  for (const essay of essays) {
    ensure(essay.folder);
    for (let i = 0; i <= essay.folder.length; i++) byPath.get(essay.folder.slice(0, i).join('/'))!.count++;
  }

  const sort = (node: FolderNode) => {
    node.children.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'));
    node.children.forEach(sort);
  };
  sort(root);
  return root;
}

export function buildEssayIndex(raws: RawEssay[], folderMeta: Map<string, FolderMeta>, publicPrefix: string): EssayIndex {
  const warnings: string[] = [];
  const essays = raws
    .map((r) => parseEssay(r, publicPrefix, warnings))
    .filter((e): e is EssayMeta => e !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title, 'zh-CN'));
  return { essays, tree: buildTree(essays, folderMeta), warnings };
}

// ---------------------------------------------------------------- filesystem adapter

export function scanEssays(root: string): { raws: RawEssay[]; folderMeta: Map<string, FolderMeta>; warnings: string[] } {
  const raws: RawEssay[] = [];
  const folderMeta = new Map<string, FolderMeta>();
  const warnings: string[] = [];
  if (!fs.existsSync(root)) return { raws, folderMeta, warnings };

  const walk = (abs: string, rel: string) => {
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    if (entries.some((e) => e.isFile() && e.name === ESSAY_FILE) && rel) {
      const file = path.join(abs, ESSAY_FILE);
      raws.push({ dir: rel, raw: fs.readFileSync(file, 'utf8'), mtime: fs.statSync(file).mtime });
      return; // a bundle never contains nested essays
    }
    const metaFile = entries.find((e) => e.isFile() && e.name === META_FILE);
    if (metaFile && rel) {
      try {
        folderMeta.set(rel, JSON.parse(fs.readFileSync(path.join(abs, META_FILE), 'utf8')));
      } catch {
        warnings.push(`[essays] ${rel}/${META_FILE} 不是合法 JSON，已忽略`);
      }
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_') && e.name !== 'assets') {
        walk(path.join(abs, e.name), rel ? `${rel}/${e.name}` : e.name);
      }
    }
  };
  walk(root, '');
  return { raws, folderMeta, warnings };
}
