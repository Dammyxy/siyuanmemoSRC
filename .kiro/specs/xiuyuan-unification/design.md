# Design Document

## Overview

XiuYuan 完全统一化设计旨在将所有卡片创建流程统一到 DDD 架构，使用统一的存储管理器优化性能，支持灵活的类型和模板组合，并实现一对多关系以支持双向卡片和列表模版卡等高级功能。

核心设计原则：
- 完全统一：所有卡片通过 CardApplicationService 创建
- 性能优先：内存索引支持 < 100ms 查询
- 解耦设计：块、XiuYuan、Card 三层分离
- 事件驱动：完整的领域事件支持
- 向后兼容：保持 Riff 同步功能正常工作

## Architecture

### DDD 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      表现层 (Presentation)                   │
│  • DialogManager (模板选择、模板编辑)                        │
│  • MenuManager (块菜单、右键菜单)                            │
│  • TabManager (浏览器、复习界面)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      应用层 (Application)                    │
│  • CardApplicationService (统一入口)                         │
│  • CreateCardUseCase (创建卡片用例)                          │
│  • DeleteCardUseCase (删除卡片用例)                          │
│  • UpdateCardUseCase (更新卡片用例)                          │
│  • CardCreationHelper (创建辅助函数)                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      领域层 (Domain)                         │
│  • XiuYuan (聚合根)                                          │
│  • Card (实体)                                               │
│  • CardCreationService (领域服务)                            │
│  • CardDeletionService (领域服务)                            │
│  • IXiuYuanRepository (仓储接口)                             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    基础设施层 (Infrastructure)               │
│  • UnifiedStorageManager (统一存储)                          │
│  • XiuYuanRepository (仓储实现)                              │
│  • EventBus (事件总线)                                       │
└─────────────────────────────────────────────────────────────┘
```

### 核心关系图

```
┌─────────────────────────────────────────────────────────────┐
│                         Block (块)                           │
│  - id: 'block-1'                                             │
│  - content: 'DDD <> 领域驱动设计'                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      XiuYuan (修缘)                          │
│  - id: 'xy_123'                                              │
│  - blockIDs: ['block-1']                                     │
│  - templateID: 'builtin-quick-bidirectional'                 │
│  - fields: [{ name: 'content', blockID: 'block-1' }]         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cards (卡片)                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 1 (正向)                                        │    │
│  │ - id: 'card-1'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - meta.typeMarker: 'forward'                         │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 2 (反向)                                        │    │
│  │ - id: 'card-2'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - meta.typeMarker: 'reverse'                         │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### UnifiedStorageManager

统一存储管理器，负责所有数据的持久化和查询。

```typescript
class UnifiedStorageManager {
  // 数据存储
  private xiuyuans: Map<string, IXiuYuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // 内存索引
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();
  
  // 脏标记和自动保存
  private dirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly SAVE_DELAY = 1000;
  
  // 生命周期
  async load(): Promise<Result<void>>;
  async save(): Promise<Result<void>>;
  
  // CRUD 操作
  async createCard(xiuyuan: IXiuYuan, card: FSRSCard): Promise<Result<void>>;
  async batchCreateCards(xiuyuan: IXiuYuan, cards: FSRSCard[]): Promise<Result<void>>;
  getCard(cardId: string): FSRSCard | undefined;
  async updateCard(card: FSRSCard): Promise<Result<void>>;
  async deleteCard(cardId: string): Promise<Result<void>>;
  async deleteXiuYuan(xiuyuanId: string): Promise<Result<void>>;
  
  // 查询方法
  getDueCards(limit: number): FSRSCard[];
  getCardsByBlockId(blockId: string): FSRSCard[];
  getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[];
  getCardsByType(type: CardType): FSRSCard[];
  getAllCards(): FSRSCard[];
  getXiuYuan(xiuyuanId: string): IXiuYuan | undefined;
  
  // 索引管理
  private rebuildIndexes(): void;
  private updateIndexesForCard(card: FSRSCard, action: 'add' | 'remove'): void;
  private scheduleSave(): void;
  
  // 数据一致性
  async validateConsistency(): Promise<string[]>;
  async autoFix(): Promise<number>;
  
  // 统计信息
  getStats(): StorageStats;
}

interface StorageStats {
  totalCards: number;
  totalXiuYuans: number;
  cardsByType: Record<CardType, number>;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}
```

