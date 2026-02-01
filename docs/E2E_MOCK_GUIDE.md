# E2E 测试 Mock 指南

## 问题分析

E2E 测试失败的主要原因是 Mock 实现不完整。以下是需要 Mock 的组件：

### 1. Siyuan API Mock

`RetrievalPracticeQueue` 内部使用 `RiffDataSource`，它会调用 Siyuan API 的 `request` 函数。

**解决方案**：使用 `vi.mock()` Mock Siyuan API

```typescript
vi.mock('@/core/siyuan/api', () => ({
  request: vi.fn().mockResolvedValue({}),
  setBlockAttrs: vi.fn().mockResolvedValue(undefined),
  getBlockInfo: vi.fn().mockResolvedValue({}),
}));
```

### 2. Riff API Mock

Riff API 需要正确返回卡片数据。

**当前问题**：
- `getRiffDueCards` 返回空数组
- Mock 的卡片没有正确添加到 Riff API

**解决方案**：

```typescript
const createMockRiffAPI = () => {
  const riffCards = new Map<string, any>();
  
  return {
    getRiffDueCards: vi.fn().mockImplementation(async (deckID: string) => {
      const cards = Array.from(riffCards.values()).filter(c => c.deckID === deckID);
      return {
        cards,
        unreviewedCount: cards.length,
        unreviewedNewCardCount: 0,
        unreviewedOldCardCount: cards.length,
      };
    }),
    reviewRiffCard: vi.fn().mockResolvedValue(undefined),
    removeRiffCards: vi.fn().mockResolvedValue({ name: 'test', size: 0 }),
    addCard: (card: any) => { 
      riffCards.set(card.cardID, card); 
    },
    clear: () => { riffCards.clear(); },
  };
};
```

### 3. StorageManager Mock

StorageManager 需要正确存储和检索卡片。

**解决方案**：

```typescript
const createMockStorage = (): StorageManager => {
  const cards = new Map<string, FSRSCard>();
  const queueData: any = { items: [] };
  const riffBlacklist = new Set<string>();

  return {
    getCard: (id: string) => cards.get(id),
    setCard: (card: FSRSCard) => { cards.set(card.id, card); },
    getAllCards: () => Array.from(cards.values()),
    saveCards: vi.fn().mockResolvedValue(undefined),
    loadData: vi.fn().mockImplementation(async (filename: string) => {
      if (filename === 'queue-retrieval-practice.json') {
        return queueData;
      }
      return null;
    }),
    saveData: vi.fn().mockImplementation(async (filename: string, data: any) => {
      if (filename === 'queue-retrieval-practice.json') {
        queueData.items = data.items;
      }
    }),
    getRiffBlacklist: () => riffBlacklist,
    addToRiffBlacklist: (blockId: string) => { riffBlacklist.add(blockId); },
    getPracticeQueue: vi.fn(() => []),
    setPracticeQueue: vi.fn().mockResolvedValue(undefined),
  } as any;
};
```

## 完整测试示例

```typescript
describe('E2E: 完整复习流程', () => {
  let storage: StorageManager;
  let router: SchedulerRouter;
  let mockRiffAPI: ReturnType<typeof createMockRiffAPI>;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = createMockStorage();
    router = new SchedulerRouter(
      {
        defaultScheduler: 'fsrs-v5',
        enableRiffSync: false,
        fsrsParams: mockParams,
      },
      storage
    );
    mockRiffAPI = createMockRiffAPI();
  });

  it('应该完成从加载到评分的完整流程', async () => {
    // 1. 准备测试数据
    const card1 = createTestCard({ 
      id: 'card-1', 
      blockId: 'block-1', 
      due: Date.now() - 1000 
    });
    storage.setCard(card1);

    // 2. 添加到 Mock Riff API
    mockRiffAPI.addCard({
      cardID: 'card-1',
      blockID: 'block-1',
      deckID: 'test-deck',
      nextDues: {
        1: new Date(Date.now() + 1000).toISOString(),
        2: new Date(Date.now() + 2000).toISOString(),
        3: new Date(Date.now() + 3000).toISOString(),
        4: new Date(Date.now() + 4000).toISOString(),
      },
    });

    // 3. 创建队列
    const queue = new RetrievalPracticeQueue({
      deckID: 'test-deck',
      api: mockRiffAPI as any,
      storage,
      schedulerRouter: router,
    });

    // 4. 等待队列加载
    await new Promise(resolve => setTimeout(resolve, 100));

    // 5. 获取统计信息
    const stats = await queue.getStats();
    expect(stats.size).toBeGreaterThan(0);
  });
});
```

## 关键点

1. **Mock Siyuan API**：使用 `vi.mock()` 在文件顶部 Mock
2. **正确的卡片格式**：确保 Mock 的卡片包含所有必需字段
3. **等待异步操作**：队列加载是异步的，需要等待
4. **deckID 匹配**：确保 Mock 卡片的 `deckID` 与队列的 `deckID` 匹配

## 下一步

1. 更新所有 E2E 测试使用正确的 Mock
2. 添加更多的等待时间以确保异步操作完成
3. 验证 Mock 数据的格式是否正确
