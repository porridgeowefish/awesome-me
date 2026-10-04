import path from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildEssayIndex, scanEssays } from './content/essays.ts';
import { buildMusicIndex, scanMusic } from './content/music.ts';

/**
 * A content collection turns a folder under `public/content/<dir>` into a virtual module.
 * Adding a new kind of content = adding one entry to `collections` (Open/Closed principle);
 * the plugin itself never changes.
 */
export interface ContentCollection {
  /** Import id used by the app, e.g. "virtual:content/essays". */
  id: string;
  /** Folder below `public/content`. */
  dir: string;
  /** Produce JSON-serialisable data. `publicPrefix` is the URL path of `dir` without BASE_URL. */
  load: (absDir: string, publicPrefix: string) => { warnings?: string[] } & Record<string, unknown>;
}

export const collections: ContentCollection[] = [
  {
    id: 'virtual:content/essays',
    dir: 'essays',
    load: (abs, prefix) => {
      const { raws, folderMeta, warnings } = scanEssays(abs);
      const index = buildEssayIndex(raws, folderMeta, prefix);
      return { ...index, warnings: [...warnings, ...index.warnings] };
    },
  },
  {
    id: 'virtual:content/music',
    dir: 'music',
    load: (abs, prefix) => ({ ...buildMusicIndex(scanMusic(abs), prefix) }),
  },
];

const RESOLVED_PREFIX = '\0';

export function contentPlugin(options: { contentRoot?: string } = {}): Plugin {
  let contentRoot = '';
  let server: ViteDevServer | undefined;

  return {
    name: 'personal-site:content',
    configResolved(config) {
      contentRoot = options.contentRoot ?? path.join(config.publicDir, 'content');
    },
    resolveId(id) {
      return collections.some((c) => c.id === id) ? RESOLVED_PREFIX + id : undefined;
    },
    load(id) {
      if (!id.startsWith(RESOLVED_PREFIX)) return;
      const collection = collections.find((c) => RESOLVED_PREFIX + c.id === id);
      if (!collection) return;
      const data = collection.load(path.join(contentRoot, collection.dir), `content/${collection.dir}`);
      for (const w of data.warnings ?? []) this.warn(w);
      return `export default ${JSON.stringify(data)};`;
    },
    configureServer(dev) {
      server = dev;
      // Re-index when content changes so new essays / tracks appear without restarting.
      const onChange = (file: string) => {
        const rel = path.relative(contentRoot, file);
        if (rel.startsWith('..')) return;
        const top = rel.split(path.sep)[0];
        for (const c of collections.filter((c) => c.dir === top)) {
          const mod = server?.moduleGraph.getModuleById(RESOLVED_PREFIX + c.id);
          if (mod) server?.moduleGraph.invalidateModule(mod);
        }
        server?.ws.send({ type: 'full-reload' });
      };
      dev.watcher.add(contentRoot);
      dev.watcher.on('add', onChange);
      dev.watcher.on('unlink', onChange);
      dev.watcher.on('change', (f) => f.endsWith('.md') || f.endsWith('.json') ? onChange(f) : undefined);
    },
  };
}
