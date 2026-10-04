/**
 * localStorage that never throws (private mode, blocked storage…) and namespaces keys,
 * because sites deployed under a sub-path share one origin with other projects.
 */
const NS = 'awesome-me:';

export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(NS + key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(NS + key, JSON.stringify(value));
    } catch {
      /* storage unavailable — preference simply isn't remembered */
    }
  },
};
