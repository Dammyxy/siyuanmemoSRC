# 实施计划（3天）

## 总体策略

- **不保留降级方案**：完全统一，不留旧代码
- **不需要数据迁移**：重新开始，清空旧数据
- **激进式重构**：直接替换，不做兼容

## Day 1：数据层统一

### 任务 1.1：创建统一存储管理器（4小时）

**文件**：`src/core/storage/UnifiedStorageManager.ts`

**步骤**：

1. 创建基础类结构
2. 实现内存索引
3. 实现 CRUD 操作
4. 实现持久化（MessagePack）
5. 实现数据验证

**验收标准**：
- [ ] 可以加载和保存数据
- [ ] 内存索引正确构建
- [ ] 查询性能 < 100ms（10万卡片）
- [ ] 单元测试通过

**代码骨架**：

```typescript
export class UnifiedStorageManager {
  // 数据存储
  private xiuyuans: Map<string, IXiuyuan> = new Map();
  private cards: Map<string, FSRSCard> = new Map();
  
  // 内存索引
  private indexByBlockID: Map<string, string[]> = new Map();
  private indexByXiuyuanID: Map<string, string[]> = new Map();
  private indexByType: Map<CardType, string[]> = new Map();
  private indexByDue: FSRSCard[] = [];
  
  // 生命周期
  async load(): Promise<Result<void>> { }
  async save(): Promise<Result<void>> { }
  
  // CRUD
  async createCard(xiuyuan: IXiuyuan, card: FSRSCard): Promise<Result<void>> { }
  getCard(cardId: string): FSRSCard | undefined { }
  async updateCard(card: FSRSCard): Promise<Result<void>> { }
  async deleteCard(cardId: string): Promise<Result<void>> { }
  
  // 查询
  getDueCards(limit: number): FSRSCard[] { }
  getCardsByBlockId(blockId: string): FSRSCard[] { }
  getCardsByXiuyuanId(xiuyuanId: string): FSRSCard[] { }
  getCardsByType(type: CardType): FSRSCard[] { }
  
  // 索引
  private rebuildIndexes(): void { }
  private updateIndexesForCard(card: FSRSCard, action: 'add' | 'remove'): void { }
}
```

### 任务 1.2：更新 XiuyuanRepository（2小时）

**文件**：`src/core/xiuyuan/infrastructure/XiuyuanRepository.ts`

**步骤**：

1. 修改为使用 UnifiedStorageManager
2. 更新 save() 方法
3. 更新 findById() 方法
4. 更新 delete() 方法

**验收标准**：
- [ ] 所有方法使用新存储
- [ ] 集成测试通过

### 任务 1.3：性能测试（2小时）

**文件**：`src/__tests__/performance/unified-storage.test.ts`

**测试场景**：

1. 加载 10 万卡片
2. 查询到期卡片（100 张）
3. 按类型查询
4. 按块 ID 查询
5. 创建卡片
6. 更新卡片
7. 删除卡片

**性能目标**：
- 加载 10 万卡片：< 2s
- 查询到期卡片：< 100ms
- 其他操作：< 50ms

**代码骨架**：

```typescript
describe('UnifiedStorageManager Performance', () => {
  it('should load 100k cards in < 2s', async () => {
    const storage = new UnifiedStorageManager(plugin);
    
    // 生成 10 万张卡片
    for (let i = 0; i < 100000; i++) {
      // ...
    }
    
    const start = Date.now();
    await storage.load();
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(2000);
  });
  
  it('should query due cards in < 100ms', async () => {
    const storage = new UnifiedStorageManager(plugin);
    await storage.load();
    
    const start = Date.now();
    const dueCards = storage.getDueCards(100);
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(100);
    expect(dueCards.length).toBeLessThanOrEqual(100);
  });
});
```

## Day 2：创建流程统一

### 任务 2.1：扩展 CreateCardCommand（1小时）

**文件**：`src/application/commands/card/CreateCardCommand.ts`

**步骤**：

1. 添加 `cardType` 字段
2. 添加 `schedulerType` 字段
3. 添加 `metadata` 字段
4. 更新验证逻辑

**新增字段**：

```typescript
export interface CreateCardCommand {
  // 现有字段
  blockIds: string[];
  templateId?: string;
  
  // 新增字段
  cardType?: 'item' | 'topic' | 'concept' | 'descriptor';
  schedulerType?: 'fsrs-v6' | 'a-factor';
  priority?: number;
  metadata?: {
    source?: 'manual' | 'auto' | 'symbol' | 'quick';
    autoCreated?: boolean;
    symbolDetected?: boolean;
    [key: string]: any;
  };
}
```

### 任务 2.2：扩展 CreateCardUseCase（2小时）

**文件**：`src/application/usecases/card/CreateCardUseCase.ts`

**步骤**：

1. 实现自动模板选择
2. 实现符号检测
3. 实现调度器类型设置
4. 更新测试

**关键逻辑**：

