import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SiteDatabase } from '../../../server/db/database';
import { ContentService } from '../../../server/content/service';

const databases: SiteDatabase[] = [];
function setup() { const db = openDatabase(':memory:'); databases.push(db); return { db, content: new ContentService(db) }; }
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

const footprint = { name: '梅里雪山', region: '云南', lnglat: [98.88, 28.44], date: '2026-01', note: '日照金山', photos: [] };
const photo = { title: '金山', place: '云南', date: '2026-01-27', story: '清晨', src: 'content/gallery/a.webp', thumb: 'content/gallery/thumbs/a.webp' };
const essay = { publicPath: '随笔/雪山', title: '雪山', subtitle: '', summary: '一次徒步', date: '2026-10-03', tags: ['徒步'], folder: ['随笔'], featured: false, body: '## 正文\n\n$E=mc^2$\n\n![图](./assets/图.png)', status: 'draft' };

describe('persistent content operations', () => {
  it('links multiple photos to an existing place or region without requiring a separate footprint field', () => {
    const { content } = setup();
    const fp = content.create('footprints', footprint, 'meili');
    const first = content.create('gallery', { ...photo, place: '梅里雪山' }, 'first');
    const second = content.create('gallery', photo, 'second');
    expect(first.data.footprint).toBe(fp.id);
    expect(second.data.footprint).toBe(fp.id);
    expect(content.publicSnapshot().footprints[0].photos).toEqual(['first', 'second']);
    expect(content.list('footprints')).toHaveLength(1);
  });

  it('creates one footprint from a located photo and reuses it for later photos', () => {
    const { content } = setup();
    const located = { ...photo, place: '示例大学', location: { lnglat: [113.94, 22.53], address: '广东省深圳市南山区', source: 'search' } };
    const first = content.create('gallery', located, 'first');
    const second = content.create('gallery', { ...located, visible: false }, 'second');
    const fp = content.get('footprints', first.data.footprint!)!;
    expect(fp.data).toMatchObject({ name: '示例大学', region: located.location.address, lnglat: located.location.lnglat, date: photo.date });
    expect(fp.data.photos).toEqual(['first', 'second']);
    expect(content.publicSnapshot().footprints[0].photos).toEqual(['first']);
    expect(second.data.footprint).toBe(fp.id);
    expect(content.list('footprints')).toHaveLength(1);
    const published = content.update('gallery', second.id, { ...second.data, visible: true }, second.revision);
    expect(content.publicSnapshot().footprints[0].photos).toEqual(['first', 'second']);
    expect(published.data.footprint).toBe(fp.id);
  });

  it('honors explicit association and unlinking and does not invent coordinates for an unknown place', () => {
    const { content } = setup();
    const fp = content.create('footprints', footprint, 'meili');
    const linked = content.create('gallery', { ...photo, place: '其他地区', footprint: fp.id });
    const unlinked = content.update('gallery', linked.id, { ...linked.data, footprint: '' }, linked.revision);
    expect(unlinked.data.footprint).toBe('');
    expect(content.publicSnapshot().footprints[0].photos).toEqual([]);
    expect(content.create('gallery', { ...photo, place: '未知地点' }).data.footprint).toBeUndefined();
    expect(content.create('gallery', { ...photo, place: '空坐标', location: { lnglat: [0, 0], source: 'manual' } }).data.footprint).toBeUndefined();
    expect(content.list('footprints')).toHaveLength(1);
  });

  it('requires a choice for ambiguous places and rolls back automatic footprints on failed saves', () => {
    const { content } = setup();
    content.create('footprints', footprint, 'meili');
    content.create('footprints', { ...footprint, name: '玉龙雪山' }, 'jade');
    expect(() => content.create('gallery', photo)).toThrowError(expect.objectContaining({ code: 'AMBIGUOUS_FOOTPRINT' }));
    expect(() => content.create('gallery', { ...photo, place: '新地区', location: { lnglat: [120, 30], source: 'manual' }, src: '/api/v1/media/missing/large' })).toThrow();
    expect(content.list('footprints')).toHaveLength(2);
    expect(content.list('gallery')).toHaveLength(0);
  });

  it('moves photos between regions and keeps stale footprint edits from overwriting the new relation', () => {
    const { content } = setup();
    const old = content.create('footprints', footprint, 'meili');
    const next = content.create('footprints', { ...footprint, name: '深圳', region: '广东' }, 'shenzhen');
    const first = content.create('gallery', { ...photo, place: old.data.name });
    const second = content.create('gallery', { ...photo, place: old.data.name });
    const stale = content.get('footprints', old.id)!;
    content.update('gallery', first.id, { ...first.data, place: next.data.name, footprint: undefined }, first.revision);
    expect(content.get('footprints', old.id)!.data.photos).toEqual([second.id]);
    expect(content.get('footprints', next.id)!.data.photos).toEqual([first.id]);
    expect(() => content.update('footprints', old.id, stale.data, stale.revision)).toThrowError(expect.objectContaining({ statusCode: 409 }));
  });

  it('can backfill legacy location-only photos repeatedly without duplicating places or disturbing links', () => {
    const { content, db } = setup();
    const fp = content.create('footprints', footprint, 'meili');
    // Simulate photos saved by the old uploader, which never populated photo_footprints.
    const insert = db.connection.prepare('INSERT INTO content_records (kind,id,data,created_at,updated_at) VALUES (?,?,?,?,?)');
    insert.run('gallery', 'legacy', JSON.stringify({ ...photo, footprint: '', visible: true }), 1, 1);
    insert.run('gallery', 'no-location', JSON.stringify({ ...photo, place: '未知地区', visible: true }), 1, 1);
    expect(content.syncPhotoLocations()).toEqual({ linked: 1, skipped: 1, errors: [] });
    expect(content.publicSnapshot().footprints[0].photos).toEqual(['legacy']);
    const revision = content.get('footprints', fp.id)!.revision;
    expect(content.syncPhotoLocations()).toEqual({ linked: 0, skipped: 1, errors: [] });
    expect(content.get('footprints', fp.id)!.revision).toBe(revision);
  });

  it('creates, reads, updates and deletes with optimistic revisions', () => {
    const { content } = setup();
    const first = content.create('wishes', { name: '稻城亚丁', region: '四川', reason: '徒步' });
    expect(first.revision).toBe(1);
    expect(content.get('wishes', first.id)?.data.name).toBe('稻城亚丁');
    const changed = content.update('wishes', first.id, { ...first.data, reason: '看雪山' }, 1);
    expect(changed.revision).toBe(2);
    expect(() => content.update('wishes', first.id, first.data, 1)).toThrowError(expect.objectContaining({ statusCode: 409 }));
    expect(() => content.delete('wishes', first.id, 1)).toThrowError(expect.objectContaining({ statusCode: 409 }));
    expect(content.get('wishes', first.id)?.data.reason).toBe('看雪山');
    content.delete('wishes', first.id, 2);
    expect(content.get('wishes', first.id)).toBeNull();
  });

  it('rejects invalid coordinates, executable URLs, unknown properties and unsafe article paths', () => {
    const { content } = setup();
    const cases: [string, unknown][] = [
      ['footprints', { ...footprint, lnglat: [200, 28] }],
      ['footprints', { ...footprint, lnglat: [98, Number.NaN] }],
      ['footprints', { ...footprint, date: '2026-99' }],
      ['gallery', { ...photo, src: 'javascript:alert(1)' }],
      ['gallery', { ...photo, src: 'content/%5cprivate.webp' }],
      ['gallery', { ...photo, src: 'content/%00private.webp' }],
      ['wishes', { name: 'A', reason: 'B', region: '', script: 'x()' }],
      ['essays', { ...essay, publicPath: '../private' }],
      ['essays', { ...essay, publicPath: 'A/%2e%2e/private' }],
      ['essays', { ...essay, publicPath: 'A\\private' }],
      ['essays', { ...essay, publicPath: 'B/雪山' }],
    ];
    for (const [kind, data] of cases) expect(() => content.create(kind, data)).toThrow();
    expect(() => content.create('unknown', {})).toThrow();
    expect(content.list('essays')).toHaveLength(0);
  });

  it('only exposes published article metadata and bodies, including legacy paths', () => {
    const { content } = setup();
    const draft = content.create('essays', essay);
    expect(content.publicSnapshot().essays.essays).toHaveLength(0);
    expect(() => content.essayBody('随笔/雪山')).toThrowError(expect.objectContaining({ statusCode: 404 }));
    expect(content.essayBody('随笔/雪山', true)).toContain('$E=mc^2$');
    const published = content.update('essays', draft.id, { ...draft.data, status: 'published' }, 1);
    const meta = content.publicSnapshot().essays.essays[0];
    expect(meta.id).toBe('随笔/雪山');
    expect(meta.features.math).toBe(true);
    expect(meta.folder).toEqual(['随笔']);
    expect(content.essayBody('随笔/雪山')).toContain('assets/图.png');
    content.update('essays', draft.id, { ...published.data, status: 'draft' }, 2);
    expect(() => content.essayBody('随笔/雪山')).toThrow();
  });

  it('uses one photo/footprint relation, rejects missing references and clears deleted references', () => {
    const { content } = setup();
    const fp = content.create('footprints', footprint, 'meili');
    const p = content.create('gallery', { ...photo, footprint: fp.id }, 'golden');
    expect(content.publicSnapshot().footprints[0].photos).toEqual(['golden']);
    expect(content.publicSnapshot().photos[0].footprint).toBe('meili');
    const another = content.create('footprints', { ...footprint, name: '玉龙' }, 'jade');
    content.update('gallery', p.id, { ...p.data, footprint: another.id }, 1);
    expect(content.get('footprints', fp.id)?.revision).toBe(3);
    expect(content.publicSnapshot().footprints.find(f => f.id === fp.id)?.photos).toEqual([]);
    expect(content.publicSnapshot().footprints.find(f => f.id === another.id)?.photos).toEqual(['golden']);
    expect(() => content.create('gallery', { ...photo, footprint: 'missing' })).toThrow();
    content.delete('footprints', another.id, content.get('footprints', another.id)!.revision);
    expect(content.publicSnapshot().photos[0].footprint).toBeUndefined();
    expect(content.get('gallery', p.id)?.revision).toBe(3);
    content.delete('gallery', p.id, 3);
    expect(content.publicSnapshot().photos).toHaveLength(0);
  });

  it('reorders a collection atomically and rejects duplicates or incomplete order', () => {
    const { content } = setup();
    const a = content.create('wishes', { name: 'A', region: '', reason: 'a' });
    const b = content.create('wishes', { name: 'B', region: '', reason: 'b' });
    const revisions = { [a.id]: a.revision, [b.id]: b.revision };
    expect(() => content.reorder('wishes', [b.id, b.id], revisions)).toThrow();
    expect(() => content.reorder('wishes', [a.id], revisions)).toThrow();
    content.reorder('wishes', [b.id, a.id], revisions);
    expect(content.list('wishes').map(r => r.id)).toEqual([b.id, a.id]);
    expect(() => content.reorder('wishes', [a.id, b.id], revisions)).toThrowError(expect.objectContaining({ statusCode:409 }));
    expect(content.list('wishes').map(r => r.id)).toEqual([b.id, a.id]);
  });

  it('applies folder reordering to the published category tree', () => {
    const { content } = setup();
    const a=content.create('folders',{path:'A',title:'A',order:0});
    const b=content.create('folders',{path:'B',title:'B',order:1});
    for(const folder of ['A','B'])content.create('essays',{...essay,publicPath:`${folder}/post`,folder:[folder],status:'published'});
    content.reorder('folders',[b.id,a.id],{[a.id]:1,[b.id]:1});
    expect(content.publicSnapshot().essays.tree.children.map(f=>f.path)).toEqual(['B','A']);
  });

  it('converts a future wish into a visited footprint without losing a failed conversion', () => {
    const { content } = setup();
    const wish = content.create('wishes', { name: '亚丁', region: '四川', reason: '徒步', lnglat: [100.31, 28.53] }, 'yading');
    expect(() => content.visitWish(wish.id, 1, { date: '2026-10-03', note: '到了', lnglat: [900, 0] })).toThrow();
    expect(content.get('wishes', wish.id)).not.toBeNull();
    const visited = content.visitWish(wish.id, 1, { date: '2026-10-03', note: '到了' });
    expect(content.get('wishes', wish.id)).toBeNull();
    expect(visited.id).toBe('yading');
    expect(visited.data.lnglat).toEqual([100.31, 28.53]);
  });

  it('does not let media deletion orphan references', () => {
    const { content, db } = setup();
    db.connection.prepare('INSERT INTO media_assets (id, filename, purpose, metadata, created_at) VALUES (?, ?, ?, ?, ?)').run('test-asset', 'x.webp', 'gallery', '{}', Date.now());
    const p = content.create('gallery', { ...photo, src: '/api/v1/media/test-asset/large', thumb: '/api/v1/media/test-asset/thumb' });
    expect(content.mediaReferences('test-asset')).toEqual([{ kind: 'gallery', id: p.id }]);
    expect(() => content.deleteMediaRecord('test-asset')).toThrowError(expect.objectContaining({ statusCode: 409 }));
    content.delete('gallery', p.id, p.revision);
    content.deleteMediaRecord('test-asset');
    expect(db.connection.prepare('SELECT id FROM media_assets WHERE id = ?').get('test-asset')).toBeUndefined();
  });
});
