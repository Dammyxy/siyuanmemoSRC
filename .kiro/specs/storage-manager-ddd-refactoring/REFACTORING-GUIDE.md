# StorageManager DDD 重构指南

## 概述

本指南帮助开发者理解和使用重构后的存储架构。重构采用 DDD（领域驱动设计）原则，将原有的单一 StorageManager 拆分为多个专职服务。

## 架构概览

### DDD 分层架构

```
表现层 (Presentation)
    ↓
应用层 (Application)
    ↓
领域层 (Domain)
    ↓
基础设施层 (Infrastructure)
```

### 服务分类

**基础设施层服务**（技术实现）：
- `FileService`：文件读写操作
- `QueuePersistenceService`：队列数据持久化
- `UnifiedStorageManager`：卡片和 XiuYuan 存储

**应用层服务**（业务协调）：
- `SettingsService`：设置和配置管理
- `ReviewLogService`：复习日志管理
- `RiffBlacklistService`：Riff 黑名单管理

**领域层对象**（业务逻辑）：
- 队列对象：`RetrievalPracticeQueue`、`FinalDrillQueue` 等
- 卡片领域对象
- XiuYuan 领域对象

## 快速开始

### 1. 获取服务实例

所有服务通过 `ApplicationContext` 获取：

```typescript
import { ApplicationContext } from '@/application/ApplicationContext';

// 在插件初始化时创建 ApplicationContext
const context = await ApplicationContext.create(plugin);

// 获取服务
const settingsService = context.getSettingsService();
const queuePersistence = context.getQueuePersistenceService();
const reviewLogService = context.getReviewLogService();
const blacklistService = context.getRiffBlacklistService();
const unifiedStorage = context.getUnifiedStorageManager();
```

### 2. 使用设置服务

```typescript
// 获取设置
const settings = settingsService.getSettings();
console.log(settings.newCardsPerDay);

// 更新设置（部分更新）
await settingsService.updateSettings({
  newCardsPerDay: 20,
  reviewsPerDay: 100
});

// 获取 Riff 配置
const riffConfig = settingsService.getRiffIntegrationConfig();

// 更新 Riff 配置
await settingsService.updateRiffIntegrationConfig({
  mode: 'advanced',
  fullSync: { enabled: true, interval: 3600000 }
});
```

### 3. 使用队列持久化

```typescript
// 队列对象通过构造函数注入持久化服务
class RetrievalPracticeQueue {
  constructor(private queuePersistence: QueuePersistenceService) {}
  
  async load(): Promise<void> {
    // 从持久化服务加载状态
    const data = this.queuePersistence.get<QueueItem[]>('retrievalPracticeQueue');
    if (data) {
      this.items = data;
    }
  }
  
  async save(): Promise<void> {
    // 保存状态到持久化服务
    await this.queuePersistence.set('retrievalPracticeQueue', this.items);
  }
}

// 创建队列实例
const queue = new RetrievalPracticeQueue(queuePersistence);
await queue.load();
```

### 4. 使用复习日志服务

```typescript
// 添加复习日志
await reviewLogService.addReviewLog({
  cardId: 'card-123',
  blockId: 'block-456',
  rating: 3,
  review: Date.now(),
  state: { /* FSRS state */ }
});

// 查询指定月份的日志
const logs = await reviewLogService.getReviewLogs(2024, 1);

// 查询所有日志
const allLogs = await reviewLogService.getAllReviewLogs();
```

### 5. 使用黑名单服务

```typescript
// 添加到黑名单
await blacklistService.addToBlacklist('block-123');

// 检查是否在黑名单中
const isBlacklisted = blacklistService.isInBlacklist('block-123');

// 从黑名单移除
await blacklistService.removeFromBlacklist('block-123');

// 清空黑名单
await blacklistService.clearBlacklist();
```

### 6. 使用卡片存储

```typescript
// 获取卡片
const card = unifiedStorage.getCard('card-123');

// 添加卡片
unifiedStorage.addCard(newCard);

// 更新卡片
unifiedStorage.updateCard(updatedCard);

// 删除卡片
unifiedStorage.deleteCard('card-123');

// 保存所有更改
await unifiedStorage.save();
```

