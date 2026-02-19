# Logger 迁移指南

## 问题

之前的实现通过劫持全局 `console` 对象来过滤日志，这会导致以下问题：

1. **影响其他插件**：劫持全局 console 会影响所有代码的日志输出
2. **可能冲突**：与其他插件或系统代码冲突
3. **不符合最佳实践**：插件不应该修改全局对象

## 解决方案

使用自定义的 Logger 类替代直接使用 console。

## 迁移步骤

### 1. 移除旧的 disableLogs 导入

在 `src/index.ts` 中移除：

```typescript
// ❌ 移除这行
import '@/utils/disableLogs';
```

### 2. 导入新的 logger

```typescript
// ✅ 使用新的 logger
import { logger } from '@/utils/logger';
```

### 3. 替换 console 调用

**之前：**
```typescript
console.log('[SiYuanMemo] message');
console.debug('[SiYuanMemo] debug info');
console.info('[SiYuanMemo] info');
console.warn('[SiYuanMemo] warning');
console.error('[SiYuanMemo] error');
```

**之后：**
```typescript
logger.log('message');
logger.debug('debug info');
logger.info('info');
logger.warn('warning');
logger.error('error');
```

### 4. 创建子 Logger（可选）

对于不同的模块，可以创建带有子前缀的 logger：

```typescript
// 在模块顶部
const moduleLogger = logger.createChild('StorageManager');

// 使用
moduleLogger.log('Initializing storage'); 
// 输出: [SiYuanMemo][StorageManager][LOG][12:34:56] Initializing storage
```

## API 说明

### 基本方法

- `logger.log(...args)` - 普通日志
- `logger.debug(...args)` - 调试日志
- `logger.info(...args)` - 信息日志
- `logger.warn(...args)` - 警告日志
- `logger.error(...args)` - 错误日志（总是显示）

### 控制方法

- `logger.setEnabled(true/false)` - 启用/禁用日志
- `logger.isEnabled()` - 获取当前状态
- `logger.createChild(prefix)` - 创建子 logger

### 全局方法（向后兼容）

```javascript
// 在浏览器控制台中
window.toggleFSRSLogs(true);  // 启用日志
window.toggleFSRSLogs(false); // 禁用日志
```

## 日志格式

新的 logger 会自动添加时间戳和日志级别：

```
[SiYuanMemo][LOG][12:34:56] message
[SiYuanMemo][DEBUG][12:34:57] debug info
[SiYuanMemo][StorageManager][INFO][12:34:58] info from module
```

## 批量替换

可以使用以下正则表达式进行批量替换：

### 查找：
```regex
console\.(log|debug|info|warn|error)\(['"](\[SiYuanMemo\].*?)['"]
```

### 替换为：
```
logger.$1('$2
```

注意：需要手动移除消息中的 `[SiYuanMemo]` 前缀，因为 logger 会自动添加。

## 注意事项

1. **错误日志总是显示**：`logger.error()` 即使在禁用日志时也会输出，确保重要错误不会被忽略
2. **不要在 logger 中使用 console**：避免循环依赖
3. **测试代码可以继续使用 console**：测试文件中可以直接使用 console，不需要迁移

## 迁移优先级

### 高优先级（核心模块）
- [x] src/index.ts ✅
- [x] src/core/storage/manager.ts ✅
- [x] src/core/scheduler/ ✅
- [x] src/services/ ✅

### 中优先级（UI 组件）
- [x] src/ui/browser/ ✅
- [x] src/ui/review/ ✅
- [x] src/ui/settings/ ✅

### 低优先级（工具和测试）
- [x] src/utils/ ✅
- [ ] src/__tests__/ (可选，测试代码可以继续使用 console)

## 完成后

1. ✅ 删除 `src/utils/disableLogs.ts` 文件
2. ✅ 验证所有日志都正常工作
3. ✅ 确认不再劫持全局 console

## 迁移完成总结

**迁移统计：**
- 处理文件：379 个
- 修改文件：74 个（初次迁移）+ 61 个（语法修复）
- 总替换次数：1383 次
- 删除文件：1 个（disableLogs.ts）

**验证结果：**
- ✅ 没有文件再导入 `disableLogs`
- ✅ 没有未迁移的 `console.log('[SiYuanMemo]...')` 调用
- ✅ 没有 logger 语法错误
- ✅ 所有中文注释和字符串都正常显示（UTF-8 编码）
- ✅ 所有优先级任务都已完成
