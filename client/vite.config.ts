import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { Plugin } from 'vite';

/** Emits sw.js with the list of built files so the whole app (all lazy pages) works offline. */
function serviceWorker(): Plugin {
  return {
    name: 'technova-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const assets = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html').map((f) => `/${f}`);
      const version = crypto.createHash('sha256').update(assets.sort().join()).digest('hex').slice(0, 12);
      const source = fs.readFileSync(path.resolve(__dirname, 'sw-template.js'), 'utf8')
        .replace("const VERSION = '__VERSION__'", `const VERSION = '${version}'`).replace('const PRECACHE = __ASSETS__', `const PRECACHE = ${JSON.stringify(assets)}`);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_API_PROXY ?? 'http://localhost:4000', changeOrigin: true } },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          vendor: ['@tanstack/react-query', '@tanstack/react-table', 'zustand', 'i18next', 'react-i18next', 'decimal.js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
