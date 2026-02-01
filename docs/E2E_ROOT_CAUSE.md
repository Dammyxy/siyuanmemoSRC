# E2E 测试失败的根本原因

## 问题分析

E2E 测试失败的根本原因是：**`RetrievalPracticeQueue` 没有使用传入的 Mock Riff API**

### 代码流程

1. 测试创建 `RetrievalPracticeQueue` 并传入 `mockRiffAPI`
2. `RetrievalPracticeQueue` 内部创建 `RiffDataSource`
3. `RiffDataSource` **直接调用** `riff.getRiffDueCards`（真实的 Siyuan API）
4. 真实的 Siyuan API 在测试环境中失败，返回空数组

### 代码证据

```typescript
// RetrievalPracticeQueue.ts
class RetrievalHybridDataSource extends HybridDataSource {
  constructor(deckID: string, api: RiffApi, storage?: StorageManager, options?: { ... }) {
    const riffSource = new RiffDataSource({
      deckId: deckID,
      // ❌ 没有传入 api 参数！
      // RiffDataSource 会直接调用 riff.getRiffDueCards
    });
    
    // ...
  }
}
```

## 解决方案

### 方案 1：修改 `RiffDataSource` 接受 API 参数（推荐）

修改 `RiffDataSource` 的构造函数，接受一个可选的 `api` 参数：

```typescript
class RiffDataSource {
  private api: RiffApi;
  
  constructor(options: {
    deckId: string;
    api?: RiffApi; // 新增：可选的 API 参数
    // ...
  }) {
    this.api = options.api || {
      getRiffDueCards: riff.getRiffDueCards,
      reviewRiffCard: riff.reviewRiffCard,
      skipReviewRiffCard: riff.skipReviewRiffCard,
    };
  }
  
  async getAll(): Promise<QueueItem[]> {
    // 使用 this.api 而不是直接调用 riff.getRiffDueCards
    const result = await this.api.getRiffDueCards(this.deckId);
    // ...
  }
}
```

然后在 `RetrievalPracticeQueue` 中传入 API：

```typescript
class RetrievalHybridDataSource extends HybridDataSource {
  constructor(deckID: string, api: RiffApi, storage?: StorageManager, options?: { ... }) {
    const riffSource = new RiffDataSource({
      deckId: deckID,
      api: api, // ✅ 传入 API 参数
      // ...
    });
    
    // ...
  }
}
```

### 方案 2：使用 `vi.mock()` Mock 整个 Riff 模块（临时方案）

在测试文件中 Mock 整个 `riff` 模块：

```typescript
// 在测试文件顶部
vi.mock('@/core/siyuan/riff', () => {
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
    // 添加一个方法用于测试添加卡片
    __addCard: (card: any) => { riffCards.set(card.cardID, card); },
  };
});
```

**问题**：这个方案的问题是 `riffCards` 在 Mock 闭包内部，测试无法访问它来添加卡片。

### 方案 3：使用全局变量（不推荐）

创建一个全局的 Mock 状态：

```typescript
// 在测试文件顶部
const globalMockRiffCards = new Map<string, any>();

vi.mock('@/core/siyuan/riff', () => ({
  getRiffDueCards: vi.fn().mockImplementation(async (deckID: string) => {
    const cards = Array.from(globalMockRiffCards.values()).filter(c => c.deckID === deckID);
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: 0,
      unreviewedOldCardCount: cards.length,
    };
  }),
  reviewRiffCard: vi.fn().mockResolvedValue(undefined),
  removeRiffCards: vi.fn().mockResolvedValue({ name: 'test', size: 0 }),
}));

// 在测试中
beforeEach(() => {
  globalMockRiffCards.clear();
});

it('test', () => {
  globalMockRiffCards.set('card-1', {
    cardID: 'card-1',
    blockID: 'block-1',
    deckID: 'test-deck',
    // ...
  });
  
  // 创建队列...
});
```

## 推荐方案

**方案 1** 是最佳方案，因为它：
1. 使代码更易于测试
2. 遵循依赖注入原则
3. 不需要全局状态
4. 更清晰和可维护

## 实施步骤

1. 修改 `RiffDataSource` 接受 `api` 参数
2. 修改 `RetrievalHybridDataSource` 传入 `api` 参数
3. 更新测试以使用新的 API

## 临时解决方案

在修改代码之前，可以使用**方案 3**（全局变量）来快速修复测试。
