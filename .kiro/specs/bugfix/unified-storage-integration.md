# UnifiedStorageManager 集成修复

## 问题描述

插件虽然实现了 `UnifiedStorageManager`，但实际运行时仍然使用旧的 `StorageManager`，导致：

1. `unified-cards.msgpack` 文件没有生成
2. 数据仍然存储在旧的 `cards.msgpack` 和 `xiuyuan.msgpack` 中
3. `XiuyuanRepository` 期望 `UnifiedStorageManager`，但实际传入的是 `StorageManager`

## 根本原因

`ApplicationContext.create()` 方法中：
- 创建了 `StorageManager` 实例
- 没有创建 `UnifiedStorageManager` 实例
- 所有服务都使用 `StorageManager`

## 解决方案

### 1. 在 ApplicationContext 中添加 UnifiedStorageManager

**修改文件**：`src/application/ApplicationContext.ts`

#### 1.1 添加导入
```typescript
import { UnifiedStorageManager } from '@/core/storage/UnifiedStorageManager';
import { createPersistenceCallbacks } from '@/core/storage/UnifiedStoragePersistence';
```

#### 1.2 添加字段
```typescript
private unifiedStorageManager: UnifiedStorageManager;
```

#### 1.3 修改 create() 方法
```typescript
static async create(config: ApplicationConfig): Promise<ApplicationContext> {
  // 1. 初始化存储管理器
  const storageManager = new StorageManager(config.plugin.name);
  await storageManager.init();
  
  // 🆕 1.1 初始化统一存储管理器
  const unifiedStorageManager = new UnifiedStorageManager();
  const { save, load } = createPersistenceCallbacks(config.plugin);
  unifiedStorageManager.setPersistenceCallbacks(save, load);
  
  // 尝试加载数据
  const loadResult = await unifiedStorageManager.load();
  if (loadResult.isErr()) {
    console.log('[ApplicationContext] UnifiedStorageManager: No existing data, starting fresh');
  } else {
    const stats = unifiedStorageManager.getStats();
    console.log('[ApplicationContext] ✅ UnifiedStorageManager loaded:', {
      xiuyuans: stats.xiuyuanCount,
      cards: stats.cardCount,
      cardDTOs: stats.cardDTOCount
    });
  }
  
  // ... 其他初始化代码
}
```

#### 1.4 修改 XiuyuanRepository 创建
```typescript
const xiuyuanRepoTemp = new XiuyuanRepository(
  unifiedStorageManager,  // ✅ 使用 UnifiedStorageManager
  config.plugin
);
```

#### 1.5 添加 getUnifiedStorage() 方法
```typescript
getUnifiedStorage(): UnifiedStorageManager {
  return this.unifiedStorageManager;
}
```

### 2. 让 UnifiedStorageManager 实现 StorageManager 接口

**修改文件**：`src/core/storage/UnifiedStorageManager.ts`

添加适配方法，使其兼容 StorageManager 的接口：

```typescript
// ========================================================================
// StorageManager 兼容接口（适配器方法）
// ========================================================================

/**
 * 设置卡片（StorageManager 兼容方法）
 */
setCard(card: FSRSCard): void {
  const existing = this.cards.get(card.id);
  if (existing) {
    this.updateCard(card);
  } else {
    const xiuyuanId = (card.meta as any)?.xiuyuanID;
    if (xiuyuanId) {
      const xiuyuan = this.xiuyuans.get(xiuyuanId);
      if (xiuyuan) {
        this.createCard(xiuyuan, card);
      }
    }
  }
}

/**
 * 移除卡片（StorageManager 兼容方法）
 */
removeCard(cardId: string): boolean {
  const card = this.cards.get(cardId);
  if (!card) {
    return false;
  }
  
  this.cards.delete(cardId);
  this.cardDTOs.delete(cardId);
  this.updateIndexesForCard(card, 'remove');
  this.dirty = true;
  this.scheduleSave();
  
  return true;
}

/**
 * 保存卡片（StorageManager 兼容方法）
 */
async saveCards(): Promise<void> {
  const result = await this.save();
  if (!result.ok) {
    throw new Error('Failed to save cards');
  }
}

/**
 * 通过 blockId 获取卡片（StorageManager 兼容方法）
 */
getCardByBlockId(blockId: string): FSRSCard | undefined {
  const cards = this.getCardsByBlockId(blockId);
  return cards[0];
}
```

