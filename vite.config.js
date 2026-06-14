import { defineConfig } from 'vite';

// base './' => all asset URLs are relative, required for GitHub Pages project sites.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5180,
  },
});
