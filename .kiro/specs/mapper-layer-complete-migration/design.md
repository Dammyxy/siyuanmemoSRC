# 设计文档：DDD 映射层完整迁移

## 概述

本设计文档描述了 xiuyuan 系统 DDD 映射层的完整迁移方案。主要目标是修复现有映射层的所有语法错误、完善 Result 类型处理、集成映射层到存储管理器，并确保向后兼容性。

### 核心问题

当前实现存在以下问题：

1. **CardMapper 语法错误**：`fromEntity`、`toEntity`、`fromEntityBatch`、`toEntityBatch` 方法定义在类外部，导致严重的语法错误
2. **Result 类型处理不完整**：Card Entity 的值对象创建返回 Result，但访问 error 属性时类型系统报错
3. **CardRepository 方法调用错误**：调用了不存在的 `CardMapper.fromEntity` 和 `CardMapper.toEntity` 方法
4. **UnifiedStorageManager 未支持 DTO**：仍然使用 FSRSCard 接口，未集成 CardPersistenceDTO
5. **缺少测试覆盖**：现有测试不完整，未覆盖所有转换场景

### 解决方案概述

1. **修复 CardMapper**：将所有方法移到类内部，确保语法正确
2. **完善 Result 类型**：使用类型守卫正确访问 Result 的 error 属性
3. **修复 CardRepository**：确保所有方法调用都指向存在的方法
4. **扩展 UnifiedStorageManager**：添加 DTO 支持，同时保持 FSRSCard 兼容性
5. **添加完整测试**：单元测试 + 属性测试 + 集成测试

## 架构

### 层次结构

```
┌─────────────────────────────────────────────────────────┐
│                   Application Layer                      │
│              (Use Cases, Services)                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                    Domain Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Card Entity  │  │  Value       │  │  Repository  │  │
│  │              │  │  Objects     │  │  Interface   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│              Infrastructure Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ CardMapper   │  │ CardRepo     │  │ Unified      │  │
│  │              │  │ Impl         │  │ Storage      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐                                       │
│  │ Card         │                                       │
│  │ PersistenceDTO│                                      │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                  Persistence Layer                       │
│              (MessagePack Storage)                       │
└─────────────────────────────────────────────────────────┘
```

### 数据流

#### 保存流程

```
Card Entity
    ↓ (CardMapper.fromEntity)
CardPersistenceDTO
    ↓ (UnifiedStorageManager.saveDTO)
MessagePack File
```

#### 加载流程

```
MessagePack File
    ↓ (UnifiedStorageManager.loadDTO)
CardPersistenceDTO
    ↓ (CardMapper.toEntity)
Card Entity
```

#### 向后兼容流程

```
FSRSCard
    ↓ (CardMapper.toPersistence)
CardPersistenceDTO
    ↓ (CardMapper.toDomain)
FSRSCard
```

## 组件和接口

### CardMapper（修复后）

```typescript
export class CardMapper {
  // === FSRSCard ↔ DTO（向后兼容）===
  
  static toPersistence(card: FSRSCard): CardPersistenceDTO {
    // 提取 meta 中的 Xiuyuan 字段到顶层
    // 清理 meta，移除已提取的字段
    // 返回 DTO
  }
  
  static toDomain(dto: CardPersistenceDTO): FSRSCard {
    // 将顶层 Xiuyuan 字段合并回 meta
    // 返回 FSRSCard
  }
  
  static toPersistenceBatch(cards: FSRSCard[]): CardPersistenceDTO[] {
    // 批量转换
  }
  
  static toDomainBatch(dtos: CardPersistenceDTO[]): FSRSCard[] {
    // 批量转换
  }
  
  // === Card Entity ↔ DTO（新接口）===
  
  static fromEntity(card: Card): CardPersistenceDTO {
    // Card Entity → DTO
    // 使用 card.toObject() 获取属性
    // 提取 xiuyuanMetadata 到顶层字段
  }
  
  static toEntity(dto: CardPersistenceDTO): Result<Card> {
    // DTO → Card Entity
    // 重建 xiuyuanMetadata
    // 调用 Card.create()
    // 返回 Result
  }
  
  static fromEntityBatch(cards: Card[]): CardPersistenceDTO[] {
    // 批量转换
  }
  
  static toEntityBatch(dtos: CardPersistenceDTO[]): Result<Card[]> {
    // 批量转换
    // 收集所有错误
    // 如果有错误，返回 err
    // 否则返回 ok(cards)
  }
  
  // === 验证 ===
  
  static validate(dto: CardPersistenceDTO): { valid: boolean; errors: string[] } {
    // 验证 DTO 完整性
  }
}
```

