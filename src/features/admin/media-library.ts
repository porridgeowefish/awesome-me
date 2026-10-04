import type { UploadResult } from '../../contracts/media';

export const ASSET_PURPOSES = ['logo', 'gallery', 'essay', 'avatar', 'cover', 'music', 'resume'] as const;
export type AssetPurpose = typeof ASSET_PURPOSES[number];
export interface LibraryAsset extends UploadResult {
  purpose: string; size: number; createdAt: string; contentType?: string;
  checksum?: string; width?: number; height?: number; originalContentType?: string;
}
export const ASSET_PURPOSE_LABELS: Record<string, string> = {
  logo: 'Logo', gallery: '图库照片', essay: '文章插图', avatar: '头像', cover: '封面', music: '音频', resume: '简历 PDF',
};
export function assetPurposeLabel(purpose: string): string { return ASSET_PURPOSE_LABELS[purpose] ?? purpose; }
export function filterAssets(items: LibraryAsset[], query: string, purpose: string): LibraryAsset[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(asset => (!purpose || asset.purpose === purpose) && (!needle || [asset.filename, asset.id, assetPurposeLabel(asset.purpose), asset.contentType ?? ''].some(value => value.toLocaleLowerCase().includes(needle))));
}
export function formatAssetBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
export function assetPreviewKind(asset: LibraryAsset): 'image' | 'audio' | 'pdf' | 'file' {
  if (asset.purpose === 'music') return 'audio';
  if (asset.purpose === 'resume' || asset.contentType === 'application/pdf') return 'pdf';
  if (asset.variants.large || asset.variants.thumb) return 'image';
  return 'file';
}
export function assetUploadAccept(purpose: AssetPurpose): string {
  if (purpose === 'music') return 'audio/*,video/mp4,.mp3,.mp4,.wav,.ogg,.oga,.opus,.flac,.m4a,.aac';
  if (purpose === 'resume') return '.pdf,application/pdf';
  if (purpose === 'logo') return 'image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg';
  return 'image/*,.heic,.heif';
}
export function uploadedLibraryAsset(result: UploadResult, file: { size: number }, purpose: AssetPurpose): LibraryAsset {
  const metadata = result as UploadResult & Partial<LibraryAsset>;
  return { ...result, purpose: metadata.purpose ?? purpose, size: metadata.size ?? file.size, createdAt: metadata.createdAt ?? new Date().toISOString() };
}
