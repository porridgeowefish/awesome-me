import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { PublicSnapshot } from '../../contracts/content';
import { profileSchema, siteSchema } from '../../contracts/content';
import { siteDefaults } from '@/data/siteDefaults';
import { Empty, Loading } from '@/shared/ui/states';

let current: PublicSnapshot | null = null;
let previewCurrent: PublicSnapshot | null = null;
const listeners = new Set<() => void>();
let pending: Promise<void> | null = null;
export function getSiteContent(): PublicSnapshot {
  if (!current) throw new Error('网站内容尚未加载');
  return previewCurrent ?? current;
}
/** Drafts exist only in the embedded preview's module instance. No API writes. */
export function applyPreviewDraft(site: unknown, profile: unknown): void {
  if (!current || window.parent === window || new URLSearchParams(window.location.search).get('preview') !== '1') return;
  const safeSite = siteSchema.safeParse(site), safeProfile = profileSchema.safeParse(profile);
  if (!safeSite.success && !safeProfile.success) return;
  const previous = previewCurrent ?? current;
  previewCurrent = { ...previous, site: safeSite.success ? safeSite.data : previous.site, profile: safeProfile.success ? safeProfile.data : previous.profile };
  listeners.forEach(listener => listener());
}
export async function refreshSiteContent(): Promise<void> {
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch('/api/v1/public/content', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容服务暂时不可用，请稍后重试');
    const next = await response.json() as PublicSnapshot;
    if (!current || current.revision !== next.revision) { current = next; if (previewCurrent) previewCurrent = { ...next, site: previewCurrent.site, profile: previewCurrent.profile }; listeners.forEach(listener => listener()); }
  })().finally(() => { pending = null; });
  return pending;
}
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useSiteContent() {
  const content = useSyncExternalStore(subscribe, getSiteContent);
  return { ...content, settings: content.site ?? siteDefaults, copy: (key: keyof typeof siteDefaults.copy) => content.site?.copy[key] ?? siteDefaults.copy[key] ?? key };
}
export function ContentProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(!!current), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    refreshSiteContent().then(() => { if (alive) { setLoaded(true); setError(''); } }).catch((e: Error) => alive && setError(e.message));
    const refresh = () => { if (document.visibilityState === 'visible') refreshSiteContent().catch(() => {}); };
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, [attempt]);
  if (!loaded) return <div className="page">{error ? <Empty title="网站内容未能加载" icon="file">{error}<p><button className="btn" onClick={() => setAttempt(n => n + 1)}>重新加载</button></p></Empty> : <Loading label="正在加载网站内容" />}</div>;
  return <>{children}<RuntimeTheme /></>;
}
function RuntimeTheme() {
  const { settings } = useSiteContent();
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', settings.theme.accent);
    root.style.setProperty('--radius', `${settings.theme.radius}px`);
    root.style.setProperty('--page-max', `${settings.theme.pageWidth}px`);
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.append(icon); }
    icon.href = settings.logo;
  }, [settings]);
  return null;
}
