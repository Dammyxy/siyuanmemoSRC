# 存储架构分析 - Xiuyuan 和 Card 数据存储

## 问题

用户询问：Xiuyuan 聚合根和卡片数据是分开存放的吗？

## 架构调查结果

### 1. 数据存储结构

#### UnifiedStorageManager（统一存储管理器）

**位置**：`src/core/storage/UnifiedStorageManager.ts`

**内存数据结构**：
```typescript
class UnifiedStorageManager {
  // === 数据存储 ===
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cardDTOs: Map<string, CardPersistenceDTO> = new Map();
  
  // === 内存索引 ===
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  private indexByPriority: Map<number, string[]> = new Map();
}
```

**持久化数据结构**：
```typescript
interface UnifiedCardStore {
  version: number;
  xiuyuans: Record<string, IXiuyuan>;      // Xiuyuan 数据
  cards: Record<string, FSRSCard>;         // 向后兼容（从 cardDTOs 转换）
  cardDTOs?: Record<string, CardPersistenceDTO>;  // 主数据源
}
```

### 2. 数据存储方式

#### ✅ 是的，Xiuyuan 和 Card 数据是分开存放的

**存储层面**：
- **Xiuyuan 数据**：存储在 `xiuyuans` Map 中
- **Card 数据**：存储在 `cardDTOs` Map 中（新架构）或 `cards` Map 中（旧架构兼容）

**持久化文件**：
- 所有数据保存在同一个 MessagePack 文件中
- 但在文件内部，Xiuyuan 和 Card 是两个独立的字段

```json
{
  "version": 1,
  "xiuyuans": {
    "xy_123": { /* Xiuyuan 数据 */ }
  },
  "cardDTOs": {
    "card_456": { /* Card 数据 */ }
  }
}
```

### 3. Xiuyuan 持久化模型

#### IXiuyuan 接口

**位置**：`src/core/xiuyuan/types.ts`

```typescript
interface IXiuyuan {
  id: string;
  blockIDs: string[];
  fields: Array<{
    name: string;
    blockID: string;
    marker: string;
  }>;
  templateID: string;
  meta: {
    priority?: number;
    faces?: Array<{
      question: string;
      answer: string;
      questionBlockId: string;
      answerBlockId: string;
    }>;
    cards?: Array<{
      id: string;
      xiuyuanId: string;
      faceIndex: number;
      scheduleInfo: { /* ... */ };
      createdAt: number;
      updatedAt: number;
    }>;
    // ... 其他元数据
  };
  createdAt: number;
  updatedAt: number;
}
```

#### 关键发现：Xiuyuan 的 meta 中包含 cards 信息

**问题**：这违反了 DDD 原则！

在 `XiuyuanRepository.toPersistence()` 方法中：
```typescript
private toPersistence(xiuyuan: Xiuyuan): Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    // ...
    meta: {
      ...xiuyuan.getMeta(),
      priority: xiuyuan.getPriority().getValue(),
      faces: faces.map(/* ... */),
      cards: xiuyuan.getCards().map(card => ({  // ❌ 问题：将 Card 数据嵌入 Xiuyuan
        id: card.getId().getValue(),
        xiuyuanId: card.getXiuyuanId().getValue(),
        faceIndex: card.getFaceIndex(),
        scheduleInfo: { /* ... */ },
        createdAt: card.getCreatedAt().getTime(),
        updatedAt: card.getUpdatedAt().getTime()
      }))
    }
  };
}
```

### 4. 数据冗余问题

#### 当前架构的数据冗余

```
MessagePack 文件
├─ xiuyuans
│  └─ xy_123
│     └─ meta.cards  ← Card 数据（冗余）
│        ├─ card_456
│        └─ card_789
└─ cardDTOs
   ├─ card_456  ← Card 数据（主数据源）
   └─ card_789  ← Card 数据（主数据源）
```

**问题**：
1. **数据冗余**：Card 数据同时存在于 `xiuyuans[].meta.cards` 和 `cardDTOs`
2. **一致性风险**：两处数据可能不同步
3. **违反 DDD**：聚合根不应该包含子实体的完整数据

### 5. DDD 架构分析

#### ❌ 当前架构的问题

**违反 DDD 原则**：
1. **聚合根边界不清晰**
   - Xiuyuan 是聚合根
   - Card 是实体，属于 Xiuyuan 聚合
   - 但 Card 数据被分别存储在两个地方

2. **数据冗余**
   - `xiuyuans[].meta.cards` 包含完整的 Card 数据
   - `cardDTOs` 也包含完整的 Card 数据
   - 违反了"单一数据源"原则

