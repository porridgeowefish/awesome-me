import { z } from 'zod';
import type { EssayIndex, MusicIndex } from '../shared/content/types';
import { ICON_NAMES } from './interface';

const text = z.string().max(20_000);
const name = z.string().trim().min(1).max(200);
export const coordinatesSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const safeContentPath = (value: string): boolean => value.length > 0 && value.length < 600 && !/[\\%?#\u0000-\u001f]/.test(value) && value.split('/').every(segment => segment.trim() === segment && !!segment && segment !== '.' && segment !== '..');
const contentPath = z.string().refine(safeContentPath, '路径无效');
export const assetUrlSchema = z.string().max(2048).refine(value => {
  if (!value) return true;
  if (/^[\\]|[\u0000-\u001f]/.test(value) || value.includes('\\')) return false;
  if (/^https?:\/\//i.test(value)) { try { const url = new URL(value); return !url.username && !url.password; } catch { return false; } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return false;
  const cleaned = value.replace(/^\/+/, '');
  try { const decoded=decodeURIComponent(cleaned); return !/[\\\u0000-\u001f]/.test(decoded) && decoded.split('/').every(s => s !== '.' && s !== '..') && !/[?#]/.test(value); } catch { return false; }
}, '图片/文件地址无效');
const contactUrl = z.string().max(2048).refine(value => {
  if (/[\\\u0000-\u001f]/.test(value)) return false;
  try { const url = new URL(value); return ['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, '链接协议无效');
const dayOrMonth = z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])(?:-\d{2})?$/, '日期使用 YYYY-MM 或 YYYY-MM-DD')
  .refine(value => value.length === 7 || z.iso.date().safeParse(value).success, '日期无效');
const date = z.iso.date();
const visible = z.boolean().default(true);
const timeline = z.strictObject({
  org: name, role: text, period: z.string().max(100), place: z.string().max(200).optional(), logo: z.string().max(100).optional(),
  badge: z.strictObject({ text: z.string().max(30), color: z.string().regex(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i) }).optional(),
  points: z.array(z.strictObject({ title: z.string().max(200).optional(), text })).max(100),
});

export const profileSchema = z.strictObject({
  name, nameEn: text, headline: text, status: text, intro: text, avatar: assetUrlSchema,
  facts: z.array(z.strictObject({ label: name, value: text })).max(50),
  contacts: z.array(z.strictObject({ kind: z.enum(['email', 'github', 'phone', 'link']), label: name, href: contactUrl })).max(50),
  interests: z.array(name).max(100), education: z.array(timeline).max(100), experience: z.array(timeline).max(100), projects: z.array(timeline).max(100),
  skills: z.array(z.strictObject({ group: name, items: z.array(z.strictObject({ name, brand: z.string().max(100).optional() })).max(100), note: text.optional() })).max(50),
  honors: z.array(z.strictObject({ text, brand: z.string().max(100).optional() })).max(100), resume: assetUrlSchema.optional(),
});

export const siteSchema = z.strictObject({
  name, nameEn: text, tagline: text, footer: text, logo: assetUrlSchema,
  play: z.strictObject({ game: z.boolean(), avatar: z.boolean() }).default({ game: false, avatar: false }),
  cursor: z.enum(['default', 'star', 'rabbit', 'parrot']).default('star'),
  navigation: z.array(z.strictObject({ id: z.enum(['me', 'gallery', 'footprints', 'essays']), label: name, labelEn: z.string().max(100), icon: z.enum(['user', 'image', 'map', 'pen', 'music', 'heart', 'flag', 'folder', 'school', 'sparkle']), visible })).max(4)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, '导航不能重复'),
  copy: z.record(z.string().regex(/^[a-zA-Z0-9_.-]+$/), z.string().max(2000)).default({}),
  icons: z.record(z.string().regex(/^[a-zA-Z0-9_.-]+$/),z.enum(ICON_NAMES)).default({}),
  sections: z.array(z.strictObject({ id: z.enum(['experience', 'projects', 'education', 'skills', 'honors']), visible })).max(5)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, '模块不能重复'),
  theme: z.strictObject({ accent: z.string().regex(/^#[0-9a-f]{6}$/i), radius: z.number().int().min(0).max(32), pageWidth: z.number().int().min(800).max(1800) }),
  player: z.strictObject({ visible, mode: z.enum(['loop', 'one', 'shuffle']), volume: z.number().min(0).max(1), fallbackCover: assetUrlSchema }),
});

export const photoSchema = z.strictObject({
  title: name, place: z.string().max(500), date: dayOrMonth, story: text, src: assetUrlSchema.min(1), thumb: assetUrlSchema.min(1),
  footprint: z.string().max(150).optional(), visible,
  location: z.strictObject({ lnglat: coordinatesSchema, source: z.enum(['exif', 'search', 'manual']), address: z.string().max(1000).optional() }).optional(),
});
export const footprintSchema = z.strictObject({ name, region: z.string().max(300), lnglat: coordinatesSchema, date: dayOrMonth, note: text, photos: z.array(z.string().max(150)).max(1000).default([]), visible });
export const wishSchema = z.strictObject({ name, region: z.string().max(300), reason: text, lnglat: coordinatesSchema.optional(), visible });
export const musicSchema = z.strictObject({ title: name, artist: z.string().max(200).optional(), album: z.string().max(200).optional(), note: text.optional(), src: assetUrlSchema.min(1), cover: assetUrlSchema.optional(), visible });
export const essaySchema = z.strictObject({
  publicPath: contentPath, title: name, subtitle: z.string().max(500).default(''), summary: z.string().max(2000).default(''), date,
  tags: z.array(name).max(100).default([]), folder: z.array(z.string().min(1).max(100)).max(10).default([]),
  cover: assetUrlSchema.optional(), featured: z.boolean().default(false), body: z.string().max(1_500_000), status: z.enum(['draft', 'published']).default('draft'),
}).refine(value => value.publicPath.split('/').slice(0, -1).join('/') === value.folder.join('/'), '文章路径与分类不一致');
export const brandSchema = z.strictObject({ label: name, file: assetUrlSchema.min(1), mono: z.boolean().default(false), ratio: z.number().positive().max(20).default(1), visible });
export const folderSchema = z.strictObject({ path: contentPath, title: name, order: z.number().int().min(-10000).max(10000).default(0) });

export const resourceSchemas = { site: siteSchema, profile: profileSchema, gallery: photoSchema, music: musicSchema, essays: essaySchema, footprints: footprintSchema, wishes: wishSchema, brands: brandSchema, folders: folderSchema } as const;
export type ResourceKind = keyof typeof resourceSchemas;
export const RESOURCE_KINDS = Object.keys(resourceSchemas) as ResourceKind[];
export const SINGLETON_KINDS = new Set<ResourceKind>(['site', 'profile']);
export type ResourceData<K extends ResourceKind> = z.infer<(typeof resourceSchemas)[K]>;
export interface ContentRecord<K extends ResourceKind = ResourceKind> {
  id: string; kind: K; data: ResourceData<K>; revision: number; order: number; createdAt: string; updatedAt: string;
}
export interface PublicSnapshot {
  revision: number;
  site: ResourceData<'site'> | null;
  profile: ResourceData<'profile'> | null;
  photos: (ResourceData<'gallery'> & { id: string })[];
  footprints: (ResourceData<'footprints'> & { id: string })[];
  wishes: (ResourceData<'wishes'> & { id: string })[];
  brands: Record<string, ResourceData<'brands'>>;
  essays: EssayIndex;
  music: MusicIndex;
}
