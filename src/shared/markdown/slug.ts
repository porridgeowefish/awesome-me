/** GitHub-style heading slugs that keep CJK characters; `createSlugger` de-duplicates. */
export function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[`*_~[\]()（）【】{}<>《》"'“”‘’!?！？。，、；：,.;:/\\|@#$%^&+=]+/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  );
}

export function createSlugger() {
  const seen = new Map<string, number>();
  return (text: string) => {
    const base = slugify(text);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

export interface TocItem {
  id: string;
  text: string;
  depth: number;
}

const TEX_SYMBOLS: Record<string, string> = {
  rightarrow: '→', to: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐', leftrightarrow: '↔',
  times: '×', cdot: '·', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', approx: '≈', infty: '∞',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', theta: 'θ',
};

/** Readable plain text for inline TeX inside headings (used for ids and the outline). */
export function texToText(tex: string): string {
  return tex
    .replace(/\\([a-zA-Z]+)/g, (_, cmd: string) => TEX_SYMBOLS[cmd] ?? cmd)
    .replace(/[{}^_]/g, '')
    .trim();
}
