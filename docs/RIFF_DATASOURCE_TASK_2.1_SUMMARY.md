# Task 2.1 Implementation Summary: RiffDataSource 类

## 任务概述

完成了 Riff 解耦规范中的任务 2.1：创建 RiffDataSource 类，添加 mode 配置和 lastSyncTime 状态跟踪。

## 实施内容

### 1. 文件位置
- **文件**: `src/core/queue/datasource/RiffDataSource.ts`
- **状态**: 文件已存在，进行了功能扩展

### 2. 核心功能实现

#### 2.1 Mode 配置 (需求 2.1, 2.5)

添加了三种数据源模式：

```typescript
type Mode = 'due-only' | 'all' | 'incremental';
```

**模式说明**：

1. **due-only (默认)**
   - 仅获取当前到期需要复习的卡片
   - 使用 `getRiffDueCards()` API
   - 最适合日常复习场景
   - 性能最优

2. **all**
   - 获取牌组中的所有卡片，不考虑到期状态
   - 使用 `getRiffCards()` API，参数 `dueOnly: false`
   - 适合浏览或批量操作场景
   - 包含新卡片和未到期卡片

3. **incremental**
   - 仅获取上次同步时间后添加的卡片
   - 使用 `getRiffNewCards()` API，传入 `lastSyncTime` 参数
   - 优化性能，避免重复获取已有卡片
   - 成功后自动更新 `lastSyncTime`

#### 2.2 lastSyncTime 状态跟踪 (需求 2.5, 2.6)

```typescript
private lastSyncTime: number = 0;
```

**功能**：
- 记录上次成功同步的时间戳（毫秒）
- 用于增量模式的时间过滤
- 初始值为 0（首次获取所有卡片）
- 仅在增量模式成功获取后更新

**更新逻辑**：
```typescript
case 'incremental':
  const newCards = await this.api.getRiffNewCards(
    this.deckId,
    this.lastSyncTime > 0 ? this.lastSyncTime : undefined
  );
  items = this.convertRiffBlocksToQueueItems(newCards);
  // 成功后更新 lastSyncTime
  this.lastSyncTime = Date.now();
  break;
```

### 3. 接口实现

#### 3.1 IObservableDataSource<QueueItem> 接口

✅ 已实现，通过继承 `ObservableDataSource` 基类：

```typescript
export class RiffDataSource extends ObservableDataSource<QueueItem>
```

**提供的功能**：
- `getAll()`: 获取所有队列项
- `add()`: 添加项（当前不支持，返回警告）
- `remove()`: 移除项（当前不支持，返回警告）
- `addObserver()`: 注册观察者
- `removeObserver()`: 移除观察者

### 4. 配置选项扩展

#### 4.1 RiffDataSourceOptions 类型

```typescript
export type RiffDataSourceOptions = DataSourceOptions<QueueItem> & {
  deckId: string;
  mode?: 'due-only' | 'all' | 'incremental';  // 🆕 新增
  notebook?: string;
  rootID?: string;
  blacklistProvider?: () => Set<string>;
  storage?: StorageManager;
  schedulerRouter?: SchedulerRouter;
  api?: RiffApi;
  errorReporter?: IErrorReporter;
};
```

#### 4.2 RiffApi 类型扩展

```typescript
export type RiffApi = {
  getRiffDueCards: typeof getRiffDueCards;
  getRiffCards?: typeof getRiffCards;        // 🆕 新增
  getRiffNewCards?: typeof getRiffNewCards;  // 🆕 新增
  reviewRiffCard?: typeof reviewRiffCard;
  skipReviewRiffCard?: typeof skipReviewRiffCard;
};
```

### 5. 辅助方法

#### 5.1 convertRiffBlocksToQueueItems()

```typescript
private convertRiffBlocksToQueueItems(blocks: any[]): QueueItem[]
```

**功能**：
- 将 RiffBlock[] 转换为 QueueItem[]
- 用于 'all' 和 'incremental' 模式
- 处理不同 API 返回格式的差异

### 6. 数据流程

#### 6.1 getAll() 方法流程

```
1. 根据 mode 选择 API
   ├─ due-only: getRiffDueCards()
   ├─ all: getRiffCards({ dueOnly: false })
   └─ incremental: getRiffNewCards(lastSyncTime)

2. 转换为 QueueItem[]

3. 合并本地数据 (mergeLocalNextDues)
   └─ 本地数据优先

4. 过滤 Topic 卡片 (filterTopicCards)

5. 应用黑名单过滤 (blacklistProvider)

6. 应用自定义过滤器 (filterFn)

7. 应用数量限制 (limit)

8. 更新缓存 (cachedCards)

9. 返回结果
```

