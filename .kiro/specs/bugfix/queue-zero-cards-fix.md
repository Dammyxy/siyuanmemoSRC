# 队列显示 0 张卡片问题修复

## 问题描述

用户报告：
- 浏览器能看到 62 张卡片
- 但所有队列（检索练习、最终演练等）都显示 0 张卡片
- 控制台日志显示：`[SiYuanMemo][DataAccessFacade] 🔍 getCards() returned 0 cards`

## 根本原因

在 `ApplicationContext.create()` 方法中，创建临时 `CardApplicationService` 时使用了错误的存储实例：

```typescript
// ❌ 错误代码（第 680 行）
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  storageManager,  // 使用旧的 storageManager
  cardScheduleService
);
```

**问题链**：
1. `CardApplicationService` 构造函数接收 `storageManager` 参数
2. 内部创建 `GetCardsQueryHandler` 时传入这个 `storageManager`
3. `GetCardsQueryHandler.execute()` 调用 `storageManager.getAllCards()`
4. 旧的 `storageManager` 没有数据（数据都在 `unifiedStorageManager` 中）
5. 返回空数组，导致队列显示 0 张卡片

## 解决方案

修改 `ApplicationContext.create()` 中的代码，使用 `unifiedStorageManager`：

```typescript
// ✅ 正确代码
const cardApplicationService = new CardApplicationService(
  createCardUseCase,
  deleteCardUseCase,
  updateCardUseCase,
  unifiedStorageManager as any,  // 使用 UnifiedStorageManager
  cardScheduleService
);
```

## 修改文件

- `siyuan-plugin-siyuanmemo/src/application/ApplicationContext.ts` (第 680 行)

## 验证步骤

1. 编译插件：
   ```bash
   npm run build
   ```

2. 重启思源笔记

3. 打开插件浏览器，检查队列数量

4. 在控制台执行验证命令：
   ```javascript
   const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-siyuanmemo');
   const context = plugin.getContext();
   
   // 验证 CardService 返回的卡片数量
   const cardService = context.getCardService();
   const result = await cardService.getCards({});
   console.log('CardService cards:', result.cards.length);
   
   // 对比 UnifiedStorage 的卡片数量
   const unifiedStorage = context.getUnifiedStorage();
   console.log('UnifiedStorage cards:', unifiedStorage.getAllCards().length);
   
   // 两者应该相等
   ```

## 相关问题

这个问题是 UnifiedStorageManager 集成过程中的第二个问题：

1. **问题 1**：XiuyuanRepository 使用错误的存储（已修复）
   - 文件：`ApplicationContext.ts` 第 295 行
   - 修复：使用 `context.getUnifiedStorage()` 而不是 `context.getXiuyuanStorage()`

2. **问题 2**：CardApplicationService 使用错误的存储（本次修复）
   - 文件：`ApplicationContext.ts` 第 680 行
   - 修复：使用 `unifiedStorageManager` 而不是 `storageManager`

## 架构说明

### 为什么需要两个 CardApplicationService 实例？

在 `ApplicationContext.create()` 中：

1. **临时实例**（第 680 行）：
   - 用于初始化阶段
   - 被 `CardCreationHelper` 和 `BlockMenuHandler` 使用
   - 在 `ApplicationContext` 创建完成前就需要

2. **服务容器实例**（第 318 行）：
   - 通过服务工厂懒加载
   - 被其他服务通过 `context.getCardService()` 获取
   - 在 `ApplicationContext` 创建完成后使用

两个实例都必须使用 `unifiedStorageManager`，否则会导致数据不一致。

## 测试结果

修复后预期结果：
- ✅ 队列显示正确的卡片数量
- ✅ `getCards()` 返回 62 张卡片
- ✅ 控制台日志显示正确的数量
- ✅ 可以正常复习卡片

## 下一步

UnifiedStorageManager 集成已完成，可以继续实现分文件存储功能。
