# 浏览器 DDD 化迁移方案

## 📋 问题分析

### 当前问题
1. **直接依赖基础设施层**：`DialogManager.openBrowserDialog()` 直接传递 `storage` 和 `scheduler` 给 Vue 组件
2. **跳过应用层**：浏览器服务 (`browserService.ts`) 直接使用 `UnifiedDataSourceManager` 和 `StorageManager`
3. **缺少应用服务**：没有 `BrowserApplicationService` 来封装浏览器相关的业务逻辑
4. **违反 DDD 分层**：表现层（Vue 组件）直接访问基础设施层

### 架构违规示例
```typescript
// ❌ 错误：DialogManager 直接传递基础设施层对象
openBrowserDialog(): void {
  const storage = this.context.getStorage();  // 基础设施层
  const scheduler = this.context.getScheduler();  // 基础设施层
  
  this.srsBrowserDialog = createVueDialog({
    props: {
      storage,      // 传递给表现层
      scheduler,    // 传递给表现层
    }
  });
}

// ❌ 错误：browserService 直接使用基础设施层
async function loadAllCardsRaw(
  unifiedDataSourceManager: UnifiedDataSourceManager,  // 基础设施层
  forceRefresh = false
): Promise<BrowserCard[]> {
  const router = unifiedDataSourceManager.getRouter();
  const fsrsCards = await router.getCards();
  // ...
}
```

## 🎯 DDD 化目标

### 正确的分层架构
```
表现层（SRSBrowser.vue）
    ↓ 调用
应用层（BrowserApplicationService）
    ↓ 使用
领域层（CardScheduleService, CardFilterService）
    ↓ 通过
基础设施层（StorageManager, UnifiedDataSourceManager）
```

### 核心原则
1. **表现层只调用应用服务**：Vue 组件不直接访问 Storage 或 Scheduler
2. **应用服务协调用例**：封装浏览器相关的查询和命令
3. **领域服务处理业务逻辑**：卡片过滤、排序、统计等
4. **查询与命令分离（CQRS）**：读操作用 Query，写操作用 Command

## 📐 设计方案

### 1. 应用层设计

#### 1.1 查询对象（Queries）

```typescript
// src/application/queries/browser/GetBrowserCardsQuery.ts
export interface GetBrowserCardsQuery {
  /** 搜索文本 */
  searchText?: string;
  /** 预设过滤器 */
  preset?: 'all' | 'due' | 'new' | 'learning' | 'review' | 'suspended';
  /** 卡片状态过滤 */
  states?: CardState[];
  /** 卡片类型过滤 */
  cardTypes?: string[];
  /** Deck ID 过滤 */
  deckIds?: string[];
  /** 标签过滤 */
  tags?: string[];
  /** 排序字段 */
  sortBy?: 'due' | 'created' | 'modified' | 'stability' | 'difficulty';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 分页：页码 */
  page?: number;
  /** 分页：每页数量 */
  pageSize?: number;
  /** 是否强制刷新 */
  forceRefresh?: boolean;
}

export interface GetBrowserCardsQueryResult {
  /** 卡片列表 */
  cards: BrowserCard[];
  /** 总数 */
  total: number;
  /** 当前页 */
  page: number;
  /** 每页数量 */
  pageSize: number;
  /** 统计信息 */
  stats: {
    totalCards: number;
    dueCards: number;
    newCards: number;
    learningCards: number;
    reviewCards: number;
    suspendedCards: number;
  };
}
```

#### 1.2 查询处理器（Query Handlers）

