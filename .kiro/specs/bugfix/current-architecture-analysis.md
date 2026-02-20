# 当前架构分析 - Xiuyuan 卡片系统

## 概述

本文档详细分析当前 Xiuyuan 卡片系统的架构，特别是**思源块 → Xiuyuan 聚合根 → 多张卡片**的映射关系。

## 核心概念

### 1. 思源块（SiYuan Block）

**定义**：思源笔记中的内容块，是最小的内容单元。

**示例**：
```markdown
DDD <> 领域驱动设计
```

**特点**：
- 每个块有唯一的 `blockId`（如 `20240101120000-abc123`）
- 块可以包含文本、图片、代码等内容
- 块可以有自定义属性（custom attributes）

### 2. Xiuyuan 聚合根（Xiuyuan Aggregate Root）

**定义**：DDD 架构中的聚合根，管理一组相关卡片的生命周期。

**职责**：
- 封装业务规则（如：至少一个块、至少一个面）
- 管理卡片的创建和删除
- 维护数据一致性
- 发布领域事件

**关键属性**：
```typescript
class Xiuyuan {
  private id: XiuyuanId;              // Xiuyuan ID
  private blockIDs: BlockId[];        // 关联的块 ID 列表
  private templateID: TemplateId;     // 模板 ID
  private faces: CardFace[];          // 卡片面列表
  private priority: Priority;         // 优先级
  private cards: Map<CardId, Card>;   // 卡片集合
  private meta: Record<string, unknown>; // 元数据
}
```

### 3. Card 实体（Card Entity）

**定义**：领域层的卡片实体，表示一张可复习的卡片。

**职责**：
- 封装 FSRS 调度信息
- 关联到 Xiuyuan 和 CardFace
- 记录复习历史

**关键属性**：
```typescript
class Card {
  private id: CardId;                 // 卡片 ID
  private xiuyuanId: XiuyuanId;       // 所属 Xiuyuan
  private faceIndex: number;          // 面索引
  private scheduleInfo: ScheduleInfo; // FSRS 调度信息
}
```

## 映射关系

### 完整的映射流程

