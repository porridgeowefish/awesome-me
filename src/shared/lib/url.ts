/**
 * Build a URL for a file under /public, honouring Vite's BASE_URL and encoding
 * non-ASCII path segments exactly once (content paths contain Chinese folder names).
 */
export function publicUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  const clean = path.replace(/^\/+/, '');
  const encoded = clean
    .split('/')
    .map((seg) => encodeURIComponent(safeDecode(seg)))
    .join('/');
  return `${import.meta.env.BASE_URL}${encoded}`;
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Resolve `rel` (as written inside a markdown file) against the markdown file's own URL path. */
export function resolveRelative(baseFile: string, rel: string): string {
  if (/^([a-z]+:)?\/\//i.test(rel) || /^(data|blob|mailto|tel):/i.test(rel) || rel.startsWith('#')) return rel;
  if (rel.startsWith('/')) return publicUrl(rel);
  const parts = baseFile.split('/').slice(0, -1);
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return publicUrl(parts.join('/'));
}
