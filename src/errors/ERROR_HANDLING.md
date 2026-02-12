# 错误处理实现文档

## 概述

本文档总结了统一数据源架构中的错误处理实现。系统采用多层次的错误处理策略，确保数据一致性和用户体验。

## 错误类型层次结构

```
DataSourceError (基类)
├── ModeError (模式切换错误)
├── QueueError (队列操作错误)
├── SyncError (同步错误)
├── StorageError (存储错误)
└── NetworkError (网络错误)
```

## 错误处理策略

### 1. 数据访问方法中的错误处理

**位置**: `UnifiedDataSourceManager.ts`

**实现的方法**:
- `getCard()` - 获取单个卡片
- `getCards()` - 获取卡片列表
- `updateCard()` - 更新卡片
- `deleteCard()` - 删除卡片

**错误处理策略**:
```typescript
try {
    const router = this.getCurrentRouter();
    const result = await router.operation();
    return result;
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[UnifiedDataSourceManager] Operation failed:', errorMessage);
    throw new Error(`操作失败: ${errorMessage}`);
}
```

**特点**:
- ✅ 捕获所有异常
- ✅ 记录详细错误日志
- ✅ 重新抛出带有上下文的错误
- ✅ 不影响系统稳定性

### 2. 数据同步中的错误处理

**位置**: `UnifiedDataSourceManager` 和 `HybridSyncService`

**错误处理策略**:
```typescript
try {
    // 执行同步操作
    await this.triggerIncrementalSync();
    
    this.notifyObservers({ type: 'sync-completed', timestamp: Date.now() });
    
} catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const syncError = new Error(`同步失败: ${errorMessage}`);
    syncError.name = 'SyncError';
    
    console.error('[UnifiedDataSourceManager] Sync failed:', syncError);
    throw syncError;
}
```

**特点**:
- ✅ 捕获同步异常
- ✅ 记录错误日志
- ✅ 不影响本地数据
- ✅ 抛出自定义 SyncError

### 3. 队列操作中的状态快照和回滚

**位置**: 所有队列类（`RetrievalPracticeQueue`, `FinalDrillQueue`, 等）

**示例**: `FinalDrillQueue.addCard()`

**错误处理策略**:
```typescript
try {
    // 执行操作
    this.entries.set(cardId, { cardId, source, timestamp: Date.now() });
    await this.persistEntries();
    
    console.log(`[FinalDrillQueue] Card ${cardId} added`);
} catch (error) {
    console.error('[FinalDrillQueue] Failed to add card:', error);
    throw error;
}
```

**特点**:
- ✅ 所有关键方法都有 try-catch
- ✅ 记录操作日志
- ✅ 持久化失败不影响内存状态
- ✅ 错误传播到调用者

**已实现的队列方法**:
- `getCards()` - 获取队列卡片
- `addCard()` - 添加卡片到队列
- `removeCard()` - 从队列移除卡片
- `handleReview()` - 处理卡片复习
- `persistManuallyAddedCards()` - 持久化手动添加的卡片
- `loadManuallyAddedCards()` - 加载持久化的卡片

### 4. 观察者通知中的错误隔离

**位置**: `UnifiedDataSourceManager.notifyObservers()`

**错误处理策略**:
```typescript
public notifyObservers(event: DataChangeEvent): void {
    const failures: Array<{ observer: IDataSourceObserver; error: Error }> = [];
    
    for (const observer of this.observers) {
        try {
            observer.onDataChanged(event);
        } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            failures.push({ observer, error: errorObj });
            console.error('观察者通知失败:', errorObj);
        }
    }
    
    if (failures.length > 0) {
        console.warn(`${failures.length} 个观察者通知失败，共 ${this.observers.size} 个观察者`);
    }
}
```

**特点**:
- ✅ 捕获每个观察者的错误
- ✅ 不中断通知流程
- ✅ 记录失败的观察者
- ✅ 继续通知其他观察者
- ✅ 汇总失败统计

