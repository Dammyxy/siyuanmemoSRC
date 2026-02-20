# 初始化顺序错误修复

## 问题描述

插件启动时出现两个关键错误：

### 1. ApplicationContext 初始化顺序错误

```
ReferenceError: Cannot access 'context' before initialization
at ApplicationContext.create (plugin:siyuan-plugin-siyuanmemo:107904:29)
```

**根本原因**：在 `ApplicationContext.create()` 方法中，第587和592行尝试访问 `context` 变量，但该变量要到第652行才被创建。

```typescript
// ❌ 错误：context 还未创建
const settingsService = context.getSettingsService();
const queuePersistenceService = context.getQueuePersistenceService();

// ... 很多行代码之后 ...

// ✅ context 在这里才被创建
const context = new ApplicationContext(config, { ... });
```

### 2. StorageManager.loadCards() 错误处理不完整

```
TypeError: cards is not iterable
at StorageManager.loadCards (plugin:siyuan-plugin-siyuanmemo:2259:28)
```

**根本原因**：当 msgpack 文件损坏时，`loadMsgpackData` 返回 `null`，然后尝试从 JSON 加载。但 `JSON.parse()` 可能返回非数组值，导致后续的 `for...of` 循环失败。

```typescript
// ❌ 错误：没有验证 JSON.parse 的返回值类型
const cards: FSRSCard[] = JSON.parse(jsonData);
for (const card of cards) { // 如果 cards 不是数组，这里会失败
  // ...
}
```

## DDD 架构审视

这两个问题都不是 DDD 架构设计的问题，而是实现细节的错误：

1. **初始化顺序错误**：违反了依赖注入的基本原则 - 在依赖可用之前就尝试使用它
2. **类型安全问题**：没有在运行时验证数据类型，过度信任 TypeScript 的编译时类型检查

## 修复方案

### 修复 1：调整 ApplicationContext 初始化顺序

**文件**：`src/application/ApplicationContext.ts`

**修改**：

1. 延迟 `UnifiedDataSourceManager` 的依赖注入
2. 在 `context` 创建后再设置这些依赖

```typescript
// 步骤 7：延迟初始化
const unifiedDataSourceManager = UnifiedDataSourceManager.getInstance();
// ⚠️ AdvancedRouter 和 QueuePersistence 将在 context 创建后设置

// ... 创建其他不依赖 context 的服务 ...

// 步骤 12：创建 context
const context = new ApplicationContext(config, { ... });

// 步骤 13.5：设置延迟的依赖
const settingsService = context.getSettingsService();
const advancedRouter = new AdvancedDataRouter(
  cardApplicationService, 
  storageManager, 
  config.plugin as any, 
  settingsService
);
unifiedDataSourceManager.setAdvancedRouter(advancedRouter);

const queuePersistenceService = context.getQueuePersistenceService();
unifiedDataSourceManager.setQueuePersistence(queuePersistenceService);
```

**符合 DDD 原则**：
- 遵循依赖倒置原则（DIP）：高层模块不依赖低层模块，都依赖抽象
- 正确的初始化顺序：先创建依赖，再注入使用

### 修复 2：增强 loadCards() 的错误处理

**文件**：`src/core/storage/manager.ts`

**修改**：

1. 验证 `JSON.parse()` 的返回值类型
2. 确保在所有错误情况下都有有效的空缓存
3. 将 `console.warn` 改为 `console.error` 以便更好地追踪问题

```typescript
private async loadCards(): Promise<void> {
    try {
        // ... msgpack 加载逻辑 ...

        // 后备：尝试加载 JSON 格式
        const jsonData = await this.readPluginData(STORAGE_FILES.CARDS_JSON);
        if (jsonData) {
            const parsed = JSON.parse(jsonData);
            // ✅ 确保解析结果是数组
            const cards: FSRSCard[] = Array.isArray(parsed) ? parsed : [];
            // ... 处理 cards ...
        } else {
            // ✅ 如果没有任何数据文件，初始化为空
            console.log('[SiYuanMemo] No card data found, starting with empty collection');
            this.cardsCache.clear();
        }
    } catch (err) {
        console.error('[SiYuanMemo] Failed to load cards:', err);
        // ✅ 确保即使出错也有一个有效的空缓存
        this.cardsCache.clear();
    }
}
```

**符合 DDD 原则**：
- 防御性编程：不信任外部数据源
- 失败安全（Fail-safe）：即使出错也保持系统可用状态
- 明确的错误处理：区分不同的错误场景

## 测试验证

### 验证步骤

1. ✅ 编译成功（无 TypeScript 错误）
2. ⏳ 插件启动测试（需要在思源笔记中验证）
3. ⏳ 数据加载测试（验证空数据、损坏数据、正常数据的处理）

### 预期结果

1. 插件能够正常启动，不再出现 `Cannot access 'context' before initialization` 错误
2. 即使 msgpack 文件损坏，也能正常降级到 JSON 或空数据
3. 所有队列和数据结构都能正确初始化

## 后续改进建议

### 1. 引入初始化状态机

当前的初始化逻辑是线性的，容易出现顺序错误。建议引入状态机模式：

```typescript
enum InitializationPhase {
  STORAGE = 'storage',
  SERVICES = 'services',
  CONTEXT = 'context',
  POST_INIT = 'post-init',
}

class InitializationOrchestrator {
  private phase: InitializationPhase = InitializationPhase.STORAGE;
  
  async initialize() {
    await this.initStorage();
    this.phase = InitializationPhase.SERVICES;
    
    await this.initServices();
    this.phase = InitializationPhase.CONTEXT;
    
    // ... 依次执行
  }
}
```

### 2. 数据验证层

引入专门的数据验证层，使用 Zod 或类似库：

```typescript
import { z } from 'zod';

const CardSchema = z.object({
  id: z.string(),
  blockId: z.string(),
  // ... 其他字段
});

const CardsArraySchema = z.array(CardSchema);

// 在加载时验证
const parsed = JSON.parse(jsonData);
const cards = CardsArraySchema.parse(parsed); // 如果不符合，抛出详细错误
```

### 3. 更好的错误恢复机制

当数据损坏时，不仅要记录日志，还应该：
- 自动备份损坏的文件
- 尝试从备份恢复
- 通知用户数据问题

## 总结

这次修复解决了两个关键的初始化问题：

1. **ApplicationContext 初始化顺序**：通过延迟依赖注入，确保所有依赖在使用前都已创建
2. **数据加载健壮性**：增强错误处理，确保即使数据损坏也能保持系统可用

这些修复符合 DDD 的核心原则：
- 明确的依赖关系
- 防御性编程
- 失败安全设计

修复后的代码更加健壮，能够处理各种边界情况和错误场景。
