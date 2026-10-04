import { AppError } from '../errors.ts';

export const MEDIA_PURPOSES = ['gallery', 'essay', 'logo', 'avatar', 'cover', 'music', 'resume'] as const;
export type MediaPurpose = typeof MEDIA_PURPOSES[number];
export const IMAGE_EXTENSIONS: Record<string, string[]> = { jpeg: ['.jpg', '.jpeg'], png: ['.png'], webp: ['.webp'], gif: ['.gif'], tiff: ['.tif', '.tiff'], heif: ['.heic', '.heif'], avif: ['.avif'], svg: ['.svg'] };
export function audioContentType(bytes: Buffer, extension: string): string | null {
  const starts = (value: string) => bytes.subarray(0, value.length).toString('ascii') === value;
  if (extension === '.wav' && bytes.length >= 44 && starts('RIFF') && bytes.subarray(8, 12).toString('ascii') === 'WAVE') return 'audio/wav';
  if (extension === '.mp3' && bytes.length >= 4 && (starts('ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) return 'audio/mpeg';
  if (extension === '.flac' && starts('fLaC')) return 'audio/flac';
  if (['.ogg', '.oga', '.opus'].includes(extension) && starts('OggS')) return 'audio/ogg';
  if (['.m4a', '.mp4'].includes(extension) && bytes.length >= 16 && bytes.subarray(4, 8).toString('ascii') === 'ftyp') return extension === '.m4a' ? 'audio/mp4' : 'video/mp4';
  if (extension === '.aac' && bytes.length >= 7 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'audio/aac';
  if (extension === '.webm' && bytes.length >= 8 && bytes.subarray(0, 4).toString('hex') === '1a45dfa3') return 'video/webm';
  return null;
}
export function validateSvg(bytes: Buffer): void {
  const source = bytes.toString('utf8');
  if (bytes.length > 2_000_000 || !/<svg\b/i.test(source) || /<\s*(?:[\w-]+:)?(?:script|foreignObject|iframe|style|object|embed)\b|\bon\w+\s*=|<!DOCTYPE|<!ENTITY/i.test(source)
    || /(?:href|src)\s*=\s*['"](?!#)[^'"]*['"]/i.test(source) || /url\s*\(\s*(?!#)/i.test(source)) {
    throw new AppError(400, 'UNSAFE_SVG', 'SVG 包含不支持的活动内容或外部资源');
  }
}
