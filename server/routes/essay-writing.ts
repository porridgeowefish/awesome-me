import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAccess } from '../auth/http.ts';
import { readEssayDraft, saveEssayDraft, checkDraftVersions } from '../content/essay-drafts.ts';
import { parseMarkdownImport } from '../content/markdown-import.ts';
import { AppError } from '../errors.ts';

const versions = z.strictObject({ baseRevision: z.number().int().positive(), revision: z.number().int().min(0) });
export function essayWritingRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/api/v1/admin/essays/:id/draft', { preHandler: requireAccess(app, 'essays:read') }, async request => readEssayDraft(app, request.params.id));
  app.put<{ Params: { id: string } }>('/api/v1/admin/essays/:id/draft', { preHandler: requireAccess(app, 'essays:write') }, async request => {
    const input = versions.extend({ data: z.unknown() }).parse(request.body);
    return saveEssayDraft(app, request.params.id, input.data, input.baseRevision, input.revision);
  });
  app.delete<{ Params: { id: string } }>('/api/v1/admin/essays/:id/draft', { preHandler: requireAccess(app, 'essays:write') }, async request => {
    const input = versions.parse(request.body);
    return app.db.transaction(() => {
      const row = app.content.get('essays', request.params.id), draft = readEssayDraft(app, request.params.id);
      if (!row || row.revision !== input.baseRevision || (draft?.revision ?? 0) !== input.revision) throw new AppError(409, 'REVISION_CONFLICT', '草稿或正文版本已变化，请重新加载后核对。');
      app.db.connection.prepare('DELETE FROM essay_working_drafts WHERE essay_id = ?').run(request.params.id);
      return { ok: true };
    });
  });
  app.post<{ Params: { id: string } }>('/api/v1/admin/essays/:id/draft/publish', { preHandler: requireAccess(app, 'essays:write') }, async request => {
    const input = versions.parse(request.body);
    return app.db.transaction(() => {
      const draft = checkDraftVersions(app, request.params.id, input.baseRevision, input.revision);
      if (!draft) throw new AppError(409, 'DRAFT_NOT_FOUND', '请先保存草稿');
      const row = app.content.update('essays', request.params.id, { ...draft.data, status: 'published' }, input.baseRevision, request.principal!.tokenId ?? 'owner');
      app.db.connection.prepare('DELETE FROM essay_working_drafts WHERE essay_id = ?').run(request.params.id);
      return row;
    });
  });
  app.post('/api/v1/admin/essay-import', { preHandler: requireAccess(app, 'essays:write') }, async request => {
    const input = z.strictObject({ source: z.string().max(1_500_000), filename: z.string().max(200), replacements: z.record(z.string(), z.string()).default({}) }).parse(request.body);
    return parseMarkdownImport(input.source, input.filename, input.replacements);
  });
}
