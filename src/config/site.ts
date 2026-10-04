/**
 * Site-wide configuration. Secrets come from environment variables (.env.local), never from code.
 */
export const site = {
  name: '示例站主',
  nameEn: 'Alex Example',
  tagline: '记录生活，分享创造',
  /** Footer line. */
  footer: '由 awesome-me 构建',
  routerMode: (import.meta.env.VITE_ROUTER_MODE ?? 'hash') as 'hash' | 'history',
} as const;
