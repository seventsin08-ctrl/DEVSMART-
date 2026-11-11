/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// When developing against the local Docker stack (npm run stack:up) the Supabase
// services are proxied through Vite so the browser talks to a single origin.
const localGateway = process.env.LOCAL_SUPABASE_GATEWAY;
const apiTarget = process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8788';

const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean }> = {
  '/api': { target: apiTarget, changeOrigin: true },
};
if (localGateway) {
  for (const prefix of ['/auth/v1', '/rest/v1', '/storage/v1']) {
    proxy[prefix] = { target: localGateway, changeOrigin: true };
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@shared': path.resolve(import.meta.dirname, 'shared'),
    },
  },
  server: { port: 5173, host: '127.0.0.1', proxy },
  preview: { port: 4173, host: '127.0.0.1', proxy },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) return 'charts';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) return 'motion';
          if (id.includes('node_modules/react')) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    css: false,
  },
});
