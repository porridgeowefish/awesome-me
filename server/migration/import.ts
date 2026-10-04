import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { profile } from '../../src/data/profile.ts';
import { photos } from '../../src/data/gallery.ts';
import { footprints, wishes } from '../../src/data/footprints.ts';
import { brandDefaults } from '../../src/data/brands.ts';
import { siteDefaults } from '../../src/data/siteDefaults.ts';
import { scanEssays, buildEssayIndex } from '../../tools/build/content/essays.ts';
import { buildMusicIndex, scanMusic } from '../../tools/build/content/music.ts';
import { ContentService } from '../content/service.ts';
import type { SiteDatabase } from '../db/database.ts';
import type { ResourceKind } from '../../src/contracts/content.ts';

export interface MigrationReport { imported: Record<ResourceKind, number>; skipped: number; filesCopied: number; warnings: string[] }
interface ImportOptions { content: ContentService; db: SiteDatabase; sourceRoot: string; dataDir: string }

export async function importLegacyContent({ content, db, sourceRoot, dataDir }: ImportOptions): Promise<MigrationReport> {
  const report: MigrationReport = { imported: { site: 0, profile: 0, brands: 0, gallery: 0, music: 0, essays: 0, footprints: 0, wishes: 0, folders: 0 }, skipped: 0, filesCopied: 0, warnings: [] };
  const publicDir = path.join(sourceRoot, 'public');
  const legacyRoot = path.join(dataDir, 'legacy', 'content');
  const copyAssets = (relative: string) => {
    const source = path.join(publicDir, 'content', relative);
    if (!fs.existsSync(source)) return;
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('迁移内容不能包含符号链接');
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) copyAssets(child);
      else if (entry.isFile() && !/\.(md|json)$/i.test(entry.name)) {
        const target = path.join(legacyRoot, child);
        if (fs.existsSync(target)) continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(path.join(source, entry.name), target, fs.constants.COPYFILE_EXCL);
        report.filesCopied++;
      }
    }
  };
  copyAssets('');
  return db.transaction(() => {
  const insert = (kind: ResourceKind, id: string, data: unknown) => {
    if (content.get(kind, id)) { report.skipped++; return false; }
    content.create(kind, data, id, 'legacy-import'); report.imported[kind]++; return true;
  };
  insert('site', 'default', siteDefaults);
  for (const [id, brand] of Object.entries(brandDefaults)) insert('brands', id, { ...brand, ratio: 'ratio' in brand ? brand.ratio : 1, visible: true });
  insert('profile', 'default', profile);
  const newFootprints = new Set<string>();
  for (const footprint of footprints) {
    const { id, ...data } = footprint;
    if (insert('footprints', id, { ...data, photos: [] })) newFootprints.add(id);
  }
  for (const photo of photos) { const { id, ...data } = photo; insert('gallery', id, data); }
  // Only newly imported footprints receive the legacy explicit photo ordering.
  for (const footprint of footprints) {
    if (!newFootprints.has(footprint.id) || !footprint.photos) continue;
    const row = content.get('footprints', footprint.id)!;
    content.update('footprints', row.id, { ...row.data, photos: footprint.photos }, row.revision, 'legacy-import');
  }
  for (const wish of wishes) { const { id, ...data } = wish; insert('wishes', id, data); }
  const music = buildMusicIndex(scanMusic(path.join(publicDir, 'content/music')), 'content/music');
  report.warnings.push(...music.warnings);
  for (const track of music.tracks) { const { id, ...data } = track; insert('music', id, data); }
  const essayRoot = path.join(publicDir, 'content/essays');
  const scanned = scanEssays(essayRoot);
  report.warnings.push(...scanned.warnings);
  for (const [folder, meta] of scanned.folderMeta) insert('folders', folder.replaceAll('/', '--'), { path: folder, title: meta.title ?? folder.split('/').at(-1), order: meta.order ?? 0 });
  for (const raw of scanned.raws) {
    const parsed = matter(raw.raw, {});
    const index = buildEssayIndex([{ ...raw, raw: raw.raw.replace(/^draft:\s*true\s*$/m, 'draft: false') }], scanned.folderMeta, 'content/essays');
    const meta = index.essays[0];
    report.warnings.push(...index.warnings);
    if (!meta) throw new Error(`文章无法解析：${raw.dir}`);
    // Stable record id is not the public path; public path remains unchanged.
    const existing = content.essayByPath(raw.dir);
    if (existing) { report.skipped++; continue; }
    insert('essays', `legacy-${report.imported.essays}-${Buffer.from(raw.dir).toString('base64url').slice(0, 110)}`, {
      publicPath: raw.dir, folder: meta.folder, title: meta.title, subtitle: meta.subtitle ?? '', summary: meta.summary,
      date: meta.date, tags: meta.tags, featured: meta.featured, cover: meta.cover, body: parsed.content, status: parsed.data.draft === true ? 'draft' : 'published',
    });
  }
  db.connection.prepare("INSERT INTO app_meta (key, value) VALUES ('legacy_import_completed', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(new Date().toISOString());
  return report;
  });
}
