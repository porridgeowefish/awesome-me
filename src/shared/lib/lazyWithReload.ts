import { lazy, type ComponentType } from 'react';

const FLAG = 'awesome-me:chunk-reload';

/** Errors thrown when a code-split chunk can no longer be fetched (typically after a redeploy). */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg);
}

/**
 * React.lazy caches a rejected import forever, so an in-place "retry" can never succeed.
 * This wrapper reloads the page once when a chunk is missing (stale hashes after a deploy);
 * if that still fails, the error reaches the ErrorBoundary, which offers a full refresh.
 */
export function lazyWithReload<T extends ComponentType>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      try {
        sessionStorage.removeItem(FLAG);
      } catch {
        /* ignore */
      }
      return mod;
    } catch (err) {
      let reloaded = false;
      try {
        reloaded = sessionStorage.getItem(FLAG) === '1';
        if (!reloaded && isChunkLoadError(err)) {
          sessionStorage.setItem(FLAG, '1');
          window.location.reload();
          return new Promise<never>(() => {}); // keep suspending until the reload happens
        }
      } catch {
        /* sessionStorage blocked → fall through */
      }
      throw err;
    }
  });
}
