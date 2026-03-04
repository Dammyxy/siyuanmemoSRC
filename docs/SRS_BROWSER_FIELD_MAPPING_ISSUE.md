# SRS浏览器字段映射问题诊断

## 问题描述

用户反馈SRS浏览器表格视图中多个字段显示异常：

1. **Intrv（间隔）** - 所有卡片都没有显示
2. **LastRep/NextRep/FirstRep（复习时间）** - 显示"已过期 X 天"而不是具体日期
3. **Retr/Diff/Stab（可提取性/难度/稳定性）** - 都没有数值显示

## 根本原因分析

### 1. 数据源差异

系统中存在两套数据转换逻辑：

#### A. `browserService.ts` 的 `transformRiffBlock`
```typescript
// ✅ 正确的映射
interval: scheduledDays,              // 间隔天数
lastReview: parseSiyuanTime(...),     // Date 对象
firstReview: lastReview,              // Date 对象
stability: riffCard.stability ?? 0,   // 数值
difficulty: riffCard.difficulty ?? 0, // 数值
retrievability: calculateRetrievability(...) // 计算值
```

#### B. `RetrievalDataSource.ts` 的 `convertToBrowserCard`
```typescript
// ❌ 问题映射
interval: card.scheduledDays,         // ✅ 正确
lastReview: new Date(card.lastReview), // ⚠️ card.lastReview 是时间戳(number)
firstReview: lastReviewDate,          // ❌ 错误：应该是首次复习，不是最后一次
stability: card.stability,            // ✅ 正确
difficulty: card.difficulty,          // ✅ 正确
retrievability: calculateRetrievability(...) // ✅ 正确
```

### 2. FSRSCard 类型定义

```typescript
export interface FSRSCard {
    due: number;          // ⚠️ 时间戳 (ms)
    lastReview: number;   // ⚠️ 时间戳 (ms)
    scheduledDays: number; // ✅ 天数
    stability: number;    // ✅ 稳定性
    difficulty: number;   // ✅ 难度
    // ❌ 缺少 firstReview 字段
}
```

### 3. 日期格式化问题

