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
    // Keep heavy SDKs out of the initial customer-home bundle on mobile networks.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/node_modules/firebase/')) return 'vendor-firebase';
          if (id.includes('/node_modules/@google/genai/')) return 'vendor-ai';
          if (id.includes('/node_modules/motion/')) return 'vendor-motion';
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/') || id.includes('/node_modules/scheduler/')) return 'vendor-react';
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
