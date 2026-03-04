# DeckDataSource 迁移到新架构完成

## 迁移时间
2026-02-06

## 迁移内容

### 1. DeckDataSource.ts 迁移到 UnifiedDataSourceManager

**修改文件**: `src/ui/browser/datasource/DeckDataSource.ts`

#### 1.1 导入新架构类型
```typescript
import type { UnifiedDataSourceManager } from '@/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';
```

#### 1.2 更新类型定义
```typescript
type FsrsPluginLike = {
  storage?: any;
  rescheduleService?: RescheduleService;
  openSubsetReviewDialog?: (blockIds: string[]) => Promise<void> | void;
  unifiedDataSourceManager?: UnifiedDataSourceManager;  // 🆕 新架构
  // 🔧 保留旧属性用于向后兼容（仅用于类型检查）
  retrievalQueue?: QueueLike;
  incrementalQueue?: QueueLike;
  finalDrillQueue?: QueueLike;
  deliberateQueue?: QueueLike;
  filterGroupQueue?: QueueLike;
  neuralQueue?: QueueLike;
};
```

#### 1.3 更新构造函数
```typescript
export class DeckDataSource implements ICardDataSource {
  id = 'deck';
  label = 'Deck';

  private readonly plugin?: FsrsPluginLike;
  private readonly manager?: UnifiedDataSourceManager;  // 🆕 新架构
  private readonly options: DeckDataSourceOptions;

  constructor(plugin: FsrsPluginLike | undefined, options: DeckDataSourceOptions) {
    this.plugin = plugin;
    this.manager = plugin?.unifiedDataSourceManager;  // 🆕 获取统一数据源管理器
    this.options = options;

    console.log('[DeckDataSource] Constructor - Using unified data source manager:', {
      hasPlugin: !!plugin,
      hasManager: !!this.manager,
      currentMode: this.manager?.getCurrentMode(),
    });
  }
}
```

#### 1.4 更新 getSupportedActions()
```typescript
getSupportedActions(): CardBrowserAction[] {
  const actions: CardBrowserAction[] = [
    BASE_ACTIONS.open,
    BASE_ACTIONS.deleteCard,
  ];

  // 🆕 使用统一数据源管理器检测可用队列
  const hasQueues = {
    retrieval: !!this.manager,  // 所有模式都支持提取练习
    incremental: !!this.manager,  // 所有模式都支持渐进学习
    finalDrill: !!this.manager,  // 所有模式都支持刻意练习
    filterGroup: !!this.manager,  // 所有模式都支持筛选复习
    neuralRoam: !!this.manager,  // 所有模式都支持神经漫游
  };
  
  const addToQueueAction = buildAddToQueueAction(hasQueues);
  
  if (addToQueueAction) {
    actions.push(addToQueueAction);
  }

  // 其他操作...
  return actions;
}
```

#### 1.5 更新 performAction()
```typescript
async performAction(actionId: string, selectedRows: BrowserCard[], context?: any): Promise<any> {
  // ... 其他操作 ...

  // ========== 队列操作（使用统一数据源管理器）==========

  if (!this.manager) {
    console.error('[DeckDataSource] UnifiedDataSourceManager not available!');
    return;
  }

  // 提取练习
  if (actionId === 'add-to-retrieval-queue') {
    const queue = this.manager.getQueue(QueueType.RetrievalPractice);
    return await addToQueue(queue as any, selectedRows, 'retrieval');
  }

  // 渐进学习
  if (actionId === 'add-to-incremental-queue') {
    const queue = this.manager.getQueue(QueueType.IncrementalLearning);
    return await addToQueue(queue as any, selectedRows, 'incremental');
  }

  // 刻意练习
  if (actionId === 'add-to-deliberate-queue' || actionId === 'add-to-final-drill-queue') {
    const queue = this.manager.getQueue(QueueType.FinalDrill);
    return await addToQueue(queue as any, selectedRows, 'final-drill');
  }

  // 筛选复习
  if (actionId === 'add-to-filter-group-queue') {
    const queue = this.manager.getQueue(QueueType.FilterGroup);
    return await addToQueue(queue as any, selectedRows, 'filter-group');
  }

  // 神经漫游（暂时保留旧架构访问方式，因为神经漫游尚未迁移到新架构）
  if (actionId === 'add-to-neural-roam-queue') {
    if (this.plugin?.neuralQueue) {
      return await addToQueue(this.plugin.neuralQueue, selectedRows, 'neural-roam');
    }
    return;
  }

  // ... 其他操作 ...
}
```

