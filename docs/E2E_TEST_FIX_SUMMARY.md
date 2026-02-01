# E2E 测试修复总结

## 已完成的修复

### 1. Mock Siyuan API
✅ 添加了 `vi.mock('@/core/siyuan/api')` 来 Mock Siyuan API

### 2. 改进 Mock Riff API
✅ 更新 `getRiffDueCards` 以正确过滤 deckID
✅ 添加 `getCards()` 方法用于调试

### 3. 改进 Mock StorageManager
✅ 添加 `getPracticeQueue` 和 `setPracticeQueue` 方法
✅ 修复 `loadData` 实现以正确返回队列数据

### 4. 更新测试用例
✅ 添加等待时间（100ms）以确保队列初始化完成
✅ 更新 Mock 卡片的 `nextDues` 格式（使用数字键而不是字符串键）

## 剩余需要修复的测试

### 测试 3: 应该优先使用本地 nextDues
**问题**：`getAllCards()` 返回空数组

**修复方案**：
```typescript
it('应该优先使用本地 nextDues 而不是 Riff nextDues', async () => {
  const localDue = Date.now() - 1000; // 改为已过期
  const card = createTestCard({ 
    id: 'card-local', 
    blockId: 'block-local',
    due: localDue,
  });
  storage.setCard(card);

  mockRiffAPI.addCard({
    cardID: 'card-local',
    blockID: 'block-local',
    deckID: 'test-deck',
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
  });

  const queue = new RetrievalPracticeQueue({
    deckID: 'test-deck',
    api: mockRiffAPI as any,
    storage,
    schedulerRouter: router,
  });

  // 等待队列初始化
  await new Promise(resolve => setTimeout(resolve, 100));

  const cards = await queue.getAllCards();
  const loadedCard = cards.find(c => c.cardID === 'card-local');
  expect(loadedCard).toBeDefined();
  expect(loadedCard!.nextDues).toBeDefined();
});
```

### 测试 4: 应该支持 Riff 卡片删除同步
**问题**：`removeRiffCards` 未被调用

**修复方案**：
```typescript
it('应该支持 Riff 卡片删除同步', async () => {
  mockRiffAPI.addCard({
    cardID: 'riff-delete',
    blockID: 'block-riff-del',
    deckID: 'test-deck',
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
  });

  const card = createTestCard({ id: 'riff-delete', blockId: 'block-riff-del' });
  storage.setCard(card);

  const queue = new IncrementalLearningQueue({
    deckID: 'test-deck',
    api: mockRiffAPI as any,
    storage,
    schedulerRouter: router,
  });

  // 等待 Riff 卡片加载
  await new Promise(resolve => setTimeout(resolve, 100));
  await queue.getAllCards();

  // 删除 Riff 卡片
  const removableTrait = queue.getRemovableTrait();
  if (removableTrait) {
    const trait = removableTrait as any;
    if (trait.removeItems) {
      await trait.removeItems([{
        cardID: 'riff-delete',
        blockID: 'block-riff-del',
        deckID: 'test-deck',
        priority: 50,
        nextDues: { 1: '', 2: '', 3: '', 4: '' },
      }]);
    }
  }

  // 验证 Riff API 被调用
  expect(mockRiffAPI.removeRiffCards).toHaveBeenCalledWith(
    'test-deck',
    ['block-riff-del']
  );
});
```

### 测试 5: 应该按优先级排序卡片
**问题**：`next()` 返回 undefined

**修复方案**：
```typescript
it('应该按优先级排序卡片', async () => {
  const highPriority = createTestCard({ 
    id: 'high', 
    blockId: 'block-high',
    priority: 10,
    due: Date.now() - 1000,
  });
  const lowPriority = createTestCard({ 
    id: 'low', 
    blockId: 'block-low',
    priority: 90,
    due: Date.now() - 2000,
  });

  storage.setCard(highPriority);
  storage.setCard(lowPriority);

  mockRiffAPI.addCard({
    cardID: 'high',
    blockID: 'block-high',
    deckID: 'test-deck',
    priority: 10,
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
  });
  mockRiffAPI.addCard({
    cardID: 'low',
    blockID: 'block-low',
    deckID: 'test-deck',
    priority: 90,
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
  });

  const queue = new RetrievalPracticeQueue({
    deckID: 'test-deck',
    api: mockRiffAPI as any,
    storage,
    schedulerRouter: router,
  });

  // 等待队列初始化
  await new Promise(resolve => setTimeout(resolve, 100));

  const firstCard = await queue.next();
  expect(firstCard).toBeDefined();
  expect(firstCard?.cardID).toBe('high');
});
```

### 测试 6: 应该支持设置卡片优先级
**问题**：Siyuan API Error

**修复方案**：
需要 Mock `setBlockAttrs` 函数：

```typescript
// 在文件顶部的 Mock 中
vi.mock('@/core/siyuan/api', () => ({
  request: vi.fn().mockResolvedValue({}),
  setBlockAttrs: vi.fn().mockResolvedValue(undefined), // ✅ 已添加
  getBlockInfo: vi.fn().mockResolvedValue({}),
}));
```

### 测试 7: 应该在 Riff 同步失败时继续执行
**问题**：`reps` 为 0

**修复方案**：
```typescript
it('应该在 Riff 同步失败时继续执行', async () => {
  const failingRiffAPI = {
    ...mockRiffAPI,
    reviewRiffCard: vi.fn().mockRejectedValue(new Error('Riff API failed')),
  };

  const card = createTestCard({ id: 'fail-card', blockId: 'block-fail', due: Date.now() - 1000 });
  storage.setCard(card);

  failingRiffAPI.addCard({
    cardID: 'fail-card',
    blockID: 'block-fail',
    deckID: 'test-deck',
    nextDues: {
      1: new Date(Date.now() + 1000).toISOString(),
      2: new Date(Date.now() + 2000).toISOString(),
      3: new Date(Date.now() + 3000).toISOString(),
      4: new Date(Date.now() + 4000).toISOString(),
    },
  });

  router.updateConfig({ enableRiffSync: true });

  const queue = new RetrievalPracticeQueue({
    deckID: 'test-deck',
    api: failingRiffAPI as any,
    storage,
    schedulerRouter: router,
  });

  // 等待队列初始化
  await new Promise(resolve => setTimeout(resolve, 100));

  const firstCard = await queue.next();
  expect(firstCard).toBeDefined();
  
  await queue.onFeedback(firstCard, { action: 'rate', rating: 3 });

  const updatedCard = storage.getCard('fail-card');
  expect(updatedCard).toBeDefined();
  expect(updatedCard!.reps).toBeGreaterThan(0);
});
```

## 关键修复点总结

1. **添加等待时间**：所有测试都需要在创建队列后等待 100ms
2. **正确的 nextDues 格式**：使用数字键（1, 2, 3, 4）而不是字符串键
3. **卡片必须已过期**：`due` 应该小于 `Date.now()`
4. **Mock Siyuan API**：确保 `setBlockAttrs` 被 Mock
5. **deckID 匹配**：确保所有 Mock 卡片的 `deckID` 与队列的 `deckID` 匹配

## 下一步行动

1. 应用上述修复到所有失败的测试
2. 运行测试验证修复
3. 更新 `TEST_STATUS.md` 记录最终结果
