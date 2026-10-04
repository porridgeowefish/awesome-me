import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { acquireRuntimeLock, assertNoSymlinkPath } from '../runtime-lock.ts';

const manifestSchema = z.object({
  format: z.literal('awesome-me-backup'), version: z.literal(1),
  createdAt: z.iso.datetime(), sqliteUserVersion: z.number().int().nonnegative(),
  directories: z.array(z.string()),
  files: z.array(z.object({ path: z.string(), bytes: z.number().int().nonnegative().safe(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()),
}).strict();
type Manifest = z.infer<typeof manifestSchema>;
interface Tree { files: string[]; directories: string[] }

function relativeManagedPath(value: string, directory = false): boolean {
  if (!value || value.includes('\\') || value.includes(':') || value.startsWith('/')) return false;
  const parts = value.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\0') || part.startsWith('.env'))) return false;
  return (!directory && value === 'site.sqlite') || (['uploads', 'legacy'].includes(parts[0]) && (directory || parts.length > 1));
}

function scanManagedTree(root: string, snapshot: boolean): Tree {
  assertNoSymlinkPath(root);
  const tree: Tree = { files: [], directories: [] };
  function walk(current: string, relative: string): void {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error(`不允许符号链接或目录链接：${current}`);
    if (stat.isDirectory()) {
      if (!relativeManagedPath(relative, true)) throw new Error(`备份目录路径无效：${relative}`);
      tree.directories.push(relative);
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name), `${relative}/${name}`);
    } else if (stat.isFile() && relativeManagedPath(relative)) {
      tree.files.push(relative);
    } else { throw new Error(`备份中存在不支持的文件或路径：${relative}`); }
  }
  if (!fs.lstatSync(root).isDirectory()) throw new Error('数据路径必须是目录');
  if (snapshot) {
    for (const name of fs.readdirSync(root)) {
      if (!['site.sqlite', 'uploads', 'legacy', 'manifest.json'].includes(name)) throw new Error(`备份中存在未收录的文件：${name}`);
      if (name === 'manifest.json') {
        if (!fs.lstatSync(path.join(root, name)).isFile()) throw new Error('备份 manifest.json 必须是普通文件');
        assertNoSymlinkPath(path.join(root, name));
      }
    }
  }
  for (const name of ['site.sqlite', 'uploads', 'legacy']) {
    const filename = path.join(root, name);
    let present = false;
    try { fs.lstatSync(filename); present = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (present) walk(filename, name);
    else if (name === 'site.sqlite') throw new Error('数据目录缺少 site.sqlite');
  }
  tree.files.sort(); tree.directories.sort();
  return tree;
}

function digest(root: string, relative: string): Manifest['files'][number] {
  const filename = path.join(root, ...relative.split('/'));
  assertNoSymlinkPath(filename);
  const fd = fs.openSync(filename, 'r');
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile()) throw new Error(`不是普通文件：${relative}`);
    const hash = createHash('sha256');
    const chunk = Buffer.allocUnsafe(1024 * 1024);
    let length: number;
    while ((length = fs.readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, length));
    return { path: relative, bytes: stat.size, sha256: hash.digest('hex') };
  } finally { fs.closeSync(fd); }
}

function checkDatabase(filename: string): number {
  const db = new DatabaseSync(filename, { readOnly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite 完整性检查失败');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite 外键完整性检查失败');
    return Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  } finally { db.close(); }
}

function ensureFreshDestination(filename: string): void {
  assertNoSymlinkPath(filename);
  try { fs.lstatSync(filename); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw new Error(`目标目录已存在，请使用全新的路径：${filename}`);
}

function disjointPaths(first: string, second: string): void {
  for (const [parent, child] of [[first, second], [second, first]]) {
    const relative = path.relative(parent, child);
    if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
      throw new Error('源目录和目标目录必须互不包含');
    }
  }
}

function createStaging(destination: string): string {
  const parent = path.dirname(destination);
  assertNoSymlinkPath(parent); fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const staging = path.join(parent, `.${path.basename(destination)}.staging-${randomUUID()}`);
  fs.mkdirSync(staging, { mode: 0o700 });
  return staging;
}

function copyManaged(source: string, destination: string, tree: Tree): void {
  for (const directory of tree.directories) fs.mkdirSync(path.join(destination, ...directory.split('/')), { recursive: true, mode: 0o700 });
  for (const relative of tree.files) {
    assertNoSymlinkPath(path.join(source, ...relative.split('/')));
    const target = path.join(destination, ...relative.split('/'));
    fs.copyFileSync(path.join(source, ...relative.split('/')), target, fs.constants.COPYFILE_EXCL);
    fs.chmodSync(target, 0o600);
  }
}

/** Preserve the operation's original failure, while still attempting independent cleanup. */
function cleanupAfter(operationFailed: boolean, steps: Array<() => void>): void {
  let cleanupFailed = false;
  let firstCleanupError: unknown;
  for (const step of steps) {
    try { step(); } catch (error) {
      if (!cleanupFailed) firstCleanupError = error;
      cleanupFailed = true;
    }
  }
  if (!operationFailed && cleanupFailed) throw firstCleanupError;
}

