import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { openDatabase, type SiteDatabase } from './db/database.ts';
import { AuthService, type Principal } from './auth/service.ts';
import { loadConfig, type ServerConfig } from './config.ts';
import { AppError } from './errors.ts';
import { authRoutes } from './routes/auth.ts';
import { ContentService } from './content/service.ts';
import { contentRoutes } from './routes/content.ts';
import { essayWritingRoutes } from './routes/essay-writing.ts';
import { legacyRoutes } from './routes/legacy.ts';
import { MediaService } from './media/service.ts';
import { mediaRoutes } from './routes/media.ts';
import { MapService } from './maps/service.ts';
import { mapRoutes } from './routes/maps.ts';
import { frontendRoutes } from './routes/frontend.ts';
import { AnalyticsService } from './analytics/service.ts';
import { analyticsRoutes } from './routes/analytics.ts';

declare module 'fastify' {
  interface FastifyInstance { db: SiteDatabase; auth: AuthService; content: ContentService; media: MediaService; maps: MapService; analytics:AnalyticsService; siteConfig: ServerConfig }
  interface FastifyRequest { principal: Principal | null }
}

export async function createApp(options: Partial<ServerConfig> = {}): Promise<FastifyInstance> {
  const config = { ...loadConfig(), ...options };
  const app = Fastify({
    logger: config.logger ? { redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'] } : false,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 300_000,
    trustProxy: false,
  });
  try {
    const db = openDatabase(config.databasePath);
    app.decorate('db', db);
    app.decorate('auth', new AuthService(db));
    app.decorate('content', new ContentService(db));
    app.decorate('media', new MediaService(db, app.content, config.dataDir));
    app.decorate('maps', new MapService(config));
    app.decorate('analytics',new AnalyticsService(db));
    app.decorate('siteConfig', config);
    app.decorateRequest('principal', null);
    app.addHook('onClose', async () => db.close());
    await app.register(cookie);
    await app.register(rateLimit, { global: false });
    await app.register(multipart, { limits: { files: 1, fileSize: 100 * 1024 * 1024, parts: 1 } });
    app.addHook('onRequest', async (request, reply) => {
      if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    });
    app.setErrorHandler((error, _request, reply) => {
      if (error instanceof ZodError) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: '提交的数据格式无效', fields: error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message })) } });
      }
      const statusCode = error instanceof AppError ? error.statusCode : (error as { statusCode?: number }).statusCode ?? 500;
      if (statusCode >= 500) app.log.error({ error: (error as Error).name }, 'Internal server error');
      return reply.code(statusCode).send({ error: { code: error instanceof AppError ? error.code : statusCode === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', message: statusCode >= 500 ? '服务暂时无法处理请求' : (error as Error).message } });
    });
    app.get('/api/v1/health', async () => ({ ok: true, ownerInitialized: app.auth.hasOwner(), version: 1 }));
    authRoutes(app);
    contentRoutes(app);
    essayWritingRoutes(app);
    mediaRoutes(app);
    mapRoutes(app);
    analyticsRoutes(app);
    legacyRoutes(app);
    await frontendRoutes(app);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