### Card Entity（修复 Result 处理）

```typescript
export class Card {
  private constructor(props: CardProps) {
    // 创建值对象
    const idResult = CardId.create(props.id);
    const blockIdResult = BlockId.create(props.blockId);
    const priorityResult = Priority.create(props.priority);

    // 修复：使用类型守卫检查 Result
    if (!idResult.ok) throw idResult.error;
    if (!blockIdResult.ok) throw blockIdResult.error;
    if (!priorityResult.ok) throw priorityResult.error;

    this._id = idResult.value;
    this._blockId = blockIdResult.value;
    this._priority = priorityResult.value;
    
    // ... 其他初始化
  }
  
  static create(props: CardProps): Result<Card> {
    try {
      const card = new Card(props);
      return ok(card);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // ... 其他方法
}
```

### CardRepository（修复方法调用）

```typescript
export class CardRepository implements ICardRepository {
  constructor(private readonly storage: UnifiedStorageManager) {}

  async save(card: Card): Promise<Result<void>> {
    try {
      // 1. Entity → DTO（修复：使用正确的方法名）
      const dto = CardMapper.fromEntity(card);
      
      // 2. 保存 DTO
      const existing = this.storage.getCardDTO(card.id.value);
      if (existing) {
        await this.storage.updateCardDTO(dto);
      } else {
        // 创建 Xiuyuan（如果需要）
        if (card.isXiuyuanCard()) {
          const xiuyuanMetadata = card.xiuyuanMetadata!;
          const xiuyuan = {
            id: xiuyuanMetadata.xiuyuanID,
            blockIDs: [card.blockId.value],
            fields: [],
            templateID: xiuyuanMetadata.templateID,
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          };
          await this.storage.createCardDTO(xiuyuan, dto);
        } else {
          // 普通卡片
          const xiuyuan = {
            id: `xy_${card.id.value}`,
            blockIDs: [card.blockId.value],
            fields: [],
            templateID: 'builtin-quick-card',
            createdAt: card.createdAt,
            updatedAt: card.updatedAt,
          };
          await this.storage.createCardDTO(xiuyuan, dto);
        }
      }
      
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async findById(id: string): Promise<Result<Card | null>> {
    try {
      const dto = this.storage.getCardDTO(id);
      if (!dto) {
        return ok(null);
      }
      
      // DTO → Entity（修复：使用正确的方法名）
      const entityResult = CardMapper.toEntity(dto);
      
      if (!entityResult.ok) {
        return err(entityResult.error);
      }
      
      return ok(entityResult.value);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // ... 其他方法
}
```

### UnifiedStorageManager（添加 DTO 支持）

