# 完整 DDD 架构迁移指南

## 概述

本文档说明如何将现有架构迁移到完整的 DDD 架构，包括：

1. **领域层**：Card Entity（真正的领域模型）
2. **领域层**：ICardRepository（仓储接口）
3. **基础设施层**：CardRepository（仓储实现）
4. **基础设施层**：CardMapper（模型映射）
5. **基础设施层**：CardPersistenceDTO（持久化模型）

## 架构对比

### 当前架构（Interface-based）

```
Application Layer
    ↓
FSRSCard (interface) ← 直接使用
    ↓
UnifiedStorageManager ← 混合领域和基础设施逻辑
    ↓
MessagePack
```

**问题**：
- ❌ FSRSCard 是 interface，无业务逻辑
- ❌ UnifiedStorageManager 混合职责
- ❌ 缺少抽象层，难以测试和替换

### 完整 DDD 架构（Entity-based）

```
Application Layer
    ↓
Card Entity ← 包含业务逻辑
    ↓
ICardRepository (interface) ← 抽象层
    ↓
CardRepository (implementation) ← 基础设施实现
    ↓
CardMapper ← 模型转换
    ↓
CardPersistenceDTO ← 持久化模型
    ↓
UnifiedStorageManager ← 纯存储逻辑
    ↓
MessagePack
```

**优势**：
- ✅ Card Entity 包含业务逻辑
- ✅ ICardRepository 提供抽象
- ✅ 职责清晰分离
- ✅ 易于测试和替换

## 核心组件

### 1. Card Entity（领域实体）

**位置**：`src/domain/entities/Card.ts`

**特点**：
- 使用 class 而不是 interface
- 包含业务方法（isOverdue, markAsLeech, etc.）
- 使用值对象（CardId, BlockId, Priority）
- 私有构造函数 + 工厂方法
- 自验证

**示例**：
```typescript
// 创建卡片
const cardResult = Card.create({
  id: 'card-1',
  blockId: 'block-1',
  // ... 其他字段
});

if (cardResult.ok) {
  const card = cardResult.value;
  
  // 业务方法
  if (card.isOverdue()) {
    console.log('Card is overdue!');
  }
  
  card.markAsLeech();
  card.addTag('important');
}
```

### 2. ICardRepository（仓储接口）

**位置**：`src/domain/repositories/ICardRepository.ts`

**特点**：
- 定义在领域层
- 使用领域语言（Card Entity）
- 技术无关（不暴露存储细节）
- 集合语义

**示例**：
```typescript
interface ICardRepository {
  save(card: Card): Promise<Result<void>>;
  findById(id: string): Promise<Result<Card | null>>;
  findDueCards(limit: number): Promise<Result<Card[]>>;
  // ...
}
```

### 3. CardRepository（仓储实现）

**位置**：`src/infrastructure/persistence/CardRepository.ts`

**特点**：
- 实现 ICardRepository 接口
- 使用 CardMapper 进行转换
- 委托给 UnifiedStorageManager
- 处理错误和异常

**示例**：
```typescript
class CardRepository implements ICardRepository {
  constructor(private storage: UnifiedStorageManager) {}
  
  async save(card: Card): Promise<Result<void>> {
    // 1. Entity → DTO
    const dto = CardMapper.fromEntity(card);
    
    // 2. 保存 DTO
    await this.storage.saveDTO(dto);
    
    return ok(undefined);
  }
}
```

### 4. CardMapper（映射器）

**位置**：`src/infrastructure/persistence/mappers/CardMapper.ts`

**新增方法**：
```typescript
class CardMapper {
  // 🆕 Entity → DTO
  static fromEntity(card: Card): CardPersistenceDTO { }
  
  // 🆕 DTO → Entity
  static toEntity(dto: CardPersistenceDTO): Result<Card> { }
  
  // 保留向后兼容
  static toPersistence(fsrsCard: FSRSCard): CardPersistenceDTO { }
  static toDomain(dto: CardPersistenceDTO): FSRSCard { }
}
```

## 迁移策略

### 阶段 1：并行运行（推荐）

**目标**：新旧架构并存，逐步迁移

**步骤**：

1. **保留 FSRSCard 接口**（向后兼容）
   ```typescript
   // 旧代码继续使用
   const fsrsCard: FSRSCard = { ... };
   ```

2. **引入 Card Entity**（新代码使用）
   ```typescript
   // 新代码使用 Entity
   const cardResult = Card.create({ ... });
   ```

3. **提供转换函数**
   ```typescript
   // FSRSCard → Card Entity
   function fsrsCardToEntity(fsrsCard: FSRSCard): Result<Card> {
     const dto = CardMapper.toPersistence(fsrsCard);
     return CardMapper.toEntity(dto);
   }
   
   // Card Entity → FSRSCard
   function entityToFSRSCard(card: Card): FSRSCard {
     const dto = CardMapper.fromEntity(card);
     return CardMapper.toDomain(dto);
   }
   ```

