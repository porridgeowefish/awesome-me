import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, hostname } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createBackup, restoreBackup } from '../../../server/backup/index.ts';
import { acquireRuntimeLock, RUNTIME_LOCK_NAME } from '../../../server/runtime-lock.ts';
import { createApp } from '../../../server/app.ts';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'site-backup-')); roots.push(root);
  const dataDir = path.join(root, 'data'); mkdirSync(dataDir);
  const db = new DatabaseSync(path.join(dataDir, 'site.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE proof (value TEXT); INSERT INTO proof VALUES (\'保留数据\');');
  mkdirSync(path.join(dataDir, 'uploads', 'photo'), { recursive: true });
  writeFileSync(path.join(dataDir, 'uploads', 'photo', 'original.jpg'), Buffer.from([0, 255, 12, 99]));
  mkdirSync(path.join(dataDir, 'legacy', 'content', '中文'), { recursive: true });
  writeFileSync(path.join(dataDir, 'legacy', 'content', '中文', '旧照片.png'), 'legacy-photo');
  writeFileSync(path.join(dataDir, '.env.server'), 'AMAP_SERVICE_KEY=never-copy');
  return { root, dataDir, db, backup: path.join(root, 'snapshot'), restored: path.join(root, 'restored') };
}

describe('offline snapshots', () => {
  it('preserves the original publish error if staging cleanup also fails, and releases the source lock', () => {
    const f = fixture(); f.db.close();
    const publishError = Object.assign(new Error('original Windows rename failure'), { code: 'EPERM' });
    vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw publishError; });
    vi.spyOn(fs, 'rmSync').mockImplementation(() => { throw new Error('secondary cleanup failure'); });
    let error: unknown;
    try { createBackup(f.dataDir, f.backup); } catch (failure) { error = failure; }
    expect(error).toBe(publishError);
    expect(readdirSync(f.dataDir)).not.toContain(RUNTIME_LOCK_NAME);
  });

  it('runs backup and restore command entry points without copying environment secrets', () => {
    const f = fixture(); f.db.close();
    const env = { ...process.env, SITE_DATA_DIR: f.dataDir, AMAP_SERVICE_KEY: 'test-only-map-key' };
    const backup = spawnSync(process.execPath, ['--import', 'tsx', 'server/commands/backup.ts', '--out', f.backup], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(backup.status, backup.stderr).toBe(0);
    expect(backup.stdout).toContain('备份完成');
    expect(readFileSync(path.join(f.backup, 'manifest.json'), 'utf8')).not.toContain('test-only-map-key');
    const restore = spawnSync(process.execPath, ['--import', 'tsx', 'server/commands/restore.ts', '--from', f.backup, '--to', f.restored], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(restore.status, restore.stderr).toBe(0);
    expect(restore.stdout).toContain('恢复完成');
    const retry = spawnSync(process.execPath, ['--import', 'tsx', 'server/commands/restore.ts', '--from', f.backup, '--to', f.restored], { cwd: process.cwd(), env, encoding: 'utf8' });
    expect(retry.status).toBe(1);
    expect(retry.stderr).toContain('已存在');
  });

  it('captures WAL commits, binary uploads and legacy, excludes environment, and persists across database reopen', () => {
    const f = fixture();
    try { createBackup(f.dataDir, f.backup); } finally { f.db.close(); }
    const manifest = JSON.parse(readFileSync(path.join(f.backup, 'manifest.json'), 'utf8'));
    expect(manifest.files.map((entry: { path: string }) => entry.path)).toContain('legacy/content/中文/旧照片.png');
    expect(readdirSync(f.backup).sort()).toEqual(['legacy', 'manifest.json', 'site.sqlite', 'uploads']);
    restoreBackup(f.backup, f.restored);
    for (let index = 0; index < 2; index++) {
      const db = new DatabaseSync(path.join(f.restored, 'site.sqlite'));
      try { expect(db.prepare('SELECT value FROM proof').get()?.value).toBe('保留数据'); } finally { db.close(); }
    }
    expect(readFileSync(path.join(f.restored, 'uploads/photo/original.jpg'))).toEqual(Buffer.from([0, 255, 12, 99]));
    expect(readFileSync(path.join(f.restored, 'legacy/content/中文/旧照片.png'), 'utf8')).toBe('legacy-photo');
  });

  it('restores actual content and owner through app restarts', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'site-backup-app-')); roots.push(root);
    const dataDir = path.join(root, 'data');
    let app = await createApp({ dataDir, databasePath: path.join(dataDir, 'site.sqlite') });
    await app.auth.createOwner('backup-owner', 'backup-test-password-long');
    app.content.create('essays', { publicPath: 'restored', title: '恢复文章', date: '2026-10-03', body: '持久正文', folder: [], status: 'published' });
    await app.close();
    createBackup(dataDir, path.join(root, 'snapshot'));
    const restored = path.join(root, 'restored'); restoreBackup(path.join(root, 'snapshot'), restored);
    for (let index = 0; index < 2; index++) {
      app = await createApp({ dataDir: restored, databasePath: path.join(restored, 'site.sqlite') });
      try {
        expect(app.auth.hasOwner()).toBe(true);
        expect((await app.inject('/api/v1/health')).json().ownerInitialized).toBe(true);
        expect(app.content.list('essays')[0].data.title).toBe('恢复文章');
      } finally { await app.close(); }
    }
  });

  it('refuses managed running process locks and releases only its own lock', () => {
    const f = fixture(); f.db.close();
    const lock = acquireRuntimeLock(f.dataDir, 'server');
    try {
      expect(() => createBackup(f.dataDir, f.backup)).toThrow(/正在使用/);
      expect(() => acquireRuntimeLock(f.dataDir, 'server')).toThrow(/正在使用/);
    } finally { lock.release(); }
    expect(readdirSync(f.dataDir)).not.toContain(RUNTIME_LOCK_NAME);
    createBackup(f.dataDir, f.backup);
  });

  it('detects stale locks without deleting them or replacing an unknown owner', () => {
    const f = fixture(); f.db.close();
    const lockDir = path.join(f.dataDir, RUNTIME_LOCK_NAME); mkdirSync(lockDir);
    writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: 2147483647, host: hostname(), token: 'other', purpose: 'server' }));
    expect(() => acquireRuntimeLock(f.dataDir, 'backup')).toThrow(/遗留锁/);
    expect(JSON.parse(readFileSync(path.join(lockDir, 'owner.json'), 'utf8')).token).toBe('other');
  });

  it('does not remove a lock whose ownership token changed', () => {
    const f = fixture(); f.db.close();
    const lock = acquireRuntimeLock(f.dataDir, 'server');
    const ownerFile = path.join(f.dataDir, RUNTIME_LOCK_NAME, 'owner.json');
    writeFileSync(ownerFile, JSON.stringify({ token: 'different-owner' }));
    lock.release();
    expect(JSON.parse(readFileSync(ownerFile, 'utf8')).token).toBe('different-owner');
  });

  it('releases the startup lock when the listen port is occupied', async () => {
    const f = fixture(); f.db.close();
    const blocker = createServer();
    await new Promise<void>(resolve => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP port');
    try {
      const child = spawn(process.execPath, ['--import', 'tsx', 'server/start.ts'], {
        cwd: process.cwd(), env: { ...process.env, SITE_DATA_DIR: f.dataDir, HOST: '127.0.0.1', PORT: String(address.port) }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let errors = ''; child.stdout.on('data', () => {}); child.stderr.on('data', chunk => { errors += chunk.toString(); });
      const code = await new Promise<number | null>((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); });
      expect(code).toBe(1);
      expect(errors).toContain('EADDRINUSE');
      expect(readdirSync(f.dataDir)).not.toContain(RUNTIME_LOCK_NAME);
      createBackup(f.dataDir, f.backup);
    } finally { await new Promise<void>((resolve, reject) => blocker.close(error => error ? reject(error) : resolve())); }
  });

  it('closes server data and releases the lock before supervised IPC shutdown exits', async () => {
    const f = fixture(); f.db.close();
    const reservation = createServer();
    await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const address = reservation.address();
    if (!address || typeof address === 'string') throw new Error('expected TCP port');
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/start.ts'], {
      cwd: process.cwd(), env: { ...process.env, SITE_DATA_DIR: f.dataDir, HOST: '127.0.0.1', PORT: String(address.port) }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = ''; child.stderr!.on('data', () => {});
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('server startup timed out')), 5000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.stdout!.on('data', chunk => { output += chunk.toString(); if (output.includes('Personal site API:')) { clearTimeout(timeout); resolve(); } });
      });
      const code = await new Promise<number | null>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('IPC shutdown timed out')), 3000);
        child.once('exit', result => { clearTimeout(timeout); resolve(result); });
        child.send({ type: 'site:shutdown' });
        child.send({ type: 'site:shutdown' });
      });
      expect(code).toBe(0);
      expect(readdirSync(f.dataDir)).not.toContain(RUNTIME_LOCK_NAME);
      createBackup(f.dataDir, f.backup);
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it('rejects a lock held by another live process and succeeds when it releases', async () => {
    const f = fixture(); f.db.close();
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
      "import { acquireRuntimeLock } from './server/runtime-lock.ts'; const lock = acquireRuntimeLock(process.env.TEST_LOCK_DIR, 'server'); console.log('ready'); process.stdin.once('data', () => { lock.release(); process.exit(0); });"],
    { cwd: process.cwd(), env: { ...process.env, TEST_LOCK_DIR: f.dataDir }, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stderr.on('data', () => {});
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('child lock startup timed out')), 5000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', code => { clearTimeout(timeout); if (!output.includes('ready')) reject(new Error(`child exited ${code}`)); });
        child.stdout.on('data', chunk => { output += chunk.toString(); if (output.includes('ready')) { clearTimeout(timeout); resolve(); } });
      });
      expect(() => createBackup(f.dataDir, f.backup)).toThrow(/正在使用/);
      await new Promise<void>((resolve, reject) => {
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`child exited ${code}`)));
        child.stdin.write('release\n');
      });
      createBackup(f.dataDir, f.backup);
    } finally { if (child.exitCode === null) child.kill(); }
  });

  it.each(['corrupt', 'missing', 'extra', 'unsafe-manifest'])('rejects %s snapshot without creating restore data', (scenario) => {
    const f = fixture(); f.db.close(); createBackup(f.dataDir, f.backup);
    const file = path.join(f.backup, 'uploads/photo/original.jpg');
    if (scenario === 'corrupt') writeFileSync(file, 'tampered');
    if (scenario === 'missing') rmSync(file);
    if (scenario === 'extra') writeFileSync(path.join(f.backup, 'uploads', 'extra.txt'), 'unlisted');
    if (scenario === 'unsafe-manifest') {
      const manifest = JSON.parse(readFileSync(path.join(f.backup, 'manifest.json'), 'utf8'));
      manifest.files[0].path = '../escape'; writeFileSync(path.join(f.backup, 'manifest.json'), JSON.stringify(manifest));
    }
    expect(() => restoreBackup(f.backup, f.restored)).toThrow();
    expect(readdirSync(f.root)).not.toContain('restored');
  });

  it('refuses existing destination data and nested snapshots', () => {
    const f = fixture(); f.db.close(); createBackup(f.dataDir, f.backup);
    mkdirSync(f.restored); writeFileSync(path.join(f.restored, 'mine.txt'), 'keep');
    expect(() => restoreBackup(f.backup, f.restored)).toThrow(/已存在/);
    expect(readFileSync(path.join(f.restored, 'mine.txt'), 'utf8')).toBe('keep');
    expect(() => createBackup(f.dataDir, path.join(f.dataDir, 'snapshot'))).toThrow();
    expect(() => createBackup(f.dataDir, f.backup)).toThrow(/已存在/);
  });

  it('rejects invalid SQLite even when its replacement checksum matches', () => {
    const f = fixture(); f.db.close(); createBackup(f.dataDir, f.backup);
    const bytes = Buffer.from('not a SQLite database');
    writeFileSync(path.join(f.backup, 'site.sqlite'), bytes);
    const manifest = JSON.parse(readFileSync(path.join(f.backup, 'manifest.json'), 'utf8'));
    const file = manifest.files.find((entry: { path: string }) => entry.path === 'site.sqlite');
    file.bytes = bytes.length; file.sha256 = createHash('sha256').update(bytes).digest('hex');
    writeFileSync(path.join(f.backup, 'manifest.json'), JSON.stringify(manifest));
    expect(() => restoreBackup(f.backup, f.restored)).toThrow();
    expect(readdirSync(f.root)).not.toContain('restored');
  });

  it('rejects symlinked source trees and snapshot trees', () => {
    const f = fixture(); f.db.close();
    const outside = path.join(f.root, 'outside'); mkdirSync(outside); writeFileSync(path.join(outside, 'secret'), 'do-not-copy');
    symlinkSync(outside, path.join(f.dataDir, 'uploads', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => createBackup(f.dataDir, f.backup)).toThrow(/链接/);
    rmSync(path.join(f.dataDir, 'uploads', 'link'));
    createBackup(f.dataDir, f.backup);
    symlinkSync(outside, path.join(f.backup, 'legacy', 'link'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => restoreBackup(f.backup, f.restored)).toThrow(/链接/);
  });
});
