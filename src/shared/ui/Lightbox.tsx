import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { createPortal } from 'react-dom';
import { clamp } from '@/shared/lib/format';
import { Icon } from './Icon';
import './lightbox.css';

export interface LightboxImage {
  src: string;
  alt?: string;
  caption?: string;
}

interface Props {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange?: (i: number) => void;
  /** Where focus should go on close if the element that opened the viewer no longer exists. */
  returnFocus?: () => HTMLElement | null;
}

const MIN = 1;
const MAX = 6;

/**
 * Full-screen viewer: wheel / pinch / double-click to zoom, drag to pan,
 * ←/→ to navigate, Esc to close. Used by the gallery and by images inside essays.
 */
export function Lightbox({ images, index, onClose, onIndexChange, returnFocus }: Props) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loaded, setLoaded] = useState(false);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; scale: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const img = images[index];

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    reset();
    setLoaded(false);
  }, [index, reset]);

  const go = useCallback(
    (delta: number) => {
      if (!onIndexChange || images.length < 2) return;
      onIndexChange((index + delta + images.length) % images.length);
    },
    [images.length, index, onIndexChange],
  );

  // latest callbacks for the (mount-only) keyboard handler
  const goRef = useRef(go);
  const closeRef = useRef(onClose);
  goRef.current = go;
  closeRef.current = onClose;
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  const dialogRef = useRef<HTMLDivElement>(null);

  // Mount-only: lock scroll, move focus in, trap Tab, restore focus on close.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
      else if (e.key === 'ArrowRight') goRef.current(1);
      else if (e.key === 'ArrowLeft') goRef.current(-1);
      else if (e.key === '+' || e.key === '=') setScale((v) => clamp(v * 1.25, MIN, MAX));
      else if (e.key === '-') setScale((v) => clamp(v / 1.25, MIN, MAX));
      else if (e.key === '0') {
        setScale(1);
        setOffset({ x: 0, y: 0 });
      } else if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
      if (prevFocus?.isConnected) prevFocus.focus();
      else returnFocusRef.current?.()?.focus();
    };
  }, []);

  useEffect(() => {
    if (scale === 1) setOffset({ x: 0, y: 0 });
  }, [scale]);

  const onWheel = (e: RWheelEvent) => {
    setScale((s) => clamp(s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), MIN, MAX));
  };

  const onPointerDown = (e: RPointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale };
      drag.current = null;
    } else {
      drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y, moved: false };
    }
  };
  const onPointerMove = (e: RPointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setScale(clamp((pinch.current.scale * d) / pinch.current.dist, MIN, MAX));
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (scale > 1) setOffset({ x: d.ox + dx, y: d.oy + dy });
  };
  const onPointerUp = (e: RPointerEvent) => {
    const d = drag.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // swipe to navigate when not zoomed
    if (d && scale === 1 && pointers.current.size === 0) {
      const dx = e.clientX - d.x;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }
    if (pointers.current.size === 0) drag.current = null;
  };

  if (!img) return null;

  return createPortal(
    <div ref={dialogRef} className="lightbox" role="dialog" aria-modal="true" aria-label={img.alt || interfaceText("图片查看器")} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-toolbar">
        <span className="lightbox-count">{images.length > 1 ? `${index + 1} / ${images.length}` : ''}</span>
        <button className="lb-btn" onClick={() => setScale((s) => clamp(s / 1.4, MIN, MAX))} aria-label={interfaceText("缩小")}>
          <Icon name={interfaceIcon("lightbox.zoomOut.0","zoomOut")} />
        </button>
        <span className="lightbox-zoom">{Math.round(scale * 100)}{interfaceText("%")}</span>
        <button className="lb-btn" onClick={() => setScale((s) => clamp(s * 1.4, MIN, MAX))} aria-label={interfaceText("放大")}>
          <Icon name={interfaceIcon("lightbox.zoomIn.1","zoomIn")} />
        </button>
        <button className="lb-btn" onClick={reset} aria-label={interfaceText("复位")}>
          <Icon name={interfaceIcon("lightbox.reset.2","reset")} />
        </button>
        <button ref={closeBtn} className="lb-btn" onClick={onClose} aria-label={interfaceText("关闭")}>
          <Icon name={interfaceIcon("lightbox.close.3","close")} />
        </button>
      </div>

      <div
        className={`lightbox-stage ${scale > 1 ? 'zoomed' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
        onClick={(e) => {
          if (e.target === e.currentTarget && scale === 1 && !drag.current?.moved) onClose();
        }}
      >
        {!loaded && <span className="lightbox-spinner" aria-hidden />}
        <img
          key={img.src}
          src={img.src}
          alt={img.alt ?? ''}
          draggable={false}
          onLoad={() => setLoaded(true)}
          style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`, opacity: loaded ? 1 : 0 }}
        />
      </div>

      {images.length > 1 && (
        <>
          <button className="lb-btn lb-nav lb-prev" onClick={() => go(-1)} aria-label={interfaceText("上一张")}>
            <Icon name={interfaceIcon("lightbox.left.4","left")} size={22} />
          </button>
          <button className="lb-btn lb-nav lb-next" onClick={() => go(1)} aria-label={interfaceText("下一张")}>
            <Icon name={interfaceIcon("lightbox.right.5","right")} size={22} />
          </button>
        </>
      )}
      {(img.caption || img.alt) && <p className="lightbox-caption">{img.caption ?? img.alt}</p>}
    </div>,
    document.body,
  );
}
