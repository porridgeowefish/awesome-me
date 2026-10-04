import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { loadConfig } from '../config.ts';
import { openDatabase } from '../db/database.ts';
import { AuthService } from '../auth/service.ts';

if (existsSync('.env.server')) process.loadEnvFile('.env.server');
const db = openDatabase(loadConfig().databasePath);
let hidden = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!hidden) process.stdout.write(chunk); callback(); } });
const prompt = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY });
try {
  const auth = new AuthService(db);
  if (auth.hasOwner()) throw new Error('站主已经存在。请登录后台修改密码。');
  const username = (await prompt.question('站主账号：')).trim();
  process.stdout.write('密码（至少 12 个字符，输入不会显示）：');
  hidden = true;
  const password = await prompt.question('');
  process.stdout.write('\n再次输入密码：');
  const repeated = await prompt.question('');
  hidden = false;
  process.stdout.write('\n');
  if (password !== repeated) throw new Error('两次输入的密码不一致');
  await auth.createOwner(username, password);
  console.log('站主初始化完成。只有这个账号能够登录管理页面。');
} catch (error) {
  hidden = false;
  console.error(error instanceof Error ? error.message : '初始化失败');
  process.exitCode = 1;
} finally {
  prompt.close();
  db.close();
}
