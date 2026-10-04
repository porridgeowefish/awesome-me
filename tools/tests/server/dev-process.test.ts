import { expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createBackup } from '../../../server/backup/index.ts';
import { RUNTIME_LOCK_NAME } from '../../../server/runtime-lock.ts';

async function freePort(): Promise<number> {
  const reservation = createServer();
  await new Promise<void>(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('expected TCP port');
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  return address.port;
}

it('supervisor IPC shuts down the actual backend before exit and releases its data lock', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'site-dev-supervisor-'));
  const dataDir = path.join(root, 'data');
  const [apiPort, frontendPort] = await Promise.all([freePort(), freePort()]);
  const child = spawn(process.execPath, ['tools/scripts/dev.mjs'], {
    cwd: process.cwd(), windowsHide: true,
    env: { ...process.env, SITE_DATA_DIR: dataDir, HOST: '127.0.0.1', PORT: String(apiPort), SITE_DEV_PORT: String(frontendPort), FORCE_COLOR: '0' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let output = '', errors = '';
  const exited = new Promise<number | null>(resolve => child.once('exit', resolve));
  child.stderr!.on('data', chunk => { errors += chunk.toString(); });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Supervisor startup timed out: ${errors}`)), 10_000);
      child.once('error', error => { clearTimeout(timeout); reject(error); });
      child.stdout!.on('data', chunk => {
        output += chunk.toString();
        if (output.includes('Personal site API:') && output.includes(`:${frontendPort}/`)) { clearTimeout(timeout); resolve(); }
      });
    });
    expect((await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).status).toBe(200);
    expect((await fetch(`http://localhost:${frontendPort}/`)).status).toBe(200);
    expect(existsSync(path.join(dataDir, RUNTIME_LOCK_NAME))).toBe(true);
    const code = await new Promise<number | null>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Supervisor IPC shutdown timed out')), 3000);
      exited.then(result => { clearTimeout(timeout); resolve(result); }, reject);
      child.send({ type: 'site:shutdown' });
      child.send({ type: 'site:shutdown' });
    });
    expect(code, errors).toBe(0);
    expect(existsSync(path.join(dataDir, RUNTIME_LOCK_NAME))).toBe(false);
    await expect(fetch(`http://127.0.0.1:${apiPort}/api/v1/health`)).rejects.toThrow();
    await expect(fetch(`http://localhost:${frontendPort}/`)).rejects.toThrow();
    expect(createBackup(dataDir, path.join(root, 'snapshot')).files.some(file => file.path === 'site.sqlite')).toBe(true);
  } finally {
    if (child.exitCode === null) {
      // Only terminate this test's own process tree if graceful shutdown failed.
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
      await exited;
    }
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
