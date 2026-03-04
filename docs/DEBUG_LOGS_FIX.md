# 调试日志功能修复

## 问题描述

调试日志功能存在以下问题：
1. 即使没有勾选"启用调试日志"，仍然会显示大量日志
2. 切换开关后需要刷新页面才能生效
3. 插件初始化时没有根据设置来配置日志开关

## 修复内容

### 1. 插件初始化时设置日志开关

**文件**: `src/index.ts`

在 `onload()` 方法中，初始化存储后立即根据设置配置日志开关：

```typescript
// 初始化存储
this.storage = new StorageManager(this.name);
await this.storage.init();

// 🆕 根据设置初始化调试日志开关
const settings = this.storage.getSettings();
const enableDebugLogs = settings.ui?.enableDebugLogs ?? false;
(window as any).FSRS_DISABLE_LOGS = !enableDebugLogs;
if (!enableDebugLogs) {
  console.log('[SiyuanMemo] Debug logs disabled by settings');
}
```

### 2. 改进日志拦截机制

**文件**: `src/utils/disableLogs.ts`

修改为动态检查 `FSRS_DISABLE_LOGS` 的值，而不是在文件加载时一次性检查：

```typescript
// 动态拦截日志
console.log = function(...args: any[]) {
  // 动态检查是否禁用日志
  if ((window as any).FSRS_DISABLE_LOGS === true) {
    if (typeof args[0] === 'string' && args[0].startsWith('[SiyuanMemo]')) {
      return; // 忽略
    }
  }
  originalLog.apply(console, args);
};
```

这样，每次调用 `console.log` 时都会检查当前的 `FSRS_DISABLE_LOGS` 值，实现动态控制。

### 3. 设置面板立即生效

**文件**: `src/ui/settings/SettingsPanel.vue`

修改 `handleDebugLogsChange` 函数，移除"刷新页面后生效"的提示：

```typescript
function handleDebugLogsChange() {
  // 立即应用日志设置（不需要刷新）
  if (typeof window !== 'undefined') {
    (window as any).FSRS_DISABLE_LOGS = !uiSettings.value.enableDebugLogs;
    
    // 提示用户
    const message = uiSettings.value.enableDebugLogs 
      ? '调试日志已启用'
      : '调试日志已禁用';
    
    console.log(`[SiyuanMemo] ${message}`);
  }
}
```

更新提示文本：
```
在浏览器控制台显示详细的调试信息（开发用）。切换后立即生效，无需刷新。
```

## 工作原理

### 日志拦截流程

1. **插件加载时**:
   - `src/index.ts` 最前面导入 `@/utils/disableLogs`
   - `disableLogs.ts` 立即执行，替换 `console.log/debug/info` 方法
   - 替换后的方法会在每次调用时动态检查 `window.FSRS_DISABLE_LOGS`

2. **插件初始化时**:
   - 读取设置中的 `ui.enableDebugLogs` 值
   - 设置 `window.FSRS_DISABLE_LOGS = !enableDebugLogs`
   - 如果禁用日志，输出一条提示信息

3. **用户切换开关时**:
   - 立即更新 `window.FSRS_DISABLE_LOGS` 的值
   - 由于日志拦截是动态检查的，所以立即生效
   - 输出一条状态变更信息

### 日志过滤规则

只拦截以 `[SiyuanMemo]` 开头的日志，其他日志不受影响：

```typescript
if (typeof args[0] === 'string' && args[0].startsWith('[SiyuanMemo]')) {
  return; // 忽略
}
```

## 测试方法

### 1. 测试默认状态（禁用）

1. 确保设置中"启用调试日志"未勾选
2. 重新加载插件
3. 打开浏览器控制台
4. 应该只看到一条日志：`[SiyuanMemo] Debug logs disabled by settings`
5. 执行一些操作（如打开卡片浏览器），不应该看到大量 `[SiyuanMemo]` 日志

### 2. 测试启用日志

1. 打开插件设置
2. 勾选"启用调试日志"
3. 应该立即看到日志：`[SiyuanMemo] Debug logs enabled`
4. 执行一些操作，应该能看到详细的调试日志

### 3. 测试禁用日志

1. 在设置中取消勾选"启用调试日志"
2. 应该立即看到日志：`[SiyuanMemo] Debug logs disabled`
3. 执行一些操作，不应该再看到 `[SiyuanMemo]` 日志

### 4. 测试控制台切换

在浏览器控制台执行：

```javascript
// 启用日志
window.toggleFSRSLogs(true);

// 禁用日志
window.toggleFSRSLogs(false);
```

应该能看到状态变更信息，并且日志输出立即改变。

## 注意事项

1. **日志拦截的范围**: 只拦截 `console.log/debug/info`，不拦截 `console.error/warn`
2. **过滤规则**: 只过滤以 `[SiyuanMemo]` 开头的日志
3. **性能影响**: 日志拦截会在每次调用时检查一个全局变量，性能影响可以忽略不计
4. **持久化**: 日志开关状态会保存在插件设置中，重启后保持

## 调试技巧

如果日志功能仍然不正常，可以在控制台执行以下命令检查状态：

```javascript
// 检查当前状态
console.log('FSRS_DISABLE_LOGS:', window.FSRS_DISABLE_LOGS);

// 检查设置
console.log('Settings:', window.siyuan.storage['siyuan-plugin-siyuanmemo']);

// 强制启用日志
window.FSRS_DISABLE_LOGS = false;

// 强制禁用日志
window.FSRS_DISABLE_LOGS = true;
```

## 相关文件

- `src/index.ts` - 插件入口，初始化日志开关
- `src/utils/disableLogs.ts` - 日志拦截实现
- `src/ui/settings/SettingsPanel.vue` - 设置面板，日志开关 UI
- `src/types/settings.ts` - 设置类型定义
