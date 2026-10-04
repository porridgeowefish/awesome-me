import { resolveRelative, safeDecode } from '@/shared/lib/url';

/** What a link inside an article should do when clicked. */
export type LinkTarget =
  | { kind: 'anchor'; id: string }
  | { kind: 'route'; to: string }
  | { kind: 'external'; href: string }
  | { kind: 'file'; href: string };

/** Maps a markdown-relative href onto an in-app route, or returns null if it is not one. */
export type RouteResolver = (href: string) => string | null;

/**
 * Classify a link. Order matters: in-page anchors, explicit app routes ("#/…"), injected
 * route resolution (e.g. ../other-essay/index.md → /essays/…), external, then static files.
 */
export function classifyLink(href: string, basePath: string, toRoute?: RouteResolver): LinkTarget {
  if (href.startsWith('#/')) return { kind: 'route', to: href.slice(1) };
  if (href.startsWith('#')) return { kind: 'anchor', id: safeDecode(href.slice(1)) };
  const route = toRoute?.(href);
  if (route) return { kind: 'route', to: route };
  if (/^([a-z]+:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href)) return { kind: 'external', href };
  return { kind: 'file', href: resolveRelative(basePath, href) };
}
