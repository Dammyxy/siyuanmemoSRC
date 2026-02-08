# 空白卡片问题修复

## 问题描述
浏览器显示 34 张空白卡片，虽然 `getAllCards()` 返回 79 张卡片，但只有 45 个有效块 ID。

## 根本原因
本地存储（`cards.msgpack`）中有 34 张卡片的 `blockId` 无效（空、undefined 或 'undefined' 字符串）。这些卡片可能是：
- 旧版本数据迁移遗留
- 块已被删除但卡片数据未清理
- 数据损坏

## 修复方案
在 `AdvancedDataRouter.getCards()` 中添加过滤逻辑，过滤掉 `blockId` 无效的卡片。

### 修改文件
- `siyuan-plugin-fsrs/src/routers/AdvancedDataRouter.ts`

### 修改内容
```typescript
async getCards(filter?: CardFilter): Promise<FSRSCard[]> {
    // 获取所有卡片
    let cards = this.storage.getAllCards();
    
    // 过滤掉 blockId 无效的卡片
    const invalidCards = cards.filter(card => !card.blockId || card.blockId === 'undefined');
    if (invalidCards.length > 0) {
        console.warn(`[AdvancedDataRouter] ⚠️ Filtering out ${invalidCards.length} cards with invalid blockId`);
        cards = cards.filter(card => card.blockId && card.blockId !== 'undefined');
    }
    
    // 应用过滤器
    if (filter) {
        cards = this.applyFilter(cards, filter);
    }
    
    return cards;
}
```

## 测试步骤
1. 重新加载插件
2. 点击检索练习队列
3. 确认浏览器只显示有效卡片（45 张）
4. 确认控制台显示过滤日志：`Filtering out 34 cards with invalid blockId`

## 预期结果
- ✅ 浏览器只显示 45 张有效卡片
- ✅ 没有空白行
- ✅ 所有卡片都能正常显示内容
- ✅ 控制台有清晰的过滤日志

## 后续建议
可选：在 `StorageManager.loadCards()` 中也添加类似的过滤逻辑，防止加载时就过滤掉无效卡片，避免它们进入内存。
