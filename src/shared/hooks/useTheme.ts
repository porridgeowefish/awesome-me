import { useCallback, useEffect, useState } from 'react';
import { safeStorage } from '@/shared/lib/storage';

export type Theme = 'light' | 'dark';
const KEY = 'site.theme';

function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Theme follows the OS until the visitor picks one explicitly. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => safeStorage.get<Theme | null>(KEY, null) ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new CustomEvent('site:theme', { detail: theme }));
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      safeStorage.set(KEY, next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

/** Read the current theme from the DOM and re-render when it changes (for canvas / map consumers). */
export function useCurrentTheme(): Theme {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light') as Theme;
  const [t, setT] = useState<Theme>(read);
  useEffect(() => {
    const on = () => setT(read());
    window.addEventListener('site:theme', on);
    return () => window.removeEventListener('site:theme', on);
  }, []);
  return t;
}
