# 快速制卡配置访问修复

## 问题描述

AutoCardHandler 使用了错误的配置访问方式：
```typescript
// ❌ 错误：使用 plugin.data[STORAGE_NAME]
const quickCardSettings = this.plugin.data[STORAGE_NAME]?.quickCard;
```

实际配置存储在 `StorageManager` 中，应该通过 `plugin.storage.getSettings()` 访问。

## 修复内容

### 1. 修改配置访问方式

在 `AutoCardHandler.ts` 的 5 个位置，将配置访问方式从：
```typescript
this.plugin.data[STORAGE_NAME]?.quickCard
```

改为：
```typescript
this.plugin.storage.getSettings().quickCard
```

### 2. 移除不必要的导入

移除了 `STORAGE_NAME` 导入：
```typescript
// 移除
import { STORAGE_NAME } from '@/types';
```

## 修复位置

1. `handle()` 方法（第 67 行）
2. `queueQuickCheck()` 方法（第 105 行）
3. `queueListCheck()` 方法（第 128 行）
4. `checkQuickSymbols()` 方法（第 209 行）
5. `checkListTemplate()` 方法（第 267 行）

## 验证步骤

### 1. 在思源中测试

1. 重新加载插件（Ctrl+Shift+R）
2. 打开控制台（F12）
3. 运行诊断脚本：

```javascript
// 完整诊断
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
const ws = plugin.transactionWebSocketService;
const settings = plugin.storage.getSettings();

console.log('=== 完整诊断 ===');
console.log('1. 插件:', !!plugin);
console.log('2. WebSocket 服务:', !!ws);
console.log('3. WebSocket 连接:', ws?.ws?.readyState);
console.log('4. 处理器数量:', ws?.handlers?.length);
console.log('5. 处理器列表:', ws?.handlers?.map(h => h.constructor.name));
console.log('6. 快速制卡配置:', settings.quickCard);
console.log('7. 配置启用状态:', settings.quickCard?.enabled);
```

### 2. 测试快速制卡

在思源中创建一个新块，输入：
```
测试 >> 答案
```

预期结果：
- 控制台显示 `[AutoCard] Block queued: <blockId> action: insert`
- 300ms 后显示 `[AutoCard] Processing quick queue, count: 1`
- 显示 `[AutoCard] Checking quick symbols: <blockId> content: 测试 >> 答案`
- 显示 `[AutoCard] Detected basic forward symbol: <blockId>`
- 显示 `✅ 已创建正向卡片 (>>)`

## 根本原因

`plugin.data` 是思源插件 API 提供的原始数据存储，但本插件使用了 `StorageManager` 封装层来管理配置。

配置的实际存储路径：
- 文件：`data/storage/petal/siyuan-plugin-siyuanmemo/fsrs-config.json`
- 访问：`plugin.storage.getSettings()`

而 `plugin.data[STORAGE_NAME]` 只在插件初始化时加载一次，不会实时反映配置变化。

## 影响范围

此修复解决了快速制卡功能完全不工作的问题。

## 相关文件

- `src/services/handlers/AutoCardHandler.ts` - 主要修复文件
- `src/types/settings.ts` - 配置类型定义
- `src/core/storage/StorageManager.ts` - 配置管理器

## 测试覆盖

单元测试需要更新 mock 对象：
```typescript
// ❌ 旧方式
mockPlugin.data[STORAGE_NAME].quickCard.enabled = false;

// ✅ 新方式
vi.spyOn(mockPlugin.storage, 'getSettings').mockReturnValue({
    ...DEFAULT_SETTINGS,
    quickCard: { ...DEFAULT_SETTINGS.quickCard, enabled: false }
});
```

## 后续工作

- [ ] 更新单元测试以使用新的配置访问方式
- [ ] 验证所有快速制卡符号（>>, ::, ;;, {{}}, >>>）
- [ ] 测试防抖机制
- [ ] 测试配置热更新

## 完成时间

2025-02-15
