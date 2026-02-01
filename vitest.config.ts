import { resolve } from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  test: {
    // 测试环境
    environment: 'happy-dom',
    
    // 全局测试设置
    globals: true,
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
      ],
    },
    
    // 测试文件匹配模式
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
    ],
    
    // 排除的文件
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],
    
    // 测试超时时间（毫秒）
    testTimeout: 10000,
    
    // Hook 超时时间（毫秒）
    hookTimeout: 10000,
    
    // 是否在测试失败时停止
    bail: 0,
    
    // 并发测试数量
    maxConcurrency: 5,
    
    // 是否隔离测试环境
    isolate: true,
    
    // 监听模式下排除的文件
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    
    // Mock 配置
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
})