`formatDate` 函数的逻辑：
```typescript
export function formatDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString(...)}`;
    } else if (diffDays === 1) {
        return `明天 ${date.toLocaleTimeString(...)}`;
    } else if (diffDays === -1) {
        return `昨天`;
    } else if (diffDays < -1) {
        return `已过期 ${Math.abs(diffDays)} 天`; // ⚠️ 这里导致显示"已过期"
    }

    return date.toLocaleDateString(...);
}
```

**问题**：当 `lastReview` 是过去的日期时，`diffDays < -1`，所以显示"已过期 X 天"。

## 具体问题

### 问题 1: Intrv 没有显示

**可能原因**：
- `card.scheduledDays` 为 0 或 undefined
- 列定义中的 `valueFormatter` 逻辑：`params.value > 0 ? ... : '-'`

**检查点**：
- FSRSCard 的 `scheduledDays` 字段是否正确填充
- 新卡片的 `scheduledDays` 默认值是否为 0

### 问题 2: LastRep/FirstRep 显示"已过期 X 天"

**根本原因**：
- `formatDate` 函数将过去的日期格式化为"已过期 X 天"
- 这个逻辑是为 `NextRep`（到期时间）设计的，不适用于 `LastRep`（历史时间）

**解决方案**：
- 需要区分"到期时间"和"历史时间"的格式化逻辑
- `LastRep` 和 `FirstRep` 应该显示具体日期，不应该显示"已过期"

### 问题 3: Retr/Diff/Stab 没有数值

**可能原因**：
- FSRSCard 的这些字段为 0 或 undefined
- 新卡片的默认值问题
- 数据同步问题（Riff ↔ UnifiedDataSourceManager）

**检查点**：
- 查看实际的 FSRSCard 数据
- 检查 `createDefaultCard` 的默认值
- 检查数据同步逻辑

### 问题 4: FirstRep 映射错误

**当前实现**：
```typescript
firstReview: lastReviewDate,  // ❌ 错误：这是最后一次复习
```

**正确实现**：
- FSRSCard 应该有独立的 `firstReview` 字段
- 或者从 `createdAt` 推算
- 或者从历史记录中获取

## 修复方案

### 方案 1: 修复日期格式化逻辑

创建两个不同的格式化函数：

```typescript
/** 格式化到期时间（未来时间，可以显示"已过期"） */
export function formatDueDate(date: Date | null | undefined): string {
    if (!date) return '-';
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `明天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === -1) {
        return `昨天`;
    } else if (diffDays < -1) {
        return `已过期 ${Math.abs(diffDays)} 天`;
    }

    return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/** 格式化历史时间（过去时间，显示具体日期） */
export function formatHistoryDate(date: Date | null | undefined): string {
    if (!date) return '-';
    
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const diffDays = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
        return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }

    // 显示具体日期
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
```

### 方案 2: 修复 RetrievalDataSource 的字段映射

```typescript
private convertToBrowserCard(card: FSRSCard): BrowserCard {
    const now = Date.now();
    const elapsedDays = card.lastReview 
      ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
      : 0;
    const retrievability = calculateRetrievability(card.stability, elapsedDays);
    const state = this.convertCardState(card.state);
    
    // ✅ 修复：正确处理时间戳
    const dueDate = new Date(card.due);
    const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
    
    // ✅ 修复：首次复习应该从 createdAt 或历史记录获取
    const firstReviewDate = card.createdAt ? new Date(card.createdAt) : null;
    
    const fullContent = (card.meta?.content as string) || '';
    const content = truncateContent(fullContent, 100);
    const deckId = (card.meta?.deckId as string) || '';
    
    let cardType: 'topic' | 'item' | 'incremental' | 'webpage' | undefined;
    if (typeof card.type === 'string') {
      cardType = card.type as any;
    }
    
    return {
      id: card.riffCardId || card.id,
      fsrsCardId: card.id,
      blockId: card.blockId,
      deckId,
      content,
      fullContent,
      rootId: (card.meta?.rootId as string) || '',
      state,
      stateLabel: this.getStateLabel(state),
      
      // ✅ 到期时间使用 formatDueDate
      due: dueDate,
      dueFormatted: formatDueDate(dueDate),
      
      // ✅ FSRS 参数
      stability: card.stability || 0,
      difficulty: card.difficulty || 0,
      retrievability: retrievability || 0,
      reps: card.reps || 0,
      lapses: card.lapses || 0,
      elapsedDays,
      scheduledDays: card.scheduledDays || 0,
      
      // ✅ 历史时间使用 formatHistoryDate
      lastReview: lastReviewDate,
      lastReviewFormatted: formatHistoryDate(lastReviewDate),
      
      // ✅ 间隔天数
      interval: card.scheduledDays || 0,
      
      // ✅ 首次复习
      firstReview: firstReviewDate,
      firstReviewFormatted: formatHistoryDate(firstReviewDate),
      
      priority: card.priority || 50,
      suspended: (card.meta?.suspended as boolean) || false,
      tags: card.tags || [],
      note: (card.meta?.note as string) || '',
      cardType,
      aFactor: card.aFactor,
    };
}
```

### 方案 3: 检查数据源

需要确认 UnifiedDataSourceManager 返回的 FSRSCard 数据是否完整：

```typescript
// 在 RetrievalDataSource.fetchRows 中添加调试日志
async fetchRows(params: { sortModel: SortModel[]; filterModel: any }): Promise<{ rows: BrowserCard[]; totalCount: number }> {
    try {
      const queue = this.manager.getQueue(QueueType.RetrievalPractice);
      const cards = await queue.getCards();
      
      // 🔍 调试：检查第一张卡片的数据
      if (cards.length > 0) {
        console.log('[RetrievalDataSource] Sample card data:', {
          id: cards[0].id,
          blockId: cards[0].blockId,
          scheduledDays: cards[0].scheduledDays,
          stability: cards[0].stability,
          difficulty: cards[0].difficulty,
          lastReview: cards[0].lastReview,
          due: cards[0].due,
          reps: cards[0].reps,
        });
      }
      
      const browserCards = cards.map(card => this.convertToBrowserCard(card));
      
      // 🔍 调试：检查转换后的数据
      if (browserCards.length > 0) {
        console.log('[RetrievalDataSource] Sample browser card:', {
          blockId: browserCards[0].blockId,
          interval: browserCards[0].interval,
          stability: browserCards[0].stability,
          difficulty: browserCards[0].difficulty,
          retrievability: browserCards[0].retrievability,
          lastReviewFormatted: browserCards[0].lastReviewFormatted,
          dueFormatted: browserCards[0].dueFormatted,
        });
      }
      
      const filtered = this.applyFilters(browserCards);
      const sorted = applySort(filtered, params?.sortModel || []);
      
      return { rows: sorted, totalCount: sorted.length };
    } catch (error) {
      console.error('[RetrievalDataSource] Failed to fetch rows:', error);
      throw error;
    }
}
```

## 优先级

1. **高优先级**：修复日期格式化逻辑（方案 1）
2. **高优先级**：修复 RetrievalDataSource 的字段映射（方案 2）
3. **中优先级**：添加调试日志，确认数据源（方案 3）
4. **低优先级**：在 FSRSCard 中添加 `firstReview` 字段

## 下一步

1. 先添加调试日志，确认数据源是否正确
2. 实现两个不同的日期格式化函数
3. 修复 RetrievalDataSource 的字段映射
4. 测试验证修复效果