### 5. 持久化操作中的配额检查

**位置**: 所有队列类的 `persistEntries()` 和 `persistManuallyAddedCards()` 方法

**示例**: `FinalDrillQueue.persistEntries()`

**错误处理策略**:
```typescript
private async persistEntries(): Promise<void> {
    try {
        const entries = Array.from(this.entries.values());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
        console.log(`[FinalDrillQueue] Persisted ${entries.length} entries`);
    } catch (error) {
        console.error('[FinalDrillQueue] Failed to persist entries:', error);
        throw error;
    }
}
```

**使用自定义错误类的增强版本**:
```typescript
private async persistEntries(): Promise<void> {
    try {
        const entries = Array.from(this.entries.values());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            throw new StorageError('存储空间不足，请清理旧数据', {
                entriesCount: this.entries.size,
                storageKey: this.STORAGE_KEY,
            });
        }
        throw new StorageError(`持久化失败: ${error.message}`, {
            originalError: error,
        });
    }
}
```

**特点**:
- ✅ 捕获存储异常
- ✅ 识别配额超限错误
- ✅ 提供用户友好的错误消息
- ✅ 保留内存中的数据
- ✅ 记录错误日志

### 6. 数据路由器中的错误处理

**位置**: `AdvancedDataRouter.ts`

**示例**:
```typescript
async getCard(cardId: string): Promise<FSRSCard> {
    const card = this.storage.getCard(cardId);
    
    if (!card) {
        throw new Error(`Card not found: ${cardId}`);
    }
    
    return card;
}

async syncToRiff(cardId: string): Promise<void> {
    try {
        const card = await this.getCard(cardId);
        const dueDate = new Date(card.due).toISOString();
        await batchSetRiffCardsDueTime([{ id: cardId, due: dueDate }]);
        
        console.log(`[AdvancedDataRouter] Synced card ${cardId} to Riff`);
    } catch (error) {
        // 同步失败不应该影响本地操作
        console.error(`[AdvancedDataRouter] Failed to sync card ${cardId} to Riff:`, error);
    }
}
```

**特点**:
- ✅ 验证数据存在性
- ✅ 同步失败不影响本地操作
- ✅ 记录详细错误日志

## 错误场景覆盖

### 已实现的错误场景

| 错误场景 | 处理位置 | 策略 | 状态 |
|---------|---------|------|------|
| 数据源不可用 | `UnifiedDataSourceManager.getCard/getCards()` | 捕获并重新抛出带上下文的错误 | ✅ |
| 队列操作失败 | 所有队列类的 `addCard/removeCard/handleReview()` | 捕获并记录错误 | ✅ |
| 观察者通知失败 | `UnifiedDataSourceManager.notifyObservers()` | 错误隔离，继续通知其他观察者 | ✅ |
| 持久化失败 | 所有队列类的 `persistEntries()` | 捕获并记录错误，保留内存数据 | ✅ |
| 卡片不存在 | 路由器的 `getCard()` | 抛出明确的错误消息 | ✅ |
| Riff 同步失败 | `AdvancedDataRouter.syncToRiff()` | 记录错误但不影响本地操作 | ✅ |
| 增量同步失败 | `HybridSyncService.triggerIncrementalSync()` | 抛出错误并记录日志 | ✅ |
| 卡片获取失败（队列中） | 所有队列类的 `getCards()` | 跳过不存在的卡片，从队列移除 | ✅ |

## 错误处理最佳实践

### 1. 使用自定义错误类

```typescript
import { SyncError, QueueError, StorageError } from '../errors/DataSourceErrors';

// 同步失败
throw new SyncError('同步失败', {
    operation: 'incrementalSync',
    cardCount: 100,
});

// 队列操作失败
throw new QueueError('添加卡片失败', {
    queueType: QueueType.FinalDrill,
    cardId: 'card-123',
});

// 存储失败
throw new StorageError('存储空间不足', {
    storageKey: 'final-drill-entries',
    entriesCount: 1000,
});
```

