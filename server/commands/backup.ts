import { existsSync } from 'node:fs';
import { loadConfig } from '../config.ts';
import { createBackup } from '../backup/index.ts';

try {
  if (existsSync('.env.server')) process.loadEnvFile('.env.server');
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--out' || !args[1]) throw new Error('用法：npm run backup -- --out 全新的备份目录（请先停止服务）');
  const manifest = createBackup(loadConfig().dataDir, args[1]);
  console.log(`离线备份完成：${args[1]}（${manifest.files.length} 个文件，含 SHA-256 校验清单）`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '备份失败');
  process.exitCode = 1;
}
