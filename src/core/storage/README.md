# UnifiedStorageManager - 统一存储管理器

## 概述

UnifiedStorageManager 是 XiuYuan 统一化架构的核心组件，负责管理所有 XiuYuan 和 FSRSCard 数据的持久化和查询。

## 核心特性

- **统一存储**: XiuYuan 和 Card 在当前运行时存储到 SQLite；旧 `unified-cards.msgpack` 只作为初始迁移来源
- **内存索引**: 提供 O(1) 查询性能，支持 blockID、xiuyuanID、type、due、priority 索引
- **防抖保存**: 1 秒延迟自动保存，避免频繁 I/O 操作
- **数据一致性**: 自动检测和修复孤儿卡片、空 XiuYuan 等问题
- **高性能**: 支持 100,000 卡片的高效管理，查询时间 < 100ms

## 使用方法

### 1. 初始化

```typescript
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { createLegacyStorageLoader } from '@/core/storage/UnifiedStoragePersistence';
import type SiyuanMemoPlugin from '@/index';

// 在插件初始化时创建存储管理器
class SiyuanMemoPlugin extends Plugin {
  private unifiedStorage: UnifiedStorageManager;

  async onload() {
    // 创建存储管理器
    this.unifiedStorage = new UnifiedStorageManager();

    // 设置 SQL 持久化回调；旧 loader 只用于 SQLite 初始迁移
    const { load } = createLegacyStorageLoader(this);
    this.unifiedStorage.setPersistenceCallbacks(
      async (data) => await sqlUnifiedRepository.saveStore(data),
      load
    );

    // 加载数据
    const result = await this.unifiedStorage.load();
    if (!result.ok) {
      console.error('Failed to load storage:', result.error);
    }
  }
}
```

### 2. 创建卡片

```typescript
import type { IXiuyuan } from '@/core/xiuyuan/types';
import type { FSRSCard } from '@/types/card';

// 创建 XiuYuan
const xiuyuan: IXiuyuan = {
  id: 'xy_1234567890_abc123',
  blockIDs: ['block-1', 'block-2'],
  templateID: 'builtin-basic-qa',
  fields: [
    { name: 'question', blockID: 'block-1' },
    { name: 'answer', blockID: 'block-2' }
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// 创建 Card
const card: FSRSCard = {
  id: 'card-1',
  xiuyuanID: xiuyuan.id,
  blockId: 'block-1',
  due: Date.now() + 86400000, // 1 day from now
  stability: 1.0,
  difficulty: 5.0,
  reps: 0,
  lapses: 0,
  state: 0,
  lastReview: Date.now(),
  elapsedDays: 0,
  scheduledDays: 1,
  learning_step: 0,
  type: 'item',
  templateID: 'builtin-basic-qa',
  schedulerType: 'fsrs-v6',
  priority: 50,
  tags: [],
  leechCount: 0,
  isLeech: false,
  skipped: false,
  meta: {
    xiuyuanID: xiuyuan.id,
    templateID: 'builtin-basic-qa',
    ruleIndex: 0,
    frontBlockIDs: ['block-1'],
    backBlockIDs: ['block-2'],
    fieldMapping: { question: 'block-1', answer: 'block-2' },
    frontFields: ['question'],
    backFields: ['answer'],
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// 保存到存储
const result = await unifiedStorage.createCard(xiuyuan, card);
if (!result.ok) {
  console.error('Failed to create card:', result.error);
}

// 数据会在 1 秒后自动保存
```

### 3. 查询卡片

```typescript
// 根据 ID 查询
const card = unifiedStorage.getCard('card-1');

// 根据块 ID 查询
const cardsByBlock = unifiedStorage.getCardsByBlockId('block-1');

// 根据 XiuYuan ID 查询
const cardsByXiuyuan = unifiedStorage.getCardsByXiuyuanId('xy_1234567890_abc123');

// 根据类型查询
const itemCards = unifiedStorage.getCardsByType('item');

// 查询到期卡片
const dueCards = unifiedStorage.getDueCards(100); // 获取前 100 张到期卡片

// 获取所有卡片
const allCards = unifiedStorage.getAllCards();

// 获取 XiuYuan
const xiuyuan = unifiedStorage.getXiuYuan('xy_1234567890_abc123');
```

### 4. 更新卡片

```typescript
// 获取卡片
const card = unifiedStorage.getCard('card-1');
if (card) {
  // 修改属性
  card.priority = 80;
  card.tags = ['important', 'review'];

  // 保存更新
  const result = await unifiedStorage.updateCard(card);
  if (!result.ok) {
    console.error('Failed to update card:', result.error);
  }
}
```

### 5. 删除卡片

```typescript
// 删除单张卡片
const result = await unifiedStorage.deleteCard('card-1');
if (!result.ok) {
  console.error('Failed to delete card:', result.error);
}

// 如果这是 XiuYuan 的最后一张卡片，XiuYuan 也会被自动删除

// 删除 XiuYuan（级联删除所有关联卡片）
const result = await unifiedStorage.deleteXiuYuan('xy_1234567890_abc123');
```

### 6. 批量创建

