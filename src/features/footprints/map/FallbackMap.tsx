import { interfaceText } from '@/shared/content/interface';
import { useMemo } from 'react';
import type { MapViewProps } from './types';

/**
 * Offline map: an equirectangular projection of the places onto a pixel grid. Used when no
 * AMap key is configured or the SDK cannot load — the page keeps working everywhere.
 */
const W = 800;
const H = 560;

export function FallbackMap({ places, selectedId, onSelect, reason, onRetry }: MapViewProps & { reason?: string; onRetry?: () => void }) {
  const project = useMemo(() => {
    const lngs = places.map((p) => p.lnglat[0]);
    const lats = places.map((p) => p.lnglat[1]);
    const pad = 4;
    const minLng = Math.min(...lngs, 95) - pad;
    const maxLng = Math.max(...lngs, 120) + pad;
    const minLat = Math.min(...lats, 20) - pad;
    const maxLat = Math.max(...lats, 40) + pad;
    const k = Math.min(W / (maxLng - minLng), H / (maxLat - minLat));
    const ox = (W - (maxLng - minLng) * k) / 2;
    const oy = (H - (maxLat - minLat) * k) / 2;
    return ([lng, lat]: [number, number]) => [ox + (lng - minLng) * k, oy + (maxLat - lat) * k] as const;
  }, [places]);


  return (
    <div className="map-canvas fallback-map">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={interfaceText("足迹示意图")}>
        <defs>
          <pattern id="fm-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="15" height="15" className="fm-cell" />
          </pattern>
        </defs>
        <rect width={W} height={H} fill="url(#fm-grid)" />
        {places.map((p) => {
          const [x, y] = project(p.lnglat);
          const sel = p.id === selectedId;
          return (
            <g key={p.id} transform={`translate(${x},${y})`} className={`fm-place fm-${p.kind} ${sel ? 'is-selected' : ''}`} onClick={() => onSelect(p.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect(p.id)} aria-label={p.name}>
              <rect x={-7} y={-7} width={14} height={14} />
              <title>{p.name}</title>
              {(p.kind === 'visited' || sel) && (
                <text x={12} y={5}>
                  {p.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="fallback-note">
        {reason ?? interfaceText("离线示意图")}
        {onRetry && (
          <button className="fallback-retry" onClick={onRetry}>
            {interfaceText("重新加载高德地图")}</button>
        )}
      </p>
    </div>
  );
}
