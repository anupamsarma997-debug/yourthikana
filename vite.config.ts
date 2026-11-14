import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  build: {
    // Lazy imports in App.tsx keep owner/admin screens and dialogs out of the first route chunk.
    chunkSizeWarningLimit: 700,
    // Do not publish source maps in the public production bundle.
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // Keep Firebase's large service SDKs in separate chunks so the browser
          // does not have to parse one 750 KB vendor file as a single task.
          // Shared Firebase internals stay together to avoid cross-service cycles.
          if (id.includes('/node_modules/@firebase/auth/') || id.includes('/node_modules/firebase/auth/')) {
            return 'firebase-auth';
          }
          if (id.includes('/node_modules/@firebase/firestore/') || id.includes('/node_modules/firebase/firestore/')) {
            return 'firebase-firestore';
          }
          if (id.includes('/node_modules/@firebase/storage/') || id.includes('/node_modules/firebase/storage/')) {
            return 'firebase-storage';
          }
          if (
            id.includes('/node_modules/@firebase/app/') ||
            id.includes('/node_modules/@firebase/component/') ||
            id.includes('/node_modules/@firebase/logger/') ||
            id.includes('/node_modules/@firebase/util/') ||
            id.includes('/node_modules/@firebase/installations/') ||
            id.includes('/node_modules/firebase/app/')
          ) {
            return 'firebase-core';
          }
          if (id.includes('/node_modules/firebase/')) return 'firebase-core';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react-vendor';
        },
      },
    },
  },
  server: {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
