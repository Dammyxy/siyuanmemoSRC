# API 参考

## 1. CardApplicationService

### 1.1 createCard()

创建卡片的统一入口。

**签名**：

```typescript
async createCard(command: CreateCardCommand): Promise<Result<Card>>
```

**参数**：

```typescript
interface CreateCardCommand {
  // 必需
  blockIds: string[];              // 块 ID 列表
  
  // 可选（自动推断）
  templateId?: string;             // 模板 ID
  cardType?: CardType;             // 卡片类型
  schedulerType?: SchedulerType;   // 调度器类型
  priority?: number;               // 优先级 0-100
  metadata?: Record<string, any>;  // 元数据
}
```

**返回值**：

```typescript
Result<Card>  // 成功返回 Card，失败返回 Error
```

**示例**：

```typescript
// 示例 1：创建概念卡（自动选择模板）
const result = await cardService.createCard({
  blockIds: ['block-1'],
  cardType: 'concept',
  schedulerType: 'a-factor',
});

// 示例 2：创建问答卡（指定模板）
const result = await cardService.createCard({
  blockIds: ['block-1', 'block-2'],
  templateId: 'builtin-basic-qa',
});

// 示例 3：创建符号检测卡（自动检测）
const result = await cardService.createCard({
  blockIds: ['block-1'],  // 内容：DDD <> 领域驱动设计
  cardType: 'item',
});
```

### 1.2 deleteCard()

删除卡片。

**签名**：

```typescript
async deleteCard(command: DeleteCardCommand): Promise<Result<void>>
```

**参数**：

```typescript
interface DeleteCardCommand {
  cardId: string;  // 卡片 ID
}
```

**示例**：

```typescript
const result = await cardService.deleteCard({
  cardId: 'card-123',
});
```

### 1.3 updateCard()

更新卡片。

**签名**：

```typescript
async updateCard(command: UpdateCardCommand): Promise<Result<void>>
```

**参数**：

```typescript
interface UpdateCardCommand {
  cardId: string;
  updates: Partial<FSRSCard>;
}
```

**示例**：

```typescript
const result = await cardService.updateCard({
  cardId: 'card-123',
  updates: {
    priority: 80,
    tags: ['important'],
  },
});
```

## 2. CardCreationHelper

### 2.1 createConceptCard()

创建概念卡的便捷方法。

**签名**：

```typescript
async createConceptCard(
  blockId: string,
  options?: {
    descriptorBlockId?: string;
    useAFactor?: boolean;
    priority?: number;
    metadata?: Record<string, any>;
  }
): Promise<Result<Card>>
```

**参数**：

- `blockId`: 概念块 ID
- `options.descriptorBlockId`: 描述符块 ID（可选）
- `options.useAFactor`: 是否使用 A-Factor 调度（默认 false）
- `options.priority`: 优先级（默认 50）
- `options.metadata`: 额外元数据

**示例**：

```typescript
const helper = new CardCreationHelper(cardService);

// 无描述符，使用 A-Factor
await helper.createConceptCard('block-1', {
  useAFactor: true,
});

// 有描述符，使用 FSRS
await helper.createConceptCard('block-1', {
  descriptorBlockId: 'block-2',
  useAFactor: false,
});
```

### 2.2 createSymbolCard()

创建符号检测卡。

**签名**：

```typescript
async createSymbolCard(
  blockId: string,
  options?: {
    priority?: number;
  }
): Promise<Result<Card>>
```

**示例**：

```typescript
await helper.createSymbolCard('block-1', {
  priority: 60,
});
```

### 2.3 createQuickCard()

创建快速卡片。

**签名**：

```typescript
async createQuickCard(
  blockId: string,
  options?: {
    priority?: number;
  }
): Promise<Result<Card>>
```

**示例**：

```typescript
await helper.createQuickCard('block-1');
```

## 3. UnifiedStorageManager

### 3.1 查询方法

#### getDueCards()

获取到期卡片。

**签名**：

```typescript
getDueCards(limit: number = 100): FSRSCard[]
```

**示例**：

```typescript
const dueCards = storage.getDueCards(50);
```

#### getCardsByBlockId()

根据块 ID 查询卡片。

**签名**：

```typescript
getCardsByBlockId(blockId: string): FSRSCard[]
```

**示例**：

```typescript
const cards = storage.getCardsByBlockId('block-1');
```

#### getCardsByXiuyuanId()

根据 Xiuyuan ID 查询卡片。

**签名**：

```typescript
getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[]
```

**示例**：

```typescript
const cards = storage.getCardsByXiuyuanId('xy_123');
```

#### getCardsByType()

根据类型查询卡片。

**签名**：

```typescript
getCardsByType(type: CardType): FSRSCard[]
```

**示例**：

```typescript
const conceptCards = storage.getCardsByType('concept');
```

### 3.2 统计方法

#### getStats()

获取统计信息。

**签名**：

```typescript
getStats(): {
  totalCards: number;
  totalXiuyuans: number;
  cardsByType: Record<CardType, number>;
  dueCards: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}
```

**示例**：

```typescript
const stats = storage.getStats();
console.log(`Total cards: ${stats.totalCards}`);
console.log(`Due cards: ${stats.dueCards}`);
```