## 架构变更总结

### 旧架构（已废弃）
```typescript
// 直接访问 plugin 上的队列属性
if (this.plugin?.retrievalQueue) {
  return await addToQueue(this.plugin.retrievalQueue, selectedRows, 'retrieval');
}
```

### 新架构（当前使用）
```typescript
// 通过 UnifiedDataSourceManager 获取队列
if (this.manager) {
  const queue = this.manager.getQueue(QueueType.RetrievalPractice);
  return await addToQueue(queue as any, selectedRows, 'retrieval');
}
```

## 优势

1. **统一数据源访问**: 所有队列通过 `UnifiedDataSourceManager` 统一管理
2. **模式切换支持**: 支持简单模式（Riff API）和高级模式（本地存储）的无缝切换
3. **类型安全**: 使用 `QueueType` 枚举，避免字符串拼写错误
4. **缓存管理**: 队列实例由 `QueueFactory` 管理，自动处理缓存失效
5. **观察者模式**: 数据变更自动通知所有观察者，UI 自动更新

## 编译状态

✅ 编译成功，无错误

## 已完成迁移的文件

1. ✅ `RetrievalDataSource.ts` - 提取练习数据源
2. ✅ `FinalDrillDataSource.ts` - 刻意练习数据源
3. ✅ `FilterGroupDataSource.ts` - 筛选复习数据源
4. ✅ `IncrementalLearningDataSource.ts` - 渐进学习数据源
5. ✅ `DeckDataSource.ts` - Deck 数据源（本次迁移）
6. ✅ `dataSourceFactory.ts` - 数据源工厂
7. ✅ `SRSBrowser.vue` - 浏览器主组件
8. ✅ `index.ts` - 插件入口

## 尚未迁移的文件

以下文件仍在使用旧架构，但不影响浏览器功能：

1. `ReviewService.ts` - 复习服务（用于复习对话框）
2. `UIManager.ts` - UI 管理器（用于复习对话框）
3. `LifecycleManager.ts` - 生命周期管理器（用于队列初始化）

这些文件主要用于复习对话框，不影响浏览器的"加入队列"功能。

## 注意事项

1. **神经漫游队列**: 暂时保留旧架构访问方式（`plugin.neuralQueue`），因为神经漫游队列尚未迁移到新架构
2. **向后兼容**: 保留了旧的类型定义（`retrievalQueue`, `finalDrillQueue` 等），确保类型检查通过
3. **Vite 警告**: `browserService.ts` 被同时动态导入和静态导入，这是代码分割警告，不影响功能

## 测试建议

1. 打开 SRS 浏览器
2. 选择一些卡片
3. 右键菜单 → "加入队列" → 选择不同的队列
4. 验证卡片是否成功加入队列
5. 打开对应的复习对话框，验证卡片是否出现

## 下一步

如果需要继续迁移其他文件（如 `ReviewService.ts`, `UIManager.ts`），可以按照相同的模式进行：

1. 导入 `UnifiedDataSourceManager` 和 `QueueType`
2. 在构造函数中获取 `manager` 引用
3. 使用 `manager.getQueue(QueueType.XXX)` 替代直接访问 `plugin.xxxQueue`
4. 编译测试

---

**迁移完成时间**: 2026-02-06
**迁移状态**: ✅ 成功
**编译状态**: ✅ 通过
