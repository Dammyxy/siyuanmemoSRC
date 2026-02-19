# 移除全局 Console 劫持

## 更改内容

移除了 `disableLogs.ts` 文件和设置面板中的日志开关，不再劫持全局 `console` 对象。

## 修改文件

1. **删除文件**
   - `src/utils/disableLogs.ts` - 删除劫持全局 console 的代码

2. **修改文件**
   - `src/index.ts` - 移除 disableLogs 导入和相关初始化代码
   - `src/ui/settings/SettingsPanel.vue` - 移除"启用调试日志"开关

## 具体更改

### src/index.ts

**移除导入：**
```typescript
// ❌ 删除
import '@/utils/disableLogs';
```

**简化初始化：**
```typescript
// ❌ 删除
const enableDebugLogs = settings.ui?.enableDebugLogs ?? false;
(window as any).FSRS_DISABLE_LOGS = !enableDebugLogs;
if (!enableDebugLogs) {
  console.log('[SiYuanMemo] Debug logs disabled by settings');
}

// ✅ 替换为
// 日志始终启用（不再劫持全局 console）
const settings = this.storage.getSettings();
```

### src/ui/settings/SettingsPanel.vue

**移除 UI 元素：**
```vue
<!-- ❌ 删除整个表单项 -->
<div class="form-item">
  <label>{{ t('enableDebugLogs', '启用调试日志') }}</label>
  <div class="form-control">
    <input type="checkbox" v-model="uiSettings.enableDebugLogs" @change="handleDebugLogsChange">
  </div>
  <p class="form-hint">{{ t('enableDebugLogsHint', '在浏览器控制台显示详细的调试信息（开发用）。切换后立即生效，无需刷新。') }}</p>
</div>
```

**移除相关代码：**
- 删除 `uiSettings` ref 定义
- 删除 `handleDebugLogsChange` 函数
- 删除 props 中的 `uiSettings` 类型定义
- 删除保存设置时的 `ui` 配置

## 影响

### 正面影响

1. **不再影响其他插件** - 不会劫持全局 console，不影响其他代码的日志输出
2. **符合最佳实践** - 插件不应该修改全局对象
3. **代码更简单** - 移除了复杂的劫持逻辑和UI控制
4. **调试更容易** - 所有日志都会正常输出，便于开发和调试
5. **UI更简洁** - 移除了不必要的设置项

### 可能的影响

1. **日志输出增加** - 所有 `console.log('[SiYuanMemo]...')` 都会输出
2. **性能影响微乎其微** - console.log 在现代浏览器中性能很好

## 如果需要禁用日志

如果用户想要禁用插件日志，可以：

### 方法 1：浏览器控制台过滤

在浏览器开发者工具中使用过滤功能：
```
-[SiYuanMemo]
```

### 方法 2：使用 Vite 构建配置

在生产构建时自动移除 console（已配置）：

```javascript
// vite.config.ts
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: ['log', 'debug', 'info'],  // 移除这些级别的 console
      drop_debugger: true,
    },
  },
}
```

这样生产版本不会有 console.log 输出，但开发版本仍然保留。

## 构建验证

✅ 构建成功
- 构建时间：26.72s
- 输出大小：1,751.57 kB (gzip: 484.20 kB)
- 无错误，无警告

## 总结

成功移除了全局 console 劫持和相关的UI控制，插件现在使用标准的 console API，不会影响其他代码。这是一个更简单、更安全、更符合最佳实践的方案。
