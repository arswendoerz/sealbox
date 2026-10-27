import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // The service worker only caches the app shell. Supabase calls always go to the network;
    // the offline vault copy lives in IndexedDB (still encrypted).
    VitePWA({
      registerType: 'prompt', // a reload would lock an open vault, so the user decides when
      injectRegister: false, // registered from UpdatePrompt.jsx
      includeManifestIcons: false, // already matched by globPatterns
      manifest: {
        name: 'Sealbox',
        short_name: 'Sealbox',
        description: 'Password manager zero-knowledge: semua enkripsi berjalan di browser.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#4338CA',
        background_color: '#F4F4F7',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'], // woff/ttf fallbacks are never requested
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^v\d/], // tabler CSS requests fonts as `…woff2?v3.19.0`
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
