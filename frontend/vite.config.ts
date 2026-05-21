import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const languagePath = '/highlight.js/lib/languages/';
          const languageIndex = id.replaceAll('\\', '/').indexOf(languagePath);
          if (languageIndex < 0) return undefined;

          const file = id.slice(languageIndex + languagePath.length).toLowerCase();
          const first = file[0] ?? 'other';
          if (first >= 'a' && first <= 'f') return 'highlight-languages-a-f';
          if (first >= 'g' && first <= 'n') return 'highlight-languages-g-n';
          if (first >= 'o' && first <= 't') return 'highlight-languages-o-t';
          return 'highlight-languages-u-z';
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
