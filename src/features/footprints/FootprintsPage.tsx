import { interfaceText, interfaceIcon } from '@/shared/content/interface';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSiteContent } from '@/shared/content/runtime';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { useCurrentTheme } from '@/shared/hooks/useTheme';
import { publicUrl } from '@/shared/lib/url';
import { Icon } from '@/shared/ui/Icon';
import { FootprintMap } from './map/FootprintMap';
import type { MapPlace } from './map/types';
import { WishCarousel } from './WishCarousel';
import './footprints.css';

export default function FootprintsPage() {
  const { footprints, wishes, photos, copy } = useSiteContent();
  useDocumentTitle(copy('footprints.title'));
  const theme = useCurrentTheme();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get('place'));

  const places = useMemo<MapPlace[]>(
    () => [
      ...footprints.map((f) => ({ id: f.id, name: f.name, lnglat: f.lnglat, kind: 'visited' as const })),
      ...wishes.filter((w) => w.lnglat).map((w) => ({ id: w.id, name: w.name, lnglat: w.lnglat!, kind: 'wish' as const })),
    ],
    [footprints, wishes],
  );

  const select = (id: string) => {
    setSelected(id);
    setParams({ place: id }, { replace: true });
  };

  const fp = footprints.find((f) => f.id === selected);
  const wish = wishes.find((w) => w.id === selected);
  const fpPhotos = fp?.photos?.map((id) => photos.find((p) => p.id === id)).filter((p) => !!p) ?? [];
  const provinces = new Set(footprints.map((f) => f.region.split(' ')[0])).size;

  return (
    <div className="page footprints-page fade-in">
      <div className="page-head">
        <div>
          <div className="eyebrow">{copy('footprints.eyebrow')}</div>
          <h1>{copy('footprints.title')}</h1>
        </div>
        <p>
          {interfaceText("去过")}<b className="pixel-num">{footprints.length}</b> {interfaceText("个地方 ·")}<b className="pixel-num">{provinces}</b> {interfaceText("个省份 · 还想去")}{' '}
          <b className="pixel-num">{wishes.length}</b> {interfaceText("个")}</p>
      </div>

      <div className="fp-layout">
        <section className="fp-map card">
          <FootprintMap places={places} selectedId={selected} onSelect={select} theme={theme} />

          <div className="fp-chips" role="toolbar" aria-label={interfaceText("去过的地方")}>
            {footprints.map((f) => (
              <button key={f.id} className={`chip ${selected === f.id ? 'on' : ''}`} onClick={() => select(f.id)}>
                <Icon name={interfaceIcon("footprintspage.pin.0","pin")} size={13} />
                {f.name}
                {f.photos.length > 0 && <span className="fp-photo-count">{f.photos.length} 张</span>}
              </button>
            ))}
          </div>

          {(fp || wish) && (
            <aside className="fp-detail" key={selected}>
              <button className="icon-btn fp-close" onClick={() => setSelected(null)} aria-label={interfaceText("关闭")}>
                <Icon name={interfaceIcon("footprintspage.close.1","close")} size={16} />
              </button>
              {fp && (
                <>
                  <span className="eyebrow">{fp.date} {interfaceText("· 去过")}</span>
                  <h3>{fp.name}</h3>
                  <p className="muted fp-region">{fp.region}</p>
                  <p>{fp.note}</p>
                  {fpPhotos.length > 0 && (
                    <><p className="muted">{fpPhotos.length} 张照片 · 点击查看</p><div className="fp-photos">
                      {fpPhotos.map((p) => (
                        <Link key={p.id} to={`/gallery?photo=${encodeURIComponent(p.id)}`} title={p.title}>
                          <img src={publicUrl(p.thumb)} alt={p.title} loading="lazy" />
                        </Link>
                      ))}
                    </div></>
                  )}
                </>
              )}
              {wish && (
                <>
                  <span className="eyebrow wish-eyebrow">{copy('footprints.wishes')}</span>
                  <h3>{wish.name}</h3>
                  <p className="muted fp-region">{wish.region}</p>
                  <p>{wish.reason}</p>
                </>
              )}
            </aside>
          )}
        </section>

        <aside className="fp-wishes">
          <header>
            <Icon name={interfaceIcon("footprintspage.flag.2","flag")} />
            <div>
              <strong>{copy('footprints.wishes')}</strong>
              <span className="muted">{copy('footprints.wishHint')}</span>
            </div>
          </header>
          <WishCarousel wishes={wishes} activeId={wish?.id ?? null} onPick={(w) => select(w.id)} />
        </aside>
      </div>
    </div>
  );
}
