import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Browser extension build: `npm run build:ext`, then load extension/dist via "Load unpacked".
const root = fileURLToPath(new URL('./extension', import.meta.url));

export default defineConfig({
  root,
  envDir: fileURLToPath(new URL('.', import.meta.url)), // same .env.local as the web app
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false, // the service worker has no DOM for preload links
    rolldownOptions: {
      input: {
        popup: `${root}/popup.html`,
        offscreen: `${root}/offscreen.html`,
        background: `${root}/src/background.js`,
        content: `${root}/src/content.js`, // no imports, so it stays a single classic-script-safe file
      },
      output: {
        entryFileNames: (chunk) => (['background', 'content'].includes(chunk.name) ? `${chunk.name}.js` : 'assets/[name]-[hash].js'),
      },
    },
  },
});
