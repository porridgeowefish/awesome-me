import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { assetUrlSchema, essaySchema } from '../../src/contracts/content.ts';
import { AppError } from '../errors.ts';

interface Node { type: string; url?: string; value?: string; identifier?: string; label?: string; alt?: string; title?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: Node[] }
export function parseMarkdownImport(source: string, filename: string, replacements: Record<string, string> = {}) {
  const clean = source.replace(/^\uFEFF/, '');
  if (clean.startsWith('---') && !/^---(?:yaml)?[ \t]*(?:\r?\n|$)/.test(clean)) throw new AppError(400, 'INVALID_YAML', '文档头仅支持 YAML，请使用 --- 分隔。');
  let parsed: ReturnType<typeof matter>;
  try { parsed = matter(clean, { language: 'yaml' }); } catch { throw new AppError(400, 'INVALID_YAML', 'YAML 头格式有误，请检查缩进和引号。'); }
  if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) throw new AppError(400, 'INVALID_YAML', 'YAML 头需使用字段名与值组成的对象。');
  const images = new Set<string>();
  const edits: { start: number; end: number; value: string }[] = [];
  const resolve = (url: string) => {
    if (replacements[url]) return assetUrlSchema.parse(replacements[url]);
    if (!/^(?:https?:\/\/|\/api\/|\/images\/)/i.test(url)) images.add(url);
    return url;
  };
  const body = parsed.content;
  const tree = unified().use(remarkParse).use(remarkMath).parse(body) as Node;
  const imageReferences = new Set<string>();
  const findReferences = (node: Node) => { if (node.type === 'imageReference' && node.identifier) imageReferences.add(node.identifier); node.children?.forEach(findReferences); };
  findReferences(tree);
  const walk = (node: Node) => {
    const start = node.position?.start.offset, end = node.position?.end.offset;
    if ((node.type === 'image' || node.type === 'definition' && imageReferences.has(node.identifier ?? '')) && node.url && start !== undefined && end !== undefined) {
      const next = resolve(node.url);
      if (next !== node.url) {
        const title = node.title ? ` "${node.title.replace(/"/g, '\\"')}"` : '';
        const value = node.type === 'image' ? `![${(node.alt ?? '').replace(/[\[\]\\]/g, '\\$&')}](${next}${title})` : `[${node.label ?? node.identifier}]: ${next}${title}`;
        edits.push({ start, end, value });
      }
    } else if (node.type === 'html' && node.value && start !== undefined && end !== undefined) {
      const next = node.value.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi, (_all, prefix, quote, url) => `${prefix}${quote}${resolve(url)}${quote}`);
      if (next !== node.value) edits.push({ start, end, value: next });
    }
    if (!['code', 'inlineCode', 'math', 'inlineMath'].includes(node.type)) node.children?.forEach(walk);
  };
  walk(tree);
  let rewritten = body;
  for (const edit of edits.sort((a, b) => b.start - a.start)) rewritten = rewritten.slice(0, edit.start) + edit.value + rewritten.slice(edit.end);
  const meta = parsed.data;
  const publicPath = String(meta.publicPath ?? meta.path ?? filename.replace(/\.(md|markdown)$/i, ''));
  const date = meta.date instanceof Date ? meta.date.toISOString().slice(0, 10) : meta.date ?? new Date().toISOString().slice(0, 10);
  const data = essaySchema.parse({
    title: meta.title ?? filename.replace(/\.(md|markdown)$/i, ''), publicPath, date,
    subtitle: meta.subtitle ?? '', summary: meta.summary ?? '', tags: meta.tags ?? [], folder: publicPath.split('/').slice(0, -1),
    ...(meta.cover ? { cover: resolve(String(meta.cover)) } : {}), featured: meta.featured ?? false, body: rewritten, status: 'draft',
  });
  return { data, images: [...images], warnings: Object.keys(meta).filter(key => !['title', 'publicPath', 'path', 'date', 'subtitle', 'summary', 'tags', 'folder', 'cover', 'featured', 'status', 'draft'].includes(key)).map(key => `YAML 字段 ${key} 未用于文章设置。`) };
}
