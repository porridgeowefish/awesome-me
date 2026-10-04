import { useEffect, useRef, useState } from 'react';
import { Loading } from '@/shared/ui/states';
import { loadAmap, type AMapMap, type AMapMarker, type AMapNS } from './amapLoader';
import type { MapViewProps } from './types';

const STYLE = { light: 'amap://styles/whitesmoke', dark: 'amap://styles/dark' } as const;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function markerHtml(name: string, kind: 'visited' | 'wish', selected: boolean) {
  return `<div class="px-pin px-pin-${kind}${selected ? ' is-selected' : ''}"><i></i><span>${escapeHtml(name)}</span></div>`;
}

/** AMap implementation of MapView. Reports failures to `onError` so the page can fall back. */
export function AmapView({ places, selectedId, onSelect, theme, onError }: MapViewProps & { onError: (e: Error) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<AMapMap | null>(null);
  const apiRef = useRef<AMapNS | null>(null);
  const markers = useRef(new Map<string, AMapMarker>());
  const [ready, setReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // create / destroy the map
  useEffect(() => {
    let disposed = false;
    loadAmap()
      .then((AMap: AMapNS) => {
        if (disposed || !el.current) return;
        const map = new AMap.Map(el.current, {
          viewMode: '2D',
          zoom: 5,
          center: [104.5, 30.5],
          mapStyle: STYLE[theme],
          showLabel: true,
        });
        map.addControl(new AMap.Scale());
        map.addControl(new AMap.ToolBar({ position: { right: '12px', bottom: '24px' } }));
        mapRef.current = map;
        apiRef.current = AMap;
        map.on('complete', () => !disposed && setReady(true));
        setTimeout(() => !disposed && setReady(true), 1500);
      })
      .catch((err: Error) => !disposed && onError(err));

    return () => {
      disposed = true;
      markers.current.clear();
      mapRef.current?.destroy(); // release the WebGL context
      mapRef.current = null;
      apiRef.current = null;
    };
    // The SDK/map stays mounted; runtime records update overlays below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current, AMap = apiRef.current;
    if (!ready || !map || !AMap) return;
    map.remove([...markers.current.values()]); markers.current.clear();
    for (const p of places) {
      const marker = new AMap.Marker({ position: p.lnglat, content: markerHtml(p.name, p.kind, p.id === selectedId), offset: new AMap.Pixel(-9, -9), title: p.name, zIndex: p.kind === 'visited' ? 110 : 100 });
      marker.on('click', () => onSelectRef.current(p.id)); map.add(marker); markers.current.set(p.id, marker);
    }
    if (places.length && !selectedId) map.setFitView([...markers.current.values()], true, [60,60,60,60], 6);
  }, [places, ready]);

  useEffect(() => {
    mapRef.current?.setMapStyle(STYLE[theme]);
  }, [theme]);

  // reflect selection
  useEffect(() => {
    for (const p of places) {
      const m = markers.current.get(p.id);
      m?.setContent(markerHtml(p.name, p.kind, p.id === selectedId));
      m?.setzIndex(p.id === selectedId ? 200 : p.kind === 'visited' ? 110 : 100);
    }
    const sel = places.find((p) => p.id === selectedId);
    if (sel && mapRef.current) mapRef.current.setZoomAndCenter(sel.kind === 'visited' ? 8 : 6, sel.lnglat, false, 600);
  }, [selectedId, places, ready]);

  return (
    <div className="map-canvas">
      <div ref={el} className="map-el" />
      {!ready && (
        <div className="map-overlay">
          <Loading label="正在加载高德地图" />
        </div>
      )}
    </div>
  );
}
