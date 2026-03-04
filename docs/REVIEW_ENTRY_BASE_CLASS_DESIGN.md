# 复习入口基类设计

## 1. 概述

将块菜单中的【块练习】模式抽象为【复习入口基类】，支持三种复习模式：
- 提取练习（只 Item，记录作答）
- 渐进学习（Item + Topic，记录作答）
- 刻意练习（所有卡片，不记录作答）

## 2. 核心接口设计

### 2.1 复习入口配置接口

```typescript
/**
 * 复习入口配置
 */
interface ReviewEntryConfig {
  /** 入口 ID（唯一标识） */
  id: string;
  
  /** 显示名称 */
  displayName: string;
  
  /** 图标 */
  icon: string;
  
  /** 队列类型 */
  queueType: QueueType;
  
  /** 是否记录作答（影响排期） */
  recordReview: boolean;
  
  /** 卡片类型过滤器 */
  cardTypeFilter: CardTypeFilter;
  
  /** 是否支持"到期/全部"模式 */
  supportDueMode: boolean;
}

/**
 * 卡片类型过滤器
 */
type CardTypeFilter = 
  | 'item-only'      // 只接受 Item
  | 'all'            // 接受 Item + Topic
  | ((card: FSRSCard) => boolean);  // 自定义过滤函数
```

### 2.2 复习入口基类

```typescript
/**
 * 复习入口基类
 * 
 * 负责：
 * 1. 收集当前块及子块的闪卡
 * 2. 过滤卡片类型
 * 3. 计算到期/全部数量
 * 4. 打开复习对话框
 */
abstract class ReviewEntryBase {
  constructor(
    protected config: ReviewEntryConfig,
    protected deps: {
      storage: StorageManager;
      reviewDialogManager: ReviewDialogManager;
      i18n: Record<string, string>;
    }
  ) {}
  
  /**
   * 从块元素收集闪卡
   * @param blockElements 块元素列表
   * @returns 卡片列表
   */
  protected collectCardsFromElements(blockElements: HTMLElement[]): FSRSCard[] {
    const seen = new Set<string>();
    const result: FSRSCard[] = [];
    const roots = blockElements.map((el) => 
      (el.closest('[data-node-id]') as HTMLElement) || el
    );

    for (const root of roots) {
      const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))];
      
      for (const node of nodes) {
        const blockId = node.getAttribute('data-node-id');
        if (!blockId || seen.has(blockId)) {
          continue;
        }
        seen.add(blockId);
        
        const card = this.deps.storage.getCardByBlockId(blockId);
        if (card && this.filterCard(card)) {
          result.push(card);
        }
      }
    }
    
    return result;
  }
  
  /**
   * 过滤卡片
   * @param card 卡片
   * @returns 是否接受该卡片
   */
  protected filterCard(card: FSRSCard): boolean {
    const filter = this.config.cardTypeFilter;
    
    if (filter === 'item-only') {
      return card.type !== 'topic';
    } else if (filter === 'all') {
      return true;
    } else if (typeof filter === 'function') {
      return filter(card);
    }
    
    return true;
  }
  
  /**
   * 计算到期卡片数量
   * @param cards 卡片列表
   * @returns 到期数量
   */
  protected countDueCards(cards: FSRSCard[]): number {
    const now = Date.now();
    return cards.filter(card => 
      card.due <= now &&
      !card.skipped &&
      (!card.skipUntil || card.skipUntil <= now)
    ).length;
  }
  
  /**
   * 获取菜单标签
   * @param dueCount 到期数量
   * @param totalCount 总数量
   * @param mode 'due' | 'all'
   * @returns 菜单标签 HTML
   */
  protected getMenuLabel(dueCount: number, totalCount: number, mode: 'due' | 'all'): string {
    const name = this.config.displayName;
    
    if (mode === 'due') {
      return `${name} - 到期 <span class="ft__secondary">(${dueCount}/${totalCount})</span>`;
    } else {
      return `${name} - 全部 <span class="ft__secondary">(${totalCount})</span>`;
    }
  }
  
  /**
   * 打开复习对话框
   * @param cards 卡片列表
   * @param mode 'due' | 'all'
   */
  protected abstract openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void>;
  
  /**
   * 创建菜单项
   * @param blockElements 块元素列表
   * @returns 菜单项数组
   */
  createMenuItems(blockElements: HTMLElement[]): any[] {
    const cards = this.collectCardsFromElements(blockElements);
    const dueCount = this.countDueCards(cards);
    const totalCount = cards.length;
    
    const items: any[] = [];
    
    if (!this.config.supportDueMode) {
      // 只支持"全部"模式（如刻意练习）
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'all'),
        click: async () => {
          if (totalCount === 0) {
            await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          await this.openReviewDialog(cards, 'all');
        },
      });
    } else {
      // 支持"到期"和"全部"两种模式
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'due'),
        click: async () => {
          if (dueCount === 0) {
            await pushMsg(this.deps.i18n?.noDueCards || '当前范围内没有到期的闪卡');
            return;
          }
          await this.openReviewDialog(cards, 'due');
        },
      });
      
      items.push({
        icon: this.config.icon,
        label: this.getMenuLabel(dueCount, totalCount, 'all'),
        click: async () => {
          if (totalCount === 0) {
            await pushMsg(this.deps.i18n?.drillNoCards || '当前范围内没有可练习的闪卡');
            return;
          }
          await this.openReviewDialog(cards, 'all');
        },
      });
    }
    
    return items;
  }
}
```

## 3. 具体实现类

### 3.1 提取练习入口