### CardApplicationService

应用服务，提供统一的卡片操作接口。

```typescript
class CardApplicationService {
  constructor(
    private repository: IXiuYuanRepository,
    private storage: UnifiedStorageManager,
    private eventBus: EventBus,
    private templateRegistry: TemplateRegistry
  ) {}
  
  // 创建卡片
  async createCard(command: CreateCardCommand): Promise<Result<Card>>;
  async batchCreateCards(commands: CreateCardCommand[]): Promise<Result<Card[]>>;
  
  // 删除卡片
  async deleteCard(command: DeleteCardCommand): Promise<Result<void>>;
  async deleteCardsByBlockId(blockId: string): Promise<Result<void>>;
  
  // 更新卡片
  async updateCard(command: UpdateCardCommand): Promise<Result<Card>>;
  
  // 查询卡片
  async getCard(cardId: string): Promise<Result<Card>>;
  async getCardsByBlockId(blockId: string): Promise<Result<Card[]>>;
}

interface CreateCardCommand {
  blockIds: string[];
  cardType?: 'item' | 'topic' | 'concept' | 'descriptor';
  templateId?: string;
  schedulerType?: 'fsrs-v6' | 'a-factor' | 'sm2';
  priority?: number;
  metadata?: {
    source?: 'manual' | 'auto' | 'symbol' | 'quick';
    autoCreated?: boolean;
    symbolDetected?: boolean;
    [key: string]: any;
  };
}

interface DeleteCardCommand {
  cardId: string;
}

interface UpdateCardCommand {
  cardId: string;
  updates: Partial<FSRSCard>;
}
```

### CreateCardUseCase

创建卡片用例，实现自动模板选择和卡片生成逻辑。

```typescript
class CreateCardUseCase {
  constructor(
    private cardCreationService: CardCreationService,
    private templateRegistry: TemplateRegistry,
    private repository: IXiuYuanRepository
  ) {}
  
  async execute(command: CreateCardCommand): Promise<Result<Card>> {
    // 1. 验证命令
    const validationResult = this.validateCommand(command);
    if (!validationResult.ok) return validationResult;
    
    // 2. 自动选择模板
    const templateId = await this.selectTemplate(command);
    
    // 3. 创建或查找 XiuYuan
    const xiuyuanResult = await this.createOrFindXiuYuan(command, templateId);
    if (!xiuyuanResult.ok) return xiuyuanResult;
    
    // 4. 生成卡片
    const cardsResult = await this.cardCreationService.createCards(
      xiuyuanResult.value,
      command
    );
    
    return cardsResult;
  }
  
  private async selectTemplate(command: CreateCardCommand): Promise<string> {
    if (command.templateId) {
      return command.templateId;
    }
    
    // 检测符号
    const hasSymbol = await this.detectSymbol(command.blockIds[0]);
    if (hasSymbol) {
      return command.blockIds.length === 1
        ? 'builtin-symbol-qa'
        : 'builtin-quick-bidirectional';
    }
    
    // 根据类型选择
    const cardType = command.cardType || 'item';
    const blockCount = command.blockIds.length;
    
    return this.getDefaultTemplateForType(cardType, blockCount);
  }
  
  private getDefaultTemplateForType(
    cardType: string,
    blockCount: number
  ): string {
    switch (cardType) {
      case 'concept':
        return blockCount > 1
          ? 'builtin-concept-descriptor'
          : 'builtin-concept-simple';
      case 'descriptor':
        return 'builtin-concept-descriptor';
      case 'topic':
        return 'builtin-topic';
      case 'item':
      default:
        return blockCount === 1
          ? 'builtin-quick-card'
          : 'builtin-basic-qa';
    }
  }
  
  private async detectSymbol(blockId: string): Promise<boolean> {
    const content = await getBlockContent(blockId);
    return content.includes('<>');
  }
}
```

