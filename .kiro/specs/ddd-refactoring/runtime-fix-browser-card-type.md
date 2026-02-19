# Runtime Fix: BrowserApplicationService Card Type Error

## 问题分析

### 错误日志
```
[SiYuanMemo][SRSBrowser] ❌ Failed to load cards via browserService:
```

### 根本原因

发现了两个类型定义问题：

1. **未定义的 Card 类型**：在 `GetBrowserCardsQueryHandler.ts` 中使用了未定义的 `Card` 类型，应该使用 `FSRSCard`
2. **CardState 枚举不一致**：`src/types/card.ts` 中的 `CardState` 枚举缺少 `Suspended = 4` 状态，但在 `CardScheduleService.ts` 和其他地方都有使用

### DDD 架构审视

这是**类型定义错误**，不是架构问题：

1. ✅ **应用层职责正确**：`GetBrowserCardsQueryHandler` 作为查询处理器，协调领域服务
2. ✅ **依赖方向正确**：应用层 → 领域层 → 基础设施层
3. ❌ **类型定义不一致**：
   - 应该使用 `FSRSCard` 而不是 `Card`
   - `CardState` 枚举定义不完整

### 修复策略

**直接修复类型定义**，无需重构架构：

1. 将所有 `Card` 类型替换为 `FSRSCard`
2. 在 `src/types/card.ts` 中添加 `CardState.Suspended = 4`
3. 使用 `CardState.Suspended` 而不是硬编码的 `4`
4. 验证运行时行为

## 修复实施

### 文件 1：`src/types/card.ts`

```typescript
// ✅ 修复：添加 Suspended 状态
/** 卡片状态 */
export enum CardState {
    New = 0,        // 新卡片
    Learning = 1,   // 学习中
    Review = 2,     // 复习阶段
    Relearning = 3, // 重新学习
    Suspended = 4,  // 暂停
}
```

### 文件 2：`src/application/queries/browser/GetBrowserCardsQueryHandler.ts`

#### 修复 1：移除未使用的导入

```typescript
// ✅ 修复：移除 ATTR_CARD_ID（未使用）
import { sql } from '@/core/siyuan/api';
import {
  ATTR_PRIORITY,
  ATTR_SUSPENDED,
  ATTR_CARD_TYPE,
  ATTR_A_FACTOR,
} from '@/core/siyuan/block';
```

#### 修复 2：使用 FSRSCard 类型

