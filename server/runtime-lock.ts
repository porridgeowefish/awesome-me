import fs from 'node:fs';
import path from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';

export const RUNTIME_LOCK_NAME = '.site-runtime.lock';
export interface RuntimeLock { release(): void }

/** Reject links in every existing ancestor, including Windows directory junctions. */
export function assertNoSymlinkPath(filename: string): void {
  const absolute = path.resolve(filename);
  let current = path.parse(absolute).root;
  for (const part of absolute.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`不允许符号链接或目录链接：${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }
}

/** Cooperating entry points must hold this lock before opening application data. */
export function acquireRuntimeLock(dataDir: string, purpose = 'server'): RuntimeLock {
  const root = path.resolve(dataDir);
  assertNoSymlinkPath(root);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lockDir = path.join(root, RUNTIME_LOCK_NAME);
  const ownerPath = path.join(lockDir, 'owner.json');
  const token = randomUUID();
  try {
    fs.mkdirSync(lockDir, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let owner: { pid?: unknown; host?: unknown; purpose?: unknown } = {};
    try {
      assertNoSymlinkPath(ownerPath);
      owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    } catch { /* Unknown or partially written locks must also block access. */ }
    if (owner.host === hostname() && typeof owner.pid === 'number' && Number.isSafeInteger(owner.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); }
      catch (probe) {
        if ((probe as NodeJS.ErrnoException).code === 'ESRCH') {
          throw new Error(`发现遗留锁（PID ${owner.pid} 已退出）：${lockDir}。确认没有服务或数据命令运行后，人工移除该锁目录再重试。`);
        }
      }
    }
    throw new Error(`数据目录正在使用或锁状态无法确认：${lockDir}。先停止服务和其他数据命令。`);
  }
  try {
    fs.writeFileSync(ownerPath, JSON.stringify({ pid: process.pid, host: hostname(), token, purpose, createdAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    try { fs.rmdirSync(lockDir); } catch { /* Preserve another writer's files. */ }
    throw error;
  }
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      try {
        assertNoSymlinkPath(ownerPath);
        const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8')) as { token?: string };
        if (owner.token !== token) return;
        fs.unlinkSync(ownerPath);
        // Keep the directory reserved until its own owner file is gone. Never recurse.
        fs.rmdirSync(lockDir);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    },
  };
}
