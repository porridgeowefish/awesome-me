import { describe, expect, it } from 'vitest';
import type { ContentRecord } from '../../src/contracts/content';
import { collectionAssetUrl, collectionPage, mergeSavedRecord, recordStatus, reorderedRecords } from '../../src/features/admin/collectionModel';

const photo = (index: number, visible = true): ContentRecord<'gallery'> => ({
  id: `photo-${index}`, kind: 'gallery', revision: index + 1, order: index,
  createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
  data: { title: `照片 ${index}`, place: index % 2 ? '台北' : 'Hills', date: '2026-10-03', story: '行走记录', src: 'library/photo.jpg', thumb: 'library/thumb.jpg', visible },
});
const essay = (status: 'published' | 'draft'): ContentRecord<'essays'> => ({
  id: status, kind: 'essays', revision: 1, order: 0, createdAt: '2026-10-03T00:00:00Z', updatedAt: '2026-10-03T00:00:00Z',
  data: { title: '旅途', publicPath: status, date: '2026-10-03', folder: [], tags: ['山野'], subtitle: '', summary: '', body: '', featured: false, status },
});

describe('collection browsing', () => {
  it('retains acknowledged create/update revisions without depending on a subsequent list request', () => {
    const before = [photo(0), photo(1)];
    const saved = { ...before[0], revision: 9, data: { ...before[0].data, title: '已保存的新标题' } };
    const after = mergeSavedRecord(before, saved);
    expect(after[0]).toBe(saved);
    expect(after[1]).toBe(before[1]);
    expect(before[0].revision).toBe(1);
    expect(mergeSavedRecord(after, photo(2)).map(row => row.revision)).toEqual([9, 2, 3]);
    expect(collectionPage(after, '已保存的新标题', 'all', 0).shown[0].revision).toBe(9);
  });
  it('combines trimmed case-insensitive search and publication filters', () => {
    const items = [photo(0), photo(1, false), photo(2, false), photo(3)];
    expect(collectionPage(items, ' HILLS ', 'private', 0).shown.map(row => row.id)).toEqual(['photo-2']);
    expect(collectionPage(items, '台北', 'public', 0).shown.map(row => row.id)).toEqual(['photo-3']);
    expect(collectionPage(items, '行走记录', 'all', 0).filtered).toHaveLength(4);
  });

  it('treats article drafts separately from published content and invisible photos', () => {
    const items = [essay('published'), essay('draft'), photo(1, false)];
    expect(collectionPage(items, '', 'private', 0).shown.map(row => row.id)).toEqual(['draft', 'photo-1']);
    expect(recordStatus(items[0])).toBe('已发布');
    expect(recordStatus(items[1])).toBe('草稿');
    expect(recordStatus(items[2])).toBe('未公开');
  });

  it('clamps a stale last page after deletion or filtering without showing an empty page', () => {
    const items = Array.from({ length: 51 }, (_, index) => photo(index));
    expect(collectionPage(items, '', 'all', 2).shown.map(row => row.id)).toEqual(['photo-50']);
    const afterDelete = collectionPage(items.slice(0, 50), '', 'all', 2);
    expect(afterDelete.page).toBe(1);
    expect(afterDelete.shown).toHaveLength(25);
    const afterFilter = collectionPage(items, '照片 50', 'all', 2);
    expect(afterFilter.page).toBe(0);
    expect(afterFilter.shown.map(row => row.id)).toEqual(['photo-50']);
    expect(collectionPage([], '', 'all', 9)).toMatchObject({ page: 0, pages: 1, shown: [] });
  });

  it('reorders against the full collection and preserves every revision without mutating the source', () => {
    const items = [photo(0), photo(1), photo(2), photo(3)];
    const next = reorderedRecords(items, 'photo-2', -1)!;
    expect(next.map(row => row.id)).toEqual(['photo-0', 'photo-2', 'photo-1', 'photo-3']);
    expect(next.map(row => row.revision)).toEqual([1, 3, 2, 4]);
    expect(items.map(row => row.id)).toEqual(['photo-0', 'photo-1', 'photo-2', 'photo-3']);
    expect(reorderedRecords(items, 'photo-0', -1)).toBeNull();
    expect(reorderedRecords(items, 'photo-3', 1)).toBeNull();
    expect(reorderedRecords(items, 'missing', 1)).toBeNull();
  });
});

describe('read-only media previews', () => {
  it('resolves library paths and valid HTTP assets for images and audio', () => {
    expect(collectionAssetUrl('/library/music/山野.mp4')).toBe('/library/music/%E5%B1%B1%E9%87%8E.mp4');
    expect(collectionAssetUrl('/api/v1/media/music-id/original')).toBe('/api/v1/media/music-id/original');
    expect(collectionAssetUrl('https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
  });

  it('does not render credentials, unsafe protocols, or escaped traversal as asset URLs', () => {
    for (const value of ['', 'javascript:alert(1)', 'data:image/svg+xml,script', '//evil.example/img', 'https://user:secret@example.com/a', '../private.png', '/library/%2e%2e/private.png', '/library/..\\private.png']) {
      expect(collectionAssetUrl(value), value).toBeUndefined();
    }
    expect(collectionAssetUrl({ src: 'library/photo.jpg' })).toBeUndefined();
  });
});
