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
    // ignore Chrome download temp files + raw (pre-optimize) Meshy drops so the watcher never
    // chokes on a locked .crdownload (EBUSY) or churns over the huge raw GLBs.
    watch: {
      ignored: ['**/*.crdownload', '**/assets/palaces/Meshy_AI_*'],
    },
  },
});
