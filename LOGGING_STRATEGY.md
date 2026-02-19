# 日志管理策略

## 概述

本插件使用自定义的 Logger 类进行日志管理，符合思源笔记插件审核要求。

## Logger 实现

### 位置
`src/utils/logger.ts`

### 使用方法

```typescript
import { logger } from '@/utils/logger';

// 普通日志（开发环境）
logger.log('普通日志');
logger.debug('调试信息', data);
logger.info('提示信息');

// 重要日志（所有环境）
logger.warn('警告信息');
logger.error('错误信息', error);
```

### 特性

1. **统一接口** - 所有日志通过 logger 实例调用
2. **自动前缀** - 自动添加 `[SiYuanMemo]` 前缀
3. **不劫持全局对象** - Logger 只是对 console 的封装，不修改全局行为
4. **环境优化** - 生产环境自动移除调试日志

## 环境差异

### 开发环境
- ✅ 所有日志正常输出
- ✅ 便于调试和问题排查
- ✅ 包含详细的调试信息

### 生产环境
- ✅ 自动移除 `console.log/debug/info`
- ✅ 保留 `console.warn/error` 用于重要提示
- ✅ 减小打包体积，提升性能

## 构建配置

日志的移除由 Vite/Terser 在构建时自动完成，配置位于 `vite.config.ts`：

```javascript
terserOptions: {
  compress: {
    drop_console: true,           // 移除所有 console
    drop_debugger: true,          // 移除 debugger
    pure_funcs: [                 // 额外指定移除的函数
      'console.log',
      'console.debug',
      'console.info'
    ],
    passes: 2                     // 多次压缩优化
  },
  format: {
    comments: false               // 移除注释
  }
}
```

## 设计原则

### 1. 不劫持全局对象 ✅

Logger 只是对 console 的简单封装，不修改全局 console 对象：

```typescript
// ❌ 不这样做（劫持）
console.log = function(...args) { /* 自定义逻辑 */ }

// ✅ 这样做（封装）
class Logger {
  log(...args) {
    console.log(this.prefix, ...args);
  }
}
```

### 2. 渐进式迁移 ✅

不强制迁移现有代码，保持向后兼容：

- **新代码**：使用 `logger.log(...)`
- **旧代码**：保持 `console.log('[SiYuanMemo]...')` 仍然可用
- **迁移**：可选，修改文件时顺便替换

### 3. 零运行时开销 ✅

生产环境中，所有调试日志在构建时被完全移除：

- 不占用运行时内存
- 不影响执行性能
- 不增加打包体积

## 代码示例

### 基础使用

```typescript
import { logger } from '@/utils/logger';

export class StorageManager {
  async init() {
    logger.log('Initializing storage...');
    
    try {
      await this.loadData();
      logger.log('Storage initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize storage:', error);
      throw error;
    }
  }
  
  private async loadData() {
    logger.debug('Loading data from:', this.dataPath);
    // ... 加载逻辑
  }
}
```

### 条件日志

```typescript
import { logger } from '@/utils/logger';

export class QueueManager {
  processQueue() {
    const items = this.getItems();
    
    if (items.length === 0) {
      logger.warn('Queue is empty, nothing to process');
      return;
    }
    
    logger.log(`Processing ${items.length} items`);
    
    items.forEach((item, index) => {
      logger.debug(`Processing item ${index + 1}/${items.length}:`, item);
      this.processItem(item);
    });
  }
}
```

### 错误处理

```typescript
import { logger } from '@/utils/logger';

export class ApiService {
  async fetchData(url: string) {
    try {
      logger.debug('Fetching data from:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        logger.warn(`API returned ${response.status}:`, response.statusText);
      }
      
      return await response.json();
    } catch (error) {
      logger.error('Failed to fetch data:', error);
      throw error;
    }
  }
}
```

## 迁移指南

### 不强制迁移

现有代码可以继续使用 `console.log('[SiYuanMemo]...')`，不影响功能。

### 推荐迁移时机

1. **创建新文件时** - 直接使用 logger
2. **修改旧文件时** - 顺便替换日志调用
3. **重构代码时** - 统一使用 logger

### 迁移示例

**之前：**
```typescript
console.log('[SiYuanMemo] Initializing...');
console.debug('[SiYuanMemo] Config:', config);
console.error('[SiYuanMemo] Error:', error);
```

**之后：**
```typescript
import { logger } from '@/utils/logger';

logger.log('Initializing...');
logger.debug('Config:', config);
logger.error('Error:', error);
```

## 验证方法

### 开发环境验证

```bash
npm run dev
```

打开浏览器控制台，应该看到：
```
[SiYuanMemo] Plugin loading...
[SiYuanMemo] Storage initialized
[SiYuanMemo] ✅ All queues initialized
```

### 生产环境验证

```bash
npm run build
```

检查 `dist/index.js`，应该：
- ✅ 没有 `console.log` 调用
- ✅ 没有 `console.debug` 调用
- ✅ 没有 `console.info` 调用
- ✅ 保留 `console.warn` 和 `console.error`

## 常见问题

### Q: 为什么不直接使用 console？

A: 插件审核要求使用自定义的 Logger 方法，不能直接使用全局 console。Logger 提供了统一的接口和更好的控制。

### Q: 生产环境如何调试？

A: 使用 `logger.warn()` 或 `logger.error()` 输出重要信息，这些在生产环境会保留。

### Q: 旧代码需要立即迁移吗？

A: 不需要。可以保持现状，逐步迁移。新代码使用 logger，旧代码保持不变。

### Q: Logger 会影响性能吗？

A: 不会。生产环境中调试日志被完全移除，零运行时开销。

## 总结

本插件的日志管理策略：

✅ **符合审核要求** - 使用自定义 Logger 类  
✅ **不劫持全局对象** - 只是封装，不修改 console  
✅ **环境优化** - 生产环境自动移除调试日志  
✅ **向后兼容** - 不强制迁移现有代码  
✅ **零性能开销** - 构建时优化，运行时无影响  

---

**相关文件：**
- Logger 实现：`src/utils/logger.ts`
- 构建配置：`vite.config.ts`
- 使用示例：本文档