4. **逐步迁移应用层代码**
   ```typescript
   // 旧代码
   class OldService {
     async getCard(id: string): Promise<FSRSCard | null> {
       return this.storage.getCard(id);
     }
   }
   
   // 新代码
   class NewService {
     constructor(private repo: ICardRepository) {}
     
     async getCard(id: string): Promise<Card | null> {
       const result = await this.repo.findById(id);
       return result.ok ? result.value : null;
     }
   }
   ```

### 阶段 2：完全迁移（可选）

**目标**：移除 FSRSCard，只使用 Card Entity

**步骤**：

1. **更新所有应用层代码**
2. **更新所有测试**
3. **移除 FSRSCard 接口**
4. **更新文档**

## 使用示例

### 示例 1：创建卡片

```typescript
// 应用层服务
class CardApplicationService {
  constructor(private repo: ICardRepository) {}
  
  async createCard(blockId: string, type: CardType): Promise<Result<Card>> {
    // 1. 创建 Entity
    const cardResult = Card.createNew(blockId, type);
    if (!cardResult.ok) {
      return cardResult;
    }
    
    const card = cardResult.value;
    
    // 2. 业务逻辑
    if (type === 'concept') {
      card.addTag('concept');
    }
    
    // 3. 保存
    const saveResult = await this.repo.save(card);
    if (!saveResult.ok) {
      return err(saveResult.error);
    }
    
    return ok(card);
  }
}
```

### 示例 2：复习卡片

```typescript
class ReviewService {
  constructor(private repo: ICardRepository) {}
  
  async reviewCard(cardId: string, rating: Rating): Promise<Result<void>> {
    // 1. 加载 Entity
    const cardResult = await this.repo.findById(cardId);
    if (!cardResult.ok || !cardResult.value) {
      return err(new Error('Card not found'));
    }
    
    const card = cardResult.value;
    
    // 2. 业务逻辑
    if (rating === Rating.Again) {
      card.recordLapse();
    }
    
    // 3. 更新 FSRS 数据（由调度器计算）
    const fsrsData = scheduler.schedule(card, rating);
    card.updateFSRSData(fsrsData);
    
    // 4. 保存
    return await this.repo.save(card);
  }
}
```

### 示例 3：查询到期卡片

```typescript
class QueueService {
  constructor(private repo: ICardRepository) {}
  
  async getDueCards(limit: number): Promise<Result<Card[]>> {
    // 1. 查询
    const cardsResult = await this.repo.findDueCards(limit);
    if (!cardsResult.ok) {
      return cardsResult;
    }
    
    // 2. 业务逻辑（过滤跳过的卡片）
    const cards = cardsResult.value.filter(card => !card.skipped);
    
    // 3. 按优先级排序
    cards.sort((a, b) => {
      if (a.priority.isHigher(b.priority)) return -1;
      if (b.priority.isHigher(a.priority)) return 1;
      return 0;
    });
    
    return ok(cards);
  }
}
```

### 示例 4：测试（使用 Mock Repository）

```typescript
describe('CardApplicationService', () => {
  it('should create card with correct type', async () => {
    // 1. 创建 Mock Repository
    const mockRepo: ICardRepository = {
      save: vi.fn().mockResolvedValue(ok(undefined)),
      findById: vi.fn(),
      // ... 其他方法
    };
    
    // 2. 创建服务
    const service = new CardApplicationService(mockRepo);
    
    // 3. 测试
    const result = await service.createCard('block-1', 'concept');
    
    // 4. 验证
    expect(result.ok).toBe(true);
    expect(result.value?.type).toBe('concept');
    expect(result.value?.tags).toContain('concept');
    expect(mockRepo.save).toHaveBeenCalledTimes(1);
  });
});
```

## 向后兼容策略

### 策略 1：Adapter 模式

创建适配器，将 Card Entity 转换为 FSRSCard：

```typescript
// src/infrastructure/adapters/CardAdapter.ts
export class CardAdapter {
  /**
   * Card Entity → FSRSCard（向后兼容）
   */
  static toFSRSCard(card: Card): FSRSCard {
    const props = card.toObject();
    
    return {
      id: props.id,
      blockId: props.blockId,
      due: props.due,
      // ... 其他字段
      meta: props.xiuyuanMetadata ? {
        xiuyuanID: props.xiuyuanMetadata.xiuyuanID,
        templateID: props.xiuyuanMetadata.templateID,
        // ...
      } : undefined,
    };
  }
  
  /**
   * FSRSCard → Card Entity
   */
  static fromFSRSCard(fsrsCard: FSRSCard): Result<Card> {
    return Card.create({
      id: fsrsCard.id,
      blockId: fsrsCard.blockId,
      // ... 其他字段
      xiuyuanMetadata: fsrsCard.meta?.xiuyuanID ? {
        xiuyuanID: fsrsCard.meta.xiuyuanID,
        templateID: fsrsCard.meta.templateID,
        // ...
      } : undefined,
    });
  }
}
```

### 策略 2：Facade 模式

创建 Facade，提供统一的接口：

