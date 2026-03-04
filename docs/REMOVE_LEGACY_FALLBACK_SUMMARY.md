# 移除降级逻辑总结

## 修改概述

本次修改完全移除了浏览器中队列模式的降级逻辑，强制使用统一数据源架构，防止数据污染问题。

## 修改的文件

### 1. `src/ui/browser/SRSBrowser.vue`

#### 修改 1：`getQueueById()` 函数

**修改前：**
```typescript
function getQueueById(id: string) {
  // 优先从 UnifiedDataSourceManager 获取队列实例
  if (browserAdapter.value) {
    try {
      // ... 获取队列逻辑
    } catch (error) {
      console.warn(`[SRSBrowser] Failed to get queue from UnifiedDataSourceManager:`, error);
      // 降级到旧队列系统
    }
  }
  
  // 降级：使用旧队列系统
  if (id === 'retrieval') return (props.plugin as any)?.retrievalQueue;
  if (id === 'final-drill') return (props.plugin as any)?.finalDrillQueue;
  if (id === 'neural-roam') return props.plugin?.neuralQueue;
  if (id === 'filter-group') return props.plugin?.filterGroupQueue;
  if (id === 'incremental-learning') return (props.plugin as any)?.incrementalQueue;  // ⚠️ 数据污染风险
  return null;
}
```

**修改后：**
```typescript
function getQueueById(id: string) {
  // 从 UnifiedDataSourceManager 获取队列实例
  if (browserAdapter.value) {
    try {
      const queueTypeMap: Record<string, QueueType> = {
        'retrieval': QueueType.RetrievalPractice,
        'final-drill': QueueType.FinalDrill,
        'incremental-learning': QueueType.IncrementalLearning,
        'filter-group': QueueType.FilterGroup,
        'neural-roam': QueueType.NeuralRoam,
      };
      
      const queueType = queueTypeMap[id];
      if (queueType) {
        const manager = UnifiedDataSourceManager.getInstance();
        const queue = manager.getQueue(queueType);
        if (queue) {
          return queue;
        }
      }
    } catch (error) {
      console.error(`[SRSBrowser] Failed to get queue from UnifiedDataSourceManager:`, error);
      return null;  // ✅ 不再降级
    }
  }
  
  console.error(`[SRSBrowser] browserAdapter not initialized, cannot get queue: ${id}`);
  return null;  // ✅ 不再降级
}
```

**关键变化：**
- 移除了所有降级到旧队列系统的代码
- 如果获取失败，返回 `null` 并记录错误
- 将 `console.warn` 改为 `console.error`，强调这是一个错误状态

#### 修改 2：`loadData()` 函数

**修改前：**
```typescript
async function loadData(forceRefresh = false) {
  // 尝试使用统一数据源适配器
  if (browserAdapter.value && activeQueueId.value) {
    try {
      // ... 使用统一数据源
      return;
    } catch (error) {
      console.error('[SRSBrowser] ❌ Failed to use UnifiedDataSourceManager, falling back to legacy:', error);
      // 降级到旧的实现
    }
  }

  // 原有的实现（降级路径）
  const sqlStmt = extractSqlStatement(searchQuery.value);
  if (sqlStmt != null) {
    // SQL 模式
  } else {
    // 创建数据源
    if (activeQueueId.value && ['final-drill', 'retrieval', 'filter-group', 'incremental-learning'].includes(activeQueueId.value)) {
      // ⚠️ 队列模式（降级路径）- 会使用旧架构
      currentDataSource.value = createQueueDataSource(activeQueueId.value, props.plugin, options);
    } else if (activeQueueId.value) {
      // 神经漫游队列
    } else {
      // 全部卡片模式
    }
  }
}
```

**修改后：**
```typescript
async function loadData(forceRefresh = false) {
  // ========================================================================
  // 队列模式：强制使用统一数据源架构
  // ========================================================================
  if (activeQueueId.value) {
    // 检查 browserAdapter 是否已初始化
    if (!browserAdapter.value) {
      throw new Error('UnifiedDataSourceManager adapter not initialized');
    }

    // 映射队列 ID 到 QueueType
    const queueTypeMap: Record<string, QueueType> = {
      'retrieval': QueueType.RetrievalPractice,
      'final-drill': QueueType.FinalDrill,
      'incremental-learning': QueueType.IncrementalLearning,
      'filter-group': QueueType.FilterGroup,
      'neural-roam': QueueType.NeuralRoam,
    };
    
    const queueType = queueTypeMap[activeQueueId.value];
    if (!queueType) {
      throw new Error(`Queue type not supported by UnifiedDataSourceManager: ${activeQueueId.value}`);
    }

    // 使用 browserAdapter 获取数据
    // ...
    return;
  }

  // ========================================================================
  // 非队列模式：SQL 查询或全部卡片
  // ========================================================================
  const sqlStmt = extractSqlStatement(searchQuery.value);
  if (sqlStmt != null) {
    // SQL 模式
  } else {
    // 全部卡片模式（使用 DeckDataSource）
    currentDataSource.value = createDeckDataSource(props.plugin, options, props.currentDocId);
  }
}
```

