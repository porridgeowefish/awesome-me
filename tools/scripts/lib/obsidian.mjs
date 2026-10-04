// Pure transformation helpers for turning an Obsidian note into a site essay.
// Kept free of filesystem access so they can be unit tested (see tests/obsidian.test.ts).

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

/** Make a filename safe for URLs and every OS: spaces → '-', strip reserved characters. */
export function safeFileName(name) {
  return name
    .normalize('NFC')
    .replace(/[\s]+/g, '-')
    .replace(/[<>:"/\\|?*#%&{}$!'`@+=]/g, '')
    .replace(/-+/g, '-');
}

/** Split text into fenced-code and prose segments so rewrites never touch code blocks. */
export function splitFences(md) {
  const parts = [];
  let last = 0, start = null, marker = '', length = 0;
  for (const line of md.matchAll(/[^\n]*(?:\n|$)/g)) {
    if (!line[0]) continue;
    const match = /^ {0,3}(`{3,}|~{3,})(.*?)(?:\r?\n)?$/.exec(line[0]);
    if (!match) continue;
    if (start === null) {
      if (match[1][0] === '`' && match[2].includes('`')) continue;
      start = line.index; marker = match[1][0]; length = match[1].length;
      if (start > last) parts.push({code:false,text:md.slice(last,start)});
    } else if (match[1][0] === marker && match[1].length >= length && !match[2].trim()) {
      last = line.index + line[0].length;
      parts.push({code:true,text:md.slice(start,last)}); start = null;
    }
  }
  if (start !== null) parts.push({code:true,text:md.slice(start)});
  else if (last < md.length) parts.push({code:false,text:md.slice(last)});
  return parts;
}

function mapProse(md, fn, protectedRanges = []) {
  let offset = 0;
  const ranges = [...protectedRanges];
  for (const part of splitFences(md)) {
    if (part.code) ranges.push({start:offset,end:offset+part.text.length});
    offset += part.text.length;
  }
  const merged = [];
  for (const range of ranges.sort((a,b)=>a.start-b.start)) {
    if (merged.length && range.start <= merged.at(-1).end) merged.at(-1).end = Math.max(merged.at(-1).end,range.end);
    else merged.push({...range});
  }
  let last = 0, result = '';
  for (const range of merged) { result += fn(md.slice(last,range.start))+md.slice(range.start,range.end); last=range.end; }
  return result+fn(md.slice(last));
}

/** Remove comments opened in prose, including code/math syntax inside the comment. */
export function stripObsidianComments(md, protectedRanges = /** @type {{start:number,end:number}[]} */ ([]) ) {
  const marks=[...md.matchAll(/%%/g)].map(match=>match.index);
  let last=0, result='';
  for(let i=0;i<marks.length;i++) {
    const start=marks[i];
    if(protectedRanges.some(range=>start>=range.start&&start<range.end))continue;
    const end=i+1<marks.length?marks[++i]+2:md.length;
    result+=md.slice(last,start);last=end;
  }
  return result+md.slice(last);
}

/**
 * Rewrite Obsidian-specific syntax to portable Markdown.
 * Returns the new markdown plus the list of image references that must be copied.
 */
export function convertObsidian(md, { stripLinePatterns = [], preserveImagePaths = false, protectedRanges = /** @type {{start:number,end:number}[]} */ ([]) } = {}) {
  const images = [];
  const addImage = (raw) => {
    if (preserveImagePaths) return raw.trim().split('/').map(segment => encodeURIComponent(decodeURIComponent(segment))).join('/');
    const clean = decodeURIComponent(raw.trim()).split('/').pop();
    const target = safeFileName(clean);
    if (!images.some((i) => i.original === clean)) images.push({ original: clean, target });
    return `./assets/${encodeURI(target)}`;
  };

  let out = md.replace(/\r\n/g, '\n');

  const strip = stripLinePatterns.map((p) => new RegExp(p, 'gm'));
  out = mapProse(out, (text) => {
    let t = text;
    for (const re of strip) t = t.replace(re, '');

    // ![[image.png|300]]  → ![](./assets/image.png)
    t = t.replace(/!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g, (all, target, alias) => {
      if (!IMAGE_EXT.test(target)) return alias || target; // embedded note → plain text
      const width = alias && /^\d+$/.test(alias.trim()) ? alias.trim() : null;
      const url = addImage(target);
      return width ? `<img src="${url}" width="${width}" alt="" />` : `![](${url})`;
    });

    // ![alt](relative/image.png) → copy local images too (skip remote URLs)
    t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (all, alt, url, title = '') => {
      if (preserveImagePaths || /^(https?:|data:)/i.test(url) || url.startsWith('./assets') || !IMAGE_EXT.test(url)) return all;
      return `![${alt}](${addImage(url)}${title})`;
    });

    // [[Note|Alias]] / [[Note#Heading]] → Alias / Note
    t = t.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (all, note, alias) => alias || note);

    // ==highlight== → <mark>, only when both markers sit on one line and are not arrows like <==>
    t = t.replace(/(^|[^<=])==([^=\n<>][^=\n]*?)==(?!>)/g, '$1<mark>$2</mark>');

    // Obsidian callouts: > [!note] Title  → > **Title**
    t = t.replace(/^>\s*\[!(\w+)\][+-]?\s*(.*)$/gm, (all, kind, title) => `> **${title || kind.toUpperCase()}**`);

    // %% comments %%
    t = t.replace(/%%[\s\S]*?%%/g, '');
    return t;
  }, protectedRanges);

  out = out.replace(/^\s*(?:-{3,}\s*\n\s*)+/, ''); // leading horizontal rules left behind after stripping
  return { markdown: out.endsWith('\n') ? out : out+'\n', images };
}

/** Remove the first level-1 heading (it becomes the frontmatter title). */
export function extractTitle(md) {
  let offset = 0;
  for (const segment of splitFences(md)) {
    if (!segment.code) {
      const m = /^ {0,3}#\s+(.+?)\s*#*\s*$/m.exec(segment.text);
      if (m && offset + m.index <= 200) return {title:m[1].replace(/\*\*/g,'').trim(),body:(md.slice(0,offset+m.index)+md.slice(offset+m.index+m[0].length)).replace(/^\s+/,'')};
    }
    offset += segment.text.length;
  }
  return {title:null,body:md};
}

/** Find a "学习日期 / 时间 / 日期" style date in the first lines of a note. */
export function extractDate(md) {
  const head = md.slice(0, 600);
  const m =
    head.match(/(?:学习日期|日期|时间|更新日期)[^\d]{0,6}(\d{4})[-./年](\d{1,2})[-./月](\d{1,2})/) ||
    head.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Plain-text summary of the first meaningful paragraph. */
export function summarize(md, max = 90) {
  const prose = splitFences(md)
    .filter((p) => !p.code)
    .map((p) => p.text)
    .join('\n');
  const lines = prose
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(#|!\[|<img|\||---|```|\$\$|>?\s*$)/.test(l))
    .map((l) =>
      l
        .replace(/^>\s*/, '')
        .replace(/^[-*+]\s+|^\d+\.\s+/, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/[*_`~$]/g, '')
        .trim(),
    )
    .filter((l) => l.length > 8 && !/^(学习日期|日期|时间|BY:|更新)/i.test(l));
  const text = lines.slice(0, 3).join(' ');
  return text.length > max ? text.slice(0, max).replace(/[，。、；：,.;:\s]+$/, '') + '…' : text;
}

/** Serialise a flat frontmatter object to YAML (strings are always quoted → no YAML surprises). */
export function toFrontmatter(data) {
  const q = (s) => JSON.stringify(String(s));
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map(q).join(', ')}]`;
      if (typeof v === 'boolean' || typeof v === 'number') return `${k}: ${v}`;
      return `${k}: ${q(v)}`;
    });
  return `---\n${lines.join('\n')}\n---\n\n`;
}
