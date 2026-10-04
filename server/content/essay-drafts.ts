import type { FastifyInstance } from 'fastify';
import { essaySchema } from '../../src/contracts/content.ts';
import type { EssayWorkingDraft } from '../../src/contracts/essay-draft.ts';
import { AppError } from '../errors.ts';

export function readEssayDraft(app: FastifyInstance, id: string): EssayWorkingDraft | null {
  if (!app.content.get('essays', id)) throw new AppError(404, 'CONTENT_NOT_FOUND', '文章不存在');
  const row = app.db.connection.prepare('SELECT * FROM essay_working_drafts WHERE essay_id = ?').get(id);
  return row ? { data: JSON.parse(String(row.data)), revision: Number(row.revision), baseRevision: Number(row.base_revision), updatedAt: new Date(Number(row.updated_at)).toISOString() } : null;
}
export function checkDraftVersions(app: FastifyInstance, id: string, baseRevision: number, revision: number) {
  const article = app.content.get('essays', id);
  const draft = readEssayDraft(app, id);
  if (!article || article.revision !== baseRevision || (draft?.revision ?? 0) !== revision || draft && draft.baseRevision !== baseRevision) {
    throw new AppError(409, 'REVISION_CONFLICT', '文章或草稿已在其他页面修改。当前编辑保留在浏览器中，请重新加载并核对后继续。');
  }
  return draft;
}
export function saveEssayDraft(app: FastifyInstance, id: string, input: unknown, baseRevision: number, revision: number): EssayWorkingDraft {
  const data = essaySchema.parse({ ...input as object, status: 'draft' });
  return app.db.transaction(() => {
    checkDraftVersions(app, id, baseRevision, revision);
    for (const match of JSON.stringify(data).matchAll(/\/api\/v1\/media\/([a-zA-Z0-9_-]+)\//g)) {
      if (!app.db.connection.prepare('SELECT id FROM media_assets WHERE id = ?').get(match[1])) throw new AppError(400, 'MEDIA_NOT_FOUND', '草稿引用的图片不存在');
    }
    app.db.connection.prepare('INSERT INTO essay_working_drafts (essay_id, data, base_revision, revision, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(essay_id) DO UPDATE SET data=excluded.data, base_revision=excluded.base_revision, revision=excluded.revision, updated_at=excluded.updated_at').run(id, JSON.stringify(data), baseRevision, revision + 1, Date.now());
    return readEssayDraft(app, id)!;
  });
}