```typescript
// src/application/queries/browser/GetBrowserCardsQueryHandler.ts
export class GetBrowserCardsQueryHandler {
  constructor(
    private readonly storageManager: StorageManager,
    private readonly cardScheduleService: CardScheduleService,
    private readonly cardFilterService: CardFilterService,
    private readonly cardSortService: CardSortService
  ) {}
  
  async execute(query: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult> {
    // 1. 获取所有卡片（基础设施层）
    const allCards = this.storageManager.getAllCards();
    
    // 2. 应用预设过滤器（领域层）
    let filteredCards = this.applyPresetFilter(allCards, query.preset);
    
    // 3. 应用自定义过滤器（领域层）
    if (query.states?.length) {
      filteredCards = this.cardFilterService.filterByStates(filteredCards, query.states);
    }
    if (query.cardTypes?.length) {
      filteredCards = this.cardFilterService.filterByCardTypes(filteredCards, query.cardTypes);
    }
    if (query.searchText) {
      filteredCards = this.cardFilterService.filterBySearchText(filteredCards, query.searchText);
    }
    
    // 4. 排序（领域层）
    const sortedCards = this.cardSortService.sort(
      filteredCards,
      query.sortBy || 'due',
      query.sortOrder || 'asc'
    );
    
    // 5. 分页
    const page = query.page || 1;
    const pageSize = query.pageSize || 100;
    const startIndex = (page - 1) * pageSize;
    const paginatedCards = sortedCards.slice(startIndex, startIndex + pageSize);
    
    // 6. 计算统计信息（领域层）
    const stats = this.calculateStats(allCards);
    
    // 7. 转换为 BrowserCard 格式
    const browserCards = await this.transformToBrowserCards(paginatedCards);
    
    return {
      cards: browserCards,
      total: sortedCards.length,
      page,
      pageSize,
      stats,
    };
  }
  
  private applyPresetFilter(cards: FSRSCard[], preset?: string): FSRSCard[] {
    if (!preset || preset === 'all') return cards;
    
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
        return this.cardFilterService.filterByStates(cards, [CardState.Suspended]);
      default:
        return cards;
    }
  }
  
  private calculateStats(cards: FSRSCard[]) {
    return {
      totalCards: cards.length,
      dueCards: this.cardScheduleService.countDueCards(cards),
      newCards: this.cardFilterService.countByState(cards, CardState.New),
      learningCards: this.cardFilterService.countByState(cards, CardState.Learning),
      reviewCards: this.cardFilterService.countByState(cards, CardState.Review),
      suspendedCards: this.cardFilterService.countByState(cards, CardState.Suspended),
    };
  }
  
  private async transformToBrowserCards(cards: FSRSCard[]): Promise<BrowserCard[]> {
    // 批量获取块属性
    const blockIds = cards.map(c => c.blockId);
    const { attrsMap, rootIdMap, tagsMap, contentMap } = await this.fetchBlockInfoBatched(blockIds);
    
    // 转换为 BrowserCard
    return cards.map(card => {
      const customAttrs = attrsMap.get(card.blockId) || {};
      const browserCard = this.transformFSRSCard(card, customAttrs);
      browserCard.rootId = rootIdMap.get(card.blockId) || '';
      browserCard.tags = tagsMap.get(card.blockId) || [];
      
      // 处理文档块内容
      const currentContent = (browserCard.fullContent || '').replace(/[\s\u200B]/g, '');
      const dbContent = contentMap.get(card.blockId);
      if (!currentContent && dbContent) {
        browserCard.fullContent = dbContent;
        browserCard.content = truncateContent(dbContent, 100);
      }
      
      return browserCard;
    });
  }
}
```

#### 1.3 命令对象（Commands）

```typescript
// src/application/commands/browser/UpdateCardPriorityCommand.ts
export interface UpdateCardPriorityCommand {
  blockId: string;
  priority: number;
}

// src/application/commands/browser/SuspendCardsCommand.ts
export interface SuspendCardsCommand {
  blockIds: string[];
  suspended: boolean;
}

// src/application/commands/browser/DeleteCardsCommand.ts
export interface DeleteCardsCommand {
  blockIds: string[];
  deleteFromRiff?: boolean;
}
```

#### 1.4 应用服务（Application Service）

