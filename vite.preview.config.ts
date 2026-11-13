// Builds the public storefront as one JS + one CSS file (no backend) for a single-file preview.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src'), '@shared': path.resolve(import.meta.dirname, 'shared') } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
    'import.meta.env.VITE_TURNSTILE_SITE_KEY': '""',
  },
  build: {
    outDir: 'dist-preview', emptyOutDir: true, cssCodeSplit: false, target: 'es2022',
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'src/preview-main.tsx'),
      output: { format: 'iife', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'app[extname]' },
    },
  },
});
