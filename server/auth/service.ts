import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SiteDatabase } from '../db/database.ts';
import { AppError } from '../errors.ts';
import { hashPassword, verifyPassword } from './password.ts';

const RESOURCES = ['site', 'profile', 'gallery', 'music', 'essays', 'footprints', 'wishes', 'brands', 'folders', 'media'] as const;
export const TOKEN_SCOPES = [...RESOURCES.flatMap(resource => [`${resource}:read`, `${resource}:write`]), 'analytics:read'] as const;
const SESSION_MS = 12 * 60 * 60 * 1000;
export const digestCredential = (token: string): string => createHash('sha256').update(token).digest('hex');
const opaqueToken = () => randomBytes(32).toString('base64url');

export interface Principal {
  type: 'session' | 'token';
  username: string;
  scopes: string[];
  tokenId?: string;
}
export interface SessionResult {
  token: string;
  csrfToken: string;
  expiresAt: string;
  username: string;
}
export interface TokenInput { name: string; scopes: string[]; expiresAt: string }
interface OwnerRow { username: string; password_hash: string }

export class AuthService {
  constructor(private readonly db: SiteDatabase, private readonly now = () => Date.now()) {}

  hasOwner(): boolean {
    return !!this.db.connection.prepare('SELECT id FROM owner WHERE id = 1').get();
  }

  async createOwner(username: string, password: string): Promise<void> {
    if (this.hasOwner()) throw new AppError(409, 'OWNER_EXISTS', '站主账号已经存在');
    if (typeof username !== 'string' || !username.trim() || username.length > 80) throw new AppError(400, 'INVALID_USERNAME', '请输入有效的站主账号');
    const passwordHash = await hashPassword(password);
    this.db.transaction(() => {
      if (this.hasOwner()) throw new AppError(409, 'OWNER_EXISTS', '站主账号已经存在');
      this.db.connection.prepare('INSERT INTO owner (id, username, password_hash, created_at) VALUES (1, ?, ?, ?)').run(username.trim(), passwordHash, this.now());
    });
  }

  async login(username: string, password: string): Promise<SessionResult> {
    const owner = this.owner();
    // When an owner exists, verify the password even for an invalid username.
    const valid = owner ? await verifyPassword(password, owner.password_hash) : false;
    if (!owner || owner.username !== username || !valid) throw new AppError(401, 'INVALID_LOGIN', '账号或密码错误');
    const token = opaqueToken(), csrfToken = opaqueToken();
    const expiresAt = this.now() + SESSION_MS;
    this.db.transaction(() => {
      const currentOwner = this.owner();
      if (!currentOwner || currentOwner.username !== owner.username || currentOwner.password_hash !== owner.password_hash) {
        throw new AppError(401, 'INVALID_LOGIN', '账号或密码错误');
      }
      this.db.connection.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(this.now());
      this.db.connection.prepare('INSERT INTO sessions (token_hash, owner_id, csrf_hash, expires_at, created_at) VALUES (?, 1, ?, ?, ?)')
        .run(digestCredential(token), digestCredential(csrfToken), expiresAt, this.now());
    });
    return { token, csrfToken, expiresAt: new Date(expiresAt).toISOString(), username: owner.username };
  }

  verifySession(token: string): Principal | null {
    if (typeof token !== 'string' || token.length > 200) return null;
    const row = this.db.connection.prepare('SELECT o.username FROM sessions s JOIN owner o ON o.id = s.owner_id WHERE s.token_hash = ? AND s.expires_at > ?')
      .get(digestCredential(token), this.now());
    return row ? { type: 'session', username: String(row.username), scopes: [] } : null;
  }

  verifyCsrf(session: string, csrf: string): boolean {
    if (!this.verifySession(session) || typeof csrf !== 'string' || csrf.length > 200) return false;
    const row = this.db.connection.prepare('SELECT csrf_hash FROM sessions WHERE token_hash = ?').get(digestCredential(session));
    return row?.csrf_hash === digestCredential(csrf);
  }

