import type { FastifyInstance } from 'fastify';
import { safeContentPath } from '../../src/contracts/content.ts';
import { AppError } from '../errors.ts';
import fs from 'node:fs';
import path from 'node:path';
import { authenticateRequest } from '../auth/http.ts';
import { streamFile } from '../media/range.ts';
import { RESOURCE_KINDS } from '../../src/contracts/content.ts';

const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.pdf': 'application/pdf' };
function references(value: unknown, target: string): boolean {
  if (typeof value === 'string') { try { return decodeURIComponent(value).replace(/^\//, '') === target; } catch { return false; } }
  if (Array.isArray(value)) return value.some(item => references(item, target));
  return value !== null && typeof value === 'object' && Object.values(value).some(item => references(item, target));
}

/** Legacy Markdown URLs remain valid but obey the current publication state. */
export function legacyRoutes(app: FastifyInstance): void {
  app.get<{ Params: { '*': string } }>('/content/*', async (request, reply) => {
    const relative = request.params['*'];
    const missing = () => new AppError(404, 'CONTENT_NOT_FOUND', '内容文件不存在或尚未发布');
    if (!safeContentPath(relative)) throw missing();
    let principal = request.headers.authorization ? authenticateRequest(app, request) : app.auth.verifySession(request.cookies.site_session ?? '');
    const scope = relative.startsWith('essays/') ? 'essays:read' : 'media:read';
    const privateAccess = !!principal && app.auth.permits(principal, scope);
    if (relative.startsWith('essays/') && relative.endsWith('/index.md')) {
      reply.type('text/markdown; charset=utf-8').header('Cache-Control', 'no-store');
      return app.content.essayBody(relative.slice(7, -'/index.md'.length), privateAccess);
    }
    const type = TYPES[path.extname(relative).toLowerCase()];
    if (!type) throw missing();
    if (!privateAccess) {
      const bundle = relative.startsWith('essays/') ? app.content.list('essays').filter(row => relative.startsWith(`essays/${row.data.publicPath}/`)).sort((a,b) => b.data.publicPath.length - a.data.publicPath.length)[0] : null;
      const directlyReferenced = RESOURCE_KINDS.some(kind => app.content.list(kind).some(row => references(row.data, `content/${relative}`) && (kind === 'essays' ? 'status' in row.data && row.data.status === 'published' : !('visible' in row.data) || row.data.visible)));
      if (!(bundle?.data.status === 'published') && !directlyReferenced) throw missing();
    }
    const root = path.resolve(app.siteConfig.dataDir, 'legacy/content');
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile() || !fs.realpathSync(file).startsWith(fs.realpathSync(root) + path.sep)) throw missing();
    reply.header('Cache-Control', 'private, no-store').header('Content-Security-Policy', "sandbox; default-src 'none'");
    return streamFile(file, type, request, reply);
  });
}
