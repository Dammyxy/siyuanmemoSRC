import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      siyuan: resolve(__dirname, 'src/test/mocks/siyuan.ts'),
    },
  },
});