### CardCreationHelper

辅助类，提供便捷的卡片创建方法。

```typescript
class CardCreationHelper {
  constructor(private cardService: CardApplicationService) {}
  
  // 创建概念卡
  async createConceptCard(
    blockId: string,
    options: {
      descriptorBlockId?: string;
      useAFactor?: boolean;
      priority?: number;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<Result<Card>> {
    const blockIds = options.descriptorBlockId
      ? [blockId, options.descriptorBlockId]
      : [blockId];
    
    return this.cardService.createCard({
      blockIds,
      cardType: 'concept',
      schedulerType: options.useAFactor ? 'a-factor' : 'fsrs-v6',
      priority: options.priority || 50,
      metadata: {
        source: 'auto',
        ...options.metadata,
      },
    });
  }
  
  // 创建符号检测卡
  async createSymbolCard(
    blockId: string,
    options: { priority?: number } = {}
  ): Promise<Result<Card>> {
    return this.cardService.createCard({
      blockIds: [blockId],
      templateId: 'builtin-symbol-qa',
      cardType: 'item',
      priority: options.priority || 50,
      metadata: {
        source: 'symbol',
        symbolDetected: true,
      },
    });
  }
  
  // 创建快速卡片
  async createQuickCard(
    blockId: string,
    options: { priority?: number } = {}
  ): Promise<Result<Card>> {
    return this.cardService.createCard({
      blockIds: [blockId],
      cardType: 'item',
      priority: options.priority || 50,
      metadata: {
        source: 'quick',
      },
    });
  }
  
  // 创建双向卡片
  async createBidirectionalCard(
    termBlockId: string,
    definitionBlockId: string,
    options: { priority?: number } = {}
  ): Promise<Result<Card[]>> {
    const result = await this.cardService.createCard({
      blockIds: [termBlockId, definitionBlockId],
      templateId: 'builtin-bidirectional',
      cardType: 'item',
      priority: options.priority || 50,
      metadata: {
        source: 'manual',
      },
    });
    
    if (!result.ok) return result;
    
    // 返回所有生成的卡片
    const cards = await this.cardService.getCardsByBlockId(termBlockId);
    return cards;
  }
  
  // 创建列表模版卡
  async createListTemplateCard(
    parentBlockId: string,
    options: { priority?: number } = {}
  ): Promise<Result<Card[]>> {
    const result = await this.cardService.createCard({
      blockIds: [parentBlockId],
      templateId: 'builtin-list-item',
      cardType: 'item',
      priority: options.priority || 50,
      metadata: {
        source: 'manual',
      },
    });
    
    if (!result.ok) return result;
    
    // 返回所有生成的卡片
    const cards = await this.cardService.getCardsByBlockId(parentBlockId);
    return cards;
  }
}
```

### TemplateRegistry

模板注册器，管理所有内置和自定义模板。