```
┌─────────────────────────────────────────────────────────────┐
│                    思源块 (SiYuan Block)                     │
│  - blockId: '20240101120000-abc123'                          │
│  - content: 'DDD <> 领域驱动设计'                            │
│  - custom-xiuyuan-id: 'xy_123'                               │
│  - custom-xiuyuan-template: 'builtin-quick-bidirectional'    │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:1 映射
                              │ (通过 blockId)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Xiuyuan 聚合根 (Aggregate Root)                 │
│  - id: 'xy_123'                                              │
│  - blockIDs: ['20240101120000-abc123']                       │
│  - templateID: 'builtin-quick-bidirectional'                 │
│  - faces: [                                                  │
│      { question: 'DDD', answer: '领域驱动设计' },            │
│      { question: '领域驱动设计', answer: 'DDD' }             │
│    ]                                                         │
│  - cards: Map {                                              │
│      'card-1' => Card { faceIndex: 0 },                      │
│      'card-2' => Card { faceIndex: 1 }                       │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N 映射
                              │ (一个 Xiuyuan 包含多张 Card)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      多张卡片 (Cards)                        │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 1 (正向卡片)                                    │    │
│  │ - id: 'card-1'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - faceIndex: 0                                       │    │
│  │ - scheduleInfo: { due, stability, difficulty, ... } │    │
│  │ - blockId: '20240101120000-abc123'                   │    │
│  │ - type: 'item'                                       │    │
│  │ - meta: {                                            │    │
│  │     xiuyuanID: 'xy_123',                             │    │
│  │     templateID: 'builtin-quick-bidirectional',       │    │
│  │     ruleIndex: 0,                                    │    │
│  │     frontFields: ['DDD'],                            │    │
│  │     backFields: ['领域驱动设计']                      │    │
│  │   }                                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Card 2 (反向卡片)                                    │    │
│  │ - id: 'card-2'                                       │    │
│  │ - xiuyuanID: 'xy_123'                                │    │
│  │ - faceIndex: 1                                       │    │
│  │ - scheduleInfo: { due, stability, difficulty, ... } │    │
│  │ - blockId: '20240101120000-abc123'                   │    │
│  │ - type: 'item'                                       │    │
│  │ - meta: {                                            │    │
│  │     xiuyuanID: 'xy_123',                             │    │
│  │     templateID: 'builtin-quick-bidirectional',       │    │
│  │     ruleIndex: 1,                                    │    │
│  │     frontFields: ['领域驱动设计'],                    │    │
│  │     backFields: ['DDD']                              │    │
│  │   }                                                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 关键映射规则

1. **思源块 → Xiuyuan**：1:1 关系
   - 一个块对应一个 Xiuyuan
   - 通过块属性 `custom-xiuyuan-id` 关联

2. **Xiuyuan → Cards**：1:N 关系
   - 一个 Xiuyuan 可以包含多张卡片
   - 每张卡片对应一个 CardFace（面）
   - 双向卡片模板：2 张卡片（正向 + 反向）
   - 列表模板：N 张卡片（每个列表项一张）

3. **Card → FSRSCard**：1:1 关系
   - Card 是领域实体（包含业务逻辑）
   - FSRSCard 是持久化模型（存储在 UnifiedStorageManager）

## DDD 分层架构

### 完整的分层结构

```
┌─────────────────────────────────────────────────────────────┐
│                    表现层 (Presentation)                     │
│  • DialogManager - 模板选择对话框                            │
│  • MenuManager - 块菜单（创建卡片）                          │
│  • CardBrowser - 卡片浏览器                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    应用层 (Application)                      │
│  • CardApplicationService - 统一入口                         │
│    ├─ createCard(blockIds, templateId)                      │
│    ├─ deleteCard(cardId)                                    │
│    └─ updateCard(cardId, data)                              │
│                                                              │
│  • Use Cases (用例)                                          │
│    ├─ CreateCardUseCase                                     │
│    ├─ DeleteCardUseCase                                     │
│    └─ UpdateCardUseCase                                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    领域层 (Domain)                           │
│  • Xiuyuan (聚合根)                                          │
│    ├─ createCard(faceIndex) → Card                          │
│    ├─ deleteCard(cardId)                                    │
│    └─ getCards() → Card[]                                   │
│                                                              │
│  • Card (实体)                                               │
│    ├─ updateScheduleInfo(scheduleInfo)                      │
│    └─ getScheduleInfo() → ScheduleInfo                      │
│                                                              │
│  • 领域服务                                                  │
│    ├─ CardCreationService                                   │
│    └─ CardDeletionService                                   │
│                                                              │
│  • 值对象                                                    │
│    ├─ XiuyuanId, CardId, BlockId                            │
│    ├─ TemplateId, Priority                                  │
│    ├─ CardFace, ScheduleInfo                                │
│    └─ ...                                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  基础设施层 (Infrastructure)                 │
│  • XiuyuanRepository (仓储实现)                              │
│    ├─ save(xiuyuan) → 保存到 UnifiedStorageManager          │
│    ├─ findById(id) → 从 UnifiedStorageManager 加载          │
│    ├─ findByBlockId(blockId)                                │
│    └─ delete(xiuyuan)                                       │
│                                                              │
│  • UnifiedStorageManager (统一存储)                          │
│    ├─ xiuyuans: Map<string, IXiuyuan>                       │
│    ├─ cards: Map<string, FSRSCard>                          │
│    ├─ 内存索引（blockID, xiuyuanID, type, due, priority）   │
│    └─ MessagePack 持久化                                    │
└─────────────────────────────────────────────────────────────┘
```

## 映射层的作用

### XiuyuanRepository 的映射职责

`XiuyuanRepository` 是映射层的核心，负责：

#### 1. 领域模型 → 持久化模型

```typescript
// Xiuyuan 聚合根 → IXiuyuan (持久化模型)
private toPersistenceWithId(xiuyuan: Xiuyuan): IXiuyuan {
  return {
    id: xiuyuan.getId().getValue(),
    blockIDs: xiuyuan.getBlockIDs().map(b => b.getValue()),
    templateID: xiuyuan.getTemplateID().getValue(),
    fields: [...],
    meta: {
      priority: xiuyuan.getPriority().getValue(),
      faces: xiuyuan.getFaces().map(face => ({...})),
      cards: xiuyuan.getCards().map(card => ({...}))  // ✅ 卡片也存储在 meta 中
    },
    createdAt: xiuyuan.getCreatedAt().getTime(),
    updatedAt: xiuyuan.getUpdatedAt().getTime()
  };
}
```

#### 2. Card 实体 → FSRSCard (持久化模型)

```typescript
// Card 领域实体 → FSRSCard
private cardToFSRSCard(card: Card, xiuyuan: Xiuyuan): FSRSCard {
  return {
    id: card.getId().getValue(),
    xiuyuanID: card.getXiuyuanId().getValue(),
    blockId: xiuyuan.getBlockIDs()[0]?.getValue() || '',
    
    // FSRS 调度信息
    due: card.getScheduleInfo().due.getTime(),
    stability: card.getScheduleInfo().stability,
    difficulty: card.getScheduleInfo().difficulty(),
    // ...
    
    // 元数据
    meta: {
      xiuyuanID: card.getXiuyuanId().getValue(),
      templateID: xiuyuan.getTemplateID().getValue(),
      ruleIndex: card.getFaceIndex(),
      // ...
    }
  };
}
```

#### 3. 持久化模型 → 领域模型

```typescript
// IXiuyuan → Xiuyuan 聚合根
private toDomain(data: IXiuyuan): Result<Xiuyuan | null> {
  // 1. 转换值对象
  const idResult = XiuyuanId.create(data.id);
  const blockIDResults = data.blockIDs.map(id => BlockId.create(id));
  const templateIDResult = TemplateId.create(data.templateID);
  
  // 2. 转换 CardFace
  const facesData = (data.meta?.faces as any[]) || [];
  const faces = facesData.map(f => CardFace.create({...}));
  
  // 3. 转换 Card 实体
  const cardsData = (data.meta?.cards as any[]) || [];
  const cardsMap = new Map<CardId, Card>();
  for (const cardData of cardsData) {
    const card = Card.create({...});
    cardsMap.set(card.getId(), card);
  }
  
  // 4. 重建 Xiuyuan 聚合根
  return Xiuyuan.reconstitute({
    id, blockIDs, templateID, faces, cards: cardsMap, ...
  });
}
```

### 数据流向

#### 创建卡片流程

```
1. 用户操作
   ↓