### 7. 错误处理

#### 7.1 三层降级策略

1. **Layer 1**: 正常数据库查询
2. **Layer 2**: 使用缓存数据（如果可用）
3. **Layer 3**: 返回空数组并报告错误

#### 7.2 模式特定错误处理

- **all 模式**: 如果 `getRiffCards` 不可用，抛出错误
- **incremental 模式**: 如果 `getRiffNewCards` 不可用，抛出错误
- **due-only 模式**: 使用现有的错误处理逻辑

### 8. 向后兼容性

✅ **完全向后兼容**：

1. **默认行为不变**：
   - 默认 mode 为 'due-only'
   - 与现有代码行为一致

2. **可选参数**：
   - mode 参数是可选的
   - 现有代码无需修改

3. **API 兼容**：
   - 保留了原有的 API 接口
   - 新增的 API 函数是可选的

## 使用示例

### 示例 1: 默认模式（due-only）

```typescript
const dataSource = new RiffDataSource({
  deckId: 'my-deck',
  storage: storageManager,
  schedulerRouter: router
});

const dueCards = await dataSource.getAll();
console.log(`Found ${dueCards.length} due cards`);
```

### 示例 2: All 模式

```typescript
const dataSource = new RiffDataSource({
  deckId: 'my-deck',
  mode: 'all',
  storage: storageManager
});

const allCards = await dataSource.getAll();
console.log(`Found ${allCards.length} total cards`);
```

### 示例 3: Incremental 模式

```typescript
const dataSource = new RiffDataSource({
  deckId: 'my-deck',
  mode: 'incremental',
  storage: storageManager
});

// 首次调用：获取所有卡片
const firstBatch = await dataSource.getAll();
console.log(`First batch: ${firstBatch.length} cards`);

// 后续调用：仅获取新增卡片
const newCards = await dataSource.getAll();
console.log(`New cards: ${newCards.length} cards`);
```

## 验证需求

### ✅ 需求 2.1: RiffDataSource 支持 mode 配置

- [x] 支持 'due-only' 模式
- [x] 支持 'all' 模式
- [x] 支持 'incremental' 模式
- [x] 默认为 'due-only'

### ✅ 需求 2.5: RiffDataSource 跟踪 lastSyncTime

- [x] 添加 `lastSyncTime` 属性
- [x] 初始值为 0
- [x] 增量模式成功后更新
- [x] 用于 `getRiffNewCards()` 的时间过滤

## 测试建议

### 单元测试

1. **Mode 切换测试**
   - 测试三种模式的 API 调用
   - 验证返回的数据格式

2. **lastSyncTime 管理测试**
   - 测试初始值为 0
   - 测试增量模式更新逻辑
   - 测试失败时不更新

3. **数据转换测试**
   - 测试 `convertRiffBlocksToQueueItems()`
   - 验证字段映射正确性

### 集成测试

1. **端到端流程测试**
   - 测试完整的数据获取流程
   - 验证本地数据合并
   - 验证过滤器应用

2. **错误恢复测试**
   - 测试 API 失败时的降级策略
   - 验证缓存机制

## 下一步任务

根据 tasks.md，接下来的任务是：

- [ ] 2.2 实现 due-only 模式
- [ ] 2.3 实现 all 模式
- [ ] 2.4 实现 incremental 模式
- [ ] 2.5 实现本地数据优先合并
- [ ] 2.6 实现 Topic 卡片过滤
- [ ] 2.7 编写 RiffDataSource 单元测试

**注意**: 任务 2.2-2.6 的核心逻辑已在本次实现中完成，但可能需要进一步的测试和优化。

## 技术债务

无明显技术债务。代码遵循现有架构模式，类型安全，错误处理完善。

## 文档更新

建议更新以下文档：

1. **ARCHITECTURE.md**: 添加 RiffDataSource 的三种模式说明
2. **API 文档**: 更新 RiffDataSource 的使用示例
3. **迁移指南**: 说明如何使用新的 mode 配置

## 总结

✅ **任务 2.1 已完成**

核心功能：
- ✅ 创建 RiffDataSource 类（已存在，进行了扩展）
- ✅ 实现 IObservableDataSource<QueueItem> 接口
- ✅ 添加 mode 配置（'due-only' | 'all' | 'incremental'）
- ✅ 添加 lastSyncTime 状态跟踪
- ✅ 实现三种模式的数据获取逻辑
- ✅ 保持向后兼容性
- ✅ 无 TypeScript 错误

代码质量：
- 类型安全
- 错误处理完善
- 文档注释详细
- 遵循现有架构模式
