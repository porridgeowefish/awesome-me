import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
import { siteDefaults } from '../../../src/data/siteDefaults';

const apps: FastifyInstance[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
async function setup() {
  const app = await createApp({ databasePath: ':memory:', logger: false }); apps.push(app);
  await app.auth.createOwner('owner', 'long-owner-password');
  const token = app.auth.issueToken({ name: 'writer', scopes: ['essays:write', 'site:write'], expiresAt: '2099-01-01T00:00:00Z' });
  const headers = { authorization: `Bearer ${token.token}` };
  const row = app.content.create('essays', { title: '公开文章', publicPath: 'note', date: '2026-10-03', body: 'PUBLIC', status: 'published' });
  return { app, headers, row };
}
describe('article writing', () => {
  it('rejects executable frontmatter languages and unsafe image replacement URLs', async () => {
    const { app, headers } = await setup();
    for (const source of ['---javascript\n({title: "executed"})\n---\nbody', '---json\n{"title":"note"}\n---\nbody']) {
      expect((await app.inject({ method: 'POST', url: '/api/v1/admin/essay-import', headers, payload: { source, filename: 'note.md' } })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/essay-import', headers, payload: { source: '![](local.png)', filename: 'note.md', replacements: { 'local.png': 'javascript:alert(1)' } } })).statusCode).toBe(400);
  });
  it('keeps automatic working drafts private, checks both versions, and publishes atomically', async () => {
    const { app, headers, row } = await setup();
    const url = `/api/v1/admin/essays/${row.id}/draft`;
    const payload = { data: { ...row.data, body: 'PRIVATE $$x^2$$', status: 'draft' }, baseRevision: row.revision, revision: 0 };
    expect((await app.inject({ method: 'PUT', url, payload })).statusCode).toBe(401);
    const saved = await app.inject({ method: 'PUT', url, headers, payload });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().revision).toBe(1);
    expect((await app.inject({ url, headers })).json().data.body).toContain('PRIVATE');
    expect((await app.inject('/api/v1/public/essays/body?path=note')).body).toBe('PUBLIC');
    expect((await app.inject('/api/v1/public/content')).body).not.toContain('PRIVATE');
    expect((await app.inject({ method: 'PUT', url, headers, payload })).statusCode).toBe(409);
    expect((await app.inject({ method: 'POST', url: `${url}/publish`, headers, payload: { revision: 0, baseRevision: 1 } })).statusCode).toBe(409);
    const published = await app.inject({ method: 'POST', url: `${url}/publish`, headers, payload: { revision: 1, baseRevision: 1 } });
    expect(published.statusCode).toBe(200);
    expect(published.json().revision).toBe(2);
    expect((await app.inject('/api/v1/public/essays/body?path=note')).body).toContain('PRIVATE');
    expect((await app.inject({ url, headers })).json()).toBeNull();
  });
  it('rejects stale drafts after another writer updates the published article', async () => {
    const { app, headers, row } = await setup();
    const url = `/api/v1/admin/essays/${row.id}/draft`;
    await app.inject({ method: 'PUT', url, headers, payload: { data: row.data, baseRevision: 1, revision: 0 } });
    app.content.update('essays', row.id, { ...row.data, body: 'OTHER' }, 1);
    expect((await app.inject({ method: 'POST', url: `${url}/publish`, headers, payload: { baseRevision: 1, revision: 1 } })).statusCode).toBe(409);
    expect(app.content.essayBody('note')).toBe('OTHER');
  });
  it('keeps images used only by working drafts private and prevents their deletion', async () => {
    const { app, headers, row } = await setup();
    app.db.connection.prepare('INSERT INTO media_assets (id, filename, purpose, metadata, created_at) VALUES (?, ?, ?, ?, ?)').run('draft-image', 'image.png', 'essay', '{}', Date.now());
    const url = `/api/v1/admin/essays/${row.id}/draft`;
    const response = await app.inject({ method: 'PUT', url, headers, payload: { data: { ...row.data, body: '![](/api/v1/media/draft-image/large)' }, baseRevision: 1, revision: 0 } });
    expect(response.statusCode).toBe(200);
    expect(app.media.isPublic('draft-image')).toBe(false);
    expect(() => app.content.deleteMediaRecord('draft-image')).toThrow('文件仍然被内容或草稿引用');
    expect((await app.inject({ method: 'DELETE', url, headers, payload: { baseRevision: 1, revision: 0 } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url, headers, payload: { baseRevision: 1, revision: 1 } })).statusCode).toBe(200);
    expect(() => app.content.deleteMediaRecord('draft-image')).not.toThrow();
  });
  it('parses editable YAML and image paths without touching fenced examples or formulas', async () => {
    const { app, headers } = await setup();
    const source = '---\ntitle: 山野记录\npublicPath: 旅行/山野\ndate: 2026-10-03\ntags: [徒步]\ncover: images/cover.png\n---\n![山](images/a.png)\n\n![再次](images/a.png)\n\n```md\n![示例](example.png)\n```\n\n$$x^2$$';
    const result = await app.inject({ method: 'POST', url: '/api/v1/admin/essay-import', headers, payload: { source, filename: 'note.md' } });
    expect(result.statusCode).toBe(200);
    expect(result.json().images).toEqual(['images/a.png', 'images/cover.png']);
    expect(result.json().data).toMatchObject({ title: '山野记录', folder: ['旅行'], tags: ['徒步'], status: 'draft' });
    const rewritten = await app.inject({ method: 'POST', url: '/api/v1/admin/essay-import', headers, payload: { source, filename: 'note.md', replacements: { 'images/a.png': '/api/v1/media/a/large', 'images/cover.png': '/api/v1/media/b/large' } } });
    expect(rewritten.json().images).toEqual([]);
    expect(rewritten.json().data.body).toContain('![山](/api/v1/media/a/large)');
    expect(rewritten.json().data.body).toContain('![示例](example.png)');
    expect(rewritten.json().data.body).toContain('$$x^2$$');
  });
  it('persists the game/avatar switches and cursor default in the shared site settings', async () => {
    const { app, headers } = await setup();
    const saved = await app.inject({ method: 'POST', url: '/api/v1/admin/site', headers, payload: { data: { ...siteDefaults, play: { game: false, avatar: false }, cursor: 'rabbit' } } });
    expect(saved.statusCode).toBe(201);
    expect((await app.inject('/api/v1/public/content')).json().site).toMatchObject({ play: { game: false, avatar: false }, cursor: 'rabbit' });
  });
  it('maps only image reference definitions and replaces escaped image URLs without rewriting code', async () => {
    const { app, headers } = await setup();
    const source = '![山](images/a\\(b\\).png)\n\n![引用][photo]\n\n[photo]: images/photo.png\n\n[文件][file]\n\n[file]: notes/related.md\n\n`![示例](ignored.png)`';
    const response = await app.inject({ method: 'POST', url: '/api/v1/admin/essay-import', headers, payload: { source, filename: 'note.md', replacements: { 'images/a(b).png': '/api/v1/media/a/large', 'images/photo.png': '/api/v1/media/b/large' } } });
    expect(response.statusCode).toBe(200);
    expect(response.json().images).toEqual([]);
    expect(response.json().data.body).toContain('![山](/api/v1/media/a/large)');
    expect(response.json().data.body).toContain('[photo]: /api/v1/media/b/large');
    expect(response.json().data.body).toContain('[file]: notes/related.md');
    expect(response.json().data.body).toContain('`![示例](ignored.png)`');
  });
});
