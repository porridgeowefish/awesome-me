import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createApp } from '../../../server/app';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDatabase } from '../../../server/db/database';
import { AuthService } from '../../../server/auth/service';

const apps: FastifyInstance[] = [];
const origin = 'http://localhost:3001';
async function setup() {
  const app = await createApp({ databasePath: ':memory:', publicOrigin: origin, secureCookies: false, logger: false });
  apps.push(app);
  await app.auth.createOwner('owner', 'long-owner-password');
  return app;
}
async function login(app: FastifyInstance) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'owner', password: 'long-owner-password' } });
  const cookie = response.cookies.map(c => `${c.name}=${c.value}`).join('; ');
  return { response, cookie, csrf: response.json().csrfToken as string };
}
afterEach(async () => { for (const app of apps.splice(0)) await app.close(); });

describe('HTTP authentication boundary', () => {
  it('detects local owner initialization while the server is already running', async () => {
    const root=mkdtempSync(path.join(os.tmpdir(),'site-owner-setup-'));
    const databasePath=path.join(root,'site.sqlite');
    const app=await createApp({databasePath,publicOrigin:origin,secureCookies:false,logger:false});
    try {
      expect((await app.inject('/api/v1/health')).json().ownerInitialized).toBe(false);
      const localDb=openDatabase(databasePath);
      try {await new AuthService(localDb).createOwner('owner','long-owner-password');}
      finally {localDb.close();}
      expect((await app.inject('/api/v1/health')).json().ownerInitialized).toBe(true);
      expect((await login(app)).response.statusCode).toBe(200);
    } finally {await app.close();rmSync(root,{recursive:true,force:true});}
  });

  it('uses HttpOnly session cookies, preserves a refresh and exposes no registration', async () => {
    const app = await setup();
    expect((await app.inject('/api/v1/auth/session')).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: {} })).statusCode).toBe(404);
    const session = await login(app);
    expect(session.response.statusCode).toBe(200);
    expect(session.response.cookies.find(c => c.name === 'site_session')?.httpOnly).toBe(true);
    expect(session.response.cookies.find(c => c.name === 'site_session')?.sameSite).toBe('Strict');
    expect(session.response.json()).not.toHaveProperty('token');
    const refreshed = await app.inject({ url: '/api/v1/auth/session', headers: { cookie: session.cookie } });
    expect(refreshed.json()).toMatchObject({ username: 'owner', csrfToken: session.csrf });
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: session.cookie, origin, 'x-csrf-token': session.csrf } });
    expect(out.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/session', headers: { cookie: session.cookie } })).statusCode).toBe(401);
  });

  it('rejects cross-origin login and session mutation without a valid CSRF header', async () => {
    const app = await setup();
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: 'https://evil.example' }, payload: { username: 'owner', password: 'long-owner-password' } })).statusCode).toBe(403);
    const session = await login(app);
    for (const headers of [
      { cookie: session.cookie, origin },
      { cookie: session.cookie, origin, 'x-csrf-token': 'wrong' },
      { cookie: session.cookie, origin: 'https://evil.example', 'x-csrf-token': session.csrf },
    ]) {
      expect((await app.inject({ method: 'POST', url: '/api/v1/auth/tokens', headers, payload: { name: 'agent', scopes: ['gallery:write'], expiresAt: '2099-01-01T00:00:00Z' } })).statusCode).toBe(403);
    }
  });

  it('allows token management only from an authenticated owner browser', async () => {
    const app = await setup();
    const session = await login(app);
    const issued = await app.inject({ method: 'POST', url: '/api/v1/auth/tokens', headers: { cookie: session.cookie, origin, 'x-csrf-token': session.csrf }, payload: { name: 'agent', scopes: ['gallery:write'], expiresAt: '2099-01-01T00:00:00Z' } });
    expect(issued.statusCode).toBe(201);
    const token = issued.json().token as string;
    const headers = { authorization: `Bearer ${token}` };
    expect((await app.inject({ url: '/api/v1/auth/session', headers })).json()).toMatchObject({ type: 'token', scopes: ['gallery:write'] });
    expect((await app.inject({ url: '/api/v1/auth/tokens', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/api/v1/auth/tokens', headers, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'PUT', url: '/api/v1/auth/password', headers, payload: { currentPassword: 'long-owner-password', newPassword: 'new-owner-password' } })).statusCode).toBe(403);
    const list = await app.inject({ url: '/api/v1/auth/tokens', headers: { cookie: session.cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.body).not.toContain(token);
    const revoked = await app.inject({ method: 'DELETE', url: `/api/v1/auth/tokens/${issued.json().id}`, headers: { cookie: session.cookie, origin, 'x-csrf-token': session.csrf } });
    expect(revoked.statusCode).toBe(200);
    expect((await app.inject({ url: '/api/v1/auth/session', headers })).statusCode).toBe(401);
  });

  it('limits repeated unsuccessful login attempts', async () => {
    const app = await setup();
    const statuses: number[] = [];
    for (let i = 0; i < 9; i++) statuses.push((await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin }, payload: { username: 'owner', password: 'incorrect-password' } })).statusCode);
    expect(statuses.slice(0, 8)).toEqual(Array(8).fill(401));
    expect(statuses[8]).toBe(429);
  });
});
