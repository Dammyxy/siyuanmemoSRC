# 修复：自动制卡设置无法保存

## 问题描述

用户报告：
1. 在设置面板中勾选"实时自动制卡"选项
2. 点击"保存设置"
3. 再次打开设置面板，发现勾选被取消了
4. 控制台显示"应用了调度器"，但没有提示自动制卡状态

## 根本原因

### 原因 1：设置保存逻辑缺失

在 `index.ts` 的 `openSetting()` 方法中，保存设置时**没有保存 `incremental` 配置**：

```typescript
save: async (settings: any) => {
  const updatedSettings = {
    ...currentSettings,
    fsrs: { ... },
    queues: settings.queues || currentSettings.queues,
    scheduler: settings.scheduler || currentSettings.scheduler,
    // ❌ 缺少：incremental: settings.incremental
  };
  await this.storage.updateSettings(updatedSettings);
  // ...
}
```

**问题**：
- `SettingsPanel.vue` 正确发送了 `incremental` 配置
- 但 `index.ts` 没有保存到 `updatedSettings` 中
- 导致设置被丢弃

### 原因 2：TransactionObserver 状态未更新

保存设置后，没有更新 `TransactionObserver` 的启用状态：

```typescript
// ❌ 缺少：更新 TransactionObserver 状态
this.transactionObserver.setEnabled(autoCardEnabled);
```

**问题**：
- 即使设置被保存（修复后），TransactionObserver 的状态也不会立即更新
- 需要重启插件才能生效

### 原因 3：设置面板未传递 incrementalSettings

打开设置面板时，没有传递 `incrementalSettings` 属性：

```typescript
props: {
  fsrsSettings: currentSettings.fsrs,
  queueSettings: currentSettings.queues,
  schedulerSettings: currentSettings.scheduler,
  // ❌ 缺少：incrementalSettings: currentSettings.incremental
  // ...
}
```

**问题**：
- 设置面板无法读取当前的 `autoCardEnabled` 值
- 每次打开都显示默认值（`false`）

## 修复方案

### 修改 1：保存 incremental 配置

在 `index.ts` 的 `save` 事件处理中添加：

```typescript
save: async (settings: any) => {
  const updatedSettings = {
    ...currentSettings,
    fsrs: { ... },
    queues: settings.queues || currentSettings.queues,
    scheduler: settings.scheduler || currentSettings.scheduler,
    incremental: settings.incremental || currentSettings.incremental,  // ✅ 新增
  };
  await this.storage.updateSettings(updatedSettings);
  // ...
}
```

### 修改 2：更新 TransactionObserver 状态

在保存设置后，立即更新 TransactionObserver：

```typescript
// 🆕 更新 TransactionObserver 启用状态
if (this.transactionObserver && settings.incremental) {
  const autoCardEnabled = settings.incremental.autoCardEnabled || false;
  this.transactionObserver.setEnabled(autoCardEnabled);
  console.log('[FSRS] ✅ TransactionObserver enabled:', autoCardEnabled);
}
```

### 修改 3：传递 incrementalSettings

在打开设置面板时传递：

```typescript
props: {
  fsrsSettings: currentSettings.fsrs,
  queueSettings: currentSettings.queues,
  schedulerSettings: currentSettings.scheduler,
  incrementalSettings: currentSettings.incremental,  // ✅ 新增
  // ...
}
```

## 修复后的工作流程

### 场景 1：首次启用自动制卡

1. 用户打开设置面板
2. 切换到"参数设置"选项卡
3. 勾选"实时自动制卡"
4. 点击"保存设置"
5. **设置被保存到存储**
6. **TransactionObserver 被启用**
7. 控制台显示：
   ```
   [FSRS] ✅ TransactionObserver enabled: true
   ```
8. 再次打开设置，勾选状态保持

### 场景 2：禁用自动制卡

1. 用户打开设置面板
2. 取消勾选"实时自动制卡"
3. 点击"保存设置"
4. **设置被保存**
5. **TransactionObserver 被禁用**
6. 控制台显示：
   ```
   [FSRS] ✅ TransactionObserver enabled: false
   ```
7. 再次打开设置，勾选状态保持

### 场景 3：重启后恢复状态

1. 用户重启思源笔记
2. 插件加载时读取设置：
   ```typescript
   const autoCardEnabled = settings.incremental?.autoCardEnabled || false;
   this.transactionObserver.setEnabled(autoCardEnabled);
   ```
3. TransactionObserver 根据保存的设置启用/禁用
4. 打开设置面板，显示正确的勾选状态

## 测试验证

### 测试 1：保存设置

1. 打开设置面板
2. 勾选"实时自动制卡"
3. 点击"保存设置"
4. 检查控制台：
   ```
   [FSRS] ✅ TransactionObserver enabled: true
   ```
5. 再次打开设置，勾选应该保持

### 测试 2：取消勾选

1. 打开设置面板
2. 取消勾选"实时自动制卡"
3. 点击"保存设置"
4. 检查控制台：
   ```
   [FSRS] ✅ TransactionObserver enabled: false
   ```
5. 再次打开设置，勾选应该取消

### 测试 3：重启恢复

1. 启用自动制卡并保存
2. 重启思源笔记
3. 检查控制台：
   ```
   [FSRS] TransactionObserver initialized
   [FSRS] ✅ TransactionObserver initialized, autoCardEnabled: true
   ```
4. 打开设置，勾选应该保持

### 测试 4：功能验证

1. 启用自动制卡
2. 创建新卡片：`【 item 测试::答案】`
3. 等待 2 秒
4. 检查控制台：
   ```
   [FSRS] WS Event: transactions
   [FSRS] Ops: insert <blockId>
   [FSRS] Item card detected: blockID=<blockId>
   ```
5. 打开浏览器，CardType 应显示 `Item`

## 相关文件

### 修改的文件
- `siyuan-plugin-fsrs/src/index.ts` - 添加 incremental 配置保存和 TransactionObserver 状态更新

### 相关文档
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_DETECTION.md` - TransactionObserver 初始化修复
- `siyuan-plugin-fsrs/docs/FIX_AUTO_CARD_TYPE_DETECTION_V2.md` - 卡片类型检测修复
- `siyuan-plugin-fsrs/docs/AUTO_CARD_DETECTION_GUIDE.md` - 用户使用指南

## 注意事项

1. **立即生效**：保存设置后立即更新 TransactionObserver 状态，无需重启
2. **持久化**：设置被正确保存到存储，重启后自动恢复
3. **控制台日志**：保存设置时会显示 TransactionObserver 的启用状态
4. **向后兼容**：如果 `incremental` 配置不存在，使用默认值 `false`

## 修复日期

- **2026-01-31**：修复设置保存逻辑，添加 TransactionObserver 状态更新