2. MenuManager.createCard(blockIds, templateId)
   ↓
3. CardApplicationService.createCard(command)
   ↓
4. CreateCardUseCase.execute(command)
   ↓
5. Xiuyuan.create({ blockIDs, templateID, faces })
   ↓
6. xiuyuan.createCard(faceIndex) → Card 实体
   ↓
7. XiuyuanRepository.save(xiuyuan)
   ├─ toPersistenceWithId(xiuyuan) → IXiuyuan
   ├─ cardToFSRSCard(card) → FSRSCard
   ├─ storage.createCard(xiuyuan, fsrsCard)
   └─ setBlockAttrs(blockId, { 'custom-xiuyuan-id': ... })
   ↓
8. UnifiedStorageManager
   ├─ xiuyuans.set(id, xiuyuan)
   ├─ cards.set(id, fsrsCard)
   └─ scheduleSave() → MessagePack
```

#### 删除卡片流程

```
1. 用户操作
   ↓
2. CardBrowser.deleteCard(cardId)
   ↓
3. CardApplicationService.deleteCard(command)
   ↓
4. DeleteCardUseCase.execute(command)
   ├─ findXiuyuanAndCardId(cardId)
   │   └─ xiuyuanRepo.findAll() → 遍历所有 Xiuyuan
   ├─ xiuyuan.deleteCard(cardId)
   └─ xiuyuanRepo.save(xiuyuan)
   ↓
5. XiuyuanRepository.save(xiuyuan)
   ├─ toPersistenceWithId(xiuyuan) → IXiuyuan (不包含已删除的 Card)
   └─ storage.updateCard(fsrsCard) / storage.deleteCard(cardId)
   ↓
6. UnifiedStorageManager
   ├─ xiuyuans.set(id, xiuyuan)
   ├─ cards.delete(cardId)
   └─ scheduleSave() → MessagePack