```typescript
class RetrievalPracticeEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'retrieval-practice',
      displayName: '提取练习',
      icon: 'iconRiffCard',
      queueType: QueueType.RetrievalPractice,
      recordReview: true,
      cardTypeFilter: 'item-only',
      supportDueMode: true,
    }, deps);
  }
  
  protected async openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void> {
    // 过滤到期卡片
    const filteredCards = mode === 'due' 
      ? cards.filter(card => {
          const now = Date.now();
          return card.due <= now && !card.skipped && (!card.skipUntil || card.skipUntil <= now);
        })
      : cards;
    
    // 打开提取练习对话框（记录作答）
    await this.deps.reviewDialogManager.openRetrievalPractice(filteredCards);
  }
}
```

### 3.2 渐进学习入口

```typescript
class IncrementalLearningEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'incremental-learning',
      displayName: '渐进学习',
      icon: 'iconBook',
      queueType: QueueType.IncrementalLearning,
      recordReview: true,
      cardTypeFilter: 'all',  // 接受 Item + Topic
      supportDueMode: true,
    }, deps);
  }
  
  protected async openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void> {
    const filteredCards = mode === 'due' 
      ? cards.filter(card => {
          const now = Date.now();
          return card.due <= now && !card.skipped && (!card.skipUntil || card.skipUntil <= now);
        })
      : cards;
    
    // 打开渐进学习对话框（记录作答）
    await this.deps.reviewDialogManager.openIncrementalLearning(filteredCards);
  }
}
```

### 3.3 刻意练习入口

```typescript
class DeliberatePracticeEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'deliberate-practice',
      displayName: '刻意练习',
      icon: 'iconRiffCard',
      queueType: QueueType.FinalDrill,
      recordReview: false,  // 不记录作答
      cardTypeFilter: 'all',
      supportDueMode: false,  // 只支持"全部"模式
    }, deps);
  }
  
  protected async openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void> {
    // 刻意练习：不记录作答，不影响排期
    await this.deps.reviewDialogManager.openDrillWithCards(cards, 'block');
  }
}
```

## 4. 使用示例

### 4.1 在 BlockMenuHandler 中使用

```typescript
export class BlockMenuHandler {
  private reviewEntries: ReviewEntryBase[];
  
  constructor(private deps: BlockMenuHandlerDeps) {
    // 初始化复习入口
    this.reviewEntries = [
      new RetrievalPracticeEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
      new IncrementalLearningEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
      new DeliberatePracticeEntry({
        storage: deps.storage,
        reviewDialogManager: deps.reviewDialogManager,
        i18n: deps.i18n,
      }),
    ];
  }
  
  handleBlockIconClick(e: any): void {
    const detail = e?.detail ?? e;
    const menu = detail?.menu;
    const blockElements: HTMLElement[] = detail?.blockElements || [];
    
    if (!menu || blockElements.length === 0) {
      return;
    }
    
    const submenu: any[] = [];
    
    // 添加复习入口菜单项
    for (const entry of this.reviewEntries) {
      const items = entry.createMenuItems(blockElements);
      submenu.push(...items);
    }
    
    // 添加分隔符
    submenu.push({ type: 'separator' });
    
    // 添加神经漫游
    submenu.push({
      icon: 'iconRefresh',
      label: this.deps.i18n?.startNeuralReviewFromHere || '从此处开始神经漫游',
      click: async () => {
        // ...
      },
    });
    
    // 添加其他菜单项...
    
    menu.addItem({
      icon: 'iconRiffCard',
      label: 'SiyuanMemo',
      submenu,
    });
  }
}
```

### 4.2 菜单效果

```
SiyuanMemo
  ├─ 提取练习 - 到期 (3/10)
  ├─ 提取练习 - 全部 (10)
  ├─ 渐进学习 - 到期 (5/15)
  ├─ 渐进学习 - 全部 (15)
  ├─ 刻意练习 - 全部 (15)
  ├─ ──────────────
  ├─ 从此处开始神经漫游
  ├─ ──────────────
  ├─ 编辑SRS数据
  ├─ 选中制卡
  └─ 取消闪卡
```

## 5. 扩展性

### 5.1 添加新的复习入口

只需继承 `ReviewEntryBase` 并实现 `openReviewDialog` 方法：

```typescript
class CustomReviewEntry extends ReviewEntryBase {
  constructor(deps: ReviewEntryBaseDeps) {
    super({
      id: 'custom-review',
      displayName: '自定义复习',
      icon: 'iconCustom',
      queueType: QueueType.Custom,
      recordReview: true,
      cardTypeFilter: (card) => card.priority > 50,  // 自定义过滤
      supportDueMode: true,
    }, deps);
  }
  
  protected async openReviewDialog(cards: FSRSCard[], mode: 'due' | 'all'): Promise<void> {
    // 自定义复习逻辑
  }
}
```

### 5.2 动态配置

可以从设置中读取配置，动态创建复习入口：

```typescript
const entryConfigs = this.deps.storage.getSettings().reviewEntries || [];
this.reviewEntries = entryConfigs.map(config => 
  createReviewEntry(config, deps)
);
```

## 6. 优势

1. **统一抽象**：所有复习入口使用相同的基类，代码复用
2. **易于扩展**：添加新的复习模式只需继承基类
3. **配置驱动**：通过配置对象控制行为，无需修改代码
4. **类型安全**：TypeScript 类型检查，减少错误
5. **可测试**：每个入口类可以独立测试

## 7. 下一步

1. 实现 `ReviewEntryBase` 基类
2. 实现三个具体入口类
3. 修改 `BlockMenuHandler` 使用新的入口类
4. 添加单元测试
5. 更新 i18n 翻译
