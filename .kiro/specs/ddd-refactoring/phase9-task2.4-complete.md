# Phase 9 Task 2.4 完成总结 - DeckDataSource 重构

完成时间：2026-02-19

## 已完成工作

### 1. 修复 DeckDataSource 直接 storage 访问 ✅

**问题**：
- 行 542-546：修缘卡片优先级更新直接访问 `this.plugin.storage`
- 违反 CQRS 原则（数据源应该只读）
- 违反 DDD 分层原则（跳过应用层）

**解决方案**：
1. 在 DeckDataSource 构造函数中注入 CardApplicationService
2. 使用 `batchUpdateCardsWithoutEvents()` 批量更新卡片
3. 保留向后兼容的回退路径

### 2. 代码变更

#### 2.1 添加类型定义

**文件**: `src/ui/browser/datasource/DeckDataSource.ts`

```typescript
type CardApplicationServiceLike = {
  batchUpdateCardsWithoutEvents?: (cards: any[]) => Promise<{
    ok: boolean;
    value?: { updatedCount: number; failedCount: number };
    error?: Error;
  }>;
};
```

#### 2.2 更新构造函数

```typescript
export class DeckDataSource implements ICardDataSource {
  private readonly cardApplicationService?: CardApplicationServiceLike;

  constructor(
    manager: UnifiedDataSourceManager, 
    options: DeckDataSourceOptions, 
    plugin?: FsrsPluginLike,
    cardApplicationService?: CardApplicationServiceLike  // ✅ 新增
  ) {
    this.cardApplicationService = cardApplicationService;
    // ...
  }
}
```

#### 2.3 重构 set-priority 操作

**之前**（直接访问 storage）：
```typescript
if (xiuyuanCards.length > 0 && this.plugin?.storage) {
  for (const card of xiuyuanCards) {
    const fsrsCard = this.plugin.storage.getCard(card.id);  // ❌
    fsrsCard.meta.priority = priority;
    await this.plugin.storage.updateCard(fsrsCard);  // ❌
  }
}
```

**之后**（通过应用服务）：
```typescript
if (xiuyuanCards.length > 0) {
  if (this.cardApplicationService?.batchUpdateCardsWithoutEvents) {
    // ✅ 使用 CardApplicationService
    const updates = xiuyuanCards.map(card => ({
      id: card.id,
      meta: { ...card.meta, priority: priority }
    }));
    
    const result = await this.cardApplicationService
      .batchUpdateCardsWithoutEvents(updates);
    
    if (result.ok) {
      console.log(`✅ Updated ${result.value?.updatedCount} cards`);
    }
  } else if (this.plugin?.storage) {
    // ⚠️ 向后兼容回退
    // ...
  }
}
```

#### 2.4 更新数据源工厂

**文件**: `src/ui/browser/utils/dataSourceFactory.ts`

**createDeckDataSource 函数**：
```typescript
export function createDeckDataSource(
  manager: any,
  options: DataSourceOptionsWithDoc,
  currentDocId?: string | null,
  plugin?: any
): ICardDataSource {
  // ✅ 获取 CardApplicationService
  const cardApplicationService = plugin?.context?.getCardApplicationService?.();

  return new DeckDataSource(
    manager, 
    options, 
    plugin,
    cardApplicationService  // ✅ 传递服务
  );
}
```

**两处创建位置都已更新**：
1. `createDeckDataSource()` 函数（行 140-157）
2. 全部卡片模式（行 246-260）

## 架构改进

### 分层清晰

```
UI Layer (DeckDataSource)
  ↓ 调用
Application Layer (CardApplicationService)
  ↓ 使用
Domain Layer (Card Entity)
  ↓ 持久化
Infrastructure Layer (StorageManager)
```

### CQRS 原则

- **读操作**：DeckDataSource.fetchRows() - 通过 manager 读取
- **写操作**：DeckDataSource.performAction() - 通过 CardApplicationService 写入

### 向后兼容

保留了三层回退机制：
1. 优先使用 CardApplicationService（DDD 架构）
2. 回退到 plugin.storage（旧架构）
3. 如果都不可用，记录错误

## 测试建议

### 功能测试

1. **设置优先级（普通卡片）**
   - 选择普通卡片
   - 右键 → 设置优先级
   - 验证块属性和 FSRSCard 都更新

2. **设置优先级（修缘卡片）**
   - 选择修缘卡片
   - 右键 → 设置优先级
   - 验证 FSRSCard.meta.priority 更新
   - 验证使用了 CardApplicationService

3. **向后兼容测试**
   - 在没有 CardApplicationService 的环境
   - 验证回退到 plugin.storage
   - 验证功能仍然正常

### 日志验证

查看控制台日志：
```
[SiYuanMemo][DeckDataSource] Constructor - Using unified data source manager: {
  hasManager: true,
  hasPlugin: true,
  hasCardApplicationService: true  // ✅ 应该为 true
}

[SiYuanMemo][DeckDataSource] ✅ Updated 5 Xiuyuan cards via CardApplicationService
```

## 影响范围

### 已更新文件
- ✅ `src/ui/browser/datasource/DeckDataSource.ts`
- ✅ `src/ui/browser/utils/dataSourceFactory.ts`

### 依赖关系
- 依赖：CardApplicationService（已在 Phase 9 Task 1 创建）
- 被使用：SRSBrowser.vue（通过 dataSourceFactory）

## 下一步

### 立即可做

1. **验证功能** - 测试浏览器中的优先级设置
2. **继续 Task 4.2** - 重构 XiuyuanSyncService 使用批量方法

### 相关任务

- Task 2.5: 修复 MenuActions（类似的模式）
- Task 4.2: 重构 XiuyuanSyncService（使用相同的批量方法）

## 技术债务

1. **类型安全**
   - `CardApplicationServiceLike` 是临时类型
   - 建议：导入并使用 `CardApplicationService` 类型

2. **错误处理**
   - 当前只记录错误日志
   - 建议：向用户显示友好的错误消息

3. **批量操作优化**
   - 当前逐个更新卡片
   - 建议：真正的批量更新（一次数据库操作）

## 总结

成功将 DeckDataSource 的写操作从直接访问 storage 迁移到通过 CardApplicationService，实现了：

1. **符合 DDD 架构** - 数据源通过应用服务访问领域层
2. **符合 CQRS 原则** - 读写分离
3. **向后兼容** - 保留回退路径
4. **可测试性** - 应用服务可以被 mock

这为后续的同步服务重构提供了良好的参考模式。
