# 日志清理总结

## ✅ 已完成

### 1. 创建统一日志系统

**文件**：`src/utils/logger.ts`

提供统一的日志管理接口：
- `logger.log()` - 普通日志
- `logger.debug()` - 调试日志
- `logger.warn()` - 警告日志
- `logger.error()` - 错误日志
- `logger.withTag()` - 带标签的日志

**特性**：
- ✅ 开发模式：输出所有日志
- ✅ 生产模式：只输出 warn 和 error
- ✅ 可通过设置完全禁用

### 2. 创建快速禁用脚本

**文件**：`src/utils/disableLogs.ts`

提供快速禁用所有 `[FSRS]` 日志的方法：
- 检查环境变量 `VITE_ENABLE_LOGS`
- 检查全局变量 `window.FSRS_DISABLE_LOGS`
- 拦截 `console.log`、`console.debug`、`console.info`
- 保留 `console.warn` 和 `console.error`

**已集成**：在 `src/index.ts` 中自动导入

### 3. 添加设置选项

**文件**：`src/types/settings.ts`

在 `UISettings` 接口中添加：
```typescript
enableDebugLogs: boolean;  // 启用调试日志（开发用）
```

默认值：`false`（关闭）

### 4. 添加设置面板 UI ✅

**文件**：`src/ui/settings/SettingsPanel.vue`

在"参数设置"标签页的"功能开关"部分添加：
- ✅ "启用调试日志"复选框
- ✅ 实时切换功能（无需重启插件）
- ✅ 保存到设置文件

**位置**：参数设置 → 功能开关 → 启用调试日志

### 5. 创建文档

- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** - 完整的日志系统使用指南
- **[QUICK_DISABLE_LOGS.md](./QUICK_DISABLE_LOGS.md)** - 快速禁用日志指南
- **[LOG_CLEANUP_SUMMARY.md](./LOG_CLEANUP_SUMMARY.md)** - 本文档

---

## 🚀 立即使用

### 方法 1：设置面板（推荐）✅

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

### 方法 2：全局变量（最快）

在浏览器控制台中执行：

```javascript
window.FSRS_DISABLE_LOGS = true;
```

然后刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）。

### 方法 2：环境变量（开发模式）

在 `.env` 文件中添加：

```bash
VITE_ENABLE_LOGS=false
```

然后重新运行 `pnpm dev`。

### 方法 3：设置面板（持久化）✅

**已添加 UI 按钮！**

1. 打开插件设置
2. 找到"参数设置"选项卡
3. 在"功能开关"部分找到"启用调试日志"
4. 取消勾选该选项
5. 点击"保存设置"
6. 刷新思源笔记

**注意**：设置会持久保存，无需每次手动设置。

---

## 📊 当前状态

### 已拦截的日志

使用 `window.FSRS_DISABLE_LOGS = true` 后，以下日志将被拦截：

- ✅ `[FSRS] Plugin loading...`
- ✅ `[FSRS] Queue initialized`
- ✅ `[FSRS] Card loaded`
- ✅ `[FSRS Dialog] Set data-key on container`
- ✅ `[FSRS ReviewView] Component mounted`
- ✅ `[FinalDrillV2Session] rotateToEnd called`
- ✅ `[SrsEditor] loadSelection`
- ✅ 所有其他 `[FSRS]` 开头的普通日志

### 仍然显示的日志

- ✅ `[FSRS] Error: ...` （错误日志）
- ✅ `[FSRS] Warning: ...` （警告日志）
- ✅ 非 `[FSRS]` 开头的日志（思源系统日志等）

---

## 📋 待迁移文件

以下文件包含大量 `console` 语句，建议逐步迁移到新的日志系统：

### 高优先级（调试日志多）

- [ ] `src/ui/review/v2/ReviewView.vue` - 复习界面（~15 处）
- [ ] `src/ui/review/v2/sessions/FinalDrillV2Session.ts` - 刻意练习（~7 处）
- [ ] `src/utils/dialog.ts` - 对话框工具（~10 处）
- [ ] `src/ui/srs/SrsEditorDialog.vue` - 编辑器对话框（~10 处）

### 中优先级（少量日志）

- [ ] `src/utils/performance.ts` - 性能监控（~3 处）
- [ ] `src/ui/srs/FlashcardMetaMenu.vue` - 元数据菜单（~1 处）

### 迁移示例

**之前**：
```typescript
console.log('[FSRS] Card loaded', card);
```

**之后**：
```typescript
import { logger } from '@/utils/logger';
logger.log('Card loaded', card);
```

或者使用带标签的日志：
```typescript
import { createLogger } from '@/utils/logger';
const log = createLogger('ReviewView');
log.log('Card loaded', card);
```

---

## 🎯 下一步

### 短期（立即可做）

1. ✅ 使用 `window.FSRS_DISABLE_LOGS = true` 快速禁用日志
2. ✅ 验证日志是否被拦截
3. ✅ 继续开发其他功能

### 中期（可选）

1. 逐步迁移现有 `console` 语句到新的日志系统
2. 在设置面板添加"启用调试日志"开关的 UI
3. 在插件初始化时根据设置启用/禁用日志

### 长期（优化）

1. 添加日志级别过滤（只显示 error、warn 等）
2. 添加日志导出功能（用于问题诊断）
3. 添加性能日志（记录关键操作的耗时）

---

## 💡 最佳实践

### 1. 开发时

- 使用 `window.FSRS_DISABLE_LOGS = true` 快速禁用日志
- 需要调试时，使用 `delete window.FSRS_DISABLE_LOGS` 重新启用
- 刷新思源笔记使更改生效

### 2. 生产环境

- 日志系统会自动只输出 `warn` 和 `error`
- 用户可以通过设置面板控制是否启用调试日志
- 默认关闭调试日志，减少性能开销

### 3. 调试问题

- 保留所有 `logger.error()` 和 `logger.warn()`
- 可以删除或注释掉 `logger.log()` 和 `logger.debug()`
- 使用浏览器控制台的过滤功能（输入 `[FSRS]`）

---

## 📞 需要帮助？

### 查看文档

- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** - 完整的日志系统使用指南
- **[QUICK_DISABLE_LOGS.md](./QUICK_DISABLE_LOGS.md)** - 快速禁用日志指南

### 常见问题

**Q: 日志还是显示怎么办？**

A: 确保：
1. 已执行 `window.FSRS_DISABLE_LOGS = true`
2. 已刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）
3. 检查控制台是否显示 `[FSRS] Debug logs disabled`

**Q: 如何只禁用特定模块的日志？**

A: 使用浏览器控制台的过滤功能：
- 输入 `-[ReviewView]` 隐藏 ReviewView 的日志
- 输入 `[FSRS] -[ReviewView]` 只看 FSRS 但不看 ReviewView

**Q: 如何永久禁用日志？**

A: 在 `src/utils/disableLogs.ts` 中修改：
```typescript
const shouldDisableLogs = true;  // 改为 true
```

---

**最后更新**：2026-01-31
