import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { safeContentPath } from '../../src/contracts/content.ts';
import { requireKind } from '../content/service.ts';
import { requireAccess } from '../auth/http.ts';
import { AppError } from '../errors.ts';

const createInput = z.strictObject({ data: z.unknown(), id: z.string().max(150).optional() });
const updateInput = z.strictObject({ data: z.unknown(), revision: z.number().int().positive() });
const paramsSchema = z.strictObject({ kind: z.string(), id: z.string().optional() });

export function contentRoutes(app: FastifyInstance): void {
  const access = (mode: 'read' | 'write') => async (request: Parameters<ReturnType<typeof requireAccess>>[0]) => {
    const kind = requireKind(paramsSchema.parse(request.params).kind);
    await requireAccess(app, `${kind}:${mode}`)(request);
  };
  app.get('/api/v1/public/content', async () => app.content.publicSnapshot());
  app.get('/api/v1/public/essays/body', async (request, reply) => {
    const query = z.strictObject({ path: z.string().refine(safeContentPath) }).parse(request.query);
    reply.type('text/markdown; charset=utf-8');
    return app.content.essayBody(query.path);
  });
  app.get<{ Params: { kind: string }; Querystring: { q?: string; limit?: string; offset?: string } }>('/api/v1/admin/:kind', { preHandler: access('read') }, async request => {
    const kind = requireKind(request.params.kind);
    const query = z.strictObject({ q: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(1000).default(100), offset: z.coerce.number().int().min(0).max(10000).default(0) }).parse(request.query);
    const all = app.content.list(kind);
    const matched = query.q ? all.filter(row => JSON.stringify(row.data).toLowerCase().includes(query.q!.toLowerCase())) : all;
    return { items: matched.slice(query.offset, query.offset + query.limit), total: matched.length };
  });
  app.get<{ Params: { kind: string; id: string } }>('/api/v1/admin/:kind/:id', { preHandler: access('read') }, async request => {
    const row = app.content.get(requireKind(request.params.kind), request.params.id);
    if (!row) throw new AppError(404, 'CONTENT_NOT_FOUND', '内容不存在');
    return row;
  });
  app.post<{ Params: { kind: string } }>('/api/v1/admin/:kind', { preHandler: access('write') }, async (request, reply) => {
    const input = createInput.parse(request.body);
    const row = app.content.create(requireKind(request.params.kind), input.data, input.id, request.principal!.tokenId ?? 'owner', app.auth.permits(request.principal!, 'footprints:write'));
    reply.code(201); return row;
  });
  app.put<{ Params: { kind: string; id: string } }>('/api/v1/admin/:kind/:id', { preHandler: access('write') }, async request => {
    const input = updateInput.parse(request.body);
    return app.content.update(requireKind(request.params.kind), request.params.id, input.data, input.revision, request.principal!.tokenId ?? 'owner', app.auth.permits(request.principal!, 'footprints:write'));
  });
  app.delete<{ Params: { kind: string; id: string } }>('/api/v1/admin/:kind/:id', { preHandler: access('write') }, async request => {
    const input = z.strictObject({ revision: z.number().int().positive() }).parse(request.body);
    app.content.delete(requireKind(request.params.kind), request.params.id, input.revision, request.principal!.tokenId ?? 'owner');
    return { ok: true };
  });
  app.post<{ Params: { kind: string } }>('/api/v1/admin/:kind/reorder', { preHandler: access('write') }, async request => {
    const input = z.strictObject({ ids: z.array(z.string()).max(10000), revisions:z.record(z.string(),z.number().int().positive()) }).parse(request.body);
    app.content.reorder(requireKind(request.params.kind), input.ids, input.revisions, request.principal!.tokenId ?? 'owner');
    return { ok: true };
  });
  app.post('/api/v1/admin/gallery/sync-locations', { preHandler: requireAccess(app, 'gallery:write') }, async request => {
    if (!app.auth.permits(request.principal!, 'footprints:write')) throw new AppError(403, 'FORBIDDEN', '同步照片地点需要足迹编辑权限');
    return app.content.syncPhotoLocations(request.principal!.tokenId ?? 'owner');
  });
  app.post<{ Params: { id: string } }>('/api/v1/admin/wishes/:id/visit', { preHandler: requireAccess(app, 'wishes:write') }, async (request, reply) => {
    if (!app.auth.permits(request.principal!, 'footprints:write')) throw new AppError(403, 'FORBIDDEN', '当前凭据缺少已去足迹编辑权限');
    const body = z.strictObject({ revision: z.number().int().positive(), date: z.string(), note: z.string(), lnglat: z.tuple([z.number(), z.number()]).optional() }).parse(request.body);
    reply.code(201);
    return app.content.visitWish(request.params.id, body.revision, body, request.principal!.tokenId ?? 'owner');
  });
}