```typescript
async execute(command: CreateCardCommand): Promise<Result<Card>> {
  // 1. 自动选择模板
  let templateId = command.templateId;
  if (!templateId) {
    const hasSymbol = await this.detectSymbol(command.blockIds[0]);
    const hasDescriptor = command.blockIds.length > 1;
    templateId = this.getDefaultTemplateForType(
      command.cardType || 'item',
      command.blockIds.length,
      hasSymbol,
      hasDescriptor
    );
  }
  
  // 2. 创建 Xiuyuan
  const xiuyuanResult = await this.createOrFindXiuyuan(command, templateId);
  if (!xiuyuanResult.ok) return xiuyuanResult;
  
  // 3. 创建卡片
  const cardResult = await this.cardCreationService.createCard(
    xiuyuanResult.value,
    command
  );
  
  // 4. 设置调度器类型
  if (cardResult.ok && command.schedulerType) {
    cardResult.value.schedulerType = command.schedulerType;
  }
  
  return cardResult;
}

private getDefaultTemplateForType(
  cardType: string,
  blockCount: number,
  hasSymbol: boolean,
  hasDescriptor: boolean
): string {
  // 符号检测优先
  if (hasSymbol) {
    return 'builtin-symbol-qa';
  }
  
  // 根据类型选择
  if (cardType === 'concept') {
    return hasDescriptor 
      ? 'builtin-concept-descriptor' 
      : 'builtin-concept-simple';
  }
  
  // 默认
  return blockCount === 1 
    ? 'builtin-quick-card' 
    : 'builtin-basic-qa';
}
```

### 任务 2.3：创建 CardCreationHelper（2小时）

**文件**：`src/application/helpers/CardCreationHelper.ts`

**步骤**：

1. 创建辅助类
2. 实现概念卡创建
3. 实现符号检测卡创建
4. 实现快速卡片创建

**代码**：

```typescript
export class CardCreationHelper {
  constructor(private cardService: CardApplicationService) {}
  
  /**
   * 创建概念卡
   */
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
  
  /**
   * 创建符号检测卡
   */
  async createSymbolCard(
    blockId: string,
    options: {
      priority?: number;
    } = {}
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
  
  /**
   * 创建快速卡片
   */
  async createQuickCard(
    blockId: string,
    options: {
      priority?: number;
    } = {}
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
}
```

### 任务 2.4：迁移 AutoCardHandler（2小时）

**文件**：`src/application/handlers/AutoCardHandler.ts`

**步骤**：

1. 添加 CardCreationHelper 依赖
2. 替换所有 `createDefaultCard` 调用
3. 删除旧代码
4. 更新测试

**迁移点**：

| 位置 | 旧代码 | 新代码 |
|------|--------|--------|
| 第 571 行 | 符号检测 | `helper.createSymbolCard()` |
| 第 857 行 | 概念卡 | `helper.createConceptCard()` |
| 第 1018 行 | 正向卡 | `helper.createConceptCard()` |
| 第 1131 行 | 反向卡 | `helper.createConceptCard()` |
| 第 1518 行 | 空概念卡 | `helper.createConceptCard()` |
| 第 1711 行 | 引用概念卡 | `helper.createConceptCard()` |

**示例迁移**：

```typescript
// 旧代码（删除）
const card = createDefaultCard(blockId);
card.type = 'concept';
this.storage.setCard(card);

// 新代码
const helper = new CardCreationHelper(this.cardService);
await helper.createConceptCard(blockId, {
  useAFactor: true,  // 无描述符时用 A-Factor
  metadata: { autoCreated: true },
});
```

### 任务 2.5：迁移 BlockMenuHandler（1小时）

**文件**：`src/application/managers/BlockMenuHandler.ts`

**步骤**：

1. 添加 CardCreationHelper 依赖
2. 替换概念卡创建（第 921 行）
3. 删除旧代码
4. 更新测试

## Day 3：清理和优化

### 任务 3.1：删除旧代码（2小时）

**删除文件**：

```bash
# 删除 CardService
rm src/services/CardService.ts

# 删除 Card Builder Strategies
rm -rf src/core/card-builder/strategies/

# 删除旧存储文件
rm src/core/xiuyuan/storage.ts  # 如果有单独的文件
```

**标记废弃**：

```typescript
// src/types/card.ts
/**
 * @deprecated 使用 CardApplicationService.createCard() 替代
 * 将在 v2.0.0 中移除
 */
export function createDefaultCard(blockId: string): FSRSCard {
  throw new Error('Deprecated: use CardApplicationService.createCard()');
}
```

**搜索并移除所有调用**：

```bash
# 搜索所有 createDefaultCard 调用
grep -r "createDefaultCard" src/ --exclude-dir=__tests__

# 搜索所有 CardService 调用
grep -r "CardService" src/ --exclude-dir=__tests__

# 搜索所有直接 storage 操作
grep -r "storage\.setCard\|storage\.removeCard" src/ --exclude-dir=__tests__
```

### 任务 3.2：统一优先级存储（1小时）