3. **一致性问题**
   - 更新 Card 时需要同时更新两处
   - 容易出现数据不一致

#### ✅ 正确的 DDD 架构

**方案 1：Card 数据只存储在 Xiuyuan 中（聚合内部）**

```typescript
interface IXiuyuan {
  id: string;
  blockIDs: string[];
  templateID: string;
  faces: Array<CardFace>;
  cards: Array<Card>;  // ✅ Card 作为聚合内部实体
  priority: number;
  meta: { /* 其他元数据 */ };
  createdAt: number;
  updatedAt: number;
}

// ❌ 不需要独立的 cardDTOs
```

**优点**：
- 符合 DDD 聚合模式
- 数据一致性由聚合根保证
- 没有数据冗余

**缺点**：
- 查询单个 Card 需要加载整个 Xiuyuan
- 性能可能受影响（如果 Xiuyuan 很大）

**方案 2：Card 数据只存储在 cardDTOs 中（分离存储）**

```typescript
interface IXiuyuan {
  id: string;
  blockIDs: string[];
  templateID: string;
  faces: Array<CardFace>;
  cardIds: string[];  // ✅ 只存储 Card ID 引用
  priority: number;
  meta: { /* 其他元数据 */ };
  createdAt: number;
  updatedAt: number;
}

// ✅ Card 数据独立存储
interface CardPersistenceDTO {
  id: string;
  xiuyuanId: string;  // 反向引用
  faceIndex: number;
  // ... 其他 Card 数据
}
```

**优点**：
- 查询 Card 不需要加载 Xiuyuan
- 性能更好（特别是大量卡片时）
- 支持独立的 Card 索引

**缺点**：
- 需要维护双向引用
- 删除 Xiuyuan 时需要级联删除 Card
- 稍微偏离传统 DDD 聚合模式

### 6. 当前实现的混合方案

**实际情况**：你的代码使用了混合方案

```typescript
// XiuyuanRepository.save()
async save(xiuyuan: Xiuyuan): Promise<Result<void>> {
  // 1. 保存 Xiuyuan（包含 meta.cards）
  const persistenceModel = this.toPersistenceWithId(xiuyuan);
  (this.storage as any).xiuyuans.set(xiuyuanId, persistenceModel);
  
  // 2. 同时保存 Card 到 cardDTOs
  for (const card of cards) {
    const fsrsCard = await this.cardToFSRSCard(card, xiuyuan);
    await this.storage.createCard(persistenceModel, fsrsCard);
  }
}
```

**问题**：
- Card 数据存储了两次
- `xiuyuans[].meta.cards` 和 `cardDTOs` 可能不同步
- 浪费存储空间

### 7. 建议的修复方案

#### 推荐：方案 2（分离存储）

**原因**：
1. 你已经有了 `cardDTOs` 和索引系统
2. 性能更好（支持快速查询单个 Card）
3. 符合你的查询需求（按 blockId、xiuyuanId、type 等查询）

**修改步骤**：

**步骤 1：修改 IXiuyuan 接口**

```typescript
interface IXiuyuan {
  id: string;
  blockIDs: string[];
  templateID: string;
  priority: number;
  meta: {
    faces: Array<{
      question: string;
      answer: string;
      questionBlockId: string;
      answerBlockId: string;
    }>;
    cardIds: string[];  // ✅ 只存储 Card ID
    // ❌ 移除 cards 字段
    // ... 其他元数据
  };
  createdAt: number;
  updatedAt: number;
}
```

**步骤 2：修改 XiuyuanRepository.toPersistence()**

```typescript
private toPersistence(xiuyuan: Xiuyuan): Omit<IXiuyuan, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    blockIDs: xiuyuan.getBlockIDs().map(b => b.getValue()),
    templateID: xiuyuan.getTemplateID().getValue(),
    priority: xiuyuan.getPriority().getValue(),
    meta: {
      faces: faces.map(face => ({
        question: face.question,
        answer: face.answer,
        questionBlockId: face.questionBlockId,
        answerBlockId: face.answerBlockId
      })),
      cardIds: xiuyuan.getCards().map(card => card.getId().getValue()),  // ✅ 只存储 ID
      // ❌ 移除完整的 cards 数据
    }
  };
}
```

**步骤 3：修改 XiuyuanRepository.toDomain()**

