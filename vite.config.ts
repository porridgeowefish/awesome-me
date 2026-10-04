/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { publicAssetsPlugin } from './tools/build/vite-plugin-public-assets.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // The full-stack service is deployed at the domain root.
    base: env.VITE_BASE || '/',
    publicDir: false,
    plugins: [react(), publicAssetsPlugin()],
    server: {
      // Windows watchers can prevent atomic directory renames during offline snapshots.
      watch:{ignored:['**/.local/**','**/.build/**','**/data/**','**/artifacts/**','**/backups/**','**/*.staging-*/**','**/.site-runtime.lock/**']},
      proxy: { '/api': 'http://127.0.0.1:3001', '/content': 'http://127.0.0.1:3001', '/_AMapService': 'http://127.0.0.1:3001' },
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      // Only lazily-loaded chunks exceed the default (mermaid's ELK layout ≈1.4 MB, the essay reader).
      // The first screen loads ≈ 90 KB gzip of JS; see docs/ARCHITECTURE.md.
      chunkSizeWarningLimit: 1500,
      outDir: 'public/.build',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // long-term cacheable framework chunk; everything else is split per route
            if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id)) return 'react';
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['tools/tests/**/*.test.ts', 'src/**/*.test.ts'],
    },
  };
});
