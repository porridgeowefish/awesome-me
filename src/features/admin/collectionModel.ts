import { assetUrlSchema, type ContentRecord, type ResourceKind } from '../../contracts/content';
import { publicUrl } from '@/shared/lib/url';

export type PublicationFilter = 'all' | 'public' | 'private';
export const COLLECTION_PAGE_SIZE = 25;
/** Keep an acknowledged mutation available even when the following list refresh fails. */
export function mergeSavedRecord(items: ContentRecord[], saved: ContentRecord): ContentRecord[] {
  const index = items.findIndex(row => row.id === saved.id && row.kind === saved.kind);
  if (index < 0) return [...items, saved];
  const next = items.slice();
  next[index] = saved;
  return next;
}
export const recordTitle = (row: ContentRecord): string => {
  const data = row.data as Record<string, unknown>;
  return String(data.title ?? data.name ?? data.label ?? row.id);
};
export function isRecordPublic(row: ContentRecord): boolean {
  const data = row.data as Record<string, unknown>;
  return 'status' in data ? data.status === 'published' : data.visible !== false;
}
export function recordStatus(row: ContentRecord): string {
  return row.kind === 'essays' ? isRecordPublic(row) ? '已发布' : '草稿' : isRecordPublic(row) ? '公开' : '未公开';
}
export function collectionPage(items: ContentRecord[], query: string, status: PublicationFilter, requestedPage: number) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter(row => (!needle || `${row.id} ${JSON.stringify(row.data)}`.toLocaleLowerCase().includes(needle)) &&
    (status === 'all' || isRecordPublic(row) === (status === 'public')));
  const pages = Math.max(1, Math.ceil(filtered.length / COLLECTION_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(requestedPage) || 0));
  return { filtered, pages, page, shown: filtered.slice(page * COLLECTION_PAGE_SIZE, (page + 1) * COLLECTION_PAGE_SIZE) };
}
export function reorderedRecords(items: ContentRecord[], id: string, delta: number): ContentRecord[] | null {
  const index = items.findIndex(row => row.id === id);
  if (index < 0 || index + delta < 0 || index + delta >= items.length) return null;
  const next = items.slice();
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}
export interface CollectionColumn { key: string; label: string }
export function collectionColumns(kind: ResourceKind): CollectionColumn[] {
  const columns: Partial<Record<ResourceKind, CollectionColumn[]>> = {
    music: [{ key: 'artist', label: '艺术家' }, { key: 'album', label: '专辑' }],
    essays: [{ key: 'date', label: '日期' }, { key: 'folder', label: '分类' }, { key: 'tags', label: '标签' }],
    gallery: [{ key: 'place', label: '地点' }, { key: 'date', label: '日期' }, { key: 'footprint', label: '关联足迹' }],
    footprints: [{ key: 'region', label: '地区' }, { key: 'date', label: '到访日期' }, { key: 'photos', label: '照片' }],
    wishes: [{ key: 'region', label: '地区' }, { key: 'reason', label: '想去的原因' }],
    brands: [{ key: 'mono', label: '单色' }],
    folders: [{ key: 'path', label: '分类路径' }, { key: 'order', label: '排序' }],
  };
  return columns[kind] ?? [];
}
export function cellText(value: unknown, key?: string): string {
  if (key === 'photos' && Array.isArray(value)) return `${value.length} 张`;
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.join(key === 'folder' ? ' / ' : '、') || '—';
  if (value == null || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
/** Preview only validated HTTP(S) and library/public asset paths. */
export function collectionAssetUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || !assetUrlSchema.safeParse(value).success) return undefined;
  return publicUrl(value);
}
