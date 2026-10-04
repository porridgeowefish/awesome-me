import { useEffect, useRef, useState } from 'react';
import { useSiteContent } from '@/shared/content/runtime';
import { useMediaQuery, useReducedMotion } from '@/shared/hooks/useMediaQuery';
import './personal-cursor.css';

const THEMES = ['default', 'star', 'rabbit', 'parrot'] as const;
type CursorTheme = typeof THEMES[number];
const LABELS: Record<CursorTheme, string> = { default: '系统鼠标', star: '黄色星星', rabbit: '侏儒兔', parrot: '小鹦鹉' };
const NOTES: Record<CursorTheme, string> = { default: '跟随设备设置', star: '流星拖尾', rabbit: '动动耳朵 · 胡萝卜拖尾', parrot: '点击轻轻啄一下' };
function useCursorTheme() {
  const { settings } = useSiteContent();
  const fallback = settings.cursor ?? 'star';
  const read = () => { try { const value = localStorage.getItem('site:cursor'); return THEMES.includes(value as CursorTheme) ? value as CursorTheme : fallback; } catch { return fallback; } };
  const [theme, setTheme] = useState<CursorTheme>(read);
  useEffect(() => { const sync = (event?: Event) => { const value = (event as CustomEvent | undefined)?.detail; setTheme(THEMES.includes(value) ? value : read()); }; sync(); window.addEventListener('site:cursor-change', sync); window.addEventListener('storage', sync); return () => { window.removeEventListener('site:cursor-change', sync); window.removeEventListener('storage', sync); }; }, [fallback]);
  return [theme, (value: CursorTheme) => { setTheme(value); try { localStorage.setItem('site:cursor', value); } catch { /* Current visit still works. */ } window.dispatchEvent(new CustomEvent('site:cursor-change', { detail: value })); }] as const;
}
export function CursorGlyph({ theme }: { theme: CursorTheme | 'carrot' }) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {theme === 'star' ? <><path d="m24 4 5.8 12.3 13.5 1.8-9.8 9.5 2.4 13.6L24 34.6l-11.9 6.6 2.4-13.6L4.7 18.1l13.5-1.8Z" fill="#ffd75e" stroke="#d49b22" strokeWidth="1.8" strokeLinejoin="round"/><path d="m24 9-4.1 9.9-9.9 1.1" stroke="#fff7cb" strokeWidth="2.3" strokeLinecap="round"/><circle cx="21" cy="24" r="1.2" fill="#8f591e"/><circle cx="28" cy="24" r="1.2" fill="#8f591e"/><path d="M23 28q2 2 4 0" stroke="#8f591e" strokeWidth="1.2" strokeLinecap="round"/></> : theme === 'rabbit' ? <>
      <g className="rabbit-ear rabbit-ear-left"><ellipse cx="17" cy="14" rx="5.6" ry="12" transform="rotate(-13 17 14)" fill="#fff8ed" stroke="#b8a696" strokeWidth="1.4"/><ellipse cx="17" cy="13" rx="2.8" ry="8" transform="rotate(-13 17 13)" fill="#efbcbd"/></g>
      <g className="rabbit-ear rabbit-ear-right"><ellipse cx="31" cy="14" rx="5.6" ry="12" transform="rotate(13 31 14)" fill="#fff8ed" stroke="#b8a696" strokeWidth="1.4"/><ellipse cx="31" cy="13" rx="2.8" ry="8" transform="rotate(13 31 13)" fill="#efbcbd"/></g>
      <ellipse cx="24" cy="32" rx="18" ry="13.5" fill="#fff8ed" stroke="#b8a696" strokeWidth="1.4"/><ellipse cx="14" cy="35" rx="4" ry="2.4" fill="#f6d4d1"/><ellipse cx="34" cy="35" rx="4" ry="2.4" fill="#f6d4d1"/><circle cx="17" cy="30" r="2.1" fill="#514136"/><circle cx="31" cy="30" r="2.1" fill="#514136"/><circle cx="17.6" cy="29.4" r=".7" fill="white"/><circle cx="31.6" cy="29.4" r=".7" fill="white"/><path d="m21.5 34 2.5 2 2.5-2" fill="#d5969a"/><path d="M24 36v2m-3 0q3 3 6 0" stroke="#a4897b" strokeLinecap="round"/></> : theme === 'parrot' ? <>
      <path d="m18 34-5 10 12-6 3 6 3-13" fill="#57a492" stroke="#366f60" strokeWidth="1.2"/><ellipse cx="24" cy="28" rx="13" ry="15" fill="#82c897" stroke="#497f68" strokeWidth="1.5"/><path d="M15 22q-8 17 9 15-8-5-5-15" fill="#55a9a2"/><g className="parrot-head"><circle cx="28" cy="15" r="11.5" fill="#ace2a0" stroke="#497f68" strokeWidth="1.5"/><path d="m20 5 1-4 4 3 3-3 2 4" fill="#f6d55e" stroke="#af9c43" strokeWidth="1"/><ellipse cx="35" cy="21" rx="4" ry="3" fill="#f4bc8d"/><path className="parrot-beak" d="M36 15q12 3 4 11l-4-6Z" fill="#edb34b" stroke="#ac772c" strokeWidth="1.2"/><circle cx="31" cy="13" r="2.3" fill="#293f37"/><circle cx="31.7" cy="12.3" r=".8" fill="white"/></g><path d="M21 42h-5m12 0h5" stroke="#a58545" strokeWidth="2" strokeLinecap="round"/></> : theme === 'carrot' ? <><path d="M22 16Q9 16 8 40q24-8 25-18Z" fill="#f79b3d" stroke="#d07025" strokeWidth="1.5"/><path d="m24 16-2-11m5 12 7-13m-5 15 12-5" stroke="#68a850" strokeWidth="4" strokeLinecap="round"/><path d="m18 22 4 3m-9 5 4 2" stroke="#d07025" strokeWidth="1.6" strokeLinecap="round"/></> : <path d="m12 6 3 31 8-8 8 12 5-3-8-12 12-3Z" fill="var(--ink-2)" stroke="var(--surface)" strokeWidth="2"/>}
  </svg>;
}
export function CursorPicker() {
  const [theme, choose] = useCursorTheme();
  const [open, setOpen] = useState(false), ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); }; document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape); return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); }; }, [open]);
  return <div className="cursor-picker" ref={ref}><button className="icon-btn cursor-picker-trigger" title="个性鼠标" aria-label="选择个性鼠标" aria-expanded={open} onClick={() => setOpen(value => !value)}><CursorGlyph theme={theme}/></button>{open && <div className="cursor-picker-menu" role="group" aria-label="鼠标主题"><span className="cursor-picker-caption">给光标一点个性</span>{THEMES.map(value => <button key={value} aria-pressed={theme === value} onClick={() => { choose(value); setOpen(false); }}><CursorGlyph theme={value}/><span>{LABELS[value]}<small>{NOTES[value]}</small></span>{theme === value && <span className="cursor-picker-check">✓</span>}</button>)}</div>}</div>;
}
export function PersonalCursor() {
  const [theme] = useCursorTheme(), fine = useMediaQuery('(hover: hover) and (pointer: fine)'), reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null), trails = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cursor = ref.current, layer = trails.current;
    if (!cursor || !layer || !fine || theme === 'default') return;
    let frame = 0, clickTimer = 0, point = { x: 0, y: 0 }, previous = point, lastTrail = 0, visible = false;
    const root = document.documentElement;
    const hide = () => { visible = false; cursor.style.visibility = 'hidden'; root.classList.remove('personal-cursor-active'); };
    const render = () => {
      frame = 0; if (!visible) return;
      cursor.style.transform = `translate3d(${point.x - 4}px,${point.y - 4}px,0)`; cursor.style.visibility = 'visible'; root.classList.add('personal-cursor-active');
      const now = performance.now(), dx = point.x - previous.x, dy = point.y - previous.y;
      if (!reduced && theme !== 'parrot' && now - lastTrail > 45 && Math.hypot(dx, dy) > 5) {
        const particle = document.createElement('span'); particle.className = `cursor-trail cursor-trail-${theme}`;
        particle.style.left = `${point.x}px`; particle.style.top = `${point.y}px`;
        particle.style.setProperty('--trail-angle', `${Math.atan2(dy, dx) * 180 / Math.PI + 180}deg`);
        particle.innerHTML = theme === 'star' ? '<i></i><b>✦</b>' : '<svg viewBox="0 0 48 48"><path d="M22 16Q9 16 8 40q24-8 25-18Z" fill="#f79b3d" stroke="#d07025" stroke-width="1.5"/><path d="m24 16-2-11m5 12 7-13m-5 15 12-5" stroke="#68a850" stroke-width="4" stroke-linecap="round"/></svg>';
        layer.append(particle); particle.addEventListener('animationend', () => particle.remove(), { once: true });
        while (layer.childElementCount > 24) layer.firstElementChild?.remove(); lastTrail = now;
      }
      previous = { ...point };
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || (event.target as Element).closest('input, textarea, [contenteditable="true"], iframe')) { hide(); return; }
      point = { x: event.clientX, y: event.clientY }; visible = true; if (!frame) frame = requestAnimationFrame(render);
    };
    const click = () => { if (reduced || !visible) return; cursor.classList.remove('is-clicking'); void cursor.offsetWidth; cursor.classList.add('is-clicking'); clearTimeout(clickTimer); clickTimer = window.setTimeout(() => cursor.classList.remove('is-clicking'), 500); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerdown', click); document.documentElement.addEventListener('pointerleave', hide); window.addEventListener('blur', hide); window.addEventListener('scroll', hide, true);
    return () => { cancelAnimationFrame(frame); clearTimeout(clickTimer); hide(); layer.replaceChildren(); document.removeEventListener('pointermove', move); document.removeEventListener('pointerdown', click); document.documentElement.removeEventListener('pointerleave', hide); window.removeEventListener('blur', hide); window.removeEventListener('scroll', hide, true); };
  }, [fine, reduced, theme]);
  return <div className="cursor-effects" aria-hidden="true"><div ref={trails} className="cursor-trails"/><div ref={ref} className={`personal-cursor personal-cursor-${theme}`}><CursorGlyph theme={theme}/></div></div>;
}
