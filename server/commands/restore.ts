import { restoreBackup } from '../backup/index.ts';

try {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--from' || args[2] !== '--to' || !args[1] || !args[3]) {
    throw new Error('用法：npm run restore -- --from 备份目录 --to 全新的数据目录（请先停止服务）');
  }
  restoreBackup(args[1], args[3]);
  console.log(`备份校验与恢复完成：${args[3]}。确认内容后将 SITE_DATA_DIR 指向此目录并启动服务。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : '恢复失败');
  process.exitCode = 1;
}
