import { existsSync } from 'node:fs';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { acquireRuntimeLock } from './runtime-lock.ts';

if (existsSync('.env.server')) process.loadEnvFile('.env.server');
const config = loadConfig();
let app: Awaited<ReturnType<typeof createApp>> | undefined;
let pendingApp: ReturnType<typeof createApp> | undefined;
let lock: ReturnType<typeof acquireRuntimeLock> | undefined;
let closing = false;
let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  closing = true;
  shutdownPromise = (async () => {
    try {
      // A signal during initialization must wait for DB handles to close before releasing.
      const instance = app ?? await pendingApp?.catch(() => undefined);
      await instance?.close();
    } finally {
      try { lock?.release(); }
      finally { if (process.connected) process.disconnect?.(); }
    }
  })();
  return shutdownPromise;
}
process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
process.on('message', message => {
  if (typeof message !== 'object' || message === null || !('type' in message) || message.type !== 'site:shutdown') return;
  void shutdown().then(() => process.exit(0), error => {
    console.error(error instanceof Error ? error.message : 'Server shutdown failed');
    process.exit(1);
  });
});
try {
  lock = acquireRuntimeLock(config.dataDir, 'server');
  app = await (pendingApp = createApp(config));
  if (!closing) {
    await app.listen({ host: config.host, port: config.port });
    if (!closing) {
      console.log(`Personal site API: http://${config.host}:${config.port}`);
      if (!app.auth.hasOwner()) console.log('Owner not initialized. Run npm run owner:init locally.');
    }
  }
} catch (error) {
  await shutdown();
  console.error(error instanceof Error ? error.message : 'Server could not start');
  process.exitCode = 1;
}