  logout(session: string): void {
    this.db.connection.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digestCredential(session));
  }

  issueToken(input: TokenInput): { id: string; token: string; name: string; scopes: string[]; expiresAt: string } {
    if (!this.hasOwner()) throw new AppError(409, 'OWNER_MISSING', '请先初始化站主账号');
    const expires = Date.parse(input.expiresAt);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 100 || !Number.isFinite(expires) || expires <= this.now()) {
      throw new AppError(400, 'INVALID_TOKEN', 'Token 名称或有效期无效');
    }
    if (!Array.isArray(input.scopes) || !input.scopes.length || input.scopes.some(scope => !TOKEN_SCOPES.includes(scope))) {
      throw new AppError(400, 'INVALID_SCOPE', 'Token 权限无效');
    }
    const id = randomUUID(), token = `site_${opaqueToken()}`, scopes = [...new Set(input.scopes)];
    this.db.connection.prepare('INSERT INTO api_tokens (id, owner_id, name, token_hash, scopes, expires_at, created_at) VALUES (?, 1, ?, ?, ?, ?, ?)')
      .run(id, input.name.trim(), digestCredential(token), JSON.stringify(scopes), expires, this.now());
    return { id, token, name: input.name.trim(), scopes, expiresAt: new Date(expires).toISOString() };
  }

  verifyToken(token: string): Principal | null {
    if (typeof token !== 'string' || token.length > 200) return null;
    const row = this.db.connection.prepare('SELECT t.id, t.scopes, o.username FROM api_tokens t JOIN owner o ON o.id = t.owner_id WHERE t.token_hash = ? AND t.expires_at > ? AND t.revoked_at IS NULL')
      .get(digestCredential(token), this.now());
    if (!row) return null;
    this.db.connection.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(this.now(), String(row.id));
    return { type: 'token', username: String(row.username), scopes: JSON.parse(String(row.scopes)) as string[], tokenId: String(row.id) };
  }

  permits(principal: Principal, scope: string): boolean {
    if (principal.type === 'session') return true;
    return principal.scopes.includes(scope) || (scope.endsWith(':read') && principal.scopes.includes(scope.replace(/:read$/, ':write')));
  }

  listTokens() {
    return this.db.connection.prepare('SELECT id, name, scopes, expires_at, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC').all()
      .map(row => ({ id: String(row.id), name: String(row.name), scopes: JSON.parse(String(row.scopes)) as string[], expiresAt: new Date(Number(row.expires_at)).toISOString(),
        createdAt: new Date(Number(row.created_at)).toISOString(), lastUsedAt: row.last_used_at ? new Date(Number(row.last_used_at)).toISOString() : null, revoked: row.revoked_at !== null }));
  }

  revokeToken(id: string): void {
    const result = this.db.connection.prepare('UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(this.now(), id);
    if (!result.changes) throw new AppError(404, 'TOKEN_NOT_FOUND', 'Token 不存在或已经撤销');
  }

  async changePassword(current: string, next: string): Promise<void> {
    const owner = this.owner();
    if (!owner || !await verifyPassword(current, owner.password_hash)) throw new AppError(401, 'INVALID_PASSWORD', '当前密码错误');
    const passwordHash = await hashPassword(next);
    this.db.transaction(() => {
      if (this.owner()?.password_hash !== owner.password_hash) throw new AppError(401, 'INVALID_PASSWORD', '当前密码错误');
      this.db.connection.prepare('UPDATE owner SET password_hash = ? WHERE id = 1').run(passwordHash);
      this.db.connection.exec('DELETE FROM sessions');
      this.db.connection.prepare('UPDATE api_tokens SET revoked_at = ? WHERE revoked_at IS NULL').run(this.now());
    });
  }

  private owner(): OwnerRow | undefined {
    return this.db.connection.prepare('SELECT username, password_hash FROM owner WHERE id = 1').get() as unknown as OwnerRow | undefined;
  }
}