```typescript
class TemplateRegistry {
  private templates: Map<string, ICardTemplate> = new Map();
  
  constructor() {
    // 注册所有内置模板
    this.registerBuiltinTemplates();
  }
  
  register(template: ICardTemplate): Result<void> {
    // 验证模板
    const errors = this.validateTemplate(template);
    if (errors.length > 0) {
      return err(new Error(`Template validation failed: ${errors.join(', ')}`));
    }
    
    this.templates.set(template.id, template);
    return ok(undefined);
  }
  
  get(templateId: string): ICardTemplate | undefined {
    return this.templates.get(templateId);
  }
  
  getAll(): ICardTemplate[] {
    return Array.from(this.templates.values());
  }
  
  getBuiltin(): ICardTemplate[] {
    return this.getAll().filter(t => t.id.startsWith('builtin-'));
  }
  
  getCustom(): ICardTemplate[] {
    return this.getAll().filter(t => !t.id.startsWith('builtin-'));
  }
  
  private validateTemplate(template: ICardTemplate): string[] {
    const errors: string[] = [];
    
    if (!template.id) errors.push('Missing template id');
    if (!template.name) errors.push('Missing template name');
    if (!template.fields || template.fields.length === 0) {
      errors.push('Template must have at least one field');
    }
    if (!template.cardRules || template.cardRules.length === 0) {
      errors.push('Template must have at least one card rule');
    }
    
    // 检查字段名唯一性
    const fieldNames = new Set<string>();
    for (const field of template.fields || []) {
      if (fieldNames.has(field.name)) {
        errors.push(`Duplicate field name: ${field.name}`);
      }
      fieldNames.add(field.name);
    }
    
    // 检查卡片规则引用的字段存在
    for (const rule of template.cardRules || []) {
      for (const fieldName of [...rule.frontFields, ...rule.backFields]) {
        if (!fieldNames.has(fieldName)) {
          errors.push(`Card rule references non-existent field: ${fieldName}`);
        }
      }
    }
    
    return errors;
  }
  
  private registerBuiltinTemplates(): void {
    const builtinTemplates = [
      BASIC_QA_TEMPLATE,
      BIDIRECTIONAL_TEMPLATE,
      CLOZE_TEMPLATE,
      BUILTIN_CONCEPT_TEMPLATE,
      CONCEPT_DESCRIPTOR_TEMPLATE,
      BUILTIN_QUICK_TEMPLATE,
      BUILTIN_SYMBOL_TEMPLATE,
      QUICK_BIDIRECTIONAL_TEMPLATE,
      LIST_ITEM_TEMPLATE,
    ];
    
    for (const template of builtinTemplates) {
      this.register(template);
    }
  }
}

interface ICardTemplate {
  id: string;
  name: string;
  description: string;
  fields: Array<{
    name: string;
    description: string;
  }>;
  cardRules: Array<{
    typeMarker: string;
    frontFields: string[];
    backFields: string[];
  }>;
}
```

## Data Models

### UnifiedCardStore

统一存储数据结构。

```typescript
interface UnifiedCardStore {
  version: number;  // 当前版本：1
  
  // XiuYuan 数据
  xiuyuans: Record<string, {
    id: string;
    blockIDs: string[];
    templateID: string;
    fields: Array<{
      name: string;
      blockID: string;
    }>;
    createdAt: number;
    updatedAt: number;
    meta?: Record<string, any>;
  }>;
  
  // FSRS 卡片数据
  cards: Record<string, {
    // 身份
    id: string;
    xiuyuanID: string;
    blockId: string;
    
    // FSRS 核心字段
    due: number;
    stability: number;
    difficulty: number;
    reps: number;
    lapses: number;
    state: number;
    lastReview: number;
    elapsedDays: number;
    scheduledDays: number;
    learning_step: number;
    
    // 类型和模板
    type: 'item' | 'topic' | 'concept' | 'descriptor';
    templateID: string;
    schedulerType: 'fsrs-v6' | 'a-factor' | 'sm2';
    
    // 优先级
    priority: number;
    
    // 扩展功能
    tags: string[];
    leechCount: number;
    isLeech: boolean;
    skipped: boolean;
    skipNote?: string;
    skipUntil?: number;
    
    // 元数据
    meta: {
      xiuyuanID: string;
      templateID: string;
      ruleIndex: number;
      typeMarker?: string;
      frontBlockIDs: string[];
      backBlockIDs: string[];
      fieldMapping: Record<string, string>;
      frontFields: string[];
      backFields: string[];
      // 列表模版卡专用
      cue?: string;
      answer?: string;
      allChildren?: Array<{
        id: string;
        cue: string;
        answer: string;
        index: number;
      }>;
      currentIndex?: number;
    };
    
    // 时间戳
    createdAt: number;
    updatedAt: number;
  }>;
}
```