```typescript
export class UnifiedStorageManager {
  // === 现有字段 ===
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // === 新增：DTO 存储 ===
  private cardDTOs: Map<string, CardPersistenceDTO> = new Map();
  
  // === 新增：DTO 操作 ===
  
  async createCardDTO(xiuyuan: IXiuyuan, dto: CardPersistenceDTO): Promise<Result<void>> {
    try {
      // 保存 XiuYuan
      if (!this.xiuyuans.has(xiuyuan.id)) {
        this.xiuyuans.set(xiuyuan.id, xiuyuan);
      }

      // 保存 DTO
      this.cardDTOs.set(dto.id, dto);

      // 同时保存 FSRSCard（向后兼容）
      const fsrsCard = CardMapper.toDomain(dto);
      this.cards.set(dto.id, fsrsCard);

      // 更新索引（使用 DTO 的顶层字段）
      this.updateIndexesForDTO(dto, 'add');

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  getCardDTO(cardId: string): CardPersistenceDTO | undefined {
    return this.cardDTOs.get(cardId);
  }
  
  async updateCardDTO(dto: CardPersistenceDTO): Promise<Result<void>> {
    try {
      const oldDTO = this.cardDTOs.get(dto.id);
      if (!oldDTO) {
        return err(new Error(`Card not found: ${dto.id}`));
      }

      // 移除旧索引
      this.updateIndexesForDTO(oldDTO, 'remove');

      // 更新 DTO
      this.cardDTOs.set(dto.id, dto);

      // 同时更新 FSRSCard（向后兼容）
      const fsrsCard = CardMapper.toDomain(dto);
      this.cards.set(dto.id, fsrsCard);

      // 添加新索引
      this.updateIndexesForDTO(dto, 'add');

      // 调度保存
      this.scheduleSave();

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  async batchCreateCardsDTO(xiuyuan: IXiuyuan, dtos: CardPersistenceDTO[]): Promise<Result<void>> {
    // 批量创建 DTO
    // 原子性操作，失败回滚
  }
  
  // === 新增：索引更新（使用 DTO 顶层字段）===
  
  private updateIndexesForDTO(dto: CardPersistenceDTO, action: 'add' | 'remove'): void {
    if (action === 'add') {
      // blockID 索引
      const blockCards = this.indexByBlockID.get(dto.blockId) || [];
      if (!blockCards.includes(dto.id)) {
        blockCards.push(dto.id);
        this.indexByBlockID.set(dto.blockId, blockCards);
      }

      // xiuyuanID 索引（使用顶层字段，避免解析 meta）
      if (dto.xiuyuanID) {
        const xiuyuanCards = this.indexByXiuyuanID.get(dto.xiuyuanID) || [];
        if (!xiuyuanCards.includes(dto.id)) {
          xiuyuanCards.push(dto.id);
          this.indexByXiuyuanID.set(dto.xiuyuanID, xiuyuanCards);
        }
      }

      // type 索引
      const typeCards = this.indexByType.get(dto.type) || [];
      if (!typeCards.includes(dto.id)) {
        typeCards.push(dto.id);
        this.indexByType.set(dto.type, typeCards);
      }

      // priority 索引
      const priorityCards = this.indexByPriority.get(dto.priority) || [];
      if (!priorityCards.includes(dto.id)) {
        priorityCards.push(dto.id);
        this.indexByPriority.set(dto.priority, priorityCards);
      }
    } else {
      // 移除索引（类似逻辑）
    }
  }
  
  // === 保持现有 FSRSCard 接口（向后兼容）===
  
  async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> {
    // 转换为 DTO
    const dto = CardMapper.toPersistence(card);
    // 调用 DTO 方法
    return this.createCardDTO(xiuyuan, dto);
  }
  
  getCard(cardId: string): FSRSCard | undefined {
    return this.cards.get(cardId);
  }
  
  async updateCard(card: FSRSCard): Promise<Result<void>> {
    const dto = CardMapper.toPersistence(card);
    return this.updateCardDTO(dto);
  }
  
  // ... 其他现有方法保持不变
}
```

## 数据模型

### CardPersistenceDTO（已定义）

```typescript
export interface CardPersistenceDTO {
  // 标识
  id: string;
  blockId: string;

  // FSRS 核心
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: number;
  elapsedDays: number;
  scheduledDays: number;
  learning_step?: number;

  // 扩展功能
  priority: number;
  type: CardType;
  tags: string[];
  cardTypeMarker?: 'concept' | 'descriptor';
  neuralRoamSeed?: boolean;

  // ... 其他字段

  // Xiuyuan 字段（顶层）
  xiuyuanID?: string;
  templateID?: string;
  frontBlockIDs?: string[];
  backBlockIDs?: string[];
  fieldMapping?: Record<string, string>;
  xiuyuanPriority?: number;

  // 扩展元数据
  meta?: Record<string, unknown>;
}
```

### Card Entity（已定义）

```typescript
export class Card {
  // 值对象
  private readonly _id: CardId;
  private readonly _blockId: BlockId;
  private _priority: Priority;
  
  // Xiuyuan 元数据
  private _xiuyuanMetadata?: XiuyuanMetadata;
  
  // ... 其他字段
  
  toObject(): CardProps {
    // 转换为普通对象
  }
}
```

## 正确性属性

*属性是一个特征或行为，应该在系统的所有有效执行中保持为真——本质上是关于系统应该做什么的形式化陈述。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。*

### 属性 1：Entity-DTO 往返一致性

*对于任何* 有效的 Card Entity，将其转换为 DTO 再转换回 Entity 应该产生等价的实体（所有字段值相同）

