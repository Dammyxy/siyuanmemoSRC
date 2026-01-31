# 快速禁用调试日志

## 🚀 最快方法（推荐）

在浏览器控制台中执行：

```javascript
window.FSRS_DISABLE_LOGS = true;
```

然后刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）。

---

## 🔧 其他方法

### 方法 1：环境变量（开发模式）

在 `.env` 文件中添加：

```bash
VITE_ENABLE_LOGS=false
```

然后重新运行 `pnpm dev`。

### 方法 2：全局切换函数

在浏览器控制台中：

```javascript
// 禁用日志
window.toggleFSRSLogs(false);

// 启用日志
window.toggleFSRSLogs(true);
```

执行后需要刷新思源笔记。

### 方法 3：修改代码（永久）

在 `src/utils/disableLogs.ts` 文件中，修改第 13 行：

```typescript
// 改为 true 永久禁用
const shouldDisableLogs = true;
```

然后重新构建插件。

---

## 📋 验证是否生效

禁用后，控制台应该：

✅ **不再显示**：
- `[FSRS] Plugin loading...`
- `[FSRS] Queue initialized`
- `[FSRS] Card loaded`
- 等等所有 `[FSRS]` 开头的普通日志

✅ **仍然显示**：
- `[FSRS] Error: ...` （错误日志）
- `[FSRS] Warning: ...` （警告日志）

---

## 🔄 重新启用日志

### 临时启用（当前会话）

在浏览器控制台中：

```javascript
delete window.FSRS_DISABLE_LOGS;
```

然后刷新思源笔记。

### 永久启用

删除或注释掉 `.env` 中的 `VITE_ENABLE_LOGS=false`，然后重新运行 `pnpm dev`。

---

## 💡 工作原理

插件在启动时会检查：

1. 环境变量 `VITE_ENABLE_LOGS`
2. 全局变量 `window.FSRS_DISABLE_LOGS`

如果任一为 `false`/`true`，则拦截所有 `[FSRS]` 开头的 `console.log`、`console.debug`、`console.info`。

**注意**：`console.warn` 和 `console.error` 不会被拦截，因为它们对调试很重要。

---

## 🎯 推荐使用场景

- **开发调试其他功能**：禁用 FSRS 日志，避免干扰
- **性能测试**：减少控制台输出，提高性能
- **用户演示**：让控制台看起来更干净

---

**最后更新**：2026-01-31