### IXiuYuan

XiuYuan 实体接口。

```typescript
interface IXiuYuan {
  id: string;                    // xy_1234567890_abc123
  blockIDs: string[];            // 关联的块 ID 列表
  templateID: string;            // 模板 ID
  fields: Array<{
    name: string;                // 字段名
    blockID: string;             // 字段对应的块 ID
  }>;
  createdAt: number;
  updatedAt: number;
  meta?: Record<string, any>;    // 扩展元数据
}
```

### FSRSCard

FSRS 卡片实体。

```typescript
interface FSRSCard {
  // 身份
  id: string;
  xiuyuanID: string;             // 必需，关联到 XiuYuan
  blockId: string;
  
  // FSRS 核心字段
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learning_step: number;
  
  // 类型和模板
  type: 'item' | 'topic' | 'concept' | 'descriptor';
  templateID: string;
  schedulerType: 'fsrs-v6' | 'a-factor' | 'sm2';
  
  // 优先级
  priority: number;              // 0-100
  
  // 扩展功能
  tags: string[];
  leechCount: number;
  isLeech: boolean;
  skipped: boolean;
  skipNote?: string;
  skipUntil?: number;
  
  // 元数据
  meta: {
    xiuyuanID: string;
    templateID: string;
    ruleIndex: number;
    typeMarker?: string;
    frontBlockIDs: string[];
    backBlockIDs: string[];
    fieldMapping: Record<string, string>;
    frontFields: string[];
    backFields: string[];
  };
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}
```

### CardType

卡片类型枚举。

```typescript
enum CardType {
  Item = 'item',           // 基础卡片
  Topic = 'topic',         // 主题卡片
  Concept = 'concept',     // 概念卡
  Descriptor = 'descriptor', // 描述符卡
}
```

## Correctness Properties


A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Storage and Persistence Properties

Property 1: Storage round-trip consistency
*For any* valid UnifiedCardStore data, serializing to MessagePack and then deserializing should produce equivalent data structures
**Validates: Requirements 1.1, 1.7**

Property 2: Query performance for large datasets
*For any* dataset containing up to 100,000 cards, querying due cards should complete in less than 100ms
**Validates: Requirements 1.3, 11.2**

Property 3: Index consistency after card creation
*For any* created card, the card should be immediately queryable by its blockID, xiuyuanID, type, and priority
**Validates: Requirements 1.4**

Property 4: Cascade deletion of XiuYuan
*For any* XiuYuan, when its last card is deleted, the XiuYuan should also be automatically deleted
**Validates: Requirements 1.5, 6.6**

Property 5: Data consistency validation
*For any* UnifiedCardStore, the validateConsistency method should detect all orphaned cards (cards with missing xiuyuanID references) and empty XiuYuans (XiuYuans with no cards)
**Validates: Requirements 1.8, 12.1, 12.2, 12.3, 12.4**

Property 6: Auto-fix removes orphaned data
*For any* UnifiedCardStore with orphaned data, calling autoFix should remove all orphaned cards and empty XiuYuans
**Validates: Requirements 12.5, 12.6**

### Card Creation Properties

Property 7: Valid xiuyuanID for all created cards
*For any* card created through CardApplicationService, the card should have a non-null xiuyuanID that references an existing XiuYuan
**Validates: Requirements 2.3, 2.6**

Property 8: Card generation matches template rules
*For any* XiuYuan created with a template, the number of generated cards should equal the number of cardRules in the template
**Validates: Requirements 2.4**

Property 9: Automatic template selection based on symbol detection
*For any* block containing the <> symbol, creating a card without specifying templateId should automatically select builtin-symbol-qa or builtin-quick-bidirectional template
**Validates: Requirements 2.2, 8.1**

Property 10: Explicit template overrides automatic selection
*For any* CreateCardCommand with an explicit templateId, the system should use the specified template regardless of block content or cardType
**Validates: Requirements 8.6**