```typescript
// ✅ 修复：使用 FSRSCard 类型
private applyPresetFilter(cards: FSRSCard[], preset?: PresetFilter): FSRSCard[] {
  if (!preset || preset === 'all') {
    return cards;
  }
  
  switch (preset) {
    case 'due':
      return this.cardScheduleService.filterDueCards(cards);
      
    case 'new':
      return this.cardFilterService.filterByStates(cards, [CardState.New]);
      
    case 'learning':
      return this.cardFilterService.filterByStates(cards, [CardState.Learning]);
      
    case 'review':
      return this.cardFilterService.filterByStates(cards, [CardState.Review]);
      
    case 'suspended':
      // ✅ 使用 CardState.Suspended 而不是硬编码的 4
      return cards.filter(card => {
        return card.state === CardState.Suspended;
      });
      
    default:
      return cards;
  }
}

private calculateStats(cards: FSRSCard[]): BrowserStats {
  return {
    totalCards: cards.length,
    dueCards: this.cardScheduleService.countDueCards(cards),
    newCards: this.cardFilterService.countByState(cards, CardState.New),
    learningCards: this.cardFilterService.countByState(cards, CardState.Learning),
    reviewCards: this.cardFilterService.countByState(cards, CardState.Review),
    // ✅ 使用 CardState.Suspended 而不是 4 as CardState
    suspendedCards: this.cardFilterService.countByState(cards, CardState.Suspended),
  };
}

private async transformToBrowserCards(cards: FSRSCard[]): Promise<BrowserCard[]> {
  if (cards.length === 0) {
    return [];
  }
  
  const blockIds = cards.map(c => c.blockId);
  const { attrsMap, rootIdMap, tagsMap, contentMap } = await this.fetchBlockInfoBatched(blockIds);
  
  return cards.map(card => {
    const customAttrs = attrsMap.get(card.blockId) || {};
    const browserCard = this.transformFSRSCard(card, customAttrs);
    browserCard.rootId = rootIdMap.get(card.blockId) || '';
    browserCard.tags = tagsMap.get(card.blockId) || [];
    
    const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
    const dbContent = contentMap.get(card.blockId);
    if (!currentContent && dbContent) {
      browserCard.fullContent = dbContent;
      browserCard.content = truncateContent(dbContent, 100);
    }
    
    return browserCard;
  });
}

private transformFSRSCard(card: FSRSCard, customAttrs: Record<string, string>): BrowserCard {
  const now = Date.now();
  const MS_PER_DAY = 86400000;
  
  const elapsedDays = card.lastReview 
    ? Math.floor((now - card.lastReview) / MS_PER_DAY)
    : 0;
  
  const retrievability = calculateRetrievability(card.stability, elapsedDays);
  const state = card.state as CardState;
  
  const dueDate = new Date(card.due);
  const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
  
  const dueFormatted = formatDueDate(dueDate);
  const lastReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
  const firstReviewFormatted = lastReviewDate ? formatHistoryDate(lastReviewDate) : '';
  
  const fullContent = (card.meta?.content as string) || '';
  const content = truncateContent(fullContent, 100);
  
  const deckId = (card.meta?.deckId as string) || '';
  const rootId = (card.meta?.rootId as string) || '';
  
  const cardType = card.type as 'topic' | 'item' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | undefined;
  const finalCardType = (customAttrs[ATTR_CARD_TYPE] as any) || cardType;
  
  return {
    id: card.id,
    fsrsCardId: card.id,
    blockId: card.blockId,
    deckId,
    rootId,
    content,
    fullContent,
    
    state,
    stateLabel: STATE_LABELS[state] || '未知',
    due: dueDate,
    dueFormatted,
    stability: card.stability,
    difficulty: card.difficulty,
    retrievability,
    reps: card.reps,
    lapses: card.lapses,
    elapsedDays,
    scheduledDays: card.scheduledDays || 0,
    lastReview: lastReviewDate,
    lastReviewFormatted,
    
    interval: card.scheduledDays || 0,
    firstReview: lastReviewDate,
    firstReviewFormatted,
    
    priority: parseInt(customAttrs[ATTR_PRIORITY] || '50') || 50,
    suspended: customAttrs[ATTR_SUSPENDED] === 'true',
    
    cardType: finalCardType,
    aFactor: parseFloat(customAttrs[ATTR_A_FACTOR] || '') || undefined,
    
    tags: [],
    meta: card.meta,
  };
}
```

## DDD 架构符合性

### ✅ 符合 DDD 原则

1. **应用层职责**：查询处理器协调领域服务，不包含业务逻辑
2. **依赖注入**：通过构造函数注入领域服务
3. **数据转换**：将领域对象（FSRSCard）转换为 DTO（BrowserCard）
4. **批量查询优化**：使用 SQL 批量获取块信息，减少数据库查询次数
5. **类型安全**：使用枚举而不是魔法数字

### 修复类型

- **类型修复**：将 `Card` 替换为 `FSRSCard`，添加 `CardState.Suspended`
- **无架构变更**：不涉及层次结构或职责调整
- **向后兼容**：不影响现有 API 和调用方
- **类型安全提升**：使用枚举值而不是硬编码数字

## 验证清单

- [x] 修复所有 `Card` 类型为 `FSRSCard`
- [x] 添加 `CardState.Suspended = 4` 到枚举定义
- [x] 使用 `CardState.Suspended` 替换硬编码的 `4`
- [x] 移除未使用的导入 `ATTR_CARD_ID`
- [x] 运行 TypeScript 编译检查（无错误）
- [ ] 测试浏览器加载功能
- [ ] 验证队列模式和非队列模式
- [ ] 检查控制台无错误日志

## 总结

这是一个类型定义不一致的问题，涉及两个修复：

1. **FSRSCard 类型**：将未定义的 `Card` 类型替换为 `FSRSCard`
2. **CardState 枚举**：在 `src/types/card.ts` 中添加缺失的 `Suspended = 4` 状态

修复后，`GetBrowserCardsQueryHandler` 将正确使用类型安全的枚举值，符合 DDD 架构设计。这个修复不涉及架构变更，只是修正了类型定义的不一致性。

