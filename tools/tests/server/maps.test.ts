import { describe, expect, it } from 'vitest';
import { MapService } from '../../../server/maps/service';
const config = { amapServiceKey: 'service-secret', amapWebKey: 'browser-key', amapSecurityCode: 'security-secret' };
describe('AMap provider boundary', () => {
  it('returns selectable POI candidates and normalizes array-valued administrative fields', async () => {
    const service = new MapService(config, async input => {
      const url = new URL(String(input));
      expect(url.hostname).toBe('restapi.amap.com'); expect(url.searchParams.get('key')).toBe('service-secret');
      expect(url.searchParams.get('keywords')).toBe('示例大学');
      return Response.json({ status: '1', info: 'OK', pois: [
        { id: 'bus', name: '示例大学(公交站)', location: '113.940540,22.539366', pname: '广东省', cityname: '深圳市', adname: [], address: [] },
        { id: 'campus', name: '示例大学(粤海校区)', location: '113.934000,22.533000', pname: '广东省', cityname: '深圳市', adname: '南山区', address: '南海大道' },
      ] });
    });
    const result = await service.search('示例大学', '深圳');
    expect(result).toHaveLength(2); expect(result[0].name).toBe('示例大学(公交站)'); expect(result[1].lnglat).toEqual([113.934,22.533]);
    expect(result[0].address).not.toContain('undefined'); expect(result[0].coordinateSystem).toBe('gcj02');
  });
  it('converts GPS before reverse geocoding and records location provenance', async () => {
    const calls: string[] = [];
    const service = new MapService(config, async input => {
      const url = new URL(String(input)); calls.push(url.pathname);
      if(url.pathname.includes('coordinate/convert')) { expect(url.searchParams.get('coordsys')).toBe('gps'); return Response.json({status:'1',locations:'113.945373,22.536380'}); }
      expect(url.searchParams.get('location')).toBe('113.945373,22.536380');
      return Response.json({status:'1',regeocode:{formatted_address:'广东省深圳市南山区',addressComponent:{province:'广东省',city:[],district:'南山区'}}});
    });
    const result=await service.locateGps([113.9405,22.5394]);
    expect(calls).toEqual(['/v3/assistant/coordinate/convert','/v3/geocode/regeo']);
    expect(result).toMatchObject({lnglat:[113.945373,22.53638],address:'广东省深圳市南山区',source:'exif',coordinateSystem:'gcj02'});
  });
  it('does not silently reuse GPS coordinates when conversion fails and never exposes provider secrets', async () => {
    const service = new MapService(config, async () => Response.json({status:'0',info:'INVALID_USER_KEY'}));
    await expect(service.locateGps([100,28])).rejects.toMatchObject({statusCode:502});
    const missing=new MapService({...config,amapServiceKey:''});
    await expect(missing.search('山')).rejects.toMatchObject({statusCode:503});
    expect(service.publicConfig()).toEqual({key:'browser-key',serviceHost:'/_AMapService'});
    expect(JSON.stringify(service.publicConfig())).not.toContain('security-secret');
  });
  it('only proxies fixed official hosts and approved JSAPI resource paths',async()=>{
    const urls: string[]=[];
    const service=new MapService(config,async input=>{urls.push(String(input));return new Response('safe',{headers:{'content-type':'application/json'}});});
    await service.proxy('/v3/geocode/regeo','key=browser-key&location=113,22&jscode=evil');
    expect(new URL(urls[0]).hostname).toBe('restapi.amap.com');expect(new URL(urls[0]).searchParams.get('jscode')).toBe('security-secret');
    for(const unsafe of ['/https://evil.example','/v3/../private','/v3/unknown','/v3/geocode/regeo?target=evil'])await expect(service.proxy(unsafe,'')).rejects.toThrow();
    await expect(service.proxy('/v3/geocode/regeo','key=other')).rejects.toThrow();
  });
});
