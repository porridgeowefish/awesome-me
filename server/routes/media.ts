import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccess, authenticateRequest } from '../auth/http.ts';
import { MEDIA_PURPOSES } from '../media/formats.ts';
import { streamFile } from '../media/range.ts';
import { AppError } from '../errors.ts';

export function mediaRoutes(app: FastifyInstance): void {
  app.get('/api/v1/admin/media', { preHandler: requireAccess(app, 'media:read') }, async () => ({ items: app.media.list() }));
  app.post('/api/v1/admin/media/upload', { preHandler: requireAccess(app, 'media:write') }, async (request, reply) => {
    const { purpose } = z.strictObject({ purpose: z.enum(MEDIA_PURPOSES) }).parse(request.query);
    const file = await request.file({ limits: { files: 1, fileSize: purpose === 'music' ? 100 * 1024 * 1024 : purpose === 'resume' ? 20 * 1024 * 1024 : 40 * 1024 * 1024, fields: 0 } });
    if (!file) throw new AppError(400, 'FILE_MISSING', '请选择要上传的文件');
    const controller = new AbortController();
    const abort = () => controller.abort();
    const abortOnDisconnect = () => { if (!reply.raw.writableEnded) abort(); };
    request.raw.once('aborted', abort);
    request.raw.once('error', abort);
    reply.raw.once('close', abortOnDisconnect);
    let asset;
    try {
      if (request.raw.aborted || (reply.raw.destroyed && !reply.raw.writableEnded)) abort();
      asset = purpose === 'music'
        ? await app.media.uploadAudio(file.file, file.filename, { signal: controller.signal })
        : await app.media.upload(await file.toBuffer(), file.filename, purpose);
    } finally {
      request.raw.off('aborted', abort);
      request.raw.off('error', abort);
      reply.raw.off('close', abortOnDisconnect);
    }
    let suggestedLocation;
    if (asset.gps) {
      try { suggestedLocation = await app.maps.locateGps(asset.gps.lnglat); }
      catch { asset.warnings.push('GPS 已读取，但地点查询未完成；可稍后查询或手动选择地点'); }
    }
    reply.code(201); return { ...asset, suggestedLocation };
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/media/:id', { preHandler: requireAccess(app, 'media:write') }, async request => { app.media.remove(request.params.id); return { ok: true }; });
  app.get<{ Params: { id: string; variant: string } }>('/api/v1/media/:id/:variant', async (request, reply) => {
    let authenticated = false;
    if (request.cookies.site_session || request.headers.authorization) {
      const principal = request.headers.authorization ? authenticateRequest(app, request) : app.auth.verifySession(request.cookies.site_session ?? '');
      authenticated = !!principal && app.auth.permits(principal, 'media:read');
    }
    const asset = app.media.get(request.params.id);
    if (!asset) throw new AppError(404, 'MEDIA_NOT_FOUND', '文件不存在');
    const file = app.media.variantPath(asset.id, request.params.variant, authenticated);
    reply.header('Cache-Control', 'private, no-store');
    if (asset.purpose === 'resume' || (request.params.variant === 'original' && asset.purpose !== 'music')) reply.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(asset.filename)}`);
    reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
    return streamFile(file, request.params.variant === 'original' ? asset.originalContentType ?? asset.contentType : 'image/webp', request, reply);
  });
}