## 迁移指南

### 从旧代码迁移

#### 1. 设置相关

**旧代码**：
```typescript
const settings = storageManager.getSettings();
await storageManager.updateSettings({ newCardsPerDay: 20 });
```

**新代码**：
```typescript
const settings = context.getSettingsService().getSettings();
await context.getSettingsService().updateSettings({ newCardsPerDay: 20 });
```

#### 2. 卡片相关

**旧代码**：
```typescript
const card = storageManager.getCard('card-123');
storageManager.setCard(updatedCard);
await storageManager.save();
```

**新代码**：
```typescript
const card = context.getUnifiedStorageManager().getCard('card-123');
context.getUnifiedStorageManager().updateCard(updatedCard);
await context.getUnifiedStorageManager().save();
```

#### 3. 队列相关

**旧代码**：
```typescript
const queue = storageManager.getRetrievalPracticeQueue();
```

**新代码**：
```typescript
const queuePersistence = context.getQueuePersistenceService();
const queue = new RetrievalPracticeQueue(queuePersistence);
await queue.load();
```

#### 4. 日志相关

**旧代码**：
```typescript
await storageManager.addReviewLog(log);
const logs = await storageManager.getReviewLogs(2024, 1);
```

**新代码**：
```typescript
await context.getReviewLogService().addReviewLog(log);
const logs = await context.getReviewLogService().getReviewLogs(2024, 1);
```

#### 5. 黑名单相关

**旧代码**：
```typescript
await storageManager.addToRiffBlacklist('block-123');
const isBlacklisted = storageManager.isInRiffBlacklist('block-123');
```

**新代码**：
```typescript
await context.getRiffBlacklistService().addToBlacklist('block-123');
const isBlacklisted = context.getRiffBlacklistService().isInBlacklist('block-123');
```

## 最佳实践

### 1. 服务生命周期

- 在插件初始化时创建 `ApplicationContext`
- 服务实例由 `ApplicationContext` 管理，不要手动创建
- 在插件卸载时清理资源

```typescript
class SiyuanMemoPlugin extends Plugin {
  private context: ApplicationContext;
  
  async onload() {
    // 创建 ApplicationContext
    this.context = await ApplicationContext.create(this);
    
    // 初始化所有服务
    await this.context.getSettingsService().init();
    await this.context.getQueuePersistenceService().init();
    await this.context.getRiffBlacklistService().init();
  }
  
  async onunload() {
    // 清理资源
    // ...
  }
}
```

### 2. 错误处理

所有服务方法都可能抛出异常，应该适当处理：

```typescript
try {
  await settingsService.updateSettings({ newCardsPerDay: 20 });
} catch (error) {
  if (error instanceof SettingsValidationError) {
    console.error('Invalid settings:', error.message);
    // 显示错误提示给用户
  } else {
    console.error('Failed to update settings:', error);
    // 显示通用错误提示
  }
}
```

### 3. 防抖保存

大多数服务都实现了防抖保存机制（300ms），避免频繁写入：

```typescript
// 这些操作会触发防抖保存
await settingsService.updateSettings({ newCardsPerDay: 20 });
await queuePersistence.set('myQueue', data);
await blacklistService.addToBlacklist('block-123');

// 如果需要立即保存，使用 flush
await queuePersistence.flush();
```

### 4. 队列自治

队列对象应该自己管理状态和持久化：

```typescript
class MyQueue {
  private items: QueueItem[] = [];
  
  constructor(private persistence: QueuePersistenceService) {}
  
  async load(): Promise<void> {
    const data = this.persistence.get<QueueItem[]>('myQueue');
    if (data) {
      this.items = data;
    }
  }
  
  async save(): Promise<void> {
    await this.persistence.set('myQueue', this.items);
  }
  
  // 业务逻辑方法
  add(item: QueueItem): void {
    this.items.push(item);
    this.save(); // 自动保存
  }
}
```

### 5. 类型安全

使用 TypeScript 接口确保类型安全：