**验证：需求 7.1, 1.2, 1.3**

### 属性 2：FSRSCard-DTO 往返一致性

*对于任何* 有效的 FSRSCard，将其转换为 DTO 再转换回 FSRSCard 应该产生等价的卡片（所有字段值相同）

**验证：需求 7.1, 5.2, 5.3**

### 属性 3：Xiuyuan 字段提取正确性

*对于任何* 包含 Xiuyuan 元数据的 FSRSCard，转换为 DTO 后，顶层应该包含 xiuyuanID、templateID 等字段，且 meta 中不应包含这些字段

**验证：需求 7.2, 4.4**

### 属性 4：Xiuyuan 字段合并正确性

*对于任何* 包含顶层 Xiuyuan 字段的 DTO，转换为 FSRSCard 后，meta 中应该包含这些字段

**验证：需求 7.3, 4.4**

### 属性 5：批量转换长度保持

*对于任何* Card Entity 数组，批量转换为 DTO 数组后，数组长度应该相同

**验证：需求 1.4, 7.4**

### 属性 6：批量转换元素正确性

*对于任何* Card Entity 数组，批量转换为 DTO 数组后，每个元素都应该正确转换（与单个转换结果相同）

**验证：需求 1.4, 7.4**

### 属性 7：错误输入返回 Err

*对于任何* 无效的 CardProps（如负数的 stability），Card.create 应该返回 Result.ok = false

**验证：需求 2.1, 2.2**

### 属性 8：批量转换错误收集

*对于任何* 包含无效 DTO 的数组，toEntityBatch 应该返回包含所有错误信息的 Result

**验证：需求 2.3**

### 属性 9：Repository 保存-加载一致性

*对于任何* Card Entity，保存后再通过 findById 加载，应该得到等价的实体

**验证：需求 3.1, 3.2, 5.5**

### 属性 10：DTO 索引使用顶层字段

*对于任何* 包含 xiuyuanID 的 DTO，保存到 UnifiedStorageManager 后，通过 getCardsByXiuyuanId 查询应该能找到该卡片

**验证：需求 4.5**

### 属性 11：向后兼容性保持

*对于任何* FSRSCard，使用旧接口（createCard）保存后，使用新接口（getCardDTO）加载应该得到正确的 DTO

**验证：需求 5.1, 5.4**

### 属性 12：转换不修改原始数据

*对于任何* Card Entity，转换为 DTO 失败时，原始 Entity 的所有字段应该保持不变

**验证：需求 7.5**

## 错误处理

### Result 类型使用

所有可能失败的操作都返回 `Result<T>` 类型：

```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### 错误访问模式

```typescript
const result = Card.create(props);
if (!result.ok) {
  // TypeScript 知道这里 result 是 { ok: false; error: Error }
  console.error(result.error);
  return err(result.error);
}
// TypeScript 知道这里 result 是 { ok: true; value: Card }
const card = result.value;
```

### 批量操作错误处理

```typescript
const result = CardMapper.toEntityBatch(dtos);
if (!result.ok) {
  // 错误信息包含所有失败的转换
  console.error(`Failed to convert ${result.error.message}`);
  return result;
}
const cards = result.value;
```

## 测试策略

### 单元测试

单元测试用于验证特定示例、边缘情况和错误条件：

- CardMapper 转换方法的基本功能
- Card Entity 值对象创建的边界条件
- CardRepository CRUD 操作的基本流程
- UnifiedStorageManager DTO 操作的基本功能

### 属性测试

属性测试用于验证通用属性在所有输入上的正确性：

- 往返一致性属性（Entity ↔ DTO ↔ Entity）
- Xiuyuan 字段提取/合并属性
- 批量转换属性
- 错误处理属性
- 向后兼容性属性

**配置**：
- 每个属性测试运行至少 100 次迭代
- 使用 fast-check 库（TypeScript）
- 标签格式：`Feature: mapper-layer-complete-migration, Property {number}: {property_text}`

### 集成测试

集成测试用于验证端到端的数据流：

- 完整的保存-加载流程
- 新旧接口混合使用
- 索引构建和查询
- 数据一致性验证

### 测试覆盖目标

- 代码覆盖率：至少 80%
- 分支覆盖率：至少 75%
- 关键路径覆盖率：100%（往返转换、错误处理）
