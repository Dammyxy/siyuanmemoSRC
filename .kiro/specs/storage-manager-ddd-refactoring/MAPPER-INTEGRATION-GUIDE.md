# Mapper 集成指南

## 概述

本文档说明如何将新的 Mapper 层集成到现有的 UnifiedStorageManager 中。

## 目标

1. 引入持久化 DTO，优化存储格式
2. 保持对外接口不变（FSRSCard）
3. 提升查询性能（Xiuyuan 字段索引）
4. 向后兼容旧数据

## 架构变更

### 变更前

```typescript
UnifiedStorageManager {
  private cards: Map<string, FSRSCard>;  // 直接存储领域模型
  
  getCard(id: string): FSRSCard | undefined {
    return this.cards.get(id);  // 直接返回
  }
}
```

### 变更后

```typescript
UnifiedStorageManager {
  private cards: Map<string, CardPersistenceDTO>;  // 存储持久化模型
  
  getCard(id: string): FSRSCard | undefined {
    const dto = this.cards.get(id);
    return dto ? CardMapper.toDomain(dto) : undefined;  // 转换后返回
  }
}
```

## 实施步骤

### 第 1 步：更新 UnifiedStorageManager 内部存储

**文件**: `src/core/storage/UnifiedStorageManager.ts`

**变更**:

```typescript
import { CardMapper } from '../../infrastructure/persistence/mappers/CardMapper';
import { XiuyuanMapper } from '../../infrastructure/persistence/mappers/XiuyuanMapper';
import type { CardPersistenceDTO, XiuyuanPersistenceDTO } from '../../infrastructure/persistence/dto/CardPersistenceDTO';

export class UnifiedStorageManager {
  // === 数据存储（使用 DTO）===
  private xiuyuans: Map<string, XiuyuanPersistenceDTO> = new Map();
  private cards: Map<string, CardPersistenceDTO> = new Map();

  // === 内存索引（使用 DTO）===
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: CardPersistenceDTO[] = [];  // 使用 DTO
  private indexByPriority: Map<number, string[]> = new Map();
  
  // ... 其他代码
}
```

### 第 2 步：更新 CRUD 方法

#### createCard