Property 11: CardType validation
*For any* CreateCardCommand, if the cardType is not one of Item, Topic, Concept, or Descriptor, the system should reject the command with a validation error
**Validates: Requirements 4.3**

### One-to-Many Relationship Properties

Property 12: Bidirectional template generates two cards
*For any* XiuYuan created with the builtin-bidirectional template, exactly two cards should be generated with typeMarkers 'forward' and 'reverse', both sharing the same xiuyuanID
**Validates: Requirements 6.1**

Property 13: List template generates N cards
*For any* parent block with N child list items, creating a card with the builtin-list-item template should generate exactly N cards, all sharing the same xiuyuanID
**Validates: Requirements 6.2**

Property 14: Query by blockID returns all associated cards
*For any* blockID, querying cards by that blockID should return all cards where card.blockId equals the blockID or the blockID appears in card.meta.frontBlockIDs or card.meta.backBlockIDs
**Validates: Requirements 6.3**

Property 15: Query by xiuyuanID returns all generated cards
*For any* xiuyuanID, querying cards by that xiuyuanID should return all cards where card.xiuyuanID equals the xiuyuanID
**Validates: Requirements 6.4**

Property 16: Cascade deletion of all cards when XiuYuan is deleted
*For any* XiuYuan, deleting the XiuYuan should also delete all cards with card.xiuyuanID equal to the XiuYuan's ID
**Validates: Requirements 6.5**

### Priority Management Properties

Property 17: Priority stored only in FSRSCard
*For any* card, the priority value should be stored only in FSRSCard.priority and not in block attributes
**Validates: Requirements 9.1, 9.2, 9.3**

Property 18: Priority independence from block attributes
*For any* card, changing the block's custom-fsrs-priority attribute should not affect the card's priority value
**Validates: Requirements 3.5, 9.2**

Property 19: Priority update only modifies FSRSCard
*For any* card, updating the card's priority should modify only FSRSCard.priority and should not write to block attributes
**Validates: Requirements 9.3, 9.5**

### Type and Template Flexibility Properties

Property 20: Concept cards support multiple schedulers
*For any* Concept card, the schedulerType can be either 'fsrs-v6' or 'a-factor', and changing schedulerType should not affect the cardType
**Validates: Requirements 5.1, 5.5**

Property 21: Type-template independence
*For any* CardType and compatible template, the system should allow creating a card with that type-template combination
**Validates: Requirements 5.2**

### Riff Sync Properties

Property 22: Riff sync creates XiuYuan for each new card
*For any* new Riff card, syncing should create a corresponding XiuYuan with a valid ID and fields
**Validates: Requirements 10.1**

Property 23: Riff sync ensures valid xiuyuanID
*For any* card created during Riff sync, the card should have a non-null xiuyuanID that references an existing XiuYuan
**Validates: Requirements 10.2**

Property 24: Riff sync preserves local changes
*For any* existing local card, syncing from Riff should not overwrite the local card's data (priority, due date, stability, etc.)
**Validates: Requirements 10.3**

Property 25: Riff sync selects appropriate templates
*For any* Riff card, syncing should automatically select an appropriate template based on the card's content and structure
**Validates: Requirements 10.4**

Property 26: Riff deletion sync
*For any* Riff card that is deleted, syncing should delete the corresponding local card and XiuYuan (if no other cards exist)
**Validates: Requirements 10.6**

### Performance Properties

Property 27: Load performance for large datasets
*For any* dataset containing up to 100,000 cards, loading the data should complete in less than 2 seconds
**Validates: Requirements 11.1**

Property 28: Card creation performance
*For any* valid CreateCardCommand, creating the card should complete in less than 50ms
**Validates: Requirements 11.3**

Property 29: Card deletion performance
*For any* existing card, deleting the card should complete in less than 50ms
**Validates: Requirements 11.4**

Property 30: Card update performance
*For any* existing card with valid updates, updating the card should complete in less than 50ms
**Validates: Requirements 11.5**

