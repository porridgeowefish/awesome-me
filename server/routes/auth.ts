import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { checkOrigin, requireAccess } from '../auth/http.ts';

const credentials = z.strictObject({ username: z.string().min(1).max(80), password: z.string().min(1).max(256) });
const tokenInput = z.strictObject({ name: z.string().min(1).max(100), scopes: z.array(z.string()).min(1).max(30), expiresAt: z.iso.datetime() });

export function authRoutes(app: FastifyInstance): void {
  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 8, timeWindow: '15 minutes' } } }, async (request, reply) => {
    checkOrigin(request, app.siteConfig.publicOrigin);
    const body = credentials.parse(request.body);
    const session = await app.auth.login(body.username, body.password);
    const options = { path: '/', sameSite: 'strict' as const, secure: app.siteConfig.secureCookies, expires: new Date(session.expiresAt) };
    reply.setCookie('site_session', session.token, { ...options, httpOnly: true });
    reply.setCookie('site_csrf', session.csrfToken, { ...options, httpOnly: false });
    return { username: session.username, type: 'session', csrfToken: session.csrfToken, expiresAt: session.expiresAt };
  });

  app.get('/api/v1/auth/session', { preHandler: requireAccess(app) }, async request => ({
    username: request.principal!.username, type: request.principal!.type, scopes: request.principal!.scopes,
    ...(request.principal!.type === 'session' ? { csrfToken: request.cookies.site_csrf ?? '' } : {}),
  }));

  app.post('/api/v1/auth/logout', { preHandler: requireAccess(app, undefined, true) }, async (request, reply) => {
    app.auth.logout(request.cookies.site_session!);
    reply.clearCookie('site_session', { path: '/' });
    reply.clearCookie('site_csrf', { path: '/' });
    return { ok: true };
  });

  app.get('/api/v1/auth/tokens', { preHandler: requireAccess(app, undefined, true) }, async () => app.auth.listTokens());
  app.post('/api/v1/auth/tokens', { preHandler: requireAccess(app, undefined, true) }, async (request, reply) => {
    const issued = app.auth.issueToken(tokenInput.parse(request.body));
    reply.code(201);
    return issued;
  });
  app.delete<{ Params: { id: string } }>('/api/v1/auth/tokens/:id', { preHandler: requireAccess(app, undefined, true) }, async request => {
    app.auth.revokeToken(request.params.id);
    return { ok: true };
  });
  app.put('/api/v1/auth/password', { preHandler: requireAccess(app, undefined, true) }, async (request, reply) => {
    const body = z.strictObject({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(256) }).parse(request.body);
    await app.auth.changePassword(body.currentPassword, body.newPassword);
    reply.clearCookie('site_session', { path: '/' });
    reply.clearCookie('site_csrf', { path: '/' });
    return { ok: true };
  });
}
