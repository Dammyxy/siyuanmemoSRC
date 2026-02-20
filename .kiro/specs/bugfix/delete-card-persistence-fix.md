# 修复删除卡片不持久化问题

## 问题描述

用户删除一个块已经被删除的卡片时，虽然操作显示成功，但刷新后卡片又回来了。

### 错误信息

```
Failed to write block attributes: Error: Siyuan API Error: 未找到 ID 为 [20260217123311-hg6vmym] 的内容块
```

## 根本原因分析

### 问题 1：块属性写入失败导致的误导性错误

在 `XiuyuanRepository.save()` 中，当块不存在时，会抛出错误并显示警告信息。虽然这个错误被捕获了，但会让用户误以为删除操作失败了。

### 问题 2：删除的卡片没有从 UnifiedStorageManager 中移除（核心问题）

在 `XiuyuanRepository.save()` 方法中，只保存了 `xiuyuan.getCards()` 返回的卡片。当一个卡片被删除时：

1. `Xiuyuan.deleteCard()` 从 `cards` Map 中移除卡片
2. `XiuyuanRepository.save()` 被调用
3. `save()` 方法遍历 `xiuyuan.getCards()`（已删除的卡片不在列表中）
4. 只更新/创建现有卡片，但不删除已移除的卡片
5. 已删除的卡片仍然存在于 `UnifiedStorageManager.cards` Map 中
6. 刷新后，卡片又回来了

## 解决方案

### 修复 1：优化块属性写入的错误处理

在 `XiuyuanRepository.save()` 中，将块不存在的情况改为 `console.debug`，避免误导用户：

```typescript
catch (error) {
  const errorMsg = error instanceof Error ? error.message : String(error);
  if (errorMsg.includes('未找到') || errorMsg.includes('not found')) {
    // 块不存在，这是正常情况（用户可能删除了块）
    console.debug(`[XiuyuanRepository] Block ${representativeBlockId} not found, skipping attribute write`);
  } else {
    // 其他错误，记录警告
    console.warn('[XiuyuanRepository] Failed to write block attributes:', error);
  }
}
```

### 修复 2：在 save() 方法中同步删除已移除的卡片

修改 `XiuyuanRepository.save()` 方法，在保存卡片之前，先检测哪些卡片被删除了，并从 `UnifiedStorageManager` 中删除它们：

```typescript
// 3. 同步卡片状态：保存现有卡片，删除已移除的卡片
const cards = xiuyuan.getCards();
const currentCardIds = new Set(cards.map(card => card.getId().getValue()));

// 3.1 查找需要删除的卡片（存在于 storage 但不在 xiuyuan 中）
const allStorageCards = this.storage.getAllCards();
const cardsToDelete = allStorageCards.filter(
  storageCard => storageCard.xiuyuanID === xiuyuanId && !currentCardIds.has(storageCard.id)
);

// 3.2 删除已移除的卡片
for (const cardToDelete of cardsToDelete) {
  await this.storage.deleteCard(cardToDelete.id);
}

// 3.3 保存/更新当前卡片
for (const card of cards) {
  const fsrsCard = this.cardToFSRSCard(card, xiuyuan);
  const existingCard = this.storage.getCard(card.getId().getValue());
  
  if (existingCard) {
    // 更新现有卡片
    await this.storage.updateCard(fsrsCard);
  } else {
    // 创建新卡片
    await this.storage.createCard(persistenceModel, fsrsCard);
  }
}
```

## 实施步骤

1. ✅ 修改 `XiuyuanRepository.save()` 中的错误处理逻辑
2. ✅ 在 `save()` 方法中添加卡片删除同步逻辑
3. ✅ 构建项目，确保没有错误

## 测试验证

### 测试场景

1. 创建一个卡片
2. 删除卡片对应的块
3. 删除卡片
4. 刷新页面
5. 验证卡片是否真的被删除了

### 预期结果

- 删除操作成功
- 刷新后卡片不再出现
- 不显示误导性的错误信息

## 架构影响

### 符合 DDD 原则

- ✅ 聚合根一致性：Xiuyuan 聚合根管理 Card 的生命周期
- ✅ Repository 职责：Repository 负责将领域模型的变化同步到持久化层
- ✅ 事务边界：删除操作在 Repository.save() 中完成，保证一致性

### 不引入技术债务

- ✅ 没有破坏封装
- ✅ 没有绕过 Repository
- ✅ 使用标准的 DDD 模式

## 相关文件

- `src/core/xiuyuan/infrastructure/XiuyuanRepository.ts` - 修改 save() 方法
- `src/application/usecases/card/DeleteCardUseCase.ts` - 删除用例
- `src/core/xiuyuan/domain/Xiuyuan.ts` - Xiuyuan 聚合根

## 总结

通过在 `XiuyuanRepository.save()` 方法中添加卡片删除同步逻辑，确保当卡片从 Xiuyuan 聚合根中删除时，也会从 `UnifiedStorageManager` 中删除。这样就解决了删除操作不持久化的问题。

同时，优化了块属性写入失败的错误处理，避免误导用户。
