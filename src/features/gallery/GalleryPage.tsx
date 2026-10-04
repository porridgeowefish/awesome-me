import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSiteContent } from '@/shared/content/runtime';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { formatDate } from '@/shared/lib/format';
import { publicUrl } from '@/shared/lib/url';
import { Icon } from '@/shared/ui/Icon';
import { Lightbox } from '@/shared/ui/Lightbox';
import { Empty } from '@/shared/ui/states';
import { ringOffset } from '@/shared/lib/ring';
import './gallery.css';

export default function GalleryPage() {
  const { photos, footprints, copy } = useSiteContent();
  useDocumentTitle(copy('gallery.title'));
  const [params, setParams] = useSearchParams();
  const index = Math.max(0, photos.findIndex((p) => p.id === params.get('photo')));
  const setIndex = useCallback((next: number | ((value: number) => number)) => {
    const i = typeof next === 'function' ? next(index) : next;
    if (!photos[i]) return;
    const p = new URLSearchParams(params); p.set('photo', photos[i].id); setParams(p, { replace: true });
  }, [index, photos, params, setParams]);
  const [zoomed, setZoomed] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);
  const n = photos.length;

  const go = useCallback((delta: number) => n && setIndex((i) => (i + delta + n) % n), [n, setIndex]);

  // keep ?photo= in sync so a photo can be linked directly (e.g. from the map)
  useEffect(() => {
    if (!n) return;
    const p = new URLSearchParams(params);
    p.set('photo', photos[index].id);
    setParams(p, { replace: true });
    stripRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos]);

  useEffect(() => {
    if (zoomed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea')) return;
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, zoomed]);

  // swipe on touch devices
  const touch = useRef<number | null>(null);

  if (!n) {
    return (
      <div className="page">
        <Empty icon="image" title={interfaceText("图库还是空的")}>
          {interfaceText("照片整理好后，会出现在这里。")}</Empty>
      </div>
    );
  }

  const photo = photos[index];
  const place = footprints.find((f) => f.id === photo.footprint);

  return (
    <div className="page gallery-page fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow">{copy('gallery.eyebrow')}</div>
          <h1>{copy('gallery.title')}</h1>
        </div>
        <p>
          <span className="pixel-num">{String(index + 1).padStart(2, '0')}</span> {interfaceText("/")}{String(n).padStart(2, '0')} {interfaceText("·")}{copy('gallery.hint')}
        </p>
      </div>

      <section
        className="coverflow"
        aria-roledescription="carousel"
        aria-label={interfaceText("照片轮播")}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touch.current === null) return;
          const dx = e.changedTouches[0].clientX - touch.current;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          touch.current = null;
        }}
      >
        <button className="cf-arrow cf-prev" onClick={() => go(-1)} aria-label={interfaceText("上一张")}>
          <Icon name={interfaceIcon("gallerypage.left.0","left")} size={22} />
        </button>
        <div className="cf-track">
          {photos.map((p, i) => {
            const off = ringOffset(i, index, n);
            const visible = Math.abs(off) <= 2;
            return (
              <figure
                key={p.id}
                className={`cf-item ${off === 0 ? 'is-active' : ''}`}
                style={{ '--off': off, '--abs': Math.abs(off), visibility: visible ? 'visible' : 'hidden' } as CSSProperties}
                aria-hidden={off !== 0}
                onClick={() => off !== 0 && setIndex(i)}
                onDoubleClick={() => off === 0 && setZoomed(true)}
              >
                <img src={publicUrl(Math.abs(off) <= 1 ? p.src : p.thumb)} alt={off === 0 ? p.title : ''} draggable={false} decoding="async" />
                {off === 0 && (
                  <button className="cf-zoom" onClick={() => setZoomed(true)} aria-label={interfaceText("放大查看")}>
                    <Icon name={interfaceIcon("gallerypage.zoomIn.1","zoomIn")} size={18} />
                  </button>
                )}
              </figure>
            );
          })}
        </div>
        <button className="cf-arrow cf-next" onClick={() => go(1)} aria-label={interfaceText("下一张")}>
          <Icon name={interfaceIcon("gallerypage.right.2","right")} size={22} />
        </button>
      </section>

      <div className="thumb-strip" ref={stripRef} role="tablist" aria-label={interfaceText("照片缩略图")}>
        {photos.map((p, i) => (
          <button key={p.id} data-i={i} role="tab" aria-selected={i === index} className={`thumb ${i === index ? 'active' : ''}`} onClick={() => setIndex(i)}>
            <img src={publicUrl(p.thumb)} alt={p.title} loading="lazy" />
          </button>
        ))}
      </div>

      <article className="story card" key={photo.id} data-edit-region={`gallery:story:${photo.id}`}>
        <header>
          <div>
            <span className="eyebrow">{copy('gallery.note')}</span>
            <h2>{photo.title}</h2>
          </div>
          <div className="story-meta">
            <span>
              <Icon name={interfaceIcon("gallerypage.pin.3","pin")} size={15} /> {photo.place}
            </span>
            <span>
              <Icon name={interfaceIcon("gallerypage.calendar.4","calendar")} size={15} /> {formatDate(photo.date)}
            </span>
            {place && (
              <Link to={`/footprints?place=${place.id}`} className="chip">
                {copy('gallery.mapLink')}
              </Link>
            )}
          </div>
        </header>
        <div className="story-text">
          {photo.story.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </article>

      {zoomed && (
        <Lightbox
          images={photos.map((p) => ({ src: publicUrl(p.src), alt: p.title, caption: `${p.title} · ${p.place}` }))}
          index={index}
          onIndexChange={setIndex}
          onClose={() => setZoomed(false)}
          returnFocus={() => document.querySelector<HTMLElement>('.cf-item.is-active .cf-zoom')}
        />
      )}
    </div>
  );
}