Property 31: Due date query returns sorted results
*For any* query for due cards, the results should be sorted by due date in ascending order
**Validates: Requirements 11.7**

### Template Validation Properties

Property 32: Template validation rejects invalid templates
*For any* template missing required fields (id, name, fields, or cardRules), registering the template should fail with validation errors
**Validates: Requirements 15.1, 15.2, 15.3**

Property 33: Template field name uniqueness
*For any* template with duplicate field names, registering the template should fail with a validation error indicating the duplicate field name
**Validates: Requirements 15.4**

Property 34: Template cardRule field references
*For any* template where a cardRule references a non-existent field, registering the template should fail with a validation error indicating the invalid field reference
**Validates: Requirements 15.5**

Property 35: Template validation error reporting
*For any* invalid template, the validation should return a list of all validation errors, not just the first error
**Validates: Requirements 15.6**

### Batch Operations Properties

Property 36: Batch creation atomicity
*For any* batch of CreateCardCommands, if any command fails, the entire batch should be rolled back and no cards should be created
**Validates: Requirements 14.2, 14.5**

## Error Handling

### Error Types

The system defines the following error types:

```typescript
class ValidationError extends Error {
  constructor(message: string, public details: string[]) {
    super(message);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends Error {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

class ConsistencyError extends Error {
  constructor(message: string, public issues: string[]) {
    super(message);
    this.name = 'ConsistencyError';
  }
}

class DeprecationError extends Error {
  constructor(oldMethod: string, newMethod: string) {
    super(`${oldMethod} is deprecated. Use ${newMethod} instead.`);
    this.name = 'DeprecationError';
  }
}
```

### Error Handling Strategies

1. **Validation Errors**: Return Result<T, ValidationError> with detailed error messages
2. **Not Found Errors**: Return Result<T, NotFoundError> when resources don't exist
3. **Consistency Errors**: Detected by validateConsistency(), can be auto-fixed
4. **Deprecation Errors**: Thrown immediately when legacy code is called
5. **Performance Errors**: Logged but don't fail operations (graceful degradation)

### Error Recovery

```typescript
// Example: Creating a card with error handling
async function createCardWithRecovery(
  command: CreateCardCommand
): Promise<Result<Card>> {
  // 1. Validate command
  const validationResult = validateCreateCardCommand(command);
  if (!validationResult.ok) {
    return err(new ValidationError(
      'Invalid command',
      validationResult.errors
    ));
  }
  
  // 2. Try to create card
  const result = await cardService.createCard(command);
  if (!result.ok) {
    // Log error
    console.error('Failed to create card:', result.error);
    
    // Check consistency
    const issues = await storage.validateConsistency();
    if (issues.length > 0) {
      // Auto-fix if possible
      const fixedCount = await storage.autoFix();
      console.log(`Auto-fixed ${fixedCount} issues`);
    }
    
    return result;
  }
  
  return result;
}
```

## Testing Strategy

### Dual Testing Approach

The testing strategy combines unit tests and property-based tests for comprehensive coverage:

- **Unit tests**: Verify specific examples, edge cases, and error conditions
- **Property tests**: Verify universal properties across all inputs

### Unit Testing Guidelines

Unit tests should focus on:
- Specific examples that demonstrate correct behavior
- Integration points between components
- Edge cases (empty lists, null values, boundary conditions)
- Error conditions and error messages

Avoid writing too many unit tests for scenarios that property tests can cover. Property tests handle comprehensive input coverage through randomization.

### Property-Based Testing Configuration

- **Library**: Use fast-check for TypeScript/JavaScript
- **Iterations**: Minimum 100 iterations per property test
- **Tagging**: Each property test must reference its design document property
- **Tag format**: `Feature: xiuyuan-unification, Property {number}: {property_text}`

Example property test:

