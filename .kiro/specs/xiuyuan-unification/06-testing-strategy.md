# 测试策略

## 1. 测试金字塔

```
        /\
       /  \
      / E2E\     ← 少量端到端测试
     /______\
    /        \
   /Integration\ ← 适量集成测试
  /__________\
 /            \
/  Unit Tests  \ ← 大量单元测试
/________________\
```

## 2. 单元测试

### 2.1 UnifiedStorageManager

**文件**：`src/core/storage/__tests__/UnifiedStorageManager.test.ts`

**测试场景**：

```typescript
describe('UnifiedStorageManager', () => {
  describe('CRUD Operations', () => {
    it('should create card', async () => {
      const storage = new UnifiedStorageManager(plugin);
      const xiuyuan = createTestXiuyuan();
      const card = createTestCard();
      
      const result = await storage.createCard(xiuyuan, card);
      
      expect(result.ok).toBe(true);
      expect(storage.getCard(card.id)).toEqual(card);
    });
    
    it('should update card', async () => {
      const storage = new UnifiedStorageManager(plugin);
      const card = createTestCard();
      await storage.createCard(xiuyuan, card);
      
      card.priority = 80;
      const result = await storage.updateCard(card);
      
      expect(result.ok).toBe(true);
      expect(storage.getCard(card.id)?.priority).toBe(80);
    });
    
    it('should delete card', async () => {
      const storage = new UnifiedStorageManager(plugin);
      const card = createTestCard();
      await storage.createCard(xiuyuan, card);
      
      const result = await storage.deleteCard(card.id);
      
      expect(result.ok).toBe(true);
      expect(storage.getCard(card.id)).toBeUndefined();
    });
  });
  
  describe('Query Operations', () => {
    it('should get due cards', () => {
      const storage = new UnifiedStorageManager(plugin);
      // 创建 10 张卡片，5 张到期
      
      const dueCards = storage.getDueCards(10);
      
      expect(dueCards.length).toBe(5);
    });
    
    it('should get cards by block ID', () => {
      const storage = new UnifiedStorageManager(plugin);
      // 创建 3 张卡片，2 张关联同一个块
      
      const cards = storage.getCardsByBlockId('block-1');
      
      expect(cards.length).toBe(2);
    });
    
    it('should get cards by type', () => {
      const storage = new UnifiedStorageManager(plugin);
      // 创建不同类型的卡片
      
      const conceptCards = storage.getCardsByType('concept');
      
      expect(conceptCards.length).toBeGreaterThan(0);
    });
  });
  
  describe('Index Operations', () => {
    it('should rebuild indexes on load', async () => {
      const storage = new UnifiedStorageManager(plugin);
      await storage.load();
      
      // 验证索引正确构建
      const stats = storage.getStats();
      expect(stats.totalCards).toBeGreaterThan(0);
    });
    
    it('should update indexes on card change', async () => {
      const storage = new UnifiedStorageManager(plugin);
      const card = createTestCard();
      await storage.createCard(xiuyuan, card);
      
      // 修改卡片类型
      card.type = 'topic';
      await storage.updateCard(card);
      
      // 验证索引更新
      const topicCards = storage.getCardsByType('topic');
      expect(topicCards).toContain(card);
    });
  });
  
  describe('Persistence', () => {
    it('should save and load data', async () => {
      const storage1 = new UnifiedStorageManager(plugin);
      const card = createTestCard();
      await storage1.createCard(xiuyuan, card);
      await storage1.save();
      
      const storage2 = new UnifiedStorageManager(plugin);
      await storage2.load();
      
      expect(storage2.getCard(card.id)).toEqual(card);
    });
  });
});
```

### 2.2 CreateCardUseCase

**文件**：`src/application/usecases/card/__tests__/CreateCardUseCase.test.ts`

**测试场景**：

```typescript
describe('CreateCardUseCase', () => {
  it('should create card with auto template selection', async () => {
    const useCase = new CreateCardUseCase(repo, service, eventBus);
    
    const result = await useCase.execute({
      blockIds: ['block-1'],
      cardType: 'concept',
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.templateID).toBe('builtin-concept-simple');
  });
  
  it('should create card with specified template', async () => {
    const useCase = new CreateCardUseCase(repo, service, eventBus);
    
    const result = await useCase.execute({
      blockIds: ['block-1', 'block-2'],
      templateId: 'builtin-basic-qa',
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.templateID).toBe('builtin-basic-qa');
  });
  
  it('should detect symbol and use symbol template', async () => {
    const useCase = new CreateCardUseCase(repo, service, eventBus);
    // Mock 块内容包含 <>
    
    const result = await useCase.execute({
      blockIds: ['block-1'],
      cardType: 'item',
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.templateID).toBe('builtin-symbol-qa');
  });
  
  it('should set scheduler type', async () => {
    const useCase = new CreateCardUseCase(repo, service, eventBus);
    
    const result = await useCase.execute({
      blockIds: ['block-1'],
      cardType: 'concept',
      schedulerType: 'a-factor',
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.schedulerType).toBe('a-factor');
  });
});
```

