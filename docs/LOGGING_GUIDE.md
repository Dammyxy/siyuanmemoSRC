# 日志系统使用指南

## 🎯 快速禁用所有日志

### 方法 1：通过设置面板（推荐）✅

1. 打开插件设置
2. 找到"参数设置"选项卡
3. 在"功能开关"部分找到"启用调试日志"
4. 取消勾选该选项
5. 点击"保存设置"
6. 刷新思源笔记

**优点**：
- ✅ 设置会持久保存
- ✅ 无需每次手动设置
- ✅ 用户友好的界面

### 方法 2：通过代码（临时）

在浏览器控制台中执行：

```javascript
// 完全禁用所有日志
window.fsrsLogger?.setEnabled(false);

// 重新启用
window.fsrsLogger?.setEnabled(true);
```

### 方法 3：通过环境变量（开发）

在 `.env` 文件中添加：

```bash
VITE_ENABLE_LOGS=false
```

---

## 📚 日志系统说明

### 日志级别

插件使用统一的日志管理系统，支持以下级别：

| 级别 | 用途 | 生产模式 | 开发模式 |
|------|------|---------|---------|
| `debug` | 调试信息 | ❌ 不输出 | ✅ 输出 |
| `log` | 普通日志 | ❌ 不输出 | ✅ 输出 |
| `info` | 信息日志 | ❌ 不输出 | ✅ 输出 |
| `warn` | 警告信息 | ✅ 输出 | ✅ 输出 |
| `error` | 错误信息 | ✅ 输出 | ✅ 输出 |

### 默认行为

- **开发模式** (`pnpm dev`)：输出所有日志
- **生产模式** (`pnpm build`)：只输出 `warn` 和 `error`
- **用户设置**：可以通过设置面板完全禁用

---

## 🔧 开发者使用

### 基本用法

```typescript
import { logger } from '@/utils/logger';

// 普通日志
logger.log('Card loaded', card);

// 调试日志（仅开发模式）
logger.debug('Queue state', queueState);

// 警告（生产模式也会输出）
logger.warn('Card not found', cardId);

// 错误（生产模式也会输出）
logger.error('Failed to load card', error);
```

### 带标签的日志

```typescript
import { createLogger } from '@/utils/logger';

const log = createLogger('ReviewView');

log.log('Component mounted');
log.warn('Invalid state', state);
log.error('Failed to load', error);
```

输出示例：
```
[FSRS] [ReviewView] Component mounted
[FSRS] [ReviewView] Invalid state {...}
[FSRS] [ReviewView] Failed to load Error: ...
```

### 分组日志

```typescript
import { logger } from '@/utils/logger';

logger.group('Performance Report');
logger.log('Queue next(): 10ms');
logger.log('Render: 5ms');
logger.groupEnd();
```

---

## 🚀 迁移现有代码

### 替换 console.log

**之前**：
```typescript
console.log('[FSRS] Card loaded', card);
```

**之后**：
```typescript
import { logger } from '@/utils/logger';
logger.log('Card loaded', card);
```

### 替换 console.warn

**之前**：
```typescript
console.warn('[FSRS] Warning:', message);
```

**之后**：
```typescript
import { logger } from '@/utils/logger';
logger.warn('Warning:', message);
```

### 替换 console.error

**之前**：
```typescript
console.error('[FSRS] Error:', error);
```

**之后**：
```typescript
import { logger } from '@/utils/logger';
logger.error('Error:', error);
```

---

## 📋 待迁移文件清单

以下文件包含 `console` 语句，需要逐步迁移：

### 高优先级（调试日志多）

- [ ] `src/ui/review/v2/ReviewView.vue` - 复习界面（~15 处）
- [ ] `src/ui/review/v2/sessions/FinalDrillV2Session.ts` - 刻意练习（~7 处）
- [ ] `src/utils/dialog.ts` - 对话框工具（~10 处）
- [ ] `src/ui/srs/SrsEditorDialog.vue` - 编辑器对话框（~10 处）

### 中优先级（少量日志）

- [ ] `src/utils/performance.ts` - 性能监控（~3 处）
- [ ] `src/ui/srs/FlashcardMetaMenu.vue` - 元数据菜单（~1 处）

### 保留的日志

以下日志应该保留（错误和警告）：

- ✅ `logger.error()` - 所有错误日志
- ✅ `logger.warn()` - 所有警告日志

---

## 🎨 最佳实践

### 1. 使用合适的日志级别

```typescript
// ❌ 不好：所有日志都用 log
logger.log('Starting process...');
logger.log('Warning: something wrong');
logger.log('Error occurred');

// ✅ 好：使用合适的级别
logger.debug('Starting process...');  // 调试信息
logger.warn('Warning: something wrong');  // 警告
logger.error('Error occurred');  // 错误
```

### 2. 提供有用的上下文

```typescript
// ❌ 不好：信息不足
logger.log('Card loaded');

// ✅ 好：提供上下文
logger.log('Card loaded', { cardId, type, due });
```

### 3. 使用标签组织日志

```typescript
// ❌ 不好：所有日志混在一起
logger.log('Queue initialized');
logger.log('Card added');

// ✅ 好：使用标签
const log = createLogger('RetrievalQueue');
log.log('Queue initialized');
log.log('Card added');
```

### 4. 避免敏感信息

```typescript
// ❌ 不好：可能包含敏感信息
logger.log('User data', userData);

// ✅ 好：只记录必要信息
logger.log('User loaded', { userId: userData.id });
```

---

## 🔍 调试技巧

### 临时启用特定模块的日志

```typescript
// 在文件顶部
const DEBUG = true;  // 临时启用

// 使用条件日志
if (DEBUG) {
  logger.debug('Detailed state', state);
}
```

### 使用浏览器过滤

在浏览器控制台中，可以过滤日志：

- 只看 FSRS 日志：输入 `[FSRS]`
- 只看特定模块：输入 `[FSRS] [ReviewView]`
- 只看错误：点击"Errors"按钮

---

## 📝 注意事项

1. **不要删除错误日志**：`logger.error()` 在生产模式也会输出，用于诊断问题
2. **不要删除警告日志**：`logger.warn()` 在生产模式也会输出，用于提醒用户
3. **可以删除调试日志**：`logger.debug()` 和 `logger.log()` 只在开发模式输出
4. **性能考虑**：日志系统会检查是否启用，禁用时几乎没有性能开销

---

## 🚧 TODO

- [ ] 迁移所有 `console.log` 到 `logger.log`
- [ ] 迁移所有 `console.warn` 到 `logger.warn`
- [ ] 迁移所有 `console.error` 到 `logger.error`
- [ ] 添加设置面板的日志开关 UI
- [ ] 在插件初始化时根据设置启用/禁用日志

---

**最后更新**：2026-01-31
