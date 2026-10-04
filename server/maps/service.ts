import { AppError } from '../errors.ts';
import type { ServerConfig } from '../config.ts';

type MapConfig = Pick<ServerConfig, 'amapServiceKey' | 'amapWebKey' | 'amapSecurityCode'>;
type FetchProvider = (input: string, init?: RequestInit) => Promise<Response>;
export interface MapCandidate { id: string; name: string; address: string; lnglat: [number, number]; coordinateSystem: 'gcj02' }
export interface MapLocation { lnglat: [number, number]; address: string; source: 'exif' | 'manual'; coordinateSystem: 'gcj02' }
const PROXY_PATHS = new Set(['/v3/geocode/geo', '/v3/geocode/regeo', '/v3/place/text', '/v3/place/around', '/v3/place/detail', '/v3/assistant/coordinate/convert', '/v4/map/styles', '/v4/map/traffic', '/v4/map/labels']);
const textField = (value: unknown): string => typeof value === 'string' ? value : '';
function point(value: unknown): [number, number] {
  const values = typeof value === 'string' ? value.split(',').map(Number) : value;
  if (!Array.isArray(values) || values.length !== 2 || values.some(v => typeof v !== 'number' || !Number.isFinite(v)) || Math.abs(values[0]) > 180 || Math.abs(values[1]) > 90) throw new AppError(400, 'INVALID_COORDINATES', '坐标无效');
  return [values[0], values[1]];
}

/** Only this boundary knows provider credentials or selects upstream hosts. */
export class MapService {
  private readonly cache = new Map<string, { expires: number; value: unknown }>();
  constructor(private readonly config: MapConfig, private readonly fetchProvider: FetchProvider = fetch) {}
  publicConfig() { return { key: this.config.amapWebKey, serviceHost: '/_AMapService' }; }

  async search(query: string, city = ''): Promise<MapCandidate[]> {
    if (!query.trim() || query.length > 200 || city.length > 100) throw new AppError(400, 'INVALID_SEARCH', '请输入有效的地点名称');
    const data = await this.request('/v3/place/text', { keywords: query.trim(), city, citylimit: 'false', offset: '20', extensions: 'base' });
    return (Array.isArray(data.pois) ? data.pois : []).flatMap((item: Record<string, unknown>) => {
      try { return [{ id: textField(item.id), name: textField(item.name), address: [item.pname, item.cityname, item.adname, item.address].map(textField).filter(Boolean).join(''), lnglat: point(item.location), coordinateSystem: 'gcj02' as const }]; }
      catch { return []; }
    });
  }

  async reverse(lnglat: [number, number], source: MapLocation['source'] = 'manual'): Promise<MapLocation> {
    const location = point(lnglat);
    const data = await this.request('/v3/geocode/regeo', { location: location.map(v => v.toFixed(6)).join(','), extensions: 'base', radius: '1000' });
    return { lnglat: location, address: textField(data.regeocode?.formatted_address), source, coordinateSystem: 'gcj02' };
  }
  async locateGps(gps: [number, number]): Promise<MapLocation> {
    const location = point(gps);
    const data = await this.request('/v3/assistant/coordinate/convert', { locations: location.join(','), coordsys: 'gps' });
    let converted: [number, number];
    try { converted = point(data.locations); } catch { throw new AppError(502, 'MAP_CONVERSION_FAILED', '高德坐标转换失败'); }
    return this.reverse(converted, 'exif');
  }

  async proxy(resource: string, query: string): Promise<Response> {
    if (!PROXY_PATHS.has(resource)) throw new AppError(404, 'MAP_RESOURCE_NOT_FOUND', '地图资源不存在');
    if (!this.config.amapWebKey || !this.config.amapSecurityCode) throw new AppError(503, 'MAP_NOT_CONFIGURED', '地图服务尚未配置');
    const params = new URLSearchParams(query);
    if (params.get('key') !== this.config.amapWebKey || query.length > 8000) throw new AppError(403, 'MAP_KEY_MISMATCH', '地图请求无效');
    params.set('jscode', this.config.amapSecurityCode);
    const host = resource === '/v4/map/styles' ? 'webapi.amap.com' : 'restapi.amap.com';
    return this.upstream(`https://${host}${resource}?${params}`);
  }

  private async request(resource: string, params: Record<string, string>): Promise<Record<string, any>> {
    if (!this.config.amapServiceKey) throw new AppError(503, 'MAP_NOT_CONFIGURED', '高德 Web 服务尚未配置');
    const query = new URLSearchParams({ ...params, key: this.config.amapServiceKey });
    const cacheKey = resource + JSON.stringify(params);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.value as Record<string, any>;
    const response = await this.upstream(`https://restapi.amap.com${resource}?${query}`);
    let data: Record<string, any>;
    try { data = await response.json() as Record<string, any>; } catch { throw new AppError(502, 'MAP_PROVIDER_FAILED', '高德服务返回无效数据'); }
    if (!data || data.status !== '1') throw new AppError(502, 'MAP_PROVIDER_FAILED', '高德服务未能完成请求');
    if (this.cache.size >= 200) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(cacheKey, { expires: Date.now() + 300_000, value: data });
    return data;
  }
  private async upstream(url: string): Promise<Response> {
    try {
      const response = await this.fetchProvider(url, { signal: AbortSignal.timeout(15_000), redirect: 'error' });
      if (!response.ok) throw new Error('Provider unavailable');
      return response;
    } catch { throw new AppError(502, 'MAP_PROVIDER_FAILED', '高德服务暂时不可用，请稍后重试或手动填写'); }
  }
}
