import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
const apps: FastifyInstance[] = [], dirs: string[] = [];
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
describe('legacy assets publication guards', () => {
  it('guards article attachments and does not expose metadata or unrelated files', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'site-legacy-')); dirs.push(dataDir);
    const dir = path.join(dataDir, 'legacy/content/essays/分类/文章'); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '图.png'), Buffer.from([1,2,3])); writeFileSync(path.join(dir, 'private.json'), '{}');
    const app = await createApp({ databasePath: ':memory:', dataDir }); apps.push(app);
    let row = app.content.create('essays', { publicPath: '分类/文章', folder: ['分类'], title: '文', date: '2026-10-03', body: '![图](图.png)', status: 'draft' });
    const url = '/content/essays/' + ['分类','文章','图.png'].map(encodeURIComponent).join('/');
    expect((await app.inject(url)).statusCode).toBe(404);
    row = app.content.update('essays', row.id, { ...row.data, status: 'published' }, row.revision);
    expect((await app.inject(url)).rawPayload).toEqual(Buffer.from([1,2,3]));
    expect((await app.inject('/content/essays/' + ['分类','文章','private.json'].map(encodeURIComponent).join('/'))).statusCode).toBe(404);
    app.content.update('essays', row.id, { ...row.data, status: 'draft' }, row.revision);
    expect((await app.inject(url)).statusCode).toBe(404);
  });
  it('serves gallery and music only while an exact file URL is referenced by visible content', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'site-legacy-')); dirs.push(dataDir);
    const dir = path.join(dataDir, 'legacy/content/gallery'); mkdirSync(dir, { recursive: true }); writeFileSync(path.join(dir, '图.webp'), 'photo');
    const app = await createApp({ databasePath: ':memory:', dataDir }); apps.push(app);
    const row = app.content.create('gallery', { title:'图', place:'', date:'2026-10-03', story:'', src:'content/gallery/图.webp', thumb:'content/gallery/图.webp', visible:true });
    const url = '/content/gallery/' + encodeURIComponent('图.webp');
    expect((await app.inject({ url, headers: { cookie: 'site_session=expired' } })).body).toBe('photo');
    app.content.update('gallery', row.id, { ...row.data, visible:false }, row.revision);
    expect((await app.inject(url)).statusCode).toBe(404);
    expect((await app.inject('/content/%2e%2e/.env.server')).statusCode).toBe(404);
  });
});
