/* Minimal typings for the parts of AMap JSAPI v2 we use. */
export interface AMapMarker {
  on(event: 'click', fn: () => void): void;
  setContent(html: string): void;
  setzIndex(z: number): void;
  setMap(map: AMapMap | null): void;
}
export interface AMapMap {
  add(o: unknown): void;
  remove(o: unknown): void;
  setFitView(overlays?: unknown[], immediately?: boolean, avoid?: number[], maxZoom?: number): void;
  setZoomAndCenter(zoom: number, center: [number, number], immediately?: boolean, duration?: number): void;
  setMapStyle(style: string): void;
  addControl(c: unknown): void;
  on(event: string, fn: () => void): void;
  destroy(): void;
}
export interface AMapNS {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => AMapMap;
  Marker: new (opts: Record<string, unknown>) => AMapMarker;
  Pixel: new (x: number, y: number) => unknown;
  Scale: new () => unknown;
  ToolBar: new (opts?: Record<string, unknown>) => unknown;
}

declare global {
  interface Window {
    _AMapSecurityConfig?: { serviceHost: string };
  }
}

let promise: Promise<AMapNS> | null = null;

/** Load the SDK once per page (singleton) with a timeout, so a blocked CDN degrades gracefully. */
export function loadAmap(timeoutMs = 12000): Promise<AMapNS> {
  if (promise) return promise;
  promise = Promise.race([
    fetch('/api/v1/public/maps/config').then(async response => {
      if (!response.ok) throw new Error('地图配置加载失败');
      const { key, serviceHost } = await response.json() as { key: string; serviceHost: string };
      if (!key) throw new Error('尚未配置高德地图');
      window._AMapSecurityConfig = { serviceHost: new URL(serviceHost, window.location.origin).href };
      const { default: AMapLoader } = await import('@amap/amap-jsapi-loader');
      return AMapLoader.load({ key, version: '2.0', plugins: ['AMap.Scale', 'AMap.ToolBar'] }) as Promise<AMapNS>;
    }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('高德地图加载超时')), timeoutMs)),
  ]);
  promise.catch(() => {
    promise = null; // allow a later retry
  });
  return promise;
}
