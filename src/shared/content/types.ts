/**
 * Content contracts shared by the build-time pipeline (build/) and the runtime (src/).
 * Anything produced by the Vite content plugin must conform to these types.
 */

/** Metadata of one essay. The body is fetched lazily from `bodyUrl`. */
export interface EssayMeta {
  /** Stable id = path below content/essays, e.g. "AI与Agent/harness-engineering". */
  id: string;
  title: string;
  subtitle?: string;
  summary: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  tags: string[];
  /** Folder path segments, e.g. ["AI与Agent", "模型与算法"]. */
  folder: string[];
  /** Public URL (relative to BASE_URL) of the markdown file. */
  bodyUrl: string;
  /** Public URL (relative to BASE_URL) of the cover image, if any. */
  cover?: string;
  /** `featured: true` in frontmatter → shown as the headline card. */
  featured: boolean;
  wordCount: number;
  readingMinutes: number;
  /** Feature flags detected at build time → lets the renderer lazy-load only what is needed. */
  features: { mermaid: boolean; math: boolean };
}

export interface FolderNode {
  /** Path joined by "/" ("" for root). */
  path: string;
  name: string;
  order: number;
  /** Number of essays in this folder and all sub-folders. */
  count: number;
  children: FolderNode[];
}

export interface EssayIndex {
  essays: EssayMeta[];
  tree: FolderNode;
  /** Non-fatal problems found while indexing (shown in dev console). */
  warnings: string[];
}

export interface Track {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  /** Public URL (relative to BASE_URL). */
  src: string;
  cover?: string;
  /** Optional lyric / note shown under the player. */
  note?: string;
}

export interface MusicIndex {
  tracks: Track[];
  warnings: string[];
}