```typescript
// src/application/services/BrowserApplicationService.ts
export class BrowserApplicationService {
  private readonly getBrowserCardsQueryHandler: GetBrowserCardsQueryHandler;
  
  constructor(
    storageManager: StorageManager,
    cardScheduleService: CardScheduleService,
    cardFilterService: CardFilterService,
    cardSortService: CardSortService
  ) {
    this.getBrowserCardsQueryHandler = new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService,
      cardFilterService,
      cardSortService
    );
  }
  
  /**
   * 获取浏览器卡片列表
   */
  async getBrowserCards(query: GetBrowserCardsQuery): Promise<GetBrowserCardsQueryResult> {
    return this.getBrowserCardsQueryHandler.execute(query);
  }
  
  /**
   * 更新卡片优先级
   */
  async updateCardPriority(command: UpdateCardPriorityCommand): Promise<Result<void>> {
    // 委托给用例
    return this.updateCardPriorityUseCase.execute(command);
  }
  
  /**
   * 批量暂停/恢复卡片
   */
  async suspendCards(command: SuspendCardsCommand): Promise<Result<void>> {
    // 委托给用例
    return this.suspendCardsUseCase.execute(command);
  }
  
  /**
   * 批量删除卡片
   */
  async deleteCards(command: DeleteCardsCommand): Promise<Result<void>> {
    // 委托给用例
    return this.deleteCardsUseCase.execute(command);
  }
}
```

### 2. 领域层设计

#### 2.1 卡片过滤服务

```typescript
// src/core/card/domain/services/CardFilterService.ts
export class CardFilterService {
  /**
   * 按状态过滤卡片
   */
  filterByStates(cards: FSRSCard[], states: CardState[]): FSRSCard[] {
    const stateSet = new Set(states);
    return cards.filter(card => stateSet.has(card.state as CardState));
  }
  
  /**
   * 按卡片类型过滤
   */
  filterByCardTypes(cards: FSRSCard[], cardTypes: string[]): FSRSCard[] {
    const typeSet = new Set(cardTypes);
    return cards.filter(card => typeSet.has(card.type || ''));
  }
  
  /**
   * 按搜索文本过滤
   */
  filterBySearchText(cards: FSRSCard[], searchText: string): FSRSCard[] {
    const lowerSearch = searchText.toLowerCase();
    return cards.filter(card => {
      const content = (card.meta?.content as string || '').toLowerCase();
      return content.includes(lowerSearch);
    });
  }
  
  /**
   * 统计指定状态的卡片数量
   */
  countByState(cards: FSRSCard[], state: CardState): number {
    return cards.filter(card => card.state === state).length;
  }
}
```

#### 2.2 卡片排序服务

```typescript
// src/core/card/domain/services/CardSortService.ts
export class CardSortService {
  /**
   * 排序卡片
   */
  sort(
    cards: FSRSCard[],
    sortBy: 'due' | 'created' | 'modified' | 'stability' | 'difficulty',
    sortOrder: 'asc' | 'desc'
  ): FSRSCard[] {
    const sorted = [...cards];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'due':
          comparison = a.due - b.due;
          break;
        case 'stability':
          comparison = a.stability - b.stability;
          break;
        case 'difficulty':
          comparison = a.difficulty - b.difficulty;
          break;
        // ... 其他排序字段
      }
      
      return comparison * multiplier;
    });
    
    return sorted;
  }
}
```

### 3. 表现层改造

#### 3.1 DialogManager 改造

```typescript
// src/application/managers/DialogManager.ts
openBrowserDialog(): void {
  // ✅ 正确：只传递应用服务
  const browserService = this.context.getBrowserService();
  
  this.srsBrowserDialog = createVueDialog({
    dataKey: 'srs-browser-dialog',
    title: this.context.getI18n()?.srsBrowser || 'SRS 浏览器',
    component: SRSBrowser,
    props: {
      browserService,  // 只传递应用服务
      i18n: this.context.getI18n(),
    },
    events: {
      close: () => this.closeBrowserDialog(),
    },
    width: 'min(1200px, 96vw)',
    height: 'min(800px, 90vh)',
    onClose: () => {
      this.srsBrowserDialog = null;
    },
  });
}
```