function validateSnapshot(root: string): { manifest: Manifest; tree: Tree } {
  const tree = scanManagedTree(root, true);
  const manifestPath = path.join(root, 'manifest.json'); assertNoSymlinkPath(manifestPath);
  const manifest = manifestSchema.parse(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
  const entries = [...manifest.files.map(file => file.path), ...manifest.directories];
  if (manifest.files.some(file => !relativeManagedPath(file.path)) || manifest.directories.some(directory => !relativeManagedPath(directory, true))) {
    throw new Error('备份清单包含不安全路径');
  }
  if (new Set(entries.map(value => value.toLowerCase())).size !== entries.length) throw new Error('备份清单包含重复或大小写冲突的路径');
  if (JSON.stringify([...manifest.files.map(file => file.path)].sort()) !== JSON.stringify(tree.files)
    || JSON.stringify([...manifest.directories].sort()) !== JSON.stringify(tree.directories)) throw new Error('备份文件缺失或包含清单之外的文件');
  for (const expected of manifest.files) {
    const actual = digest(root, expected.path);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error(`备份校验失败：${expected.path}`);
  }
  if (checkDatabase(path.join(root, 'site.sqlite')) !== manifest.sqliteUserVersion) throw new Error('备份数据库版本与清单不一致');
  return { manifest, tree };
}

/** Offline snapshot. The SQLite API also captures committed WAL rows atomically. */
export function createBackup(dataDirectory: string, outputDirectory: string): Manifest {
  const source = path.resolve(dataDirectory), destination = path.resolve(outputDirectory);
  disjointPaths(source, destination); ensureFreshDestination(destination);
  assertNoSymlinkPath(source);
  if (!fs.existsSync(source)) throw new Error('数据目录不存在');
  const lock = acquireRuntimeLock(source, 'backup');
  let staging: string | undefined;
  let operationFailed = false;
  try {
    const tree = scanManagedTree(source, false);
    staging = createStaging(destination);
    const db = new DatabaseSync(path.join(source, 'site.sqlite'), { readOnly: true, timeout: 5000 });
    try {
      // SQLite quotes the path as a bound value, avoiding SQL/path interpolation.
      db.prepare('VACUUM INTO ?').run(path.join(staging, 'site.sqlite'));
    } finally { db.close(); }
    copyManaged(source, staging, { directories: tree.directories, files: tree.files.filter(file => file !== 'site.sqlite') });
    const copied = scanManagedTree(staging, true);
    const manifest: Manifest = {
      format: 'awesome-me-backup', version: 1, createdAt: new Date().toISOString(),
      sqliteUserVersion: checkDatabase(path.join(staging, 'site.sqlite')),
      directories: copied.directories, files: copied.files.map(file => digest(staging!, file)),
    };
    fs.writeFileSync(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    validateSnapshot(staging);
    ensureFreshDestination(destination);
    fs.renameSync(staging, destination); staging = undefined;
    return manifest;
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    cleanupAfter(operationFailed, [
      () => { if (staging) fs.rmSync(staging, { recursive: true, force: true }); },
      () => lock.release(),
    ]);
  }
}

/** Validate first, then install only into an absent directory held under the runtime lock. */
export function restoreBackup(backupDirectory: string, targetDirectory: string): void {
  const source = path.resolve(backupDirectory), destination = path.resolve(targetDirectory);
  disjointPaths(source, destination); ensureFreshDestination(destination);
  const { tree } = validateSnapshot(source);
  const staging = createStaging(destination);
  let lock: ReturnType<typeof acquireRuntimeLock> | undefined;
  let targetCreated = false;
  let installed = false;
  let operationFailed = false;
  try {
    copyManaged(source, staging, tree);
    fs.copyFileSync(path.join(source, 'manifest.json'), path.join(staging, 'manifest.json'), fs.constants.COPYFILE_EXCL);
    // Recheck copied bytes, guarding against source changes during transfer.
    validateSnapshot(staging);
    ensureFreshDestination(destination);
    fs.mkdirSync(destination, { mode: 0o700 }); targetCreated = true;
    lock = acquireRuntimeLock(destination, 'restore');
    for (const name of ['uploads', 'legacy', 'site.sqlite']) {
      if (fs.existsSync(path.join(staging, name))) fs.renameSync(path.join(staging, name), path.join(destination, name));
    }
    installed = true;
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    cleanupAfter(operationFailed, [
      () => {
        // Only clean a destination after acquiring its lock; never delete another owner's directory.
        // If removing partial restored data fails, retain its lock for manual inspection.
        if (targetCreated && lock && !installed) {
          for (const name of ['uploads', 'legacy', 'site.sqlite']) fs.rmSync(path.join(destination, name), { recursive: true, force: true });
        }
        lock?.release();
        if (targetCreated && lock && !installed) fs.rmdirSync(destination);
      },
      () => fs.rmSync(staging, { recursive: true, force: true }),
    ]);
  }
}