### 3. 更新服务工厂使用 UnifiedStorageManager

**修改文件**：`src/application/ApplicationContext.ts`

```typescript
// CardApplicationService
this.registerServiceFactory('cardService', (context) => {
  const xiuyuanRepo = new XiuyuanRepository(
    context.getUnifiedStorage(),  // ✅ 使用 UnifiedStorageManager
    context.getPlugin()
  );
  
  // ...
  
  return new CardApplicationService(
    createCardUseCase,
    deleteCardUseCase,
    updateCardUseCase,
    context.getUnifiedStorage() as any,  // ✅ 使用 UnifiedStorageManager
    scheduleService
  );
});

// BrowserApplicationService
this.registerServiceFactory('browserService', (context) => {
  return new BrowserApplicationService(
    context.getUnifiedStorage() as any,  // ✅ 使用 UnifiedStorageManager
    cardScheduleService,
    cardFilterService,
    cardSortService,
    context.getUnifiedDataSourceManager()
  );
});

// ReviewApplicationService
this.registerServiceFactory('reviewService', (context) => {
  return new ReviewApplicationService(
    context.getUnifiedStorage() as any,  // ✅ 使用 UnifiedStorageManager
    context.getScheduler()
  );
});
```

## 验证

### 常见问题

#### 1. TypeError: loadResult.isErr is not a function

**原因**：Result 类型使用 `ok` 属性，不是 `isErr()` 方法。

**修复**：
```typescript
// ❌ 错误
if (loadResult.isErr()) { ... }

// ✅ 正确
if (!loadResult.ok) { ... }
```

### 1. 启动插件后检查文件

应该生成 `unified-cards.msgpack` 文件：

```
data/storage/petal/siyuan-plugin-siyuanmemo/
├── unified-cards.msgpack  ✅ 新文件
├── settings.json
└── practice-queue.msgpack
```

### 2. 检查控制台日志

应该看到：

```
[ApplicationContext] ✅ UnifiedStorageManager loaded: {
  xiuyuans: 0,
  cards: 0,
  cardDTOs: 0
}
```

### 3. 创建卡片后检查

创建一张卡片后，`unified-cards.msgpack` 应该包含：

```json
{
  "version": 1,
  "xiuyuans": {
    "xy_123": { ... }
  },
  "cards": {
    "card-1": { ... }
  }
}
```

## 架构优势

### 1. 符合 DDD 原则

- **依赖倒置**：应用层依赖接口，不依赖具体实现
- **单一数据源**：所有数据访问都通过 UnifiedStorageManager
- **清晰的边界**：基础设施层实现领域层定义的接口

### 2. 为分文件存储做准备

- 分文件存储只需要修改 UnifiedStorageManager 内部实现
- 不需要修改应用层和领域层的代码
- 接口保持稳定

### 3. 平滑迁移

- 可以逐步废弃旧的 StorageManager
- 所有服务统一使用 UnifiedStorageManager
- 避免数据不一致

## 下一步：分文件存储

修复完成后，可以实现分文件存储：

1. 修改 `UnifiedStoragePersistence.ts`
2. 创建 `xiuyuans.msgpack` 和 `cards.msgpack`
3. 修改 `save()` 和 `load()` 方法
4. 保持接口不变

详见：[分文件存储设计](./split-file-storage-design.md)

## 相关文档

- [当前架构分析](./current-architecture-analysis.md)
- [XiuyuanRepository Storage 修复](./xiuyuan-repository-storage-fix.md)
