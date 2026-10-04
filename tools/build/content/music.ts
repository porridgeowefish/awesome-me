import fs from 'node:fs';
import path from 'node:path';
import type { MusicIndex, Track } from '../../../src/shared/content/types.ts';

/**
 * Music is discovered from files dropped into content/music/:
 *   song.mp3 / .m4a…    → a track
 *   song.mp4            → also accepted; only its audio is played (no video / MV)
 *   song.json           → optional sidecar { title, artist, album, cover, note }
 *   song.jpg|png|webp   → optional cover with the same base name
 *   playlist.json       → optional ["b.mp3", "a.mp3"] to fix the order
 */

/** Audio formats, plus MP4/WebM containers whose audio track is played. */
export const MEDIA_EXT = ['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.wav', '.flac', '.opus', '.mp4', '.webm'];
const COVER_EXT = ['.webp', '.jpg', '.jpeg', '.png'];

export function isMedia(file: string): boolean {
  return MEDIA_EXT.includes(path.extname(file).toLowerCase());
}

/** "02 - 林俊杰 - 江南.mp3" → { artist: "林俊杰", title: "江南" } */
export function parseFileName(file: string): { title: string; artist?: string } {
  const base = path.basename(file, path.extname(file)).replace(/^\d+\s*[-_.]\s*/, '');
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { title: base.trim() };
}

export interface MusicDirListing {
  files: string[];
  readJson: (file: string) => unknown;
}

export function buildMusicIndex(listing: MusicDirListing, publicPrefix: string): MusicIndex {
  const warnings: string[] = [];
  const media = listing.files.filter(isMedia);
  const fileSet = new Set(listing.files);

  let order: string[] = [];
  if (fileSet.has('playlist.json')) {
    const data = listing.readJson('playlist.json');
    if (Array.isArray(data)) order = data.map(String);
    else warnings.push('[music] playlist.json 应是文件名数组，已忽略');
  }
  const rank = (f: string) => {
    const i = order.indexOf(f);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  media.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-CN'));

  const tracks: Track[] = media.map((file) => {
    const stem = file.slice(0, -path.extname(file).length);
    let side: Record<string, unknown> = {};
    if (fileSet.has(`${stem}.json`)) {
      const data = listing.readJson(`${stem}.json`);
      if (data && typeof data === 'object') side = data as Record<string, unknown>;
      else warnings.push(`[music] ${stem}.json 格式不正确，已忽略`);
    }
    const coverFile =
      (typeof side.cover === 'string' && side.cover) || COVER_EXT.map((e) => stem + e).find((c) => fileSet.has(c));
    const guessed = parseFileName(file);
    const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
    return {
      id: file, // file name incl. extension → unique even for song.mp3 + song.mp4
      title: str(side.title) ?? guessed.title,
      artist: str(side.artist) ?? guessed.artist,
      album: str(side.album),
      note: str(side.note),
      src: path.posix.join(publicPrefix, file),
      cover: coverFile ? path.posix.join(publicPrefix, coverFile) : undefined,
    };
  });

  for (const name of order) if (!fileSet.has(name)) warnings.push(`[music] playlist.json 中的 ${name} 不存在`);
  return { tracks, warnings };
}

export function scanMusic(root: string): MusicDirListing {
  const files = fs.existsSync(root) ? fs.readdirSync(root).filter((f) => fs.statSync(path.join(root, f)).isFile()) : [];
  return {
    files,
    readJson: (file) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      } catch {
        return null;
      }
    },
  };
}