```typescript
// 定义接口
interface IMyService {
  doSomething(): Promise<void>;
}

// 实现接口
class MyService implements IMyService {
  async doSomething(): Promise<void> {
    // ...
  }
}

// 使用接口类型
function useService(service: IMyService) {
  service.doSomething();
}
```

## 测试指南

### 单元测试

每个服务都应该有独立的单元测试：

```typescript
describe('SettingsService', () => {
  let fileService: IFileService;
  let settingsService: SettingsService;
  
  beforeEach(() => {
    // 创建 mock FileService
    fileService = createMockFileService();
    settingsService = new SettingsService(fileService);
  });
  
  test('should load settings', async () => {
    await settingsService.init();
    const settings = settingsService.getSettings();
    expect(settings).toBeDefined();
  });
  
  test('should update settings', async () => {
    await settingsService.init();
    await settingsService.updateSettings({ newCardsPerDay: 20 });
    const settings = settingsService.getSettings();
    expect(settings.newCardsPerDay).toBe(20);
  });
});
```

### 集成测试

测试服务之间的协作：

```typescript
describe('Storage Integration', () => {
  let context: ApplicationContext;
  
  beforeEach(async () => {
    context = await ApplicationContext.create(mockPlugin);
  });
  
  test('complete workflow', async () => {
    // 创建卡片
    const card = createTestCard();
    context.getUnifiedStorageManager().addCard(card);
    await context.getUnifiedStorageManager().save();
    
    // 添加到队列
    const queue = new RetrievalPracticeQueue(
      context.getQueuePersistenceService()
    );
    await queue.load();
    queue.add({ cardId: card.id, blockId: card.blockId });
    await queue.save();
    
    // 记录复习日志
    await context.getReviewLogService().addReviewLog({
      cardId: card.id,
      blockId: card.blockId,
      rating: 3,
      review: Date.now()
    });
    
    // 验证所有数据
    const retrievedCard = context.getUnifiedStorageManager().getCard(card.id);
    expect(retrievedCard).toEqual(card);
  });
});
```

## 常见问题

### Q: 为什么要拆分 StorageManager？

A: 原有的 StorageManager 承担了过多职责，违反了单一职责原则。拆分后每个服务只负责一个明确的领域，更易于理解、测试和维护。

### Q: 如何选择使用哪个服务？

A: 根据功能领域选择：
- 设置和配置 → `SettingsService`
- 卡片数据 → `UnifiedStorageManager`
- 队列数据 → `QueuePersistenceService`
- 复习日志 → `ReviewLogService`
- Riff 黑名单 → `RiffBlacklistService`

### Q: 队列为什么不直接使用 FileService？

A: 队列是领域对象，应该通过基础设施层的持久化服务来保存数据，而不是直接操作文件。这符合 DDD 的依赖倒置原则。

### Q: 为什么使用 ApplicationContext？

A: ApplicationContext 作为 DI 容器，统一管理所有服务的创建和生命周期，避免手动管理依赖关系。

### Q: 如何添加新的服务？

A: 
1. 在相应的层（应用层或基础设施层）创建服务类
2. 实现服务接口
3. 在 ApplicationContext 中注册服务工厂
4. 添加便捷的 getter 方法
5. 编写单元测试和集成测试

### Q: 防抖保存会丢失数据吗？

A: 不会。防抖只是延迟保存，所有修改都会在 300ms 后保存。如果需要立即保存，可以调用 `flush()` 方法。

## 相关文档

- [ADR-001: StorageManager DDD 重构](./ADR-001-storage-manager-refactoring.md)
- [Requirements Document](./requirements.md)
- [Design Document](./design.md)
- [Tasks](./tasks.md)

## 贡献指南

如果你想为重构做出贡献：

1. 阅读 [Requirements](./requirements.md) 和 [Design](./design.md) 文档
2. 查看 [Tasks](./tasks.md) 了解当前进度
3. 选择一个未完成的任务
4. 编写代码和测试
5. 提交 Pull Request

## 支持

如果遇到问题或有疑问，请：

1. 查看本指南的常见问题部分
2. 查看相关文档
3. 在 GitHub Issues 中提问