```typescript
// src/application/facades/CardFacade.ts
export class CardFacade {
  constructor(
    private repo: ICardRepository,
    private storage: UnifiedStorageManager // 旧接口
  ) {}
  
  /**
   * 获取卡片（自动选择新旧接口）
   */
  async getCard(id: string): Promise<FSRSCard | null> {
    // 优先使用新接口
    const entityResult = await this.repo.findById(id);
    if (entityResult.ok && entityResult.value) {
      return CardAdapter.toFSRSCard(entityResult.value);
    }
    
    // 降级到旧接口
    return this.storage.getCard(id) || null;
  }
}
```

## 性能考虑

### 1. Entity 创建开销

**问题**：每次查询都创建 Entity，可能有性能开销

**解决**：
```typescript
// 使用缓存
class CachedCardRepository implements ICardRepository {
  private cache: Map<string, Card> = new Map();
  
  constructor(private inner: ICardRepository) {}
  
  async findById(id: string): Promise<Result<Card | null>> {
    // 检查缓存
    if (this.cache.has(id)) {
      return ok(this.cache.get(id)!);
    }
    
    // 查询并缓存
    const result = await this.inner.findById(id);
    if (result.ok && result.value) {
      this.cache.set(id, result.value);
    }
    
    return result;
  }
}
```

### 2. 批量操作优化

**问题**：逐个保存 Entity 效率低

**解决**：
```typescript
// 使用批量操作
async saveBatch(cards: Card[]): Promise<Result<void>> {
  // 1. 批量转换
  const dtos = CardMapper.fromEntityBatch(cards);
  
  // 2. 批量保存
  await this.storage.saveDTOBatch(dtos);
  
  return ok(undefined);
}
```

## 测试策略

### 1. Entity 单元测试

```typescript
describe('Card Entity', () => {
  it('should validate stability', () => {
    const result = Card.create({
      // ...
      stability: -1, // 无效值
    });
    
    expect(result.ok).toBe(false);
    expect(result.error.message).toContain('Stability');
  });
  
  it('should mark as leech', () => {
    const card = Card.createNew('block-1', 'item').value!;
    
    card.markAsLeech();
    
    expect(card.isLeech).toBe(true);
    expect(card.leechCount).toBe(1);
  });
});
```

### 2. Repository 集成测试

```typescript
describe('CardRepository', () => {
  let repo: ICardRepository;
  let storage: UnifiedStorageManager;
  
  beforeEach(async () => {
    storage = new UnifiedStorageManager();
    repo = new CardRepository(storage);
    await repo.reload();
  });
  
  it('should save and load card', async () => {
    // 1. 创建 Entity
    const card = Card.createNew('block-1', 'item').value!;
    
    // 2. 保存
    await repo.save(card);
    
    // 3. 加载
    const loaded = await repo.findById(card.id.value);
    
    // 4. 验证
    expect(loaded.ok).toBe(true);
    expect(loaded.value?.id.value).toBe(card.id.value);
  });
});
```

## 迁移检查清单

### 阶段 1：基础设施层

- [x] 创建 Card Entity
- [x] 创建 ICardRepository 接口
- [x] 创建 CardRepository 实现
- [x] 更新 CardMapper（添加 Entity 方法）
- [ ] 创建 CardAdapter（向后兼容）
- [ ] 更新 UnifiedStorageManager（支持 DTO）

### 阶段 2：应用层

- [ ] 更新 CardApplicationService
- [ ] 更新 ReviewService
- [ ] 更新 QueueService
- [ ] 更新 XiuyuanSyncService

### 阶段 3：测试

- [ ] Entity 单元测试
- [ ] Repository 集成测试
- [ ] 应用层测试
- [ ] 端到端测试

### 阶段 4：文档

- [ ] 更新 API 文档
- [ ] 更新架构文档
- [ ] 更新迁移指南

## 时间估算

| 阶段 | 任务 | 时间 |
|------|------|------|
| 1 | 创建 Entity + Repository | 4 小时 ✅ |
| 2 | 更新 Mapper | 2 小时 ✅ |
| 3 | 创建 Adapter | 2 小时 |
| 4 | 更新应用层 | 6 小时 |
| 5 | 更新测试 | 4 小时 |
| 6 | 文档更新 | 2 小时 |
| **总计** | | **20 小时** |

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 性能下降 | 中 | 低 | 使用缓存 + 批量操作 |
| 兼容性问题 | 高 | 中 | 并行运行 + Adapter |
| 测试覆盖不足 | 高 | 中 | 完整的测试策略 |
| 开发延期 | 中 | 中 | 分阶段实施 |

## 下一步

1. ✅ 审查 Entity 和 Repository 设计
2. ✅ 确认迁移策略
3. 创建 CardAdapter（向后兼容）
4. 更新应用层代码
5. 更新测试
6. 性能验证
7. 上架

## 相关文档

- [Card Entity](../../src/domain/entities/Card.ts)
- [ICardRepository](../../src/domain/repositories/ICardRepository.ts)
- [CardRepository](../../src/infrastructure/persistence/CardRepository.ts)
- [CardMapper](../../src/infrastructure/persistence/mappers/CardMapper.ts)
- [持久化层 README](../../src/infrastructure/persistence/README.md)
