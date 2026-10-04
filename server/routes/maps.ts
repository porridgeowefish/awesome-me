import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccess } from '../auth/http.ts';
import { AppError } from '../errors.ts';

export function mapRoutes(app: FastifyInstance): void {
  const guard = async (request: Parameters<ReturnType<typeof requireAccess>>[0]) => {
    await requireAccess(app)(request);
    if (!['gallery', 'footprints', 'wishes'].some(kind => app.auth.permits(request.principal!, `${kind}:read`))) throw new AppError(403, 'FORBIDDEN', '当前凭据没有地点查询权限');
  };
  const rate = { rateLimit: { max: 60, timeWindow: '1 minute' } };
  const coordinates = z.tuple([z.coerce.number().min(-180).max(180), z.coerce.number().min(-90).max(90)]);
  app.get('/api/v1/public/maps/config', async () => app.maps.publicConfig());
  app.get('/api/v1/admin/maps/search', { preHandler: guard, config: rate }, async request => {
    const query = z.strictObject({ q: z.string().min(1).max(200), city: z.string().max(100).optional() }).parse(request.query);
    return { items: await app.maps.search(query.q, query.city) };
  });
  for (const mode of ['reverse', 'gps'] as const) app.get(`/api/v1/admin/maps/${mode}`, { preHandler: guard, config: rate }, async request => {
    const query = z.strictObject({ lng: z.coerce.number(), lat: z.coerce.number() }).parse(request.query);
    const point = coordinates.parse([query.lng, query.lat]);
    return mode === 'gps' ? app.maps.locateGps(point) : app.maps.reverse(point);
  });
  app.get<{ Params: { '*': string } }>('/_AMapService/*', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    const response = await app.maps.proxy(`/${request.params['*']}`, request.url.split('?').slice(1).join('?'));
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > 5 * 1024 * 1024) throw new AppError(502, 'MAP_PROVIDER_FAILED', '地图资源过大');
    reply.header('Cache-Control', 'private, max-age=60').type(response.headers.get('content-type') ?? 'application/json');
    return body;
  });
}
