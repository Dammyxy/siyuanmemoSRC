# ✅ 日志控制按钮已添加

## 🎉 功能完成

已在设置面板中添加"启用调试日志"开关！

---

## 📍 按钮位置

**路径**：插件设置 → 参数设置 → 功能开关 → 启用调试日志

**具体步骤**：
1. 点击插件图标打开设置
2. 确保在"参数设置"标签页（默认）
3. 向下滚动到"功能开关"部分
4. 找到"启用调试日志"复选框
5. 取消勾选以禁用日志
6. 点击"保存设置"
7. 刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）

---

## 🎨 UI 截图说明

```
┌─────────────────────────────────────────┐
│  参数设置  │  调度器  │  练习模式  │  关于  │
├─────────────────────────────────────────┤
│                                          │
│  功能开关                                 │
│  ─────────────────────────────────────  │
│                                          │
│  □ 实时自动制卡                          │
│  监听编辑操作，当输入特定内容时自动创建闪卡 │
│                                          │
│  ☑ 启用调试日志                    ← 这里！│
│  在浏览器控制台显示详细的调试信息（开发用） │
│                                          │
│  ─────────────────────────────────────  │
│                                          │
│  [保存设置]  [重置默认]                   │
│                                          │
└─────────────────────────────────────────┘
```

---

## ⚙️ 技术实现

### 1. 数据结构

**文件**：`src/types/settings.ts`

```typescript
export interface UISettings {
  // ...
  enableDebugLogs: boolean;  // 启用调试日志（开发用）
}

export const DEFAULT_SETTINGS: PluginSettings = {
  // ...
  ui: {
    // ...
    enableDebugLogs: false,  // 默认关闭
  },
};
```

### 2. UI 组件

**文件**：`src/ui/settings/SettingsPanel.vue`

```vue
<!-- 启用调试日志 -->
<div class="form-item">
  <label>{{ t('enableDebugLogs', '启用调试日志') }}</label>
  <div class="form-control">
    <input 
      type="checkbox" 
      v-model="uiSettings.enableDebugLogs" 
      @change="handleDebugLogsChange"
    >
  </div>
  <p class="form-hint">
    {{ t('enableDebugLogsHint', '在浏览器控制台显示详细的调试信息（开发用，关闭可提升性能）') }}
  </p>
</div>
```

### 3. 实时切换逻辑

```typescript
// 处理调试日志开关变化
function handleDebugLogsChange() {
  // 立即应用日志设置
  if (typeof window !== 'undefined') {
    (window as any).FSRS_DISABLE_LOGS = !uiSettings.value.enableDebugLogs;
    
    // 提示用户
    const message = uiSettings.value.enableDebugLogs 
      ? '调试日志已启用，刷新页面后生效'
      : '调试日志已禁用，刷新页面后生效';
    
    console.log(`[FSRS] ${message}`);
  }
}
```

### 4. 保存逻辑

```typescript
function saveSettings() {
  // ...
  emit('save', {
    // ...
    ui: {
      enableDebugLogs: uiSettings.value.enableDebugLogs,
    },
  });
}
```

---

## 🔄 工作流程

### 用户操作流程

```
用户打开设置
  ↓
找到"启用调试日志"开关
  ↓
取消勾选（禁用日志）
  ↓
点击"保存设置"
  ↓
设置保存到 settings.json
  ↓
handleDebugLogsChange() 立即设置 window.FSRS_DISABLE_LOGS
  ↓
控制台显示提示："调试日志已禁用，刷新页面后生效"
  ↓
用户刷新思源笔记（Ctrl+R）
  ↓
disableLogs.ts 检测到 window.FSRS_DISABLE_LOGS = true
  ↓
拦截所有 [FSRS] 开头的日志
  ↓
✅ 控制台清爽了！
```

### 数据流

```
SettingsPanel.vue (UI)
  ↓ v-model
uiSettings.enableDebugLogs
  ↓ @change
handleDebugLogsChange()
  ↓ 设置全局变量
window.FSRS_DISABLE_LOGS
  ↓ 保存设置
emit('save', { ui: { enableDebugLogs } })
  ↓ 持久化
settings.json
  ↓ 下次加载
disableLogs.ts 检测并拦截日志
```

---

## ✨ 特性

### 1. 实时生效

- ✅ 切换开关后立即设置全局变量
- ✅ 刷新页面后完全生效
- ✅ 无需重启插件

### 2. 持久化

- ✅ 设置保存到 `settings.json`
- ✅ 下次启动自动应用
- ✅ 跨设备同步（如果使用思源同步）

### 3. 用户友好

- ✅ 清晰的标签和提示
- ✅ 复选框交互直观
- ✅ 控制台提示操作结果

### 4. 向后兼容

- ✅ 不影响现有代码
- ✅ 默认关闭（不干扰用户）
- ✅ 可以随时切换

---

## 🎯 使用建议

### 开发时

**启用日志**：
- 勾选"启用调试日志"
- 保存设置并刷新
- 查看详细的调试信息

**禁用日志**：
- 取消勾选"启用调试日志"
- 保存设置并刷新
- 控制台清爽，专注开发

### 生产环境

**默认行为**：
- 日志默认关闭
- 用户不会看到调试信息
- 只显示 warn 和 error

**用户需要调试**：
- 引导用户启用日志
- 收集日志信息
- 诊断问题

---

## 📚 相关文档

- **[DISABLE_LOGS_NOW.md](./DISABLE_LOGS_NOW.md)** - 快速禁用指南
- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** - 完整的日志系统文档
- **[LOG_CLEANUP_SUMMARY.md](./LOG_CLEANUP_SUMMARY.md)** - 日志清理总结

---

## 🎉 总结

现在你有三种方式控制日志：

1. **设置面板**（推荐）- 持久化，用户友好 ✅
2. **全局变量**（临时）- 快速，适合开发
3. **环境变量**（开发）- 构建时控制

选择最适合你的方式，享受清爽的控制台！ 🚀

---

**最后更新**：2026-01-31
