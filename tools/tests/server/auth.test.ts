import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase, type SiteDatabase } from '../../../server/db/database';
import { AuthService } from '../../../server/auth/service';
import { hashPassword, verifyPassword } from '../../../server/auth/password';
import * as passwordKdf from '../../../server/auth/password';

const opened: SiteDatabase[] = [];
const directories: string[] = [];
const password = 'correct-horse-山野-2026';
function setup(clock = () => Date.now(), filename = ':memory:') {
  const db = openDatabase(filename);
  opened.push(db);
  return { db, auth: new AuthService(db, clock) };
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const db of opened.splice(0)) db.close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('owner authentication', () => {
  it('stores salted password hashes and never accepts a wrong password', async () => {
    const first = await hashPassword(password);
    const second = await hashPassword(password);
    expect(first).not.toBe(second);
    expect(first).not.toContain(password);
    expect(await verifyPassword(password, first)).toBe(true);
    expect(await verifyPassword('wrong-password', first)).toBe(false);
    expect(await verifyPassword(password, 'corrupt-record')).toBe(false);
  });

  it('allows exactly one owner and validates password strength', async () => {
    const { auth } = setup();
    await expect(auth.createOwner('owner', 'short')).rejects.toMatchObject({ statusCode: 400 });
    await auth.createOwner('owner', password);
    await expect(auth.createOwner('second', password)).rejects.toMatchObject({ statusCode: 409 });
    await expect(auth.login('second', password)).rejects.toMatchObject({ statusCode: 401 });
    await expect(auth.login('owner', 'wrong-password')).rejects.toMatchObject({ statusCode: 401 });
    const session = await auth.login('owner', password);
    expect(auth.verifySession(session.token)?.username).toBe('owner');
  });

  it('expires and revokes sessions and stores only opaque token digests', async () => {
    let now = Date.parse('2026-10-03T01:00:00Z');
    const { auth, db } = setup(() => now);
    await auth.createOwner('owner', password);
    const session = await auth.login('owner', password);
    const row = db.connection.prepare('SELECT token_hash, csrf_hash FROM sessions').get();
    expect(JSON.stringify(row)).not.toContain(session.token);
    expect(JSON.stringify(row)).not.toContain(session.csrfToken);
    expect(auth.verifySession(session.token)?.type).toBe('session');
    expect(auth.verifyCsrf(session.token, session.csrfToken)).toBe(true);
    expect(auth.verifyCsrf(session.token, 'incorrect')).toBe(false);
    auth.logout(session.token);
    expect(auth.verifySession(session.token)).toBeNull();
    const next = await auth.login('owner', password);
    now = Date.parse(next.expiresAt) + 1;
    expect(auth.verifySession(next.token)).toBeNull();
  });

  it('enforces token scopes, expiry and immediate revocation', async () => {
    let now = Date.parse('2026-10-03T01:00:00Z');
    const { auth, db } = setup(() => now);
    await auth.createOwner('owner', password);
    const issued = auth.issueToken({ name: 'photo-agent', scopes: ['gallery:write', 'media:write'], expiresAt: new Date(now + 60_000).toISOString() });
    const principal = auth.verifyToken(issued.token)!;
    expect(principal.type).toBe('token');
    expect(auth.permits(principal, 'gallery:write')).toBe(true);
    expect(auth.permits(principal, 'essays:write')).toBe(false);
    expect(auth.permits(principal, 'gallery:read')).toBe(true);
    expect(auth.permits(principal, 'auth:write')).toBe(false);
    expect(JSON.stringify(db.connection.prepare('SELECT token_hash FROM api_tokens').get())).not.toContain(issued.token);
    expect(JSON.stringify(auth.listTokens())).not.toContain(issued.token);
    auth.revokeToken(issued.id);
    expect(auth.verifyToken(issued.token)).toBeNull();
    const expired = auth.issueToken({ name: 'short', scopes: ['analytics:read'], expiresAt: new Date(now + 1000).toISOString() });
    now += 1001;
    expect(auth.verifyToken(expired.token)).toBeNull();
  });

  it('rejects privileged, empty, unknown and already expired token scopes', async () => {
    const { auth } = setup();
    await auth.createOwner('owner', password);
    for (const scopes of [[], ['auth:write'], ['anything:write']]) {
      expect(() => auth.issueToken({ name: 'bad', scopes, expiresAt: '2099-01-01T00:00:00Z' })).toThrow();
    }
    expect(() => auth.issueToken({ name: 'bad', scopes: ['site:read'], expiresAt: '2020-01-01T00:00:00Z' })).toThrow();
  });

  it('changing a password revokes existing sessions and CLI tokens', async () => {
    const { auth } = setup();
    await auth.createOwner('owner', password);
    const old = await auth.login('owner', password);
    const issued = auth.issueToken({ name: 'agent', scopes: ['site:read'], expiresAt: '2099-01-01T00:00:00Z' });
    await expect(auth.changePassword('incorrect-password', 'new-correct-password')).rejects.toMatchObject({ statusCode: 401 });
    await auth.changePassword(password, 'new-correct-password');
    expect(auth.verifySession(old.token)).toBeNull();
    expect(auth.verifyToken(issued.token)).toBeNull();
    await expect(auth.login('owner', password)).rejects.toMatchObject({ statusCode: 401 });
    expect(auth.verifySession((await auth.login('owner', 'new-correct-password')).token)).not.toBeNull();
  });

  it('rejects an old-password login that finishes verification after a password change', async () => {
    const { auth, db } = setup();
    await auth.createOwner('owner', password);
    const verification = deferred<boolean>();
    vi.spyOn(passwordKdf, 'verifyPassword').mockImplementationOnce(() => verification.promise);
    const pendingLogin = auth.login('owner', password);
    const rejectedLogin = expect(pendingLogin).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_LOGIN' });
    await auth.changePassword(password, 'new-correct-password');
    verification.resolve(true);
    await rejectedLogin;
    expect(db.connection.prepare('SELECT COUNT(*) AS count FROM sessions').get()?.count).toBe(0);
    expect(auth.verifySession((await auth.login('owner', 'new-correct-password')).token)).not.toBeNull();
  });

  it('rejects a concurrent password change based on the stale password hash', async () => {
    const { auth } = setup();
    await auth.createOwner('owner', password);
    const staleHash = await hashPassword('stale-new-password');
    const hashing = deferred<string>();
    const enteredHashing = deferred<void>();
    vi.spyOn(passwordKdf, 'hashPassword').mockImplementationOnce(() => {
      enteredHashing.resolve();
      return hashing.promise;
    });
    const pendingChange = auth.changePassword(password, 'stale-new-password');
    const rejectedChange = expect(pendingChange).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_PASSWORD' });
    await enteredHashing.promise;
    await auth.changePassword(password, 'winning-new-password');
    const winningSession = await auth.login('owner', 'winning-new-password');
    hashing.resolve(staleHash);
    await rejectedChange;
    expect(auth.verifySession(winningSession.token)).not.toBeNull();
    await expect(auth.login('owner', 'stale-new-password')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('persists the owner and sessions through a database restart', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'personal-site-auth-'));
    directories.push(directory);
    const filename = path.join(directory, 'site.sqlite');
    const first = setup(undefined, filename);
    await first.auth.createOwner('站主', password);
    const session = await first.auth.login('站主', password);
    first.db.close();
    opened.splice(opened.indexOf(first.db), 1);
    const second = setup(undefined, filename);
    expect(second.auth.verifySession(session.token)?.username).toBe('站主');
    expect(readFileSync(filename).includes(Buffer.from(password))).toBe(false);
  });

  it('rolls back all writes when a transaction fails', () => {
    const { db } = setup();
    expect(() => db.transaction(() => {
      db.connection.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('probe', 'one');
      throw new Error('stop');
    })).toThrow('stop');
    expect(db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('probe')).toBeUndefined();
  });

  it('does not retain nesting depth when beginning a transaction fails', () => {
    const { db } = setup();
    const beginError = new Error('database is busy');
    const exec = vi.spyOn(db.connection, 'exec').mockImplementationOnce(() => { throw beginError; });
    expect(() => db.transaction(() => undefined)).toThrow(beginError);
    db.transaction(() => db.connection.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('after-begin-failure', 'saved'));
    expect(exec.mock.calls[1][0]).toBe('BEGIN IMMEDIATE');
    expect(db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('after-begin-failure')?.value).toBe('saved');
  });

  it('preserves the original failure when rollback also fails and restores transaction depth', () => {
    const { db } = setup();
    const operationError = new Error('original operation failure');
    expect(() => db.transaction(() => {
      // SQLite can end a transaction itself, leaving no transaction to roll back.
      db.connection.exec('ROLLBACK');
      throw operationError;
    })).toThrow(operationError);
    db.transaction(() => db.connection.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('after-rollback-failure', 'saved'));
    expect(db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('after-rollback-failure')?.value).toBe('saved');
  });

  it('rolls back nested content operations with their enclosing transaction', () => {
    const { db } = setup();
    expect(() => db.transaction(() => {
      db.transaction(() => db.connection.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('inner', 'one'));
      throw new Error('outer failure');
    })).toThrow('outer failure');
    expect(db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('inner')).toBeUndefined();
    db.transaction(() => {
      db.connection.prepare('INSERT INTO app_meta (key, value) VALUES (?, ?)').run('outer', 'keep');
      expect(() => db.transaction(() => { throw new Error('inner failure'); })).toThrow('inner failure');
    });
    expect(db.connection.prepare('SELECT value FROM app_meta WHERE key = ?').get('outer')?.value).toBe('keep');
  });
});