**关键变化：**
- 将函数重构为两个清晰的分支：队列模式和非队列模式
- 队列模式强制使用统一数据源架构，不再有降级路径
- 移除了 `createQueueDataSource()` 的调用（该函数会创建旧架构的数据源）
- 如果 `browserAdapter` 未初始化或队列类型不支持，直接抛出错误

## 影响分析

### 正面影响

1. **彻底防止数据污染**
   - 无法再回退到旧架构的 `incrementalQueue`
   - 所有队列数据访问都通过统一数据源管理器
   - 确保数据一致性

2. **代码更清晰**
   - 移除了复杂的降级逻辑
   - 队列模式和非队列模式分离明确
   - 更容易理解和维护

3. **错误更明确**
   - 如果统一数据源管理器未初始化，会立即抛出错误
   - 不会静默降级到旧架构，隐藏问题

### 潜在风险

1. **如果统一数据源管理器未正确初始化**
   - 队列模式将完全无法使用
   - 需要确保 `onMounted()` 中的初始化逻辑正确

2. **向后兼容性**
   - 如果有其他代码依赖旧架构的队列，可能会受到影响
   - 需要确保所有队列访问都通过统一数据源管理器

## 验证清单

- [ ] 检查统一数据源管理器是否正确初始化
- [ ] 测试所有队列模式（检索练习、最终训练、渐进学习、过滤组、神经漫游）
- [ ] 确认没有数据污染问题
- [ ] 检查错误日志，确保没有降级到旧架构
- [ ] 测试非队列模式（SQL 查询、全部卡片）

## 后续清理建议

### 1. 清理 `dataSourceFactory.ts`

文件：`src/ui/browser/utils/dataSourceFactory.ts`

**问题：**
- `createQueueDataSource()` 函数仍然存在
- 该函数会为 `incremental-learning` 创建 `IncrementalLearningDataSource`
- 但是传递的是 `plugin` 参数，而不是 `UnifiedDataSourceManager` 实例

**建议：**
```typescript
export function createQueueDataSource(
  queueId: string,
  plugin: any,
  options: DataSourceOptionsWithDoc
): ICardDataSource | null {
  const { docId, preset, queryText, cardType } = options;

  switch (queueId) {
    case 'final-drill':
      return new FinalDrillDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    case 'retrieval':
      return new RetrievalDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    case 'filter-group':
      return new FilterGroupDataSource(plugin, {
        docId,
        preset,
        queryText,
        cardType,
      });

    case 'incremental-learning':
      // ⚠️ 已废弃：请使用 UnifiedDataSourceManager
      console.error('[dataSourceFactory] incremental-learning queue should use UnifiedDataSourceManager');
      return null;

    default:
      return null;
  }
}
```

### 2. 标记旧架构队列为废弃

文件：`src/core/queue/strategies/IncrementalLearningQueue.ts`

**建议：**
- 在文件顶部添加更明显的废弃警告
- 在构造函数中添加运行时警告

```typescript
/**
 * @deprecated 此文件属于旧队列架构，已被统一数据源架构取代。
 * 请使用 src/queues/IncrementalLearningQueue.ts
 * 
 * ⚠️ 警告：使用此队列可能导致数据污染问题！
 * 
 * 参考迁移指南: docs/MIGRATION_GUIDE.md
 * 参考迁移报告: INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md
 */
export class IncrementalLearningQueue implements IQueueStrategy<QueueItem> {
  constructor(options?: { /* ... */ }) {
    // 运行时警告
    console.warn(
      '[IncrementalLearningQueue] ⚠️ 使用已废弃的旧架构队列！' +
      '请迁移到统一数据源架构（src/queues/IncrementalLearningQueue.ts）'
    );
    
    warnDeprecatedQueueUsage(this.constructor.name);
    // ...
  }
}
```

## 相关文档

- [渐进学习队列浏览器数据源迁移报告](./INCREMENTAL_LEARNING_DATA_SOURCE_MIGRATION.md)
- [统一数据源架构规范](./.kiro/specs/unified-data-source-architecture/)
- [统一数据源 UI 集成规范](./.kiro/specs/unified-data-source-ui-integration/)

## 日期

2026-02-06
