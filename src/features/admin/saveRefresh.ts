/** A public-cache refresh cannot undo an acknowledged server mutation. */
export async function refreshAfterSave(refresh:()=>Promise<unknown>): Promise<string|undefined> {
  try {await refresh();return undefined;}
  catch {return '内容已保存，但公开页面暂时未能刷新。稍后刷新网站即可读取最新内容。';}
}