```

## 存储结构

### UnifiedStorageManager 的数据结构

```typescript
interface UnifiedCardStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;     // Xiuyuan 元数据
  cards: Record<string, FSRSCard>;        // 独立存储的卡片
  cardDTOs?: Record<string, CardPersistenceDTO>; // 卡片 DTO（可选）
}
```

**关键点**：
- `xiuyuans` 和 `cards` 是**平级**的，不是嵌套关系
- 通过 `card.xiuyuanID` 关联到 Xiuyuan
- 通过 `card.blockId` 关联到思源块

### 示例数据

```json
{
  "version": 1,
  "xiuyuans": {
    "xy_123": {
      "id": "xy_123",
      "blockIDs": ["20240101120000-abc123"],
      "templateID": "builtin-quick-bidirectional",
      "fields": [
        { "name": "content", "blockID": "20240101120000-abc123", "marker": "question" }
      ],
      "meta": {
        "priority": 50,
        "schedulerType": "fsrs-v6"
      },
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    }
  },
  "cards": {
    "card-1": {
      "id": "card-1",
      "xiuyuanID": "xy_123",  // ← 通过这个关联到 Xiuyuan
      "blockId": "20240101120000-abc123",
      "due": 1704153600000,
      "stability": 1.0,
      "difficulty": 5.0,
      "reps": 0,
      "lapses": 0,
      "state": 0,
      "type": "item",
      "templateID": "builtin-quick-bidirectional",
      "priority": 50,
      "meta": {
        "xiuyuanID": "xy_123",
        "templateID": "builtin-quick-bidirectional",
        "ruleIndex": 0,
        "frontFields": ["DDD"],
        "backFields": ["领域驱动设计"]
      },
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    },
    "card-2": {
      "id": "card-2",
      "xiuyuanID": "xy_123",  // ← 同一个 Xiuyuan
      "blockId": "20240101120000-abc123",
      "due": 1704153600000,
      "stability": 1.0,
      "difficulty": 5.0,
      "reps": 0,
      "lapses": 0,
      "state": 0,
      "type": "item",
      "templateID": "builtin-quick-bidirectional",
      "priority": 50,
      "meta": {
        "xiuyuanID": "xy_123",
        "templateID": "builtin-quick-bidirectional",
        "ruleIndex": 1,
        "frontFields": ["领域驱动设计"],
        "backFields": ["DDD"]
      },
      "createdAt": 1704067200000,
      "updatedAt": 1704067200000
    }
  }
}
```

**注意**：
- ❌ 卡片**不存储**在 `xiuyuans[id].meta.cards` 中
- ✅ 卡片**独立存储**在 `cards[id]` 中
- ✅ 通过 `card.xiuyuanID` 建立关联关系

## 关键设计决策

### 1. 为什么需要 Xiuyuan 聚合根？

**原因**：
- **业务规则封装**：确保至少一个块、至少一个面
- **数据一致性**：删除 Xiuyuan 时级联删除所有卡片
- **事务边界**：Xiuyuan 是事务的边界
- **领域事件**：发布 XiuyuanCreated、CardCreated 等事件

### 2. 卡片是单独存储的！

**存储方式**：
```
xiuyuans: Map<string, IXiuyuan>    // Xiuyuan 元数据
cards: Map<string, FSRSCard>       // 独立存储的卡片（通过 xiuyuanID 关联）
```

**不是嵌套存储**：
- ❌ 卡片**不存储**在 `xiuyuans[id].meta.cards` 中
- ✅ 卡片**独立存储**在 `cards[id]` 中
- ✅ 通过 `card.xiuyuanID` 建立关联

**为什么这样设计？**
- **查询性能**：独立的 cards Map 支持 O(1) 查询
- **内存索引**：可以为 cards 建立多个索引（blockID, xiuyuanID, type, due, priority）
- **数据一致性**：通过 xiuyuanID 关联，而不是嵌套存储
- **灵活性**：可以独立更新卡片的 FSRS 数据，不需要加载整个 Xiuyuan
- **向后兼容**：保持与旧架构的兼容性

### 3. 为什么需要映射层？

**原因**：
- **领域模型与持久化模型分离**：
  - 领域模型：Card Entity（包含业务逻辑）
  - 持久化模型：FSRSCard（纯数据结构）
- **类型转换**：
  - 值对象 ↔ 原始类型
  - Date ↔ timestamp
  - Map ↔ Array
- **数据验证**：加载时验证数据完整性
- **聚合根重建**：从分散的数据重建 Xiuyuan 聚合根

## 当前问题和修复

### 问题：XiuyuanRepository 使用错误的 storage

**错误代码**：
```typescript
// ❌ 错误：传入 XiuyuanStorage
const xiuyuanRepo = new XiuyuanRepository(
    context.getXiuyuanStorage(),  // XiuyuanStorage
    context.getPlugin()
);
```

**问题**：
- `XiuyuanRepository` 期望 `UnifiedStorageManager`
- 实际传入 `XiuyuanStorage`
- 方法名不匹配：`getAllXiuyuans()` vs `getAllXiuYuans()`

**修复**：
```typescript
// ✅ 正确：传入 UnifiedStorageManager
const xiuyuanRepo = new XiuyuanRepository(
    context.getStorage(),  // UnifiedStorageManager
    context.getPlugin()
);
```

**原因**：
- `UnifiedStorageManager` 是统一的数据访问层
- 所有 Repository 都应该使用它
- `XiuyuanStorage` 只用于模板管理

## 总结

### 核心映射关系

```
思源块 (1) → Xiuyuan 聚合根 (1) → 多张 Card (N)
```

### 映射层职责

1. **XiuyuanRepository**：
   - 领域模型 ↔ 持久化模型转换
   - 协调 UnifiedStorageManager、块属性、Riff
   - 发布领域事件

2. **UnifiedStorageManager**：
   - 统一存储 Xiuyuan 和 Card
   - 提供内存索引（blockID, xiuyuanID, type, due, priority）
   - MessagePack 持久化

### DDD 架构优势

1. **职责清晰**：每层有明确的职责
2. **易于测试**：可以 Mock Repository
3. **业务规则封装**：Xiuyuan 聚合根封装业务逻辑
4. **数据一致性**：通过聚合根保证一致性
5. **可扩展性**：易于添加新的卡片类型和模板

## 相关文档

- [Xiuyuan 统一架构设计](../xiuyuan-unification/design.md)
- [XiuyuanRepository Storage 修复](./xiuyuan-repository-storage-fix.md)
- [DDD 架构文档](../storage-manager-ddd-refactoring/ARCHITECTURE.md)


---

## 补充说明：文件存储方式

### 问题：卡片是单独存储在不同文件吗？

**答案：不是！所有数据存储在同一个文件中。**

### 实际的文件结构

**文件名**：`unified-cards.msgpack`

**文件内容**：
```json
{
  "version": 1,
  "xiuyuans": {
    "xy_123": {
      "id": "xy_123",
      "blockIDs": ["block-1"],
      "templateID": "builtin-quick-bidirectional",
      "fields": [...],
      "meta": { "priority": 50 }
    }
  },
  "cards": {
    "card-1": {
      "id": "card-1",
      "xiuyuanID": "xy_123",
      "blockId": "block-1",
      "due": 1704153600000,
      ...
    },
    "card-2": {
      "id": "card-2",
      "xiuyuanID": "xy_123",
      "blockId": "block-1",
      "due": 1704153600000,
      ...
    }
  },
  "cardDTOs": {
    "card-1": { ... },
    "card-2": { ... }
  }
}
```

### 关键点

1. **单文件存储**：
   - ❌ 不是分开存储在 `xiuyuan.msgpack` 和 `cards.msgpack`
   - ✅ 存储在同一个文件 `unified-cards.msgpack` 中

2. **平级字段**：
   - 在文件内部，`xiuyuans` 和 `cards` 是平级的独立字段
   - 不是嵌套关系（cards 不在 xiuyuans 内部）

3. **关联方式**：
   - 通过 `card.xiuyuanID` 关联到 `xiuyuan.id`
   - 通过 `card.blockId` 关联到思源块

### 为什么用一个文件？

**优势**：
1. **原子性**：保存时要么全部成功，要么全部失败
2. **一致性**：避免 xiuyuan 和 cards 文件不同步
3. **简化管理**：只需要管理一个文件的读写
4. **性能**：一次 I/O 操作加载所有数据

**实现**：
```typescript
// UnifiedStoragePersistence.ts
export const UNIFIED_STORAGE_KEY = 'unified-cards.msgpack';