```typescript
private toDomain(data: IXiuyuan): Result<Xiuyuan | null> {
  // ... 转换 ID、BlockIDs、TemplateID、Faces、Priority
  
  // 6. 从 cardDTOs 加载 Cards（而不是从 meta.cards）
  const cardIds = (data.meta?.cardIds as string[]) || [];
  const cards: Card[] = [];
  
  for (const cardId of cardIds) {
    const cardDTO = this.storage.getCardDTO(cardId);
    if (cardDTO) {
      const cardResult = this.cardFromDTO(cardDTO);
      if (cardResult.ok) {
        cards.push(cardResult.value);
      }
    }
  }
  
  // 7. 创建 Xiuyuan（使用 createFromPersistence 工厂方法）
  const xiuyuanResult = Xiuyuan.createFromPersistence({
    id: idResult.value,
    blockIDs,
    templateID: templateIDResult.value,
    faces,
    priority: priorityResult.ok ? priorityResult.value : Priority.createDefault(),
    cards,  // ✅ 从 cardDTOs 加载的 Cards
    meta: data.meta || {},
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt)
  });
  
  return xiuyuanResult;
}
```

**步骤 4：添加 Xiuyuan.createFromPersistence() 工厂方法**

```typescript
// src/core/xiuyuan/domain/Xiuyuan.ts
class Xiuyuan {
  /**
   * 从持久化数据创建 Xiuyuan（包含已有的 Cards）
   */
  static createFromPersistence(props: {
    id: XiuyuanId;
    blockIDs: BlockId[];
    templateID: TemplateId;
    faces: CardFace[];
    priority: Priority;
    cards: Card[];  // ✅ 已有的 Cards
    meta: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
  }): Result<Xiuyuan> {
    const xiuyuan = new Xiuyuan(
      props.id,
      props.blockIDs,
      props.templateID,
      props.faces,
      props.priority,
      new Map(props.cards.map(c => [c.getId(), c])),  // ✅ 恢复 Cards
      props.meta,
      props.createdAt,
      props.updatedAt
    );
    
    return ok(xiuyuan);
  }
}
```

### 8. 迁移策略

**向后兼容**：

```typescript
// XiuyuanRepository.toDomain()
private toDomain(data: IXiuyuan): Result<Xiuyuan | null> {
  // ... 其他转换
  
  // 6. 加载 Cards（支持新旧格式）
  let cards: Card[] = [];
  
  // 🆕 新格式：从 cardIds 加载
  const cardIds = (data.meta?.cardIds as string[]) || [];
  if (cardIds.length > 0) {
    for (const cardId of cardIds) {
      const cardDTO = this.storage.getCardDTO(cardId);
      if (cardDTO) {
        const cardResult = this.cardFromDTO(cardDTO);
        if (cardResult.ok) {
          cards.push(cardResult.value);
        }
      }
    }
  } else {
    // 🔄 旧格式：从 meta.cards 加载（向后兼容）
    const cardsData = (data.meta?.cards as any[]) || [];
    for (const cardData of cardsData) {
      const cardResult = this.cardFromData(cardData);
      if (cardResult.ok) {
        cards.push(cardResult.value);
      }
    }
    console.log('[XiuyuanRepository] ⚠️ Loaded cards from legacy meta.cards format');
  }
  
  // ...
}
```

## 总结

### 当前架构

- ✅ Xiuyuan 和 Card 数据在内存中是分开的（`xiuyuans` Map 和 `cardDTOs` Map）
- ✅ 持久化文件中也是分开的字段
- ❌ 但 Xiuyuan 的 `meta.cards` 中包含了完整的 Card 数据（冗余）
- ❌ 违反了"单一数据源"原则

### 建议修复

1. **移除 `meta.cards`**：只保留 `meta.cardIds`
2. **Card 数据只存储在 `cardDTOs`**：单一数据源
3. **加载时从 `cardDTOs` 重建 Cards**：保持聚合完整性
4. **向后兼容**：支持从旧格式迁移

### DDD 合规性

修复后：
- ✅ 单一数据源（cardDTOs）
- ✅ 聚合根通过 ID 引用子实体
- ✅ 没有数据冗余
- ✅ 性能更好（支持独立查询 Card）
- ✅ 符合 DDD 分离存储模式

### 影响评估

**修改范围**：
- `IXiuyuan` 接口
- `XiuyuanRepository.toPersistence()`
- `XiuyuanRepository.toDomain()`
- `Xiuyuan.createFromPersistence()` 工厂方法

**风险**：
- 低（向后兼容，支持旧数据迁移）

**收益**：
- 消除数据冗余
- 提高数据一致性
- 符合 DDD 原则
- 减少存储空间

## 下一步

1. ⏳ 决定是否修复数据冗余问题
2. ⏳ 如果修复，实现上述方案
3. ⏳ 编写迁移脚本
4. ⏳ 测试向后兼容性
