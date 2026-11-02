import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Two apps on one design system and code base:
 *  - index.html    → tenant portal (public, Tatv Cloud)
 *  - operator.html → operator console (internal only; deployed separately behind PAM)
 * `--mode preview` and `--mode preview-operator` each produce one self-contained HTML file for sharing.
 */
export default defineConfig(({ mode }) => {
  const single = mode === 'preview' || mode === 'preview-operator';
  return {
    plugins: single ? [react(), viteSingleFile()] : [react()],
    build: {
      outDir: mode === 'preview' ? 'dist-preview' : mode === 'preview-operator' ? 'dist-preview-operator' : 'dist',
      rollupOptions: {
        input:
          mode === 'preview'
            ? 'index.html'
            : mode === 'preview-operator'
              ? 'operator.html'
              : { portal: 'index.html', operator: 'operator.html' },
      },
    },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test-setup.ts'] },
  };
});
