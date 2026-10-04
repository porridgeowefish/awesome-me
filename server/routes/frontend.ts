import fs from 'node:fs';
import path from 'node:path';
import staticFiles from '@fastify/static';
import type { FastifyInstance } from 'fastify';

export async function frontendRoutes(app: FastifyInstance) {
  const root = path.resolve('public/.build');
  if (!fs.existsSync(path.join(root, 'index.html'))) return;
  // Static output contains design assets only. Content/media are handled by publication guards.
  await app.register(staticFiles, { root, wildcard: false, index: false, cacheControl: true, maxAge: '1h', setHeaders(reply, file) { if (file.endsWith('index.html')) reply.header('Cache-Control', 'no-store'); } });
  app.get('/', async (_request, reply) => reply.header('Cache-Control','no-store').sendFile('index.html'));
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !/^\/(api|content|_AMapService)(\/|$)/.test(request.url) && !path.extname(request.url.split('?')[0])) return reply.header('Cache-Control', 'no-store').sendFile('index.html');
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '页面或资源不存在' } });
  });
}
