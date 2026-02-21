# 修复：右键菜单更改卡片类型同步到卡片数据

## 问题描述

右键菜单中的"更改卡片类型"功能（Topic/Item）只修改了块属性（`custom-fsrs-card-type`），没有同步到卡片数据（StorageManager/Xiuyuan），导致：

1. 块属性已更新
2. 但 `FSRSCard.type` 和 `Xiuyuan.meta.cardType` 没有更新
3. 需要等待下次 `XiuyuanSyncService` 同步才能生效

## 根本原因

在新架构中，卡片类型应该存储在两个地方：
- **块属性**：`custom-fsrs-card-type`（用于持久化和跨设备同步）
- **卡片数据**：`FSRSCard.type` 和 `Xiuyuan.meta.cardType`（用于运行时逻辑）

旧的实现（`useContextMenu.ts`）只更新了块属性，没有同步到卡片数据。

## 解决方案

### 修改文件
- `src/ui/browser/composables/useContextMenu.ts`

### 修改内容

1. **添加 `storage` 参数到 `ContextMenuOptions`**
   ```typescript
   export interface ContextMenuOptions {
     // ... 其他参数
     storage?: any;  // ✅ 添加 StorageManager 依赖
   }
   ```

2. **更新 `markCardsAsTopic` 函数**
   ```typescript
   async function markCardsAsTopic(cards: BrowserCard[]): Promise<void> {
     // 1. 更新块属性
     for (const blockId of blockIds) {
       await setBlockAttrs(blockId, { [ATTR_CARD_TYPE]: 'topic' });
     }

     // 2. ✅ 更新 StorageManager 中的卡片类型
     if (options.storage) {
       for (const card of cards) {
         const cardId = card.fsrsCardId || card.id;
         if (cardId) {
           const fsrsCard = options.storage.getCard(cardId);
           if (fsrsCard) {
             fsrsCard.type = 'topic' as any;
             options.storage.setCard(fsrsCard);
           }
         }
       }
       await options.storage.saveCards();
     }
   }
   ```

3. **更新 `markCardsAsItem` 函数**（同样的逻辑）

## 验证

修改后，右键菜单更改卡片类型时：
1. ✅ 块属性立即更新
2. ✅ StorageManager 中的卡片数据立即更新
3. ✅ 无需等待 XiuyuanSyncService 同步

## 注意事项

- `SRSBrowser.vue` 已经在使用 `useCardActions` 中的正确实现
- 本次修复确保 `useContextMenu` 中的实现与 `useCardActions` 保持一致
- 未来如果有其他组件使用 `useContextMenu`，也能获得正确的行为

## 相关文件

- `src/ui/browser/composables/useContextMenu.ts` - 修复的文件
- `src/ui/browser/composables/useCardActions.ts` - 参考的正确实现
- `src/application/services/XiuyuanSyncService.ts` - 同步服务（从块属性同步到 Xiuyuan）
