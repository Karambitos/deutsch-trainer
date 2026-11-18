import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/deutsch-trainer/',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom/client'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      injectRegister: false,
      manifest: {
        name: 'Deutsch Trainer', short_name: 'Deutsch Trainer', lang: 'uk',
        id: './', start_url: './', scope: './', display: 'standalone',
        background_color: '#101419', theme_color: '#101419',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
