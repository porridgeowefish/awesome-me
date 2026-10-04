import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/** Runtime-managed content never enters the deployment's static directory. */
export function publicAssetsPlugin(): Plugin {
  let root: string, outDir: string;
  return {
    name: 'public-design-assets-only',
    configResolved(config) { root = config.root; outDir = path.resolve(root, config.build.outDir); },
    closeBundle() {
      const source = path.join(root, 'public');
      for (const name of ['images', 'favicon.png']) {
        if (fs.existsSync(path.join(source, name))) fs.cpSync(path.join(source, name), path.join(outDir, name), { recursive: true });
      }
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try { pathname = decodeURIComponent((request.url ?? '').split('?')[0]); } catch { response.statusCode = 400; response.end(); return; }
        if (pathname === '/favicon.png' || pathname.startsWith('/images/')) {
          const base = path.resolve(root, 'public'); const file = path.resolve(base, pathname.slice(1));
          if (file.startsWith(base + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            const mime: Record<string, string> = { '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
            response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream'); fs.createReadStream(file).pipe(response); return;
          }
        }
        next();
      });
    },
  };
}
