import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../errors.ts';

export class LocalMediaStore {
  readonly root: string;
  constructor(dataDir: string) { this.root = path.resolve(dataDir, 'uploads'); fs.mkdirSync(this.root, { recursive: true }); }
  directory(id: string): string {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(id)) throw new AppError(400, 'INVALID_MEDIA_ID', '文件 ID 无效');
    return path.join(this.root, id);
  }
  path(id: string, file: string): string {
    if (!/^[a-zA-Z0-9_.-]+$/.test(file) || file === '..' || file === '.') throw new AppError(400, 'INVALID_MEDIA_PATH', '文件路径无效');
    return path.join(this.directory(id), file);
  }
  create(id: string): void { fs.mkdirSync(this.directory(id), { recursive: false }); }
  write(id: string, file: string, bytes: Buffer): void { fs.writeFileSync(this.path(id, file), bytes, { flag: 'wx', mode: 0o600 }); }
  finalize(id: string, staged: string, file: string): void { fs.renameSync(this.path(id, staged), this.path(id, file)); }
  remove(id: string): void { const directory = this.directory(id); if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true }); }
}