#### 3.2 Vue 组件改造

```typescript
// src/ui/browser/SRSBrowser.vue
<script setup lang="ts">
import type { BrowserApplicationService } from '@/application/services/BrowserApplicationService';

const props = defineProps<{
  browserService: BrowserApplicationService;  // ✅ 只依赖应用服务
  i18n: Record<string, any>;
}>();

// 加载卡片
async function loadCards() {
  const result = await props.browserService.getBrowserCards({
    searchText: searchText.value,
    preset: currentPreset.value,
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
    page: currentPage.value,
    pageSize: pageSize.value,
  });
  
  cards.value = result.cards;
  totalCards.value = result.total;
  stats.value = result.stats;
}

// 更新优先级
async function updatePriority(blockId: string, priority: number) {
  const result = await props.browserService.updateCardPriority({
    blockId,
    priority,
  });
  
  if (result.ok) {
    // 刷新列表
    await loadCards();
  }
}
</script>
```

### 4. ApplicationContext 集成

```typescript
// src/application/ApplicationContext.ts
private initializeServiceContainer(): void {
  // ... 其他服务注册
  
  // 注册浏览器应用服务工厂
  this.registerServiceFactory('browserService', (context) => {
    // 创建领域服务
    const cardScheduleService = new CardScheduleService();
    const cardFilterService = new CardFilterService();
    const cardSortService = new CardSortService();
    
    // 创建应用服务
    return new BrowserApplicationService(
      context.getStorage(),
      cardScheduleService,
      cardFilterService,
      cardSortService
    );
  });
}

/**
 * 获取浏览器应用服务
 */
getBrowserService(): BrowserApplicationService {
  return this.getService<BrowserApplicationService>('browserService');
}
```

## 📝 迁移步骤

### Phase 1: 创建领域服务
- [ ] 创建 `CardFilterService`
- [ ] 创建 `CardSortService`
- [ ] 为领域服务编写单元测试

### Phase 2: 创建应用层
- [ ] 创建查询对象 `GetBrowserCardsQuery`
- [ ] 创建查询处理器 `GetBrowserCardsQueryHandler`
- [ ] 创建应用服务 `BrowserApplicationService`
- [ ] 为应用层编写单元测试

### Phase 3: 集成到 ApplicationContext
- [ ] 在 `ApplicationContext` 中注册 `browserService`
- [ ] 添加 `getBrowserService()` 方法
- [ ] 添加必要的 import 语句

### Phase 4: 改造表现层
- [ ] 修改 `DialogManager.openBrowserDialog()`
- [ ] 修改 `SRSBrowser.vue` 组件
- [ ] 移除对 `storage` 和 `scheduler` 的直接依赖
- [ ] 移除 `browserService.ts` 中的全局状态

### Phase 5: 测试和验证
- [ ] 运行单元测试
- [ ] 手动测试浏览器功能
- [ ] 验证所有过滤、排序、分页功能正常
- [ ] 验证批量操作功能正常

## ✅ 验收标准

1. **分层清晰**：表现层 → 应用层 → 领域层 → 基础设施层
2. **依赖正确**：表现层只依赖应用服务，不直接访问 Storage
3. **测试覆盖**：领域服务和应用服务都有单元测试
4. **功能完整**：所有浏览器功能正常工作
5. **性能保持**：迁移后性能不下降

## 🎯 预期收益

1. **更好的可测试性**：领域服务和应用服务都可以独立测试
2. **更清晰的职责**：每一层都有明确的职责
3. **更容易维护**：业务逻辑集中在领域层
4. **更好的复用性**：领域服务可以在其他地方复用
5. **符合 DDD 原则**：遵循依赖倒置原则