```typescript
import fc from 'fast-check';

describe('Property 7: Valid xiuyuanID for all created cards', () => {
  it('should ensure all created cards have valid xiuyuanID', async () => {
    // Feature: xiuyuan-unification, Property 7: Valid xiuyuanID for all created cards
    
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }), // blockIds
        fc.constantFrom('item', 'topic', 'concept', 'descriptor'), // cardType
        async (blockIds, cardType) => {
          // Create card
          const result = await cardService.createCard({
            blockIds,
            cardType,
          });
          
          // Verify card has valid xiuyuanID
          expect(result.ok).toBe(true);
          const card = result.value;
          expect(card.xiuyuanID).toBeDefined();
          expect(card.xiuyuanID).not.toBeNull();
          
          // Verify XiuYuan exists
          const xiuyuan = storage.getXiuYuan(card.xiuyuanID);
          expect(xiuyuan).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Coverage Requirements

- **Unit tests**: Cover all error conditions, edge cases, and integration points
- **Property tests**: Cover all 36 correctness properties defined in this document
- **Performance tests**: Verify all performance requirements (< 100ms queries, < 2s load, etc.)
- **Integration tests**: Test end-to-end workflows (create → review → delete)

### Test Data Generators

Property tests require generators for test data:

```typescript
// Generator for valid CreateCardCommand
const createCardCommandArb = fc.record({
  blockIds: fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
  cardType: fc.constantFrom('item', 'topic', 'concept', 'descriptor'),
  templateId: fc.option(fc.string()),
  schedulerType: fc.option(fc.constantFrom('fsrs-v6', 'a-factor', 'sm2')),
  priority: fc.option(fc.integer({ min: 0, max: 100 })),
});

// Generator for FSRSCard
const fsrsCardArb = fc.record({
  id: fc.string(),
  xiuyuanID: fc.string(),
  blockId: fc.string(),
  due: fc.integer({ min: 0 }),
  stability: fc.float({ min: 0, max: 100 }),
  difficulty: fc.float({ min: 0, max: 10 }),
  // ... other fields
});

// Generator for IXiuYuan
const xiuyuanArb = fc.record({
  id: fc.string(),
  blockIDs: fc.array(fc.string(), { minLength: 1 }),
  templateID: fc.string(),
  fields: fc.array(fc.record({
    name: fc.string(),
    blockID: fc.string(),
  })),
  createdAt: fc.integer({ min: 0 }),
  updatedAt: fc.integer({ min: 0 }),
});
```

### Performance Testing

Performance tests should verify the following requirements:

```typescript
describe('Performance Tests', () => {
  it('should load 100,000 cards in < 2s', async () => {
    // Generate 100,000 cards
    const cards = generateLargeDataset(100000);
    
    // Measure load time
    const start = Date.now();
    await storage.load();
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(2000);
  });
  
  it('should query due cards in < 100ms', async () => {
    // Setup: Load 100,000 cards
    await storage.load();
    
    // Measure query time
    const start = Date.now();
    const dueCards = storage.getDueCards(100);
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(100);
  });
  
  it('should create card in < 50ms', async () => {
    const start = Date.now();
    await cardService.createCard({
      blockIds: ['block-1'],
      cardType: 'item',
    });
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(50);
  });
});
```

### Integration Testing

Integration tests verify end-to-end workflows:

```typescript
describe('Integration Tests', () => {
  it('should support complete card lifecycle', async () => {
    // 1. Create card
    const createResult = await cardService.createCard({
      blockIds: ['block-1', 'block-2'],
      templateId: 'builtin-bidirectional',
    });
    expect(createResult.ok).toBe(true);
    
    // 2. Query cards
    const cards = await storage.getCardsByBlockId('block-1');
    expect(cards.length).toBe(2);
    
    // 3. Update card
    const card = cards[0];
    card.priority = 80;
    await storage.updateCard(card);
    
    // 4. Verify update
    const updated = storage.getCard(card.id);
    expect(updated?.priority).toBe(80);
    
    // 5. Delete card
    await cardService.deleteCard({ cardId: card.id });
    
    // 6. Verify deletion
    const deleted = storage.getCard(card.id);
    expect(deleted).toBeUndefined();
  });
});
```

