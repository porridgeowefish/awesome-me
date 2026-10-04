import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import sharp, { type Metadata } from 'sharp';
import exifr from 'exifr';
import type { SiteDatabase } from '../db/database.ts';
import type { ContentService } from '../content/service.ts';
import { AppError } from '../errors.ts';
import { LocalMediaStore } from './storage.ts';
import { audioContentType, IMAGE_EXTENSIONS, MEDIA_PURPOSES, type MediaPurpose, validateSvg } from './formats.ts';
import { convertMp4Audio, MAX_AUDIO_BYTES, type AudioConverter } from './audio-converter.ts';

export interface MediaAsset {
  id: string; filename: string; purpose: MediaPurpose; size: number; checksum: string; contentType: string;
  width?: number; height?: number; capturedAt?: string; originalContentType?: string; gps?: { lnglat: [number, number]; coordinateSystem: 'wgs84' };
  warnings: string[]; variants: Record<string, string>; createdAt: string;
}

export interface StoredMediaAsset extends MediaAsset { files: Record<string, string> }

function validateFilename(filename: string): void {
  if (!filename || filename.length > 200 || /[\\/\u0000-\u001f]/.test(filename) || filename === '.' || filename === '..') throw new AppError(400, 'INVALID_FILENAME', '文件名无效');
}

export class MediaService {
  private readonly storage: LocalMediaStore;
  private readonly convertAudio: AudioConverter;
  constructor(private readonly db: SiteDatabase, private readonly content: ContentService, dataDir: string, options: { convertAudio?: AudioConverter } = {}) {
    this.storage = new LocalMediaStore(dataDir); this.convertAudio = options.convertAudio ?? convertMp4Audio;
  }

  async upload(bytes: Buffer, filename: string, purposeValue: string): Promise<MediaAsset> {
    if (!MEDIA_PURPOSES.includes(purposeValue as MediaPurpose)) throw new AppError(400, 'INVALID_PURPOSE', '文件用途无效');
    const purpose = purposeValue as MediaPurpose;
    validateFilename(filename);
    if (purpose === 'music') return this.uploadAudio(Readable.from([bytes]), filename);
    const maximum = purpose === 'resume' ? 20 * 1024 * 1024 : 40 * 1024 * 1024;
    if (!bytes.length || bytes.length > maximum) throw new AppError(413, 'FILE_TOO_LARGE', '文件为空或超过允许大小');
    const extension = path.extname(filename).toLowerCase();
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const id = randomUUID();
    const asset: StoredMediaAsset = { id, filename, purpose, size: bytes.length, checksum, contentType: '', warnings: [], variants: {}, files: {}, createdAt: new Date().toISOString() };
    if (purpose === 'resume') {
      if (extension !== '.pdf' || bytes.subarray(0, 5).toString() !== '%PDF-' || bytes.length < 20) throw new AppError(400, 'INVALID_PDF', '简历请上传 PDF 文件');
      asset.contentType = 'application/pdf'; asset.files.original = 'original.pdf';
    } else {
      if (extension === '.svg') { if (purpose !== 'logo') throw new AppError(400, 'INVALID_IMAGE', 'SVG 仅支持经过清洗的 Logo 用途'); validateSvg(bytes); }
      let metadata: Metadata;
      try { metadata = await sharp(bytes, { limitInputPixels: 60_000_000 }).metadata(); }
      catch { throw new AppError(400, 'INVALID_IMAGE', '图片无法解析或分辨率过高'); }
      if (!metadata.format || !IMAGE_EXTENSIONS[metadata.format]?.includes(extension)) throw new AppError(400, 'INVALID_IMAGE', '图片内容与扩展名不一致');
      if ((metadata.pages ?? 1) > 1) asset.warnings.push('多帧图片仅使用第一帧');
      if (metadata.format !== 'svg') {
        try {
          const exif = await exifr.parse(bytes, { pick: ['DateTimeOriginal', 'CreateDate', 'latitude', 'longitude'], gps: true }) as { DateTimeOriginal?: Date; CreateDate?: Date; latitude?: number; longitude?: number } | undefined;
          const taken = exif?.DateTimeOriginal ?? exif?.CreateDate;
          if (taken instanceof Date && Number.isFinite(taken.valueOf())) asset.capturedAt = taken.toISOString();
          if (typeof exif?.longitude === 'number' && typeof exif.latitude === 'number' && Number.isFinite(exif.longitude) && Number.isFinite(exif.latitude) && Math.abs(exif.longitude) <= 180 && Math.abs(exif.latitude) <= 90) {
            asset.gps = { lnglat: [exif.longitude, exif.latitude], coordinateSystem: 'wgs84' };
          }
        } catch { asset.warnings.push('图片元数据无法读取，仍可手动填写'); }
      }
      asset.originalContentType = metadata.format === 'svg' ? 'image/svg+xml' : `image/${metadata.format}`;
      asset.contentType = 'image/webp'; asset.files = { original: `original${extension}`, large: 'large.webp', thumb: 'thumb.webp' };
    }
    // No unvalidated user name ever enters a storage path.
    const existing = this.db.connection.prepare("SELECT metadata FROM media_assets WHERE purpose = ? AND json_extract(metadata, '$.checksum') = ? LIMIT 1").get(purpose, checksum);
    if (existing) return this.visibleAsset(JSON.parse(String(existing.metadata)) as StoredMediaAsset);
    this.storage.create(id);
    try {
      this.storage.write(id, asset.files.original, bytes);
      if (asset.files.large) {
        const image = sharp(bytes, { limitInputPixels: 60_000_000 }).rotate();
        await image.clone().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(this.storage.path(id, asset.files.large));
        await image.clone().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toFile(this.storage.path(id, asset.files.thumb));
        const large = await sharp(fs.readFileSync(this.storage.path(id, asset.files.large))).metadata(); asset.width = large.width; asset.height = large.height;
      }
      for (const variant of Object.keys(asset.files)) asset.variants[variant] = `/api/v1/media/${id}/${variant}`;
      this.db.connection.prepare('INSERT INTO media_assets (id, filename, purpose, metadata, created_at) VALUES (?, ?, ?, ?, ?)').run(id, filename, purpose, JSON.stringify(asset), Date.now());
      return this.visibleAsset(asset);
    } catch (error) { this.storage.remove(id); throw error; }
  }

