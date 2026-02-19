# 手动添加卡片 - SuperMemo 风格实现

## 问题背景

在提取练习队列中，手动添加的卡片在评分后会被移除，即使评分为 2（困难）。这是因为：

1. 手动添加的卡片可能原本到期时间在未来
2. 评分后，FSRS 调度器计算新的到期时间（仍在未来）
3. `shouldRemoveFromQueue` 判断 `dueAfterDayEnd: true`，触发移除

## 解决方案调研

### SuperMemo 的 "Add to outstanding"

根据 SuperMemo 官方文档（`H:\project-F\flashcard\资料\supermemo\Add to outstanding - SuperMemo Help.md` 和 `Subset operations - SuperMemo Help.md`）：

> "The elements are not physically rescheduled in the collection (i.e. the repetition date does not change, and if the review does not take place, the scheduling will remain unchanged on the next day). This is the only case in SuperMemo where an element is outstanding while possibly being scheduled for review on a date later than today."

**核心特点**：
- ❌ 不改变原有到期时间
- ✅ 允许未来到期的卡片出现在今天的队列
- ✅ 评分按 mid-interval repetition 处理
- ✅ 评分后从队列移除（同一天不能重复复习）

**添加条件**：
- element must be memorized（元素必须已记忆）
- element cannot have been reviewed earlier on the same day（同一天不能重复复习）
- the new position in the outstanding queue must be less than the old position（新位置必须小于旧位置）

**特殊选项**：
- **Add to outstanding**：不能添加今天已复习的元素
- **Add all to outstanding**：可以添加今天已复习的元素（允许同一天多次复习）

### Anki 的 Filtered Deck

Anki 提供两种模式：

1. **Reschedule 模式**（默认）：
   - 评分会改变卡片的到期时间
   - 新的到期时间影响原牌组
   
2. **Preview 模式**：
   - 评分不影响到期时间
   - 只是预览，不改变调度

## 实现方案

采用 **SuperMemo 的方式**，理由：

1. **符合"手动添加"语义**：用户手动添加是想"提前练习"，而不是"改变计划"
2. **保持调度完整性**：不破坏 FSRS 已经计算好的复习计划
3. **评分仍然有效**：按 mid-interval repetition 处理，影响记忆参数
4. **避免队列污染**：评分后立即移除，不会重复出现

## 代码实现

### 修改位置

`siyuan-plugin-siyuanmemo/src/queues/RetrievalPracticeQueue.ts`

### 核心逻辑

```typescript
/**
 * 判断卡片是否应该从队列移除
 * 
 * SuperMemo 风格的手动添加逻辑：
 * - 手动添加的卡片：评分后立即移除（已经提前练习过了）
 * - 普通到期卡片：按基类逻辑判断（due 超过今天或 scheduledDays >= 1）
 */
protected shouldRemoveFromQueue(card: FSRSCard): boolean {
    // 手动添加的卡片：评分后立即移除
    if (this.manuallyAddedCards.has(card.id)) {
        console.log(`[RetrievalPracticeQueue] shouldRemoveFromQueue: Card ${card.id} is manually added, will be removed after review`);
        return true;
    }
    
    // 普通卡片：使用基类逻辑
    return super.shouldRemoveFromQueue(card);
}
```

## 行为说明

### 手动添加卡片时

```typescript
public async addCard(card: FSRSCard | QueueItem | string): Promise<void> {
    const cardId = resolveCardId(card);
    
    // ✅ 不修改 due，保留原有到期时间
    this.manuallyAddedCards.add(cardId);
    await this.persistManuallyAddedCards();
}
```

### 获取队列卡片时

```typescript
public async getCards(): Promise<FSRSCard[]> {
    // 1. 获取到期的卡片（due <= dayEnd）
    const dueCards = await this.manager.getCards({
        cardType: 'item',
        dueDate: { lte: new Date(dayEnd) }
    });
    
    // 2. 获取手动添加的卡片（包括未来到期的）
    const manualCards = await this.getManuallyAddedCards();
    
    // 3. 合并并去重
    return this.mergeAndDeduplicate(dueCards, manualCards);
}
```

### 评分后的处理

```typescript
public async handleReview(cardId: string, rating: number): Promise<void> {
    // 1. 使用调度器更新卡片（mid-interval repetition）
    await this.handleReviewWithScheduler(cardId, rating);
    
    // 2. shouldRemoveFromQueue 判断：
    //    - 手动添加的卡片 → 立即移除（无论评分几）
    //    - 普通卡片 → 按基类逻辑（due 或 scheduledDays）
    
    // 3. 评分 < 3 时添加到最终训练
    if (rating < 3) {
        await finalDrillQueue.addCard(cardId, 'auto-failed');
    }
}
```

### 为什么评分后立即移除？

根据 SuperMemo 的设计：
- **条件**："element cannot have been reviewed earlier on the same day"
- **含义**：同一天不能重复复习同一个元素
- **实现**：评分后从 outstanding queue 移除
- **例外**："Add all to outstanding" 可以添加今天已复习的元素

我们的实现遵循 SuperMemo 的标准 "Add to outstanding" 行为：
- ✅ 评分后立即移除（无论评分 1/2/3/4）
- ✅ 同一天不能重复出现
- ✅ 如果用户想再次练习，可以再次手动添加

## 用户体验

### 场景 1：手动添加未来到期的卡片

```
1. 用户手动添加卡片 A（原本 3 天后到期）
2. 卡片 A 立即出现在提取练习队列
3. 用户评分 2（困难）
4. FSRS 更新记忆参数，但保持原定到期时间（3 天后）
5. 卡片 A 从队列移除（已经提前练习过了）
6. 3 天后，卡片 A 自动出现在队列（按原定计划）
```

### 场景 2：手动添加今天到期的卡片

```
1. 用户手动添加卡片 B（今天到期）
2. 卡片 B 出现在队列（可能已经在队列中）
3. 用户评分 4（简单）
4. FSRS 计算新的到期时间（例如 7 天后）
5. 卡片 B 从队列移除
6. 7 天后，卡片 B 自动出现在队列
```

## 优势

1. ✅ **保持原有计划**：手动添加不会打乱 FSRS 的复习计划
2. ✅ **提前复习有效**：评分会影响记忆参数（stability, difficulty）
3. ✅ **避免重复**：评分后立即移除，不会在同一天重复出现
4. ✅ **符合直觉**：手动添加 = 提前练习，而不是改变计划
5. ✅ **与 SuperMemo 一致**：采用成熟的间隔重复系统的设计理念

## 参考资料

- SuperMemo 文档：`H:\project-F\flashcard\资料\supermemo\Add to outstanding - SuperMemo Help.md`
- Anki 源码：`H:\project-F\flashcard\anki\rslib\src\decks\filtered.rs`
- Anki 源码：`H:\project-F\flashcard\anki\qt\aqt\filtered_deck.py`

## 修改日期

2026-02-14