## 4. TemplateRegistry

### 4.1 register()

注册模板。

**签名**：

```typescript
register(template: ICardTemplate): void
```

**示例**：

```typescript
const registry = new TemplateRegistry();
registry.register({
  id: 'custom-my-template',
  name: '我的模板',
  fields: [...],
  cardRules: [...],
});
```

### 4.2 get()

获取模板。

**签名**：

```typescript
get(templateId: string): ICardTemplate | undefined
```

**示例**：

```typescript
const template = registry.get('builtin-basic-qa');
```

### 4.3 getAll()

获取所有模板。

**签名**：

```typescript
getAll(): ICardTemplate[]
```

**示例**：

```typescript
const allTemplates = registry.getAll();
```

### 4.4 getBuiltin()

获取所有内置模板。

**签名**：

```typescript
getBuiltin(): ICardTemplate[]
```

**示例**：

```typescript
const builtinTemplates = registry.getBuiltin();
```

### 4.5 getCustom()

获取所有自定义模板。

**签名**：

```typescript
getCustom(): ICardTemplate[]
```

**示例**：

```typescript
const customTemplates = registry.getCustom();
```

## 5. 类型定义

### 5.1 CardType

```typescript
enum CardType {
  Item = 'item',
  Topic = 'topic',
  Concept = 'concept',
  Descriptor = 'descriptor',
}
```

### 5.2 SchedulerType

```typescript
type SchedulerType = 'fsrs-v6' | 'a-factor' | 'sm2';
```

### 5.3 ICardTemplate

```typescript
interface ICardTemplate {
  id: string;
  name: string;
  description?: string;
  fields: Array<{
    name: string;
    description?: string;
  }>;
  cardRules: Array<{
    typeMarker: string;
    frontFields: string[];
    backFields: string[];
  }>;
}
```

### 5.4 FSRSCard

```typescript
interface FSRSCard {
  // 身份
  id: string;
  xiuyuanID: string;
  blockId: string;
  
  // FSRS 核心
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  
  // 类型和模板
  type: CardType;
  templateID: string;
  schedulerType: SchedulerType;
  
  // 优先级
  priority: number;
  
  // 元数据
  meta: {
    xiuyuanID: string;
    templateID: string;
    frontBlockIDs: string[];
    backBlockIDs: string[];
    fieldMapping: Record<string, any>;
  };
  
  // 时间戳
  createdAt: number;
  updatedAt: number;
}
```

## 6. 错误处理

### 6.1 Result 类型

```typescript
type Result<T> = 
  | { ok: true; value: T }
  | { ok: false; error: Error };
```

### 6.2 错误示例

```typescript
const result = await cardService.createCard({ ... });

if (result.ok) {
  console.log('Success:', result.value);
} else {
  console.error('Error:', result.error.message);
}
```

### 6.3 常见错误

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `Invalid command: blockIds is required` | 缺少 blockIds | 提供 blockIds |
| `Template not found: xxx` | 模板不存在 | 检查模板 ID |
| `Card not found: xxx` | 卡片不存在 | 检查卡片 ID |
| `Xiuyuan not found: xxx` | Xiuyuan 不存在 | 检查 Xiuyuan ID |

## 7. 事件

### 7.1 CardCreated

卡片创建后发布。

```typescript
interface CardCreatedEvent {
  type: 'CardCreated';
  cardId: string;
  xiuyuanId: string;
  timestamp: number;
}
```

### 7.2 CardDeleted

卡片删除后发布。

```typescript
interface CardDeletedEvent {
  type: 'CardDeleted';
  cardId: string;
  xiuyuanId: string;
  timestamp: number;
}
```

### 7.3 CardUpdated

卡片更新后发布。

```typescript
interface CardUpdatedEvent {
  type: 'CardUpdated';
  cardId: string;
  changes: Partial<FSRSCard>;
  timestamp: number;
}
```

### 7.4 订阅事件

```typescript
eventBus.subscribe('CardCreated', (event) => {
  console.log('Card created:', event.cardId);
});
```

## 8. 最佳实践

### 8.1 创建卡片

```typescript
// ✅ 推荐：使用 CardCreationHelper
const helper = new CardCreationHelper(cardService);
await helper.createConceptCard(blockId, { useAFactor: true });

// ✅ 推荐：使用 CardApplicationService
await cardService.createCard({
  blockIds: [blockId],
  cardType: 'concept',
});

// ❌ 不推荐：直接操作存储
storage.setCard(card);  // 绕过业务逻辑
```

### 8.2 查询卡片

```typescript
// ✅ 推荐：使用索引查询
const dueCards = storage.getDueCards(100);  // O(1)

// ❌ 不推荐：遍历所有卡片
const allCards = storage.getAllCards();
const dueCards = allCards.filter(c => c.due <= Date.now());  // O(n)
```

### 8.3 错误处理

```typescript
// ✅ 推荐：使用 Result 类型
const result = await cardService.createCard({ ... });
if (!result.ok) {
  console.error(result.error);
  return;
}
const card = result.value;

// ❌ 不推荐：使用 try-catch
try {
  const card = await cardService.createCard({ ... });
} catch (error) {
  console.error(error);
}
```
