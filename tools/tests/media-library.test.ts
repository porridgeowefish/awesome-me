import { describe, expect, it } from 'vitest';
import { assetPreviewKind, assetUploadAccept, filterAssets, formatAssetBytes, uploadedLibraryAsset, type LibraryAsset } from '../../src/features/admin/media-library';
const logo: LibraryAsset = { id: 'logo-id', filename: '机构 Logo.svg', purpose: 'logo', size: 900, createdAt: '2026-10-03T00:00:00Z', variants: { original: '/api/v1/media/logo-id/original', large: '/api/v1/media/logo-id/large', thumb: '/api/v1/media/logo-id/thumb' }, warnings: [] };
const audio: LibraryAsset = { ...logo, id: 'audio-id', filename: 'song.wav', purpose: 'music', variants: { original: '/api/v1/media/audio-id/original' } };
const pdf: LibraryAsset = { ...logo, id: 'resume-id', filename: 'resume.pdf', purpose: 'resume', variants: { original: '/api/v1/media/resume-id/original' } };
describe('central asset library', () => {
  it('searches Unicode names, ids and localized purposes while honoring the purpose filter', () => {
    const assets = [logo, audio, pdf];
    expect(filterAssets(assets, '  logo  ', 'logo')).toEqual([logo]);expect(filterAssets(assets, '机构', '')).toEqual([logo]);expect(filterAssets(assets, 'audio-id', '')).toEqual([audio]);expect(filterAssets(assets, '音频', '')).toEqual([audio]);expect(filterAssets(assets, 'resume', 'logo')).toEqual([]);
  });
  it('offers image, audio and PDF details without introducing video previews', () => {
    expect([logo, audio, pdf].map(assetPreviewKind)).toEqual(['image', 'audio', 'pdf']);expect(assetPreviewKind({ ...audio, filename: 'old.mp4', contentType: 'video/mp4' })).toBe('audio');expect(assetUploadAccept('music')).toContain('.mp4');expect(assetUploadAccept('logo')).toContain('.svg');expect(assetUploadAccept('resume')).toContain('.pdf');
  });
  it('retains canonical deduplicated upload metadata instead of the new source size', () => {
    const result = uploadedLibraryAsset(logo, { size: 1000 }, 'logo');expect(result).toMatchObject({ id: 'logo-id', size: 900, createdAt: logo.createdAt, purpose: 'logo' });expect(result.variants).toEqual(logo.variants);
  });
  it('formats small files distinctly from larger uploads', () => { expect(formatAssetBytes(0)).toBe('0 B');expect(formatAssetBytes(900)).toBe('900 B');expect(formatAssetBytes(2048)).toBe('2.0 KB');expect(formatAssetBytes(2 * 1024 * 1024)).toBe('2.00 MB'); });
});
