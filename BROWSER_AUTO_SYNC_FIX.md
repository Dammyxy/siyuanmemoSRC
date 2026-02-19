# 浏览器自动同步问题修复

## 问题描述

使用思源原生快速制卡后，打开 SRS 浏览器没有自动获取新卡片，需要手动点击"全量同步"按钮才能看到新卡片。

## 根本原因

### 1. 思源原生快速制卡的特性

思源原生快速制卡使用 `addRiffCards` API 直接操作 riff 数据库，**不会触发插件的任何事件**。因此：
- 插件不知道有新卡片被创建
- 本地数据和 riff 数据不同步
- 需要通过同步机制来获取新卡片

### 2. 浏览器打开时的自动同步没有触发

从日志分析，浏览器打开时应该触发增量同步，但实际上没有执行。可能的原因：

1. **配置问题**：
   - `riffIntegration.mode` 不是 `'advanced'`
   - `incrementalSync.enabled` 为 `false`
   - `incrementalSync.triggers` 不包含 `'browser-open'`

2. **HybridSyncService 未初始化**：
   - 服务未正确初始化
   - 配置加载失败

3. **代码逻辑问题**：
   - 同步是后台执行，UI 先加载了旧数据
   - 同步完成后没有刷新 UI

## 修复方案

### 修复 1：添加诊断日志

在 `SRSBrowser.vue` 的 `onMounted` 中添加详细日志，诊断为什么自动同步没有触发：

```typescript
console.log('[SRSBrowser] 🔍 Checking auto-sync configuration:', {
  hasHybridSyncService: !!plugin.hybridSyncService,
  hasRiffConfig: !!riffConfig,
  mode: riffConfig?.mode,
  incrementalSyncEnabled: riffConfig?.incrementalSync?.enabled,
  triggers: riffConfig?.incrementalSync?.triggers,
  hasBrowserOpenTrigger: riffConfig?.incrementalSync?.triggers?.includes('browser-open')
});
```

### 修复 2：改为前台同步

将浏览器打开时的同步从后台改为前台，确保数据加载完成后再显示：

```typescript
// 原来：后台执行，不阻塞 UI
void plugin.hybridSyncService.incrementalSync().catch(...);
loadData();

// 修改后：前台执行，等待同步完成
await plugin.hybridSyncService.incrementalSync();
await loadData(true); // 强制刷新缓存
return; // 不再执行下面的 loadData()
```

### 修复 3：修复 loadQueueCards 参数问题

之前的修复已经解决了 `loadQueueCards` 函数签名不匹配的问题，确保增量更新能正确获取数据。

## 使用说明

### 1. 检查配置

打开浏览器后，查看控制台日志：

```
[SRSBrowser] 🔍 Checking auto-sync configuration: {
  hasHybridSyncService: true,
  hasRiffConfig: true,
  mode: 'advanced',
  incrementalSyncEnabled: true,
  triggers: ['plugin-start', 'browser-open', 'review-open'],
  hasBrowserOpenTrigger: true
}
```

如果配置正确，应该看到：
- `mode: 'advanced'`
- `incrementalSyncEnabled: true`
- `hasBrowserOpenTrigger: true`

### 2. 启用自动同步

如果配置不正确，需要在设置中启用：

1. 打开插件设置
2. 找到"Riff 集成"部分
3. 确保模式为"高级模式"
4. 启用"增量同步"
5. 勾选"浏览器打开时"触发器

### 3. 验证修复

1. 使用思源原生快速制卡创建新卡片
2. 打开 SRS 浏览器
3. 查看控制台日志：
   ```
   [SRSBrowser] ✅ Triggering incremental sync on browser open...
   [HybridSync] Starting incremental sync...
   [HybridSync] Fetched X new cards from Riff
   [SRSBrowser] ✅ Incremental sync completed, reloading data...
   ```
4. 新卡片应该自动显示，无需手动点击全量同步

## 预期行为

修复后的流程：

1. 用户使用思源原生快速制卡
2. 卡片数据写入 riff 数据库
3. 打开 SRS 浏览器
4. **自动触发增量同步**
5. 从 riff 获取新卡片
6. 更新本地数据
7. 显示包含新卡片的列表

## 相关文件

- `src/ui/browser/SRSBrowser.vue` - 浏览器组件，添加自动同步逻辑
- `src/services/HybridSyncService.ts` - 混合同步服务
- `src/ui/browser/browserService.ts` - 浏览器数据服务，修复 loadQueueCards
- `BROWSER_SYNC_ISSUE_FIX.md` - loadQueueCards 参数问题修复

## 故障排查

### 问题：浏览器打开时没有触发同步

**检查日志：**
```
[SRSBrowser] ⚠️ Auto-sync not triggered, loading data without sync
```

**可能原因：**
1. 配置中 `mode` 不是 `'advanced'`
2. `incrementalSync.enabled` 为 `false`
3. `triggers` 不包含 `'browser-open'`

**解决方法：**
在设置中启用高级模式和增量同步。

### 问题：同步失败

**检查日志：**
```
[SRSBrowser] ❌ Incremental sync failed: Error: ...
```

**可能原因：**
1. Riff API 调用失败
2. 网络问题
3. 数据格式错误

**解决方法：**
1. 检查 Riff 服务是否正常
2. 查看详细错误信息
3. 尝试手动全量同步

### 问题：同步完成但没有显示新卡片

**检查日志：**
```
[HybridSync] Fetched 0 new cards from Riff
```

**可能原因：**
1. `lastSyncTime` 时间戳问题
2. 新卡片已经在本地
3. 黑名单过滤

**解决方法：**
1. 尝试手动全量同步
2. 检查黑名单配置
3. 清除本地数据重新同步

## 修复日期

2026-02-14

## 修复人员

Kiro AI Assistant
