export async function requireOwnerInitialized(readHealth:()=>Promise<{ownerInitialized:boolean}>): Promise<void> {
  const health = await readHealth();
  if (!health.ownerInitialized) {
    throw new Error('尚未找到站主账号。请在本项目的 website 目录运行 npm run owner:init，并确认终端显示「站主初始化完成」后再检查。');
  }
}
