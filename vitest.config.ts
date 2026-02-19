import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      siyuan: resolve(__dirname, 'src/test/mocks/siyuan.ts'),
      electron: resolve(__dirname, 'src/test/mocks/electron.ts'),
    },
  },
  test: {
    environment: 'jsdom',
  },
});