```typescript
async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> {
  try {
    // 1. 转换为 DTO
    const xiuyuanDTO = XiuyuanMapper.toPersistence(xiuyuan);
    const cardDTO = CardMapper.toPersistence(card);
    
    // 2. 保存 DTO
    if (!this.xiuyuans.has(xiuyuanDTO.id)) {
      this.xiuyuans.set(xiuyuanDTO.id, xiuyuanDTO);
    }
    this.cards.set(cardDTO.id, cardDTO);
    
    // 3. 更新索引（使用 DTO）
    this.updateIndexesForCard(cardDTO, 'add');
    this.indexByDue.sort((a, b) => a.due - b.due);
    
    // 4. 调度保存
    this.scheduleSave();
    
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

#### getCard

```typescript
getCard(cardId: string): FSRSCard | undefined {
  const dto = this.cards.get(cardId);
  return dto ? CardMapper.toDomain(dto) : undefined;
}
```

#### updateCard

```typescript
async updateCard(card: FSRSCard): Promise<Result<void>> {
  try {
    const oldDTO = this.cards.get(card.id);
    if (!oldDTO) {
      return err(new Error(`Card not found: ${card.id}`));
    }
    
    // 1. 转换为 DTO
    const newDTO = CardMapper.toPersistence(card);
    
    // 2. 移除旧索引
    this.updateIndexesForCard(oldDTO, 'remove');
    
    // 3. 更新卡片
    this.cards.set(newDTO.id, newDTO);
    
    // 4. 添加新索引
    this.updateIndexesForCard(newDTO, 'add');
    this.indexByDue.sort((a, b) => a.due - b.due);
    
    // 5. 调度保存
    this.scheduleSave();
    
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

#### deleteCard

```typescript
async deleteCard(cardId: string): Promise<Result<void>> {
  try {
    const dto = this.cards.get(cardId);
    if (!dto) {
      return err(new Error(`Card not found: ${cardId}`));
    }
    
    // 1. 移除索引
    this.updateIndexesForCard(dto, 'remove');
    
    // 2. 删除卡片
    this.cards.delete(cardId);
    
    // 3. 检查是否需要删除 Xiuyuan
    const xiuyuanID = dto.xiuyuanID;  // 🆕 从顶层读取
    if (xiuyuanID) {
      const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID);
      if (!xiuyuanCards || xiuyuanCards.length === 0) {
        this.xiuyuans.delete(xiuyuanID);
      }
    }
    
    // 4. 调度保存
    this.scheduleSave();
    
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### 第 3 步：更新查询方法

#### getDueCards

```typescript
getDueCards(limit: number): FSRSCard[] {
  const now = Date.now();
  const dueCards: FSRSCard[] = [];
  
  for (const dto of this.indexByDue) {
    if (dto.due <= now && dto.state !== 4) {
      // 转换为领域模型
      dueCards.push(CardMapper.toDomain(dto));
      if (dueCards.length >= limit) {
        break;
      }
    }
  }
  
  return dueCards;
}
```

#### getCardsByXiuyuanId

```typescript
getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] {
  const cardIds = this.indexByXiuyuanID.get(xiuyuanId) || [];
  return cardIds
    .map(id => this.cards.get(id))
    .filter((dto): dto is CardPersistenceDTO => dto !== undefined)
    .map(dto => CardMapper.toDomain(dto));  // 转换为领域模型
}
```

#### getAllCards

```typescript
getAllCards(): FSRSCard[] {
  return Array.from(this.cards.values())
    .map(dto => CardMapper.toDomain(dto));  // 转换为领域模型
}
```

### 第 4 步：更新索引方法

#### updateIndexesForCard

```typescript
private updateIndexesForCard(dto: CardPersistenceDTO, action: 'add' | 'remove'): void {
  if (action === 'add') {
    // blockID 索引
    const blockCards = this.indexByBlockID.get(dto.blockId) || [];
    if (!blockCards.includes(dto.id)) {
      blockCards.push(dto.id);
      this.indexByBlockID.set(dto.blockId, blockCards);
    }
    
    // xiuyuanID 索引（🆕 从顶层读取）
    const xiuyuanID = dto.xiuyuanID;
    if (xiuyuanID) {
      const xiuyuanCards = this.indexByXiuyuanID.get(xiuyuanID) || [];
      if (!xiuyuanCards.includes(dto.id)) {
        xiuyuanCards.push(dto.id);
        this.indexByXiuyuanID.set(xiuyuanID, xiuyuanCards);
      }
    }
    
    // type 索引
    const typeCards = this.indexByType.get(dto.type) || [];
    if (!typeCards.includes(dto.id)) {
      typeCards.push(dto.id);
      this.indexByType.set(dto.type, typeCards);
    }
    
    // due 索引
    this.indexByDue.push(dto);
    
    // priority 索引
    const priorityCards = this.indexByPriority.get(dto.priority) || [];
    if (!priorityCards.includes(dto.id)) {
      priorityCards.push(dto.id);
      this.indexByPriority.set(dto.priority, priorityCards);
    }
  } else {
    // 移除索引（类似逻辑）
    // ...
  }
}
```

### 第 5 步：更新持久化方法

#### getStoreData

```typescript
getStoreData(): UnifiedCardStore {
  const xiuyuans: Record<string, IXiuyuan> = {};
  for (const [id, dto] of this.xiuyuans.entries()) {
    xiuyuans[id] = XiuyuanMapper.toDomain(dto);  // 转换为领域模型
  }
  
  const cards: Record<string, FSRSCard> = {};
  for (const [id, dto] of this.cards.entries()) {
    cards[id] = CardMapper.toDomain(dto);  // 转换为领域模型
  }
  
  return {
    version: 1,
    xiuyuans,
    cards,
  };
}
```

#### load

```typescript
async load(): Promise<Result<void>> {
  try {
    if (!this.loadCallback) {
      return err(new Error('Load callback not set'));
    }
    
    const store = await this.loadCallback();
    
    // 清空现有数据
    this.xiuyuans.clear();
    this.cards.clear();
    
    // 加载 Xiuyuans（转换为 DTO）
    for (const [id, xiuyuan] of Object.entries(store.xiuyuans)) {
      const dto = XiuyuanMapper.toPersistence(xiuyuan);
      this.xiuyuans.set(id, dto);
    }
    
    // 加载 Cards（转换为 DTO）
    for (const [id, card] of Object.entries(store.cards)) {
      const dto = CardMapper.toPersistence(card);
      this.cards.set(id, dto);
    }
    
    // 重建索引
    this.rebuildIndexes();
    
    this.dirty = false;
    return ok(undefined);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### 第 6 步：更新数据一致性检查

#### validateConsistency

```typescript
async validateConsistency(): Promise<string[]> {
  const issues: string[] = [];
  
  // 检查孤儿卡片（🆕 从顶层读取 xiuyuanID）
  for (const dto of this.cards.values()) {
    const xiuyuanID = dto.xiuyuanID;
    if (!xiuyuanID) {
      issues.push(`Card ${dto.id} has no xiuyuanID`);
    } else if (!this.xiuyuans.has(xiuyuanID)) {
      issues.push(`Card ${dto.id} references non-existent XiuYuan ${xiuyuanID}`);
    }
  }
  
  // 检查空 XiuYuan
  for (const dto of this.xiuyuans.values()) {
    const cardIds = this.indexByXiuyuanID.get(dto.id);
    if (!cardIds || cardIds.length === 0) {
      issues.push(`XiuYuan ${dto.id} has no associated cards`);
    }
  }
  
  return issues;
}
```

## 测试策略

### 单元测试

1. **Mapper 测试**（已完成）
   - ✅ `CardMapper.test.ts`
   - ✅ `XiuyuanMapper.test.ts`
   - ✅ `RiffMapper.test.ts`

2. **UnifiedStorageManager 测试**（需要更新）
   - 更新现有测试，确保使用 Mapper 后行为一致
   - 添加 DTO 验证测试

### 集成测试

```typescript
describe('UnifiedStorageManager with Mapper', () => {
  it('应该正确保存和加载 Xiuyuan 卡片', async () => {
    const manager = new UnifiedStorageManager();
    
    // 创建 Xiuyuan 卡片
    const xiuyuan: IXiuyuan = {
      id: 'xy_123',
      blockIDs: ['block-1', 'block-2'],
      fields: [
        { name: 'question', blockID: 'block-1' },
        { name: 'answer', blockID: 'block-2' },
      ],
      templateID: 'builtin-basic-qa',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const card: FSRSCard = {
      id: 'card-1',
      blockId: 'block-1',
      // ... 其他字段
      meta: {
        xiuyuanID: 'xy_123',
        templateID: 'builtin-basic-qa',
      },
    };
    
    // 保存
    await manager.createCard(xiuyuan, card);
    
    // 查询
    const loadedCard = manager.getCard('card-1');
    expect(loadedCard).toBeDefined();
    expect(loadedCard?.meta?.xiuyuanID).toBe('xy_123');
    
    // 通过 xiuyuanID 查询
    const xiuyuanCards = manager.getCardsByXiuyuanId('xy_123');
    expect(xiuyuanCards).toHaveLength(1);
    expect(xiuyuanCards[0].id).toBe('card-1');
  });
});
```

## 性能验证

### 基准测试

```typescript
import { performance } from 'perf_hooks';

describe('Performance', () => {
  it('查询 Xiuyuan 卡片应该 < 1ms', () => {
    const manager = new UnifiedStorageManager();
    
    // 创建 10,000 张卡片
    for (let i = 0; i < 10000; i++) {
      // ...
    }
    
    // 测试查询性能
    const start = performance.now();
    const cards = manager.getCardsByXiuyuanId('xy_123');
    const end = performance.now();
    
    expect(end - start).toBeLessThan(1); // < 1ms
  });
});
```

## 向后兼容

### 数据迁移

如果用户有旧数据，Mapper 会自动处理：

```typescript
// 旧数据（meta 包含所有字段）
const oldCard: FSRSCard = {
  id: 'card-1',
  // ...
  meta: {
    xiuyuanID: 'xy_123',
    templateID: 'builtin-basic-qa',
  },
};

// 保存时自动转换为新格式
const dto = CardMapper.toPersistence(oldCard);
// dto.xiuyuanID === 'xy_123' (顶层)
// dto.meta === undefined (已清理)

// 加载时自动重建 meta
const loadedCard = CardMapper.toDomain(dto);
// loadedCard.meta.xiuyuanID === 'xy_123' (重建)
```

## 回滚计划

如果出现问题，可以快速回滚：

1. **代码回滚**
   - 恢复 UnifiedStorageManager 到旧版本
   - 移除 Mapper 导入

2. **数据回滚**
   - 旧数据格式仍然兼容
   - 无需数据迁移

## 检查清单

- [ ] 创建 DTO 类型定义
- [ ] 创建 Mapper 类
- [ ] 更新 UnifiedStorageManager 内部存储
- [ ] 更新 CRUD 方法
- [ ] 更新查询方法
- [ ] 更新索引方法
- [ ] 更新持久化方法
- [ ] 更新数据一致性检查
- [ ] 更新单元测试
- [ ] 添加集成测试
- [ ] 性能基准测试
- [ ] 文档更新

## 预期收益

1. **查询性能**: 100x 提升（O(n) → O(1)）
2. **存储大小**: 30% 减少
3. **类型安全**: 明确的 DTO 类型
4. **可维护性**: 清晰的职责分离

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 数据丢失 | 高 | 低 | 完整的测试覆盖 |
| 性能下降 | 中 | 低 | 基准测试验证 |
| 兼容性问题 | 中 | 低 | 向后兼容设计 |
| 开发延期 | 低 | 中 | 分步实施 |

## 时间估算

- DTO 定义: 1 小时 ✅
- Mapper 实现: 2 小时 ✅
- UnifiedStorageManager 重构: 3 小时
- 测试更新: 2 小时
- 集成测试: 2 小时
- 文档更新: 1 小时

**总计**: 11 小时

## 下一步

1. 运行 Mapper 单元测试，确保通过
2. 开始重构 UnifiedStorageManager
3. 逐步更新测试
4. 性能验证
5. 代码审查
6. 合并到主分支

## 相关文档

- [持久化层 README](../../src/infrastructure/persistence/README.md)
- [DDD 架构设计](./ARCHITECTURE.md)
- [Xiuyuan 统一化](../xiuyuan-unification/README.md)
