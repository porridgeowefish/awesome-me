import { randomUUID } from 'node:crypto';
import { resourceSchemas, RESOURCE_KINDS, SINGLETON_KINDS, type ContentRecord, type PublicSnapshot, type ResourceData, type ResourceKind } from '../../src/contracts/content.ts';
import { buildEssayIndex, type FolderMeta } from '../../tools/build/content/essays.ts';
import { toFrontmatter } from '../../tools/scripts/lib/obsidian.mjs';
import type { SiteDatabase } from '../db/database.ts';
import { AppError } from '../errors.ts';
import { ContentRepository } from './repository.ts';

export function requireKind(value: string): ResourceKind {
  if (!RESOURCE_KINDS.includes(value as ResourceKind)) throw new AppError(404, 'UNKNOWN_RESOURCE', '内容类型不存在');
  return value as ResourceKind;
}
const validId = (value: string) => value.length > 0 && value.length <= 150 && value !== '.' && value !== '..' && !/[\\/\u0000-\u001f?#]/.test(value);
const assetIds = (data: unknown) => [...new Set([...JSON.stringify(data).matchAll(/\/api\/v1\/media\/([a-zA-Z0-9_-]+)(?:\/|\\?"|\b)/g)].map(match => match[1]))];

export class ContentService {
  private readonly repository: ContentRepository;
  constructor(private readonly db: SiteDatabase) { this.repository = new ContentRepository(db); }

  get<K extends ResourceKind>(kind: K, id: string): ContentRecord<K> | null {
    const row = this.repository.get(kind, id);
    if (!row) return null;
    if (kind === 'gallery') {
      const footprint = this.db.connection.prepare('SELECT footprint_id FROM photo_footprints WHERE photo_id = ?').get(id);
      const explicitlyUnlinked = (row.data as ResourceData<'gallery'>).footprint === '';
      row.data = { ...row.data, footprint: footprint ? String(footprint.footprint_id) : explicitlyUnlinked ? '' : undefined } as ResourceData<K>;
    }
    if (kind === 'footprints') {
      const photos = this.db.connection.prepare('SELECT photo_id FROM photo_footprints WHERE footprint_id = ? ORDER BY sort_order, photo_id').all(id);
      row.data = { ...row.data, photos: photos.map(item => String(item.photo_id)) } as ResourceData<K>;
    }
    return row;
  }

  list<K extends ResourceKind>(kind: K): ContentRecord<K>[] {
    requireKind(kind);
    return this.repository.list(kind).map(row => this.get(kind, row.id)!);
  }

  create<K extends ResourceKind>(kind: K, input: unknown, id?: string, actor?: string, allowFootprintCreation?: boolean): ContentRecord<K>;
  create(kind: string, input: unknown, id?: string, actor?: string, allowFootprintCreation?: boolean): ContentRecord;
  create(kindValue: string, input: unknown, id: string = randomUUID(), actor = 'owner', allowFootprintCreation = true): ContentRecord {
    const kind = requireKind(kindValue);
    if (SINGLETON_KINDS.has(kind)) id = 'default';
    if (!validId(id)) throw new AppError(400, 'INVALID_ID', '内容 ID 无效');
    const data = resourceSchemas[kind].parse(input);
    return this.db.transaction(() => {
      if (this.repository.get(kind, id)) throw new AppError(409, 'ALREADY_EXISTS', '内容已经存在');
      if (this.repository.list(kind).length >= 10000) throw new AppError(400, 'COLLECTION_LIMIT', '单个集合不能超过 10000 项');
      this.validateReferences(kind, data, id);
      if (kind === 'gallery') this.resolvePhotoFootprint(data as ResourceData<'gallery'>, actor, allowFootprintCreation);
      this.repository.insert(kind, id, data);
      this.syncRelations(kind, id, data);
      this.changed(actor, 'create', `${kind}/${id}`);
      return this.get(kind, id)!;
    });
  }

  update<K extends ResourceKind>(kind: K, id: string, input: unknown, revision: number, actor = 'owner', allowFootprintCreation = true): ContentRecord<K> {
    requireKind(kind);
    const data = resourceSchemas[kind].parse(input) as ResourceData<K>;
    return this.db.transaction(() => {
      this.expectRevision(kind, id, revision);
      this.validateReferences(kind, data, id);
      if (kind === 'gallery') this.resolvePhotoFootprint(data as ResourceData<'gallery'>, actor, allowFootprintCreation);
      this.repository.update(kind, id, data);
      this.syncRelations(kind, id, data);
      this.changed(actor, 'update', `${kind}/${id}`);
      return this.get(kind, id)!;
    });
  }

  delete(kind: ResourceKind, id: string, revision: number, actor = 'owner'): void {
    requireKind(kind);
    if (SINGLETON_KINDS.has(kind)) throw new AppError(400, 'REQUIRED_CONTENT', '站点设置和个人资料不能删除');
    this.db.transaction(() => {
      this.expectRevision(kind, id, revision);
      if (kind === 'footprints') {
        const photos = this.db.connection.prepare('SELECT photo_id FROM photo_footprints WHERE footprint_id = ?').all(id);
        for (const item of photos) this.repository.bump('gallery', String(item.photo_id));
        this.db.connection.prepare('DELETE FROM photo_footprints WHERE footprint_id = ?').run(id);
      }
      if (kind === 'gallery') {
        const old = this.db.connection.prepare('SELECT footprint_id FROM photo_footprints WHERE photo_id = ?').get(id);
        if (old) this.repository.bump('footprints', String(old.footprint_id));
        this.db.connection.prepare('DELETE FROM photo_footprints WHERE photo_id = ?').run(id);
      }
      if (kind === 'brands') {
        const profile = this.repository.get('profile', 'default');
        if (profile && this.brandUsed(profile.data, id)) throw new AppError(409, 'BRAND_REFERENCED', 'Logo 仍然被个人资料使用，请先修改引用');
      }
      if (kind === 'folders') {
        const folder = this.repository.get('folders', id)!.data.path;
        if (this.list('essays').some(item => item.data.folder.join('/') === folder || item.data.folder.join('/').startsWith(`${folder}/`))) {
          throw new AppError(409, 'FOLDER_NOT_EMPTY', '分类仍然包含文章，请先移动文章');
        }
      }
      this.repository.delete(kind, id);
      if (kind === 'essays') this.db.connection.prepare('DELETE FROM essay_working_drafts WHERE essay_id = ?').run(id);
      this.changed(actor, 'delete', `${kind}/${id}`);
    });
  }

  reorder(kind: ResourceKind, ids: string[], revisions: Record<string,number>, actor = 'owner'): void {
    requireKind(kind);
    if (SINGLETON_KINDS.has(kind)) throw new AppError(400, 'INVALID_ORDER', '单例内容不支持排序');
    this.db.transaction(() => {
      const existing = this.repository.list(kind).map(row => row.id);
      if (!Array.isArray(ids) || ids.length !== existing.length || new Set(ids).size !== ids.length || ids.some(id => !existing.includes(id))) {
        throw new AppError(400, 'INVALID_ORDER', '排序必须包含每个现有 ID 且不能重复');
      }
      if (!revisions || Object.keys(revisions).length !== existing.length) throw new AppError(409,'REVISION_CONFLICT','请重新加载集合后再调整顺序');
      ids.forEach(id => this.expectRevision(kind,id,revisions[id]));
      const statement = this.db.connection.prepare('UPDATE content_records SET sort_order = ?, revision = revision + 1, updated_at = ? WHERE kind = ? AND id = ?');
      ids.forEach((id, index) => {
        statement.run(index, Date.now(), kind, id);
        if (kind === 'folders') this.db.connection.prepare("UPDATE content_records SET data = json_set(data, '$.order', ?) WHERE kind = 'folders' AND id = ?").run(index,id);
      });
      this.changed(actor, 'reorder', kind);
    });
  }

  visitWish(id: string, revision: number, input: { date: string; note: string; lnglat?: [number, number] | number[] }, actor = 'owner'): ContentRecord<'footprints'> {
    const wish = this.get('wishes', id);
    if (!wish) throw new AppError(404, 'CONTENT_NOT_FOUND', '未来足迹不存在');
    const data = resourceSchemas.footprints.parse({ name: wish.data.name, region: wish.data.region, lnglat: input.lnglat ?? wish.data.lnglat, date: input.date, note: input.note, photos: [], visible: wish.data.visible });
    return this.db.transaction(() => {
      this.expectRevision('wishes', id, revision);
      if (this.repository.get('footprints', id)) throw new AppError(409, 'ALREADY_EXISTS', '同 ID 的已去足迹已经存在');
      this.repository.insert('footprints', id, data);
      this.repository.delete('wishes', id);
      this.changed(actor, 'visit', `wishes/${id}`);
      return this.get('footprints', id)!;
    });
  }

  publicSnapshot(): PublicSnapshot {
    const photos = this.list('gallery').filter(row => row.data.visible).map(row => ({ ...row.data, id: row.id }));
    const footprints = this.list('footprints').filter(row => row.data.visible).map(row => ({ ...row.data, id: row.id, photos: row.data.photos.filter(id => photos.some(photo => photo.id === id)) }));
    for (const photo of photos) if (!footprints.some(fp => fp.id === photo.footprint)) photo.footprint = undefined;
    const folderMeta = new Map<string, FolderMeta>(this.list('folders').map(row => [row.data.path, { title: row.data.title, order: row.data.order }]));
    const published = this.list('essays').filter(row => row.data.status === 'published');
    const essays = buildEssayIndex(published.map(row => ({ dir: row.data.publicPath, raw: this.rawEssay(row.data), mtime: new Date(row.updatedAt) })), folderMeta, 'content/essays');
    for (const meta of essays.essays) {
      const row = published.find(item => item.data.publicPath === meta.id)!;
      // The legacy bundle path stays the base for relative assets; body fetches use the guarded endpoint.
      meta.bodyUrl = `content/essays/${meta.id}/index.md`;
      if (row.data.cover) meta.cover = row.data.cover;
    }
    return {
      revision: Number(this.db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('content_revision')?.value ?? 0),
      site: this.get('site', 'default')?.data ?? null, profile: this.get('profile', 'default')?.data ?? null,
      photos, footprints, wishes: this.list('wishes').filter(row => row.data.visible).map(row => ({ ...row.data, id: row.id })),
      brands: Object.fromEntries(this.list('brands').filter(row => row.data.visible).map(row => [row.id, row.data])),
      essays, music: { tracks: this.list('music').filter(row => row.data.visible).map(row => ({ ...row.data, id: row.id })), warnings: [] },
    };
  }

  essayBody(publicPath: string, includeDraft = false): string {
    const record = this.list('essays').find(row => row.data.publicPath === publicPath && (includeDraft || row.data.status === 'published'));
    if (!record) throw new AppError(404, 'CONTENT_NOT_FOUND', '文章不存在或尚未发布');
    return record.data.body;
  }

  essayByPath(publicPath: string): ContentRecord<'essays'> | null { return this.list('essays').find(row => row.data.publicPath === publicPath) ?? null; }

  mediaReferences(id: string): { kind: ResourceKind; id: string }[] {
    return RESOURCE_KINDS.flatMap(kind => this.repository.list(kind).filter(row => assetIds(row.data).includes(id)).map(row => ({ kind, id: row.id })));
  }

  deleteMediaRecord(id: string): void {
    this.db.transaction(() => {
      const draftReferences = this.db.connection.prepare('SELECT data FROM essay_working_drafts').all().some(row => assetIds(JSON.parse(String(row.data))).includes(id));
      if (this.mediaReferences(id).length || draftReferences) throw new AppError(409, 'MEDIA_REFERENCED', '文件仍然被内容或草稿引用，请先移除引用');
      const result = this.db.connection.prepare('DELETE FROM media_assets WHERE id = ?').run(id);
      if (!result.changes) throw new AppError(404, 'MEDIA_NOT_FOUND', '文件不存在');
    });
  }

  private expectRevision(kind: ResourceKind, id: string, revision: number): ContentRecord {
    const row = this.repository.get(kind, id);
    if (!row) throw new AppError(404, 'CONTENT_NOT_FOUND', '内容不存在');
    if (!Number.isInteger(revision) || row.revision !== revision) throw new AppError(409, 'REVISION_CONFLICT', '内容已被修改，请重新加载后再保存');
    return row;
  }

  /** Resolve a region at save time; photo_footprints remains the authority for both views. */
  private resolvePhotoFootprint(photo: ResourceData<'gallery'>, actor: string, allowCreation: boolean): void {
    // Empty string is an explicit opt-out; undefined requests automatic association.
    if (photo.footprint !== undefined) return;
    const normalize = (value: string) => value.trim().toLocaleLowerCase();
    const footprints = this.repository.list('footprints');
    const place = normalize(photo.place);
    const address = normalize(photo.location?.address ?? '');
    const exactNames = footprints.filter(row => (place && normalize(row.data.name) === place) || (address && normalize(row.data.name) === address));
    const candidates = exactNames.length ? exactNames : footprints.filter(row => {
      const region = normalize(row.data.region);
      return (region && (region === place || region === address)) || (photo.location && !photo.location.lnglat.every(value => value === 0) && row.data.lnglat.every((value, index) => Math.abs(value - photo.location!.lnglat[index]) < 0.00001));
    });
    if (candidates.length > 1) throw new AppError(400, 'AMBIGUOUS_FOOTPRINT', '这个地区有多个足迹，请在“所属地区”中选择一个。');
    if (candidates.length === 1) { photo.footprint = candidates[0].id; return; }
    if (!photo.location || photo.location.lnglat.every(value => value === 0) || (!place && !address)) return;
    if (!allowCreation) throw new AppError(403, 'FORBIDDEN', '为照片建立新足迹需要 footprints:write 权限；也可以选择已有足迹。');
    const footprint = this.create('footprints', {
      name: (photo.place.trim() || photo.location.address!.trim()).slice(0, 200),
      region: (photo.location.address?.trim() || photo.place.trim()).slice(0, 300),
      lnglat: photo.location.lnglat, date: photo.date, note: '', photos: [], visible: photo.visible,
    }, undefined, actor);
    photo.footprint = footprint.id;
  }

  syncPhotoLocations(actor = 'owner'): { linked: number; skipped: number; errors: { id: string; message: string }[] } {
    const result = { linked: 0, skipped: 0, errors: [] as { id: string; message: string }[] };
    for (const row of this.list('gallery')) {
      if (row.data.footprint) continue;
      try {
        this.db.transaction(() => {
          const data = { ...row.data, footprint: undefined };
          this.resolvePhotoFootprint(data, actor, true);
          if (!data.footprint) { result.skipped++; return; }
          this.update('gallery', row.id, data, row.revision, actor);
          result.linked++;
        });
      } catch (error) { result.errors.push({ id: row.id, message: (error as Error).message }); }
    }
    return result;
  }

  private validateReferences(kind: ResourceKind, data: ResourceData<ResourceKind>, id: string): void {
    for (const asset of assetIds(data)) if (!this.db.connection.prepare('SELECT id FROM media_assets WHERE id = ?').get(asset)) throw new AppError(400, 'MEDIA_NOT_FOUND', '内容引用的文件不存在');
    if (kind === 'gallery') {
      const photo = data as ResourceData<'gallery'>;
      if (photo.footprint && !this.repository.get('footprints', photo.footprint)) throw new AppError(400, 'FOOTPRINT_NOT_FOUND', '关联的足迹不存在');
    }
    if (kind === 'footprints') {
      const footprint = data as ResourceData<'footprints'>;
      if (new Set(footprint.photos).size !== footprint.photos.length || footprint.photos.some(photo => !this.repository.get('gallery', photo))) throw new AppError(400, 'PHOTO_NOT_FOUND', '关联照片不存在或重复');
    }
    if (kind === 'essays') {
      const essay = data as ResourceData<'essays'>;
      if (this.repository.list('essays').some(row => row.id !== id && row.data.publicPath === essay.publicPath)) throw new AppError(409, 'PATH_EXISTS', '文章路径已经被使用');
    }
    if (kind === 'folders') {
      const folder = data as ResourceData<'folders'>;
      if (this.repository.list('folders').some(row => row.id !== id && row.data.path === folder.path)) throw new AppError(409, 'PATH_EXISTS', '分类路径已经被使用');
    }
    if (kind === 'profile') {
      const profile = data as ResourceData<'profile'>;
      for (const brand of this.referencedBrands(profile)) if (!this.repository.get('brands', brand)) throw new AppError(400, 'BRAND_NOT_FOUND', '个人资料中的 Logo 不存在');
    }
  }

  private syncRelations(kind: ResourceKind, id: string, data: ResourceData<ResourceKind>): void {
    if (kind === 'gallery') {
      const next = (data as ResourceData<'gallery'>).footprint || undefined;
      const old = this.db.connection.prepare('SELECT footprint_id FROM photo_footprints WHERE photo_id = ?').get(id);
      const previous = old ? String(old.footprint_id) : undefined;
      if (previous === next) return;
      this.db.connection.prepare('DELETE FROM photo_footprints WHERE photo_id = ?').run(id);
      if (previous) this.repository.bump('footprints', previous);
      if (next) {
        this.db.connection.prepare('INSERT INTO photo_footprints (photo_id, footprint_id, sort_order) VALUES (?, ?, (SELECT COUNT(*) FROM photo_footprints WHERE footprint_id = ?))').run(id, next, next);
        this.repository.bump('footprints', next);
      }
    }
    if (kind === 'footprints') {
      const next = (data as ResourceData<'footprints'>).photos;
      const old = this.db.connection.prepare('SELECT photo_id FROM photo_footprints WHERE footprint_id = ?').all(id).map(row => String(row.photo_id));
      for (const photo of old.filter(photo => !next.includes(photo))) {
        this.db.connection.prepare('DELETE FROM photo_footprints WHERE photo_id = ?').run(photo);
        this.repository.bump('gallery', photo);
      }
      next.forEach((photo, index) => {
        const previous = this.db.connection.prepare('SELECT footprint_id FROM photo_footprints WHERE photo_id = ?').get(photo);
        if (previous?.footprint_id !== id) {
          if (previous) this.repository.bump('footprints', String(previous.footprint_id));
          this.repository.bump('gallery', photo);
        }
        this.db.connection.prepare('INSERT INTO photo_footprints (photo_id, footprint_id, sort_order) VALUES (?, ?, ?) ON CONFLICT(photo_id) DO UPDATE SET footprint_id = excluded.footprint_id, sort_order = excluded.sort_order').run(photo, id, index);
      });
    }
  }

  private referencedBrands(profile: ResourceData<'profile'>): string[] {
    return [...profile.education, ...profile.experience, ...profile.projects].flatMap(item => item.logo ? [item.logo] : [])
      .concat(profile.skills.flatMap(group => group.items.flatMap(item => item.brand ? [item.brand] : [])), profile.honors.flatMap(item => item.brand ? [item.brand] : []));
  }
  private brandUsed(profile: ResourceData<'profile'>, id: string): boolean { return this.referencedBrands(profile).includes(id); }
  private rawEssay(data: ResourceData<'essays'>): string {
    return toFrontmatter({ title: data.title, subtitle: data.subtitle, summary: data.summary, date: data.date, tags: data.tags, cover: data.cover, featured: data.featured }) + data.body;
  }
  private changed(actor: string, action: string, resource: string): void {
    this.db.connection.prepare("UPDATE app_meta SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'content_revision'").run();
    this.db.connection.prepare('INSERT INTO audit_log (actor, action, resource, created_at) VALUES (?, ?, ?, ?)').run(actor, action, resource, Date.now());
  }
}