  async uploadAudio(source: Readable & { truncated?: boolean }, filename: string, options: { signal?: AbortSignal } = {}): Promise<MediaAsset> {
    validateFilename(filename);
    const id = randomUUID(), extension = path.extname(filename).toLowerCase();
    const hash = createHash('sha256'), prefix = Buffer.alloc(44);
    let size = 0, prefixLength = 0, committed = false;
    this.storage.create(id);
    try {
      if (source.destroyed) throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
      const inspect = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length;
          if (size > MAX_AUDIO_BYTES) return callback(new AppError(413, 'FILE_TOO_LARGE', '文件为空或超过允许大小'));
          const copied = Math.min(chunk.length, prefix.length - prefixLength);
          chunk.copy(prefix, prefixLength, 0, copied); prefixLength += copied;
          hash.update(chunk); callback(null, chunk);
        },
      });
      try {
        await pipeline(source, inspect, fs.createWriteStream(this.storage.path(id, 'original.part'), { flags: 'wx', mode: 0o600 }), { signal: options.signal });
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (source.truncated) throw new AppError(413, 'FILE_TOO_LARGE', '文件为空或超过允许大小');
        if (options.signal?.aborted || (error as NodeJS.ErrnoException).code === 'ERR_STREAM_PREMATURE_CLOSE' || /terminated early|unexpected end/i.test((error as Error).message)) {
          throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
        }
        throw error;
      }
      if (source.truncated || !size) throw new AppError(413, 'FILE_TOO_LARGE', '文件为空或超过允许大小');
      let contentType = audioContentType(prefix.subarray(0, prefixLength), extension);
      if (!contentType) throw new AppError(400, 'INVALID_AUDIO', '音频格式不受支持或文件内容与扩展名不一致');
      let checksum = hash.digest('hex'), storedExtension = extension, staged = 'original.part';
      if (extension === '.mp4') {
        await this.convertAudio(this.storage.path(id, staged), this.storage.path(id, 'audio.part'), options.signal);
        if (options.signal?.aborted) throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
        const converted = this.storage.path(id, 'audio.part');
        size = fs.statSync(converted).size;
        if (!size || size > MAX_AUDIO_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', '转换后的音频为空或超过允许大小');
        const convertedHash = createHash('sha256'); prefixLength = 0;
        try {
          for await (const chunk of fs.createReadStream(converted, { signal: options.signal })) {
            const copied = Math.min(chunk.length, prefix.length - prefixLength);
            chunk.copy(prefix, prefixLength, 0, copied); prefixLength += copied; convertedHash.update(chunk);
          }
        } catch (error) {
          if (options.signal?.aborted) throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
          throw error;
        }
        if (options.signal?.aborted) throw new AppError(400, 'UPLOAD_INCOMPLETE', '文件上传未完成');
        contentType = audioContentType(prefix.subarray(0, prefixLength), '.mp3');
        if (!contentType) throw new AppError(400, 'INVALID_AUDIO', '音频转换未生成有效的 MP3 文件');
        checksum = convertedHash.digest('hex'); storedExtension = '.mp3';
        filename = `${filename.slice(0, -extension.length)}.mp3`;
        fs.unlinkSync(this.storage.path(id, staged)); staged = 'audio.part';
      }
      // Validate even duplicate bytes against the requested extension before reusing an asset.
      const existing = this.db.connection.prepare("SELECT metadata FROM media_assets WHERE purpose = ? AND json_extract(metadata, '$.checksum') = ? LIMIT 1").get('music', checksum);
      if (existing) return this.visibleAsset(JSON.parse(String(existing.metadata)) as StoredMediaAsset);
      const original = `original${storedExtension}`;
      this.storage.finalize(id, staged, original);
      const asset: StoredMediaAsset = { id, filename, purpose: 'music', size, checksum, contentType, warnings: [], variants: { original: `/api/v1/media/${id}/original` }, files: { original }, createdAt: new Date().toISOString() };
      this.db.connection.prepare('INSERT INTO media_assets (id, filename, purpose, metadata, created_at) VALUES (?, ?, ?, ?, ?)').run(id, filename, 'music', JSON.stringify(asset), Date.now());
      committed = true;
      return this.visibleAsset(asset);
    } finally { if (!committed) this.storage.remove(id); }
  }

  get(id: string): MediaAsset | null {
    const row = this.db.connection.prepare('SELECT metadata FROM media_assets WHERE id = ?').get(id);
    return row ? this.visibleAsset(JSON.parse(String(row.metadata)) as StoredMediaAsset) : null;
  }
  list(): MediaAsset[] { return this.db.connection.prepare('SELECT metadata FROM media_assets ORDER BY created_at DESC LIMIT 10000').all().map(row => this.visibleAsset(JSON.parse(String(row.metadata)) as StoredMediaAsset)); }

  variantPath(id: string, variant: string, authenticated: boolean): string {
    const row = this.db.connection.prepare('SELECT metadata FROM media_assets WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'MEDIA_NOT_FOUND', '文件不存在');
    const asset = JSON.parse(String(row.metadata)) as StoredMediaAsset;
    if (!Object.hasOwn(asset.files, variant)) throw new AppError(404, 'VARIANT_NOT_FOUND', '文件版本不存在');
    if (!authenticated) {
      if (variant === 'original' && !['music', 'resume'].includes(asset.purpose)) throw new AppError(403, 'PRIVATE_ORIGINAL', '原始图片仅限站主管理访问');
      if (!this.isPublic(id)) throw new AppError(404, 'MEDIA_NOT_FOUND', '文件尚未发布');
    }
    const file = this.storage.path(id, asset.files[variant]);
    if (!fs.existsSync(file)) throw new AppError(404, 'MEDIA_NOT_FOUND', '文件缺失');
    return file;
  }

  isPublic(id: string): boolean {
    return this.content.mediaReferences(id).some(reference => {
      const row = this.content.get(reference.kind, reference.id);
      if (!row) return false;
      if (reference.kind === 'essays') return 'status' in row.data && row.data.status === 'published';
      return !('visible' in row.data) || row.data.visible;
    });
  }

  remove(id: string): void {
    this.db.transaction(() => { this.content.deleteMediaRecord(id); this.storage.remove(id); });
  }

  private visibleAsset(asset: StoredMediaAsset): MediaAsset {
    // Storage file names are internal; callers use variants, never absolute filesystem paths.
    const { files: _files, ...publicMetadata } = asset;
    return publicMetadata;
  }
}
