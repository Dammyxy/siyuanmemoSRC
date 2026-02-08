# 修复重复卡片问题

## 问题根源

当用户"重置闪卡"（取消 + 重新制作）时：

1. **取消闪卡**：
   - 从本地存储删除卡片（旧 ID：`old-card-id`）
   - 从块属性中删除 `custom-fsrs-card-id`

2. **重新制作闪卡**：
   - 创建新卡片（新 ID：`new-card-id`，`due = Date.now()`）
   - 设置块属性 `custom-fsrs-card-id = new-card-id`

3. **HybridSyncService 同步**：
   - 从 Riff 获取旧卡片（`old-card-id`）
   - 检查本地是否有 `old-card-id`：没有
   - **添加旧卡片到本地**（使用 Riff 的旧数据，`due = 旧时间`）

4. **结果**：
   - 本地有两张卡片：`new-card-id`（正确）和 `old-card-id`（重复）
   - `old-card-id` 的 `due` 是旧时间（可能是未来）
   - 提取练习队列可能显示 `old-card-id`（如果它的 `due` 更早）

## 解决方案

### 方案 1：基于 blockId 去重（推荐）

在 `incrementalSync()` 中，检查是否已经有相同 `blockId` 的卡片：

```typescript
for (const riffCard of filtered) {
    const localCard = this.storage.getCard(riffCard.id);
    
    if (!localCard) {
        // 检查是否有相同 blockId 的卡片
        const existingCardWithSameBlock = this.storage.getAllCards()
            .find(c => c.blockId === riffCard.id);
        
        if (existingCardWithSameBlock) {
            // 本地已有相同块的卡片，跳过（保留本地数据）
            console.log(`[HybridSync] Skipping ${riffCard.id}: block already has card ${existingCardWithSameBlock.id}`);
            skippedCount++;
            continue;
        }
        
        // 本地没有，添加新卡片
        const fsrsCard = this.convertRiffCardToFSRSCard(riffCard);
        this.storage.setCard(fsrsCard);
        addedCards.push(riffCard);
        addedCount++;
    } else {
        // 本地已存在，跳过（保留本地数据）
        skippedCount++;
    }
}
```

### 方案 2：清理重复卡片（临时修复）

运行以下代码清理重复卡片：

```javascript
// 获取插件实例
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');

// 获取所有卡片
const allCards = plugin.storage.getAllCards();
console.log(`总共 ${allCards.length} 张卡片`);

// 按 blockId 分组
const cardsByBlock = new Map();
for (const card of allCards) {
    if (!cardsByBlock.has(card.blockId)) {
        cardsByBlock.set(card.blockId, []);
    }
    cardsByBlock.get(card.blockId).push(card);
}

// 找出重复的块
const duplicates = [];
for (const [blockId, cards] of cardsByBlock.entries()) {
    if (cards.length > 1) {
        duplicates.push({ blockId, cards });
    }
}

console.log(`找到 ${duplicates.length} 个重复的块`);

// 对于每个重复的块，保留最新的卡片（createdAt 最大）
let removedCount = 0;
for (const { blockId, cards } of duplicates) {
    // 按 createdAt 排序，保留最新的
    cards.sort((a, b) => b.createdAt - a.createdAt);
    const keepCard = cards[0];
    const removeCards = cards.slice(1);
    
    console.log(`块 ${blockId}:`);
    console.log(`  保留: ${keepCard.id} (created: ${new Date(keepCard.createdAt).toISOString()})`);
    
    for (const card of removeCards) {
        console.log(`  删除: ${card.id} (created: ${new Date(card.createdAt).toISOString()})`);
        plugin.storage.removeCard(card.id);
        removedCount++;
    }
}

// 保存
if (removedCount > 0) {
    await plugin.storage.saveCards();
    console.log(`✅ 已删除 ${removedCount} 张重复卡片`);
} else {
    console.log('没有重复卡片');
}
```

### 方案 3：禁用 Riff 同步（如果不需要）

如果你不需要 Riff 同步，可以在设置中禁用：

1. 打开插件设置
2. 找到 "Riff Integration" 部分
3. 将 "Mode" 设置为 "simple"
4. 或者禁用 "Incremental Sync"

## 推荐操作步骤

1. **立即修复**：运行方案 2 的代码清理重复卡片
2. **长期修复**：实施方案 1，修改 `HybridSyncService.incrementalSync()` 方法
3. **可选**：如果不需要 Riff 同步，使用方案 3 禁用

## 验证

修复后，运行以下代码验证：

```javascript
const plugin = window.siyuan.ws.app.plugins.find(p => p.name === 'siyuan-plugin-fsrs');
const allCards = plugin.storage.getAllCards();

// 按 blockId 分组
const cardsByBlock = new Map();
for (const card of allCards) {
    if (!cardsByBlock.has(card.blockId)) {
        cardsByBlock.set(card.blockId, []);
    }
    cardsByBlock.get(card.blockId).push(card);
}

// 检查重复
let duplicateCount = 0;
for (const [blockId, cards] of cardsByBlock.entries()) {
    if (cards.length > 1) {
        console.log(`⚠️ 块 ${blockId} 有 ${cards.length} 张卡片:`, cards.map(c => c.id));
        duplicateCount++;
    }
}

if (duplicateCount === 0) {
    console.log('✅ 没有重复卡片');
} else {
    console.log(`❌ 还有 ${duplicateCount} 个重复的块`);
}
```
