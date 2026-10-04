import { spawn } from 'node:child_process';
const backend = spawn(process.execPath, ['--import', 'tsx', 'server/start.ts'], {
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'], windowsHide: true, env: process.env,
});
const frontend = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--port', process.env.SITE_DEV_PORT ?? '5173', '--strictPort'], {
  stdio: 'inherit', windowsHide: true, env: process.env,
});
const children = [backend, frontend];
const closed = children.map(child => new Promise(resolve => child.once('close', resolve)));
let stopPromise;

function stop(code = 0) {
  if (code !== 0 || process.exitCode === undefined) process.exitCode = code;
  if (stopPromise) return stopPromise;
  stopPromise = (async () => {
    if (backend.exitCode === null && backend.signalCode === null && backend.connected) {
      backend.send({ type: 'site:shutdown' }, () => {});
    }
    if (frontend.exitCode === null && frontend.signalCode === null) frontend.kill('SIGTERM');
    // A hung or forcibly terminated backend can leave its lock for manual inspection.
    const timeout = setTimeout(() => {
      if (backend.exitCode === null && backend.signalCode === null) {
        process.exitCode = 1;
        backend.kill('SIGTERM');
      }
    }, 30_000);
    timeout.unref();
    try { await Promise.all(closed); }
    finally {
      clearTimeout(timeout);
      if (process.connected) process.disconnect?.();
    }
  })();
  return stopPromise;
}

for (const child of children) {
  child.on('error', error => { console.error(error.message); void stop(1); });
  child.on('exit', code => { if (!stopPromise) void stop(code ?? 1); });
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
process.on('message', message => {
  if (typeof message !== 'object' || message === null || message.type !== 'site:shutdown') return;
  void stop().then(() => process.exit(process.exitCode ?? 0), error => {
    console.error(error instanceof Error ? error.message : 'Development shutdown failed');
    process.exit(1);
  });
});
