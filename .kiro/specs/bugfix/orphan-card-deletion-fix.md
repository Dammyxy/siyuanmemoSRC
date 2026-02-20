# 卡片删除持久化修复

## 问题描述

删除卡片后，数据没有真正保存到磁盘。删除前后的卡片数量都是 64，说明删除操作被覆盖了。

### 症状

1. 删除单个卡片：删除前 64 张，删除后还是 64 张
2. 批量删除 11 张卡片：只成功删除 6 张（有 Xiuyuan 的），5 张孤儿卡片失败
3. 日志显示删除操作执行了，但最终保存的数据没有变化

## 根本原因

### 1. 保存延迟问题

`UnifiedStorageManager` 使用防抖机制保存数据：
- `SAVE_DELAY = 1000` (1 秒延迟)
- 删除操作调用 `storage.deleteCard()` 后，会触发 `scheduleSave()`
- `scheduleSave()` 会等待 1 秒后才真正保存

### 2. 增量同步覆盖

在 1 秒延迟期间，系统触发了增量同步：
```
[SiYuanMemo][CardBrowser] 删除卡片后清除缓存
[RiffSync] Waiting for Riff API to update...
[RiffSync] Triggering incremental sync...
[SiYuanMemo][HybridSync] Starting incremental sync...
```

增量同步可能重新加载了 Riff 的数据，覆盖了内存中的删除操作，导致删除失败。

### 3. 时序问题

```
时间线：
T0: 删除卡片 -> storage.deleteCard() -> scheduleSave(1秒后)
T0.1: 增量同步开始 -> 重新加载数据 -> 覆盖内存中的删除
T1: scheduleSave 触发 -> 保存被覆盖后的数据（删除丢失）
```

## 解决方案

在 `XiuyuanRepository.save()` 方法中，删除卡片后**立即保存**，不等待防抖延迟。

### 修改内容

**文件**: `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

```typescript
// 3.2 删除已移除的卡片
for (const cardToDelete of cardsToDelete) {
  await this.storage.deleteCard(cardToDelete.id);
}

// 3.3 保存/更新当前卡片
for (const card of cards) {
  const fsrsCard = this.cardToFSRSCard(card, xiuyuan);
  const existingCard = this.storage.getCard(card.getId().getValue());
  
  if (existingCard) {
    await this.storage.updateCard(fsrsCard);
  } else {
    await this.storage.createCard(persistenceModel, fsrsCard);
  }
}

// 4. 🔧 立即保存（删除操作需要立即持久化，避免被后续操作覆盖）
if (cardsToDelete.length > 0) {
  console.log(`[XiuyuanRepository] Deleted ${cardsToDelete.length} cards, forcing immediate save`);
  const saveResult = await this.storage.save();
  if (!saveResult.ok) {
    console.error('[XiuyuanRepository] Failed to save after deletion:', saveResult.error);
    return saveResult;
  }
}
```

### 关键改进

1. **条件判断**: 只有在真正删除了卡片时才立即保存
2. **错误处理**: 如果保存失败，返回错误而不是继续
3. **日志记录**: 记录删除的卡片数量，便于调试

## 完整的删除流程

现在删除流程包含 4 个关键步骤：

1. ✅ **删除卡片（Card）**
   - `Xiuyuan.deleteCard()` 从聚合根中删除
   - `storage.deleteCard()` 从存储中删除
   - 清理索引（blockID mapping）

2. ✅ **删除 Xiuyuan 聚合根**（如果是最后一张卡片）
   - `UnifiedStorageManager.deleteCard()` 自动检查
   - 如果 Xiuyuan 没有其他卡片，自动删除

3. ✅ **删除 mapping**（blockId -> xiuyuanId）
   - `updateIndexesForCard('remove')` 清理 blockID 索引
   - 如果索引为空，删除整个 mapping

4. ✅ **删除 Riff 的闪卡**
   - `RiffSyncEventHandler` 监听 `CardDeletedEvent`
   - 调用 `syncService.deleteSync()` 删除 Riff 卡片

5. ✅ **立即保存到磁盘**
   - 不等待防抖延迟
   - 避免被后续操作覆盖

## 优势

1. **数据一致性**: 删除操作立即持久化，不会丢失
2. **防止覆盖**: 避免被增量同步等操作覆盖
3. **性能优化**: 只在真正删除时才立即保存，其他操作仍使用防抖
4. **错误处理**: 保存失败时能够及时发现并返回错误

## 测试建议

1. **单个卡片删除**: 验证删除后数据立即保存
2. **批量删除**: 验证多个卡片同时删除
3. **并发操作**: 删除的同时触发增量同步，验证不会被覆盖
4. **空 Xiuyuan**: 验证删除最后一张卡片时，Xiuyuan 也被删除
5. **Riff 同步**: 验证 Riff 中的卡片也被删除

## 状态

✅ 已实现
⏳ 待测试