### 2.3 CardCreationHelper

**文件**：`src/application/helpers/__tests__/CardCreationHelper.test.ts`

**测试场景**：

```typescript
describe('CardCreationHelper', () => {
  it('should create concept card without descriptor', async () => {
    const helper = new CardCreationHelper(cardService);
    
    const result = await helper.createConceptCard('block-1', {
      useAFactor: true,
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.type).toBe('concept');
    expect(result.value.schedulerType).toBe('a-factor');
  });
  
  it('should create concept card with descriptor', async () => {
    const helper = new CardCreationHelper(cardService);
    
    const result = await helper.createConceptCard('block-1', {
      descriptorBlockId: 'block-2',
      useAFactor: false,
    });
    
    expect(result.ok).toBe(true);
    expect(result.value.templateID).toBe('builtin-concept-descriptor');
  });
  
  it('should create symbol card', async () => {
    const helper = new CardCreationHelper(cardService);
    
    const result = await helper.createSymbolCard('block-1');
    
    expect(result.ok).toBe(true);
    expect(result.value.templateID).toBe('builtin-symbol-qa');
  });
});
```

## 3. 集成测试

### 3.1 端到端卡片创建

**文件**：`src/__tests__/integration/card-creation.test.ts`

**测试场景**：

```typescript
describe('Card Creation Integration', () => {
  let context: ApplicationContext;
  let cardService: CardApplicationService;
  let storage: UnifiedStorageManager;
  
  beforeEach(async () => {
    context = await createTestContext();
    cardService = context.getCardService();
    storage = context.getStorage();
  });
  
  it('should create and persist concept card', async () => {
    const result = await cardService.createCard({
      blockIds: ['block-1'],
      cardType: 'concept',
    });
    
    expect(result.ok).toBe(true);
    
    // 验证存储
    const card = storage.getCard(result.value.id);
    expect(card).toBeDefined();
    expect(card?.type).toBe('concept');
    
    // 验证 Xiuyuan
    const xiuyuan = storage.getXiuyuan(card!.meta.xiuyuanID);
    expect(xiuyuan).toBeDefined();
  });
  
  it('should create bidirectional cards', async () => {
    const result = await cardService.createCard({
      blockIds: ['block-1', 'block-2'],
      templateId: 'builtin-bidirectional',
    });
    
    expect(result.ok).toBe(true);
    
    // 验证生成了 2 张卡片
    const cards = storage.getCardsByXiuyuanId(result.value.meta.xiuyuanID);
    expect(cards.length).toBe(2);
    
    // 验证正向和反向
    const forward = cards.find(c => c.meta.typeMarker === 'forward');
    const reverse = cards.find(c => c.meta.typeMarker === 'reverse');
    expect(forward).toBeDefined();
    expect(reverse).toBeDefined();
  });
  
  it('should delete card and cascade delete xiuyuan', async () => {
    const createResult = await cardService.createCard({
      blockIds: ['block-1'],
      cardType: 'item',
    });
    
    const deleteResult = await cardService.deleteCard({
      cardId: createResult.value.id,
    });
    
    expect(deleteResult.ok).toBe(true);
    
    // 验证卡片已删除
    expect(storage.getCard(createResult.value.id)).toBeUndefined();
    
    // 验证 Xiuyuan 已删除
    expect(storage.getXiuyuan(createResult.value.meta.xiuyuanID)).toBeUndefined();
  });
});
```

### 3.2 AutoCardHandler 集成

**文件**：`src/__tests__/integration/auto-card-handler.test.ts`

**测试场景**：

```typescript
describe('AutoCardHandler Integration', () => {
  it('should auto create concept card on reference', async () => {
    const handler = new AutoCardHandler(context);
    
    // 模拟引用检测
    await handler.onBlockReference('block-1');
    
    // 验证概念卡已创建
    const cards = storage.getCardsByBlockId('block-1');
    expect(cards.length).toBe(1);
    expect(cards[0].type).toBe('concept');
  });
  
  it('should auto create symbol card on symbol detection', async () => {
    const handler = new AutoCardHandler(context);
    
    // 模拟符号检测
    await handler.onSymbolDetected('block-1');
    
    // 验证符号卡已创建
    const cards = storage.getCardsByBlockId('block-1');
    expect(cards.length).toBe(1);
    expect(cards[0].templateID).toBe('builtin-symbol-qa');
  });
});
```

