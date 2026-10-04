import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
const apps: FastifyInstance[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });
async function setup() {
  const app = await createApp({ databasePath: ':memory:', logger: false }); apps.push(app);
  await app.auth.createOwner('owner', 'long-owner-password');
  const rw = app.auth.issueToken({ name: 'editor', scopes: ['wishes:write', 'essays:write', 'footprints:write'], expiresAt: '2099-01-01T00:00:00Z' });
  return { app, headers: { authorization: `Bearer ${rw.token}` } };
}
describe('content API permissions and publication', () => {
  it('creates and displays multiple photos at one footprint through the API, while enforcing new-place permissions', async () => {
    const { app } = await setup();
    const scoped = app.auth.issueToken({ name: 'photos', scopes: ['gallery:write'], expiresAt: '2099-01-01T00:00:00Z' });
    const full = app.auth.issueToken({ name: 'places', scopes: ['gallery:write', 'footprints:write'], expiresAt: '2099-01-01T00:00:00Z' });
    const photoHeaders = { authorization: `Bearer ${scoped.token}` }, headers = { authorization: `Bearer ${full.token}` };
    const data = { title: '照片', place: '示例大学', date: '2026-10-03', story: '', src: 'content/gallery/a.webp', thumb: 'content/gallery/thumbs/a.webp', location: { lnglat: [113.94, 22.53], address: '广东深圳', source: 'search' } };
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/gallery', headers: photoHeaders, payload: { data } })).statusCode).toBe(403);
    expect(app.content.list('footprints')).toHaveLength(0);
    const first = await app.inject({ method: 'POST', url: '/api/v1/admin/gallery', headers, payload: { data } });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({ method: 'POST', url: '/api/v1/admin/gallery', headers: photoHeaders, payload: { data } });
    expect(second.statusCode).toBe(201);
    const snapshot = (await app.inject('/api/v1/public/content')).json();
    expect(snapshot.footprints).toHaveLength(1);
    expect(snapshot.footprints[0].photos).toEqual([first.json().id, second.json().id]);
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/gallery/sync-locations', headers: photoHeaders })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/gallery/sync-locations', headers })).json()).toEqual({ linked: 0, skipped: 0, errors: [] });
  });
  it('rejects unauthenticated writes and scope escalation and accepts validated CRUD', async () => {
    const { app, headers } = await setup();
    const payload = { data: { name: '亚丁', region: '四川', reason: '徒步' } };
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/wishes', payload })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/admin/music', headers, payload })).statusCode).toBe(403);
    const created = await app.inject({ method: 'POST', url: '/api/v1/admin/wishes', headers, payload });
    expect(created.statusCode).toBe(201);
    const row = created.json();
    expect((await app.inject({ url: `/api/v1/admin/wishes/${row.id}`, headers })).json().data.name).toBe('亚丁');
    const changed = await app.inject({ method: 'PUT', url: `/api/v1/admin/wishes/${row.id}`, headers, payload: { data: { ...row.data, reason: '雪山' }, revision: 1 } });
    expect(changed.statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/api/v1/admin/wishes/${row.id}`, headers, payload: { data: row.data, revision: 1 } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/admin/wishes/${row.id}`, headers, payload: { revision: 2 } })).statusCode).toBe(200);
    expect((await app.inject({ url: `/api/v1/admin/wishes/${row.id}`, headers })).statusCode).toBe(404);
  });
  it('does not expose a draft through public body or legacy Markdown routes', async () => {
    const { app, headers } = await setup();
    const data = { publicPath: '分类/文章', folder: ['分类'], title: '文章', date: '2026-10-03', body: 'SECRET-DRAFT\n\n$$x^2$$', status: 'draft' };
    const created = await app.inject({ method: 'POST', url: '/api/v1/admin/essays', headers, payload: { data } });
    expect(created.statusCode).toBe(201);
    const row = created.json();
    const bodyUrl = '/api/v1/public/essays/body?path=' + encodeURIComponent(data.publicPath);
    const legacy = '/content/essays/' + encodeURIComponent('分类') + '/' + encodeURIComponent('文章') + '/index.md';
    for (const url of [bodyUrl, legacy]) expect((await app.inject(url)).statusCode).toBe(404);
    expect((await app.inject('/api/v1/public/content')).body).not.toContain('SECRET-DRAFT');
    await app.inject({ method: 'PUT', url: `/api/v1/admin/essays/${row.id}`, headers, payload: { data: { ...row.data, status: 'published' }, revision: 1 } });
    for (const url of [bodyUrl, legacy]) expect((await app.inject(url)).body).toContain('$$x^2$$');
    await app.inject({ method: 'PUT', url: `/api/v1/admin/essays/${row.id}`, headers, payload: { data: row.data, revision: 2 } });
    for (const url of [bodyUrl, legacy]) expect((await app.inject(url)).statusCode).toBe(404);
  });
  it('supports scoped collection order and future-to-visited conversion', async () => {
    const { app, headers } = await setup();
    const first = app.content.create('wishes', { name: 'A', region: '', reason: 'a', lnglat: [100, 28] });
    const second = app.content.create('wishes', { name: 'B', region: '', reason: 'b' });
    const order = await app.inject({ method: 'POST', url: '/api/v1/admin/wishes/reorder', headers, payload: { ids: [second.id, first.id], revisions: { [first.id]:1,[second.id]:1 } } });
    expect(order.statusCode).toBe(200);
    expect((await app.inject({ method:'POST',url:'/api/v1/admin/wishes/reorder',headers,payload:{ids:[first.id,second.id],revisions:{[first.id]:1,[second.id]:1}}})).statusCode).toBe(409);
    expect((await app.inject({ url: '/api/v1/admin/wishes', headers })).json().items[0].id).toBe(second.id);
    const converted = await app.inject({ method: 'POST', url: `/api/v1/admin/wishes/${first.id}/visit`, headers, payload: { revision: 2, date: '2026-10-03', note: '到了' } });
    expect(converted.statusCode).toBe(201);
    expect((await app.inject('/api/v1/public/content')).json().footprints[0].id).toBe(first.id);
  });
});
