/** Small deterministic string hash (FNV-1a) — used to derive stable colours/patterns from titles. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(list: readonly T[], seed: string): T {
  return list[hashString(seed) % list.length];
}