**步骤**：

1. 移除所有块属性优先级的读写
2. 只使用 `FSRSCard.priority`
3. 更新相关代码

**迁移点**：

```typescript
// 旧代码（删除）
await siyuanApi.setBlockAttrs(blockId, {
  'custom-fsrs-priority': priority.toString(),
});

const priority = parseInt(attrs['custom-fsrs-priority'] || '50');

// 新代码（保留）
card.priority = priority;
await storage.updateCard(card);

const priority = card.priority;
```

### 任务 3.3：简化 CardType（1小时）

**文件**：`src/types/card.ts`

**步骤**：

1. 移除 `Incremental` 和 `Webpage`
2. 更新所有引用
3. 更新测试

**新定义**：

```typescript
export enum CardType {
  Item = 'item',
  Topic = 'topic',
  Concept = 'concept',
  Descriptor = 'descriptor',
}
```

### 任务 3.4：集成测试（2小时）

**文件**：`src/__tests__/integration/unified-card-creation.test.ts`

**测试场景**：

1. 创建概念卡（无描述符）
2. 创建概念卡（有描述符）
3. 创建符号检测卡
4. 创建快速卡片
5. 创建双向卡片
6. 创建列表模版卡
7. 删除卡片
8. 更新卡片

**代码骨架**：

```typescript
describe('Unified Card Creation', () => {
  let cardService: CardApplicationService;
  let helper: CardCreationHelper;
  
  beforeEach(() => {
    // 初始化
  });
  
  it('should create concept card without descriptor', async () => {
    const result = await helper.createConceptCard('block-1', {
      useAFactor: true,
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.type).toBe('concept');
    expect(result.value.schedulerType).toBe('a-factor');
  });
  
  it('should create concept card with descriptor', async () => {
    const result = await helper.createConceptCard('block-1', {
      descriptorBlockId: 'block-2',
      useAFactor: false,
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.type).toBe('concept');
    expect(result.value.schedulerType).toBe('fsrs-v6');
  });
  
  // ... 更多测试
});
```

### 任务 3.5：手动测试（2小时）

**测试清单**：

- [ ] 创建概念卡（块菜单）
- [ ] 创建概念卡（自动检测）
- [ ] 创建符号检测卡（<>）
- [ ] 创建快速卡片
- [ ] 创建模板卡片
- [ ] 创建列表模版卡
- [ ] 删除卡片
- [ ] 复习卡片
- [ ] 浏览器查看卡片
- [ ] 优先级设置
- [ ] 性能测试（10万卡片）

## 验收标准

### 功能标准

- [ ] 所有卡片创建使用 CardApplicationService
- [ ] 所有卡片删除使用 CardApplicationService
- [ ] 没有 createDefaultCard 调用（除了废弃标记）
- [ ] 没有直接 StorageManager 操作（除了内部）
- [ ] 没有块属性优先级读写
- [ ] CardType 只有 4 种

### 质量标准

- [ ] 单元测试通过
- [ ] 集成测试通过
- [ ] 性能测试通过（< 100ms）
- [ ] 手动测试通过

### 文档标准

- [ ] API 文档更新
- [ ] 架构文档更新
- [ ] CHANGELOG 更新

## 风险管理

### 高风险点

1. **性能问题**
   - 缓解：性能测试
   - 缓解：内存索引优化

2. **功能回归**
   - 缓解：充分的测试覆盖
   - 缓解：手动测试清单

3. **数据丢失**
   - 缓解：不需要迁移，重新开始
   - 缓解：备份机制

### 回滚策略

如果出现严重问题：

1. 回滚到 Git 分支
2. 恢复旧代码
3. 分析问题
4. 修复后重新开始

## 时间表

| Day | 任务 | 时间 | 状态 |
|-----|------|------|------|
| Day 1 | 创建统一存储管理器 | 4h | ⏳ |
| Day 1 | 更新 XiuyuanRepository | 2h | ⏳ |
| Day 1 | 性能测试 | 2h | ⏳ |
| Day 2 | 扩展 CreateCardCommand | 1h | ⏳ |
| Day 2 | 扩展 CreateCardUseCase | 2h | ⏳ |
| Day 2 | 创建 CardCreationHelper | 2h | ⏳ |
| Day 2 | 迁移 AutoCardHandler | 2h | ⏳ |
| Day 2 | 迁移 BlockMenuHandler | 1h | ⏳ |
| Day 3 | 删除旧代码 | 2h | ⏳ |
| Day 3 | 统一优先级存储 | 1h | ⏳ |
| Day 3 | 简化 CardType | 1h | ⏳ |
| Day 3 | 集成测试 | 2h | ⏳ |
| Day 3 | 手动测试 | 2h | ⏳ |
| **总计** | | **24h** | |

## 下一步

1. 创建 Git 分支：`git checkout -b feature/xiuyuan-unification`
2. 开始 Day 1 任务
3. 每天结束时提交代码
4. 完成后合并到主分支
5. 发布新版本
