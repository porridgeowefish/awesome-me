import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../errors.ts';
import type { Principal } from './service.ts';

export function checkOrigin(request: FastifyRequest, expected: string): void {
  if (request.headers.origin !== expected) throw new AppError(403, 'INVALID_ORIGIN', '请求来源不被允许');
}

export function authenticateRequest(app: FastifyInstance, request: FastifyRequest): Principal {
  const authorization = request.headers.authorization;
  const principal = authorization
    ? /^Bearer [\w-]+$/.test(authorization) ? app.auth.verifyToken(authorization.slice(7)) : null
    : app.auth.verifySession(request.cookies.site_session ?? '');
  if (!principal) throw new AppError(401, 'UNAUTHENTICATED', '请先登录');
  request.principal = principal;
  return principal;
}

export function requireAccess(app: FastifyInstance, scope?: string, ownerOnly = false) {
  return async (request: FastifyRequest): Promise<void> => {
    const principal = authenticateRequest(app, request);
    if ((ownerOnly && principal.type !== 'session') || (scope && !app.auth.permits(principal, scope))) {
      throw new AppError(403, 'FORBIDDEN', '当前凭据没有这项操作的权限');
    }
    if (principal.type === 'session' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      checkOrigin(request, app.siteConfig.publicOrigin);
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !app.auth.verifyCsrf(request.cookies.site_session ?? '', csrf)) {
        throw new AppError(403, 'INVALID_CSRF', '会话验证失败，请刷新管理页面后重试');
      }
    }
  };
}