// 保存时
await plugin.saveData(UNIFIED_STORAGE_KEY, {
  version: 1,
  xiuyuans: {...},
  cards: {...},
  cardDTOs: {...}
});

// 加载时
const data = await plugin.loadData(UNIFIED_STORAGE_KEY);
```

### 内存中的结构

虽然存储在一个文件中，但在内存中是完全独立的：

```typescript
class UnifiedStorageManager {
  // 独立的 Map
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  private cardDTOs: Map<string, CardPersistenceDTO> = new Map();
  
  // 内存索引（只为 cards 建立）
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();
}
```

### 查询性能

即使存储在一个文件中，查询性能仍然很高：

1. **加载时**：一次性加载到内存，构建索引
2. **查询时**：直接从内存 Map 查询，O(1) 时间复杂度
3. **保存时**：防抖保存（1 秒延迟），避免频繁 I/O

**示例**：
```typescript
// O(1) 查询
const card = storage.getCard('card-1');

// O(1) 查询（通过索引）
const cards = storage.getCardsByXiuyuanId('xy_123');

// O(log n) 查询（通过排序索引）
const dueCards = storage.getDueCards(100);
```

### 总结

- **文件层面**：所有数据存储在 `unified-cards.msgpack` 一个文件中
- **数据层面**：`xiuyuans` 和 `cards` 是平级的独立字段
- **内存层面**：使用独立的 Map 和索引，支持高性能查询
- **关联方式**：通过 `xiuyuanID` 建立关联，不是嵌套存储