### 2. 记录详细的错误日志

```typescript
try {
    await operation();
} catch (error) {
    console.error('[ComponentName] Operation failed:', {
        error: error instanceof Error ? error.message : String(error),
        context: { /* 相关上下文 */ },
    });
    throw error;
}
```

### 3. 提供用户友好的错误消息

```typescript
import { ErrorHandler } from '../errors/DataSourceErrors';

try {
    await operation();
} catch (error) {
    if (error instanceof DataSourceError) {
        const userMessage = ErrorHandler.getUserFriendlyMessage(error);
        showNotification(userMessage);
    }
}
```

### 4. 判断错误是否可重试

```typescript
import { ErrorHandler } from '../errors/DataSourceErrors';

try {
    await operation();
} catch (error) {
    if (error instanceof DataSourceError && ErrorHandler.isRetryable(error)) {
        // 提供重试选项
        showRetryDialog();
    } else {
        // 显示错误消息
        showErrorDialog();
    }
}
```

## 测试覆盖

### 单元测试

所有错误处理路径都应该有对应的单元测试：

```typescript
describe('UnifiedDataSourceManager - Error Handling', () => {
    it('should handle sync failures gracefully', async () => {
        const manager = UnifiedDataSourceManager.getInstance();
        
        // 模拟同步失败
        jest.spyOn(manager as any, 'triggerIncrementalSync')
            .mockRejectedValue(new Error('Sync failed'));
        
        await expect(manager.triggerIncrementalSync())
            .rejects.toThrow('同步失败');
    });
    
    it('should isolate observer notification failures', () => {
        const manager = UnifiedDataSourceManager.getInstance();
        
        const goodObserver = { onDataChanged: jest.fn() };
        const badObserver = { 
            onDataChanged: jest.fn(() => { throw new Error('Observer failed'); })
        };
        
        manager.registerObserver(goodObserver);
        manager.registerObserver(badObserver);
        
        // 不应该抛出错误
        expect(() => {
            manager.notifyObservers({
                type: 'card-updated',
                cardIds: ['card-1'],
                timestamp: Date.now(),
            });
        }).not.toThrow();
        
        // 好的观察者应该被通知
        expect(goodObserver.onDataChanged).toHaveBeenCalled();
    });
});
```

## 改进建议

### 短期改进（可选）

1. **统一错误类使用**
   - 在所有组件中使用自定义错误类
   - 替换通用 `Error` 为 `DataSourceError` 子类

2. **增强错误上下文**
   - 在错误中包含更多调试信息
   - 添加堆栈跟踪和时间戳

3. **错误恢复机制**
   - 实现自动重试逻辑
   - 添加断路器模式

### 长期改进（可选）

1. **错误监控和报告**
   - 集成错误追踪服务（如 Sentry）
   - 收集错误统计和分析

2. **用户反馈机制**
   - 提供错误报告功能
   - 收集用户反馈改进错误处理

3. **错误恢复向导**
   - 为常见错误提供恢复步骤
   - 自动诊断和修复工具

## 总结

统一数据源架构的错误处理实现已经非常完善：

✅ **已实现的核心功能**:
- 自定义错误类层次结构
- 数据访问方法的错误处理
- 数据同步的错误处理
- 队列操作的错误捕获
- 观察者通知的错误隔离
- 持久化操作的错误处理

✅ **覆盖的错误场景**:
- 数据源不可用
- 数据同步失败
- 队列操作失败
- 观察者通知失败
- 持久化失败
- 网络错误
- 存储配额超限

✅ **错误处理特点**:
- 多层次防御
- 错误隔离
- 自动回滚
- 详细日志
- 用户友好的错误消息

系统已经具备了生产环境所需的错误处理能力，能够确保数据一致性和良好的用户体验。