## 4. 性能测试

### 4.1 大规模数据测试

**文件**：`src/__tests__/performance/large-scale.test.ts`

**测试场景**：

```typescript
describe('Large Scale Performance', () => {
  it('should handle 100k cards', async () => {
    const storage = new UnifiedStorageManager(plugin);
    
    // 生成 10 万张卡片
    console.time('Generate 100k cards');
    for (let i = 0; i < 100000; i++) {
      const xiuyuan = createTestXiuyuan();
      const card = createTestCard();
      await storage.createCard(xiuyuan, card);
    }
    console.timeEnd('Generate 100k cards');
    
    // 测试查询性能
    console.time('Query due cards');
    const dueCards = storage.getDueCards(100);
    console.timeEnd('Query due cards');
    
    expect(dueCards.length).toBeLessThanOrEqual(100);
  });
  
  it('should save and load 100k cards', async () => {
    const storage = new UnifiedStorageManager(plugin);
    
    // 生成数据
    for (let i = 0; i < 100000; i++) {
      const xiuyuan = createTestXiuyuan();
      const card = createTestCard();
      await storage.createCard(xiuyuan, card);
    }
    
    // 测试保存性能
    console.time('Save 100k cards');
    await storage.save();
    console.timeEnd('Save 100k cards');
    
    // 测试加载性能
    const storage2 = new UnifiedStorageManager(plugin);
    console.time('Load 100k cards');
    await storage2.load();
    console.timeEnd('Load 100k cards');
    
    expect(storage2.getStats().totalCards).toBe(100000);
  });
});
```

### 4.2 查询性能测试

**文件**：`src/__tests__/performance/query-performance.test.ts`

**测试场景**：

```typescript
describe('Query Performance', () => {
  let storage: UnifiedStorageManager;
  
  beforeAll(async () => {
    storage = new UnifiedStorageManager(plugin);
    // 加载 10 万张卡片
    await storage.load();
  });
  
  it('should query due cards in < 100ms', () => {
    const start = Date.now();
    const dueCards = storage.getDueCards(100);
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(100);
  });
  
  it('should query by block ID in < 50ms', () => {
    const start = Date.now();
    const cards = storage.getCardsByBlockId('block-1');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(50);
  });
  
  it('should query by type in < 50ms', () => {
    const start = Date.now();
    const cards = storage.getCardsByType('concept');
    const elapsed = Date.now() - start;
    
    expect(elapsed).toBeLessThan(50);
  });
});
```

## 5. 手动测试清单

### 5.1 卡片创建

- [ ] 创建概念卡（块菜单）
  - [ ] 单块（无描述符）
  - [ ] 两块（有描述符）
- [ ] 创建符号检测卡
  - [ ] 单向（DDD <> 领域驱动设计）
  - [ ] 双向（自动生成 2 张卡片）
- [ ] 创建快速卡片
- [ ] 创建模板卡片
  - [ ] 基础问答
  - [ ] 双向卡片
  - [ ] 填空卡片
- [ ] 创建列表模版卡
  - [ ] 父列表项 + 3 个子列表项
  - [ ] 验证生成 3 张卡片

### 5.2 卡片删除

- [ ] 删除单张卡片
- [ ] 删除 Xiuyuan（级联删除所有卡片）
- [ ] 验证索引更新

### 5.3 卡片复习

- [ ] 复习概念卡（A-Factor）
- [ ] 复习问答卡（FSRS）
- [ ] 复习列表模版卡
- [ ] 验证调度正确

### 5.4 卡片浏览器

- [ ] 查看所有卡片
- [ ] 按类型过滤
- [ ] 按优先级排序
- [ ] 搜索卡片

### 5.5 优先级设置

- [ ] 设置单张卡片优先级
- [ ] 批量设置优先级
- [ ] 验证不使用块属性

### 5.6 性能测试

- [ ] 创建 1000 张卡片
- [ ] 查询到期卡片（< 100ms）
- [ ] 保存数据（< 1s）
- [ ] 加载数据（< 2s）

## 6. 测试覆盖率目标

| 层级 | 目标覆盖率 |
|------|-----------|
| 单元测试 | > 80% |
| 集成测试 | > 60% |
| 端到端测试 | > 40% |

## 7. 持续集成

### 7.1 CI 配置

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run test
      - run: npm run test:integration
      - run: npm run test:performance
```

### 7.2 测试脚本

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:performance": "vitest run --config vitest.performance.config.ts",
    "test:coverage": "vitest run --coverage"
  }
}
```