```typescript
const xiuyuan: IXiuyuan = { /* ... */ };
const cards: FSRSCard[] = [
  { /* card 1 */ },
  { /* card 2 */ },
  { /* card 3 */ },
];

// 批量创建（性能更好）
const result = await unifiedStorage.batchCreateCards(xiuyuan, cards);
if (!result.ok) {
  console.error('Failed to batch create cards:', result.error);
}
```

### 7. 数据一致性检查

```typescript
// 验证数据一致性
const issues = await unifiedStorage.validateConsistency();
if (issues.length > 0) {
  console.warn('Data consistency issues:', issues);
  
  // 自动修复
  const fixedCount = await unifiedStorage.autoFix();
  console.log(`Fixed ${fixedCount} issues`);
}
```

### 8. 统计信息

```typescript
const stats = unifiedStorage.getStats();
console.log('Storage statistics:', {
  totalCards: stats.totalCards,
  totalXiuYuans: stats.totalXiuYuans,
  cardsByType: stats.cardsByType,
  dueCards: stats.dueCards,
  newCards: stats.newCards,
  learningCards: stats.learningCards,
  reviewCards: stats.reviewCards,
});
```

### 9. 手动保存

```typescript
// 通常不需要手动保存，系统会自动保存
// 但在某些情况下（如插件卸载前）可以手动保存
const result = await unifiedStorage.save();
if (!result.ok) {
  console.error('Failed to save:', result.error);
}
```

## 性能指标

- **加载时间**: 100,000 卡片 < 2 秒
- **查询时间**: < 100ms（任何查询）
- **创建时间**: < 50ms（单张卡片）
- **更新时间**: < 50ms（单张卡片）
- **删除时间**: < 50ms（单张卡片）

## 数据结构

### UnifiedCardStore

```typescript
interface UnifiedCardStore {
  version: number;  // 当前版本：1
  xiuyuans: Record<string, IXiuyuan>;
  cards: Record<string, FSRSCard>;
}
```

### 存储文件

- **文件名**: `unified-cards.msgpack`
- **格式**: MessagePack（二进制格式，性能优于 JSON）
- **位置**: 插件数据目录（由思源笔记管理）
- **同步**: 自动通过思源云同步到其他设备

## 索引说明

UnifiedStorageManager 维护以下内存索引：

1. **blockID 索引**: `Map<string, string[]>` - 快速查找块关联的所有卡片
2. **xiuyuanID 索引**: `Map<string, string[]>` - 快速查找 XiuYuan 生成的所有卡片
3. **type 索引**: `Map<CardType, string[]>` - 快速查找特定类型的卡片
4. **due 索引**: `FSRSCard[]` - 按到期时间排序的卡片列表
5. **priority 索引**: `Map<number, string[]>` - 按优先级分组的卡片

所有索引在加载数据时自动构建，在 CRUD 操作时自动更新。

## 错误处理

所有异步方法返回 `Result<T>` 类型：

```typescript
const result = await unifiedStorage.createCard(xiuyuan, card);
if (result.ok) {
  // 成功
  console.log('Card created successfully');
} else {
  // 失败
  console.error('Error:', result.error.message);
}
```

## 注意事项

1. **必须设置持久化回调**: 在使用前必须调用 `setPersistenceCallbacks()`
2. **必须加载数据**: 在使用前必须调用 `load()`
3. **自动保存**: 修改操作会触发 1 秒延迟的自动保存，无需手动保存
4. **级联删除**: 删除 XiuYuan 会删除所有关联卡片；删除最后一张卡片会删除 XiuYuan
5. **线程安全**: 当前实现不是线程安全的，应在单线程环境中使用

## 迁移指南

如果你正在从旧的存储系统迁移：

1. 旧系统使用 `cards.msgpack` 和 `xiuyuan.msgpack` 两个文件
2. 新系统使用 `unified-cards.msgpack` 一个文件
3. 迁移时需要：
   - 读取旧的 `xiuyuan.msgpack` 和 `cards.msgpack`
   - 合并数据到 `UnifiedCardStore` 格式
   - 保存到 `unified-cards.msgpack`
   - 删除旧文件（可选）

## 相关文件

- `UnifiedStorageManager.ts` - 核心存储管理器
- `UnifiedStoragePersistence.ts` - 持久化适配器
- `__tests__/UnifiedStorageManager.test.ts` - CRUD 操作测试
- `__tests__/UnifiedStorageManager.query.test.ts` - 查询方法测试
- `__tests__/UnifiedStorageManager.persistence.test.ts` - 持久化测试
- `__tests__/UnifiedStorageManager.integration.test.ts` - 集成测试

## 验证需求

- ✅ Requirement 1.1: 统一存储 XiuYuan 和 Card 数据
- ✅ Requirement 1.2: 构建内存索引
- ✅ Requirement 1.3: 查询性能 < 100ms
- ✅ Requirement 1.4: 自动更新索引
- ✅ Requirement 1.5: 级联删除
- ✅ Requirement 1.6: 防抖自动保存
- ✅ Requirement 1.7: MessagePack 序列化
- ✅ Requirement 1.8: 数据一致性验证
