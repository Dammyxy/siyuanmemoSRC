# StorageManager DDD 架构文档

## 架构概览

本文档描述了重构后的存储架构，采用 DDD（领域驱动设计）原则，将系统分为四个清晰的层次。

## 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│                  (UI Components, Dialogs)                    │
│                                                              │
│  - Settings Dialog                                           │
│  - Review Interface                                          │
│  - Browser UI                                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │          ApplicationContext (DI Container)            │  │
│  │  - Service Registration & Lifecycle Management       │  │
│  │  - Dependency Injection                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Application Services                     │  │
│  │  - SettingsService                                    │  │
│  │  - ReviewLogService                                   │  │
│  │  - RiffBlacklistService                               │  │
│  │  - Use Cases (协调领域对象和基础设施服务)            │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Domain Layer                            │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  │
│  │ Queue Objects  │  │  Card Domain   │  │ XiuYuan      │  │
│  │ - Retrieval    │  │  - FSRSCard    │  │ Domain       │  │
│  │ - FinalDrill   │  │  - CardType    │  │ - IXiuyuan   │  │
│  │ - Incremental  │  │  - Review      │  │ - Templates  │  │
│  │ - FilterGroup  │  │    Logic       │  │              │  │
│  │ - NeuralRoam   │  │                │  │              │  │
│  └────────────────┘  └────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  Infrastructure Layer                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │    Queue     │  │    File      │  │    Unified       │  │
│  │ Persistence  │  │   Service    │  │    Storage       │  │
│  │   Service    │  │              │  │    Manager       │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    File System Layer                         │
│  - settings.json                                             │
│  - riff-integration.json                                     │
│  - queues.msgpack                                            │
│  - unified-cards.msgpack                                     │
│  - review-logs/YYYY-MM.json                                  │
│  - riff-blacklist.json                                       │
└─────────────────────────────────────────────────────────────┘
```

## 层次职责

### 1. Presentation Layer（表现层）

**职责**：
- 处理用户交互
- 显示数据
- 调用应用层服务

**组件**：
- Vue 组件
- 对话框
- 菜单项

**示例**：
```typescript
// Settings Dialog
async function saveSettings() {
  const settingsService = context.getSettingsService();
  await settingsService.updateSettings({
    newCardsPerDay: 20
  });
}
```

### 2. Application Layer（应用层）

**职责**：
- 协调领域对象完成业务用例
- 管理事务边界
- 提供应用服务接口

**服务**：

#### SettingsService
- 管理插件设置
- 管理 Riff 集成配置
- 验证设置有效性
- 防抖保存

#### ReviewLogService
- 记录复习日志
- 记录重新调度日志
- 按月分片存储
- 查询历史日志

#### RiffBlacklistService
- 管理 Riff 黑名单
- 快速成员检查（O(1)）
- 防抖保存

#### ApplicationContext
- 服务注册和创建
- 依赖注入
- 生命周期管理

**示例**：
```typescript
class ApplicationContext {
  private services: Map<string, any> = new Map();
  
  registerServiceFactory(name: string, factory: Function) {
    this.serviceFactories.set(name, factory);
  }
  
  getService<T>(name: string): T {
    if (!this.services.has(name)) {
      const factory = this.serviceFactories.get(name);
      this.services.set(name, factory(this));
    }
    return this.services.get(name);
  }
}
```

### 3. Domain Layer（领域层）

**职责**：
- 包含业务逻辑
- 定义领域模型
- 实现业务规则

**对象**：

#### Queue Objects（队列对象）
- RetrievalPracticeQueue：复习练习队列
- FinalDrillQueue：最终演练队列
- IncrementalLearningQueue：渐进学习队列
- FilterGroupQueue：过滤组队列
- NeuralRoamQueue：神经漫游队列

**特点**：
- 自治：自己管理状态和逻辑
- 通过接口使用基础设施服务
- 不直接依赖具体实现

**示例**：
```typescript
class RetrievalPracticeQueue {
  private items: QueueItem[] = [];
  
  constructor(private persistence: IQueuePersistenceService) {}
  
  async load(): Promise<void> {
    const data = this.persistence.get<QueueItem[]>('retrievalPracticeQueue');
    if (data) {
      this.items = data;
    }
  }
  
  async save(): Promise<void> {
    await this.persistence.set('retrievalPracticeQueue', this.items);
  }
  
  // 业务逻辑
  peek(): QueueItem | null {
    return this.items[0] || null;
  }
  
  next(): QueueItem | null {
    return this.items.shift() || null;
  }
}
```

#### Card Domain（卡片领域）
- FSRSCard：FSRS 算法卡片
- CardType：卡片类型
- Review Logic：复习逻辑

#### XiuYuan Domain（修远领域）
- IXiuyuan：修远接口
- Templates：模板系统

### 4. Infrastructure Layer（基础设施层）

**职责**：
- 提供技术实现
- 数据持久化
- 外部系统交互

**服务**：

#### FileService
- 封装 SiYuan Plugin API
- 提供统一的文件读写接口
- 支持 JSON 和 MessagePack 格式
- 错误处理和日志记录

**接口**：
```typescript
interface IFileService {
  readFile(fileName: string): Promise<string | null>;
  writeFile(fileName: string, content: string): Promise<void>;
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: any): Promise<void>;
  readMsgpack<T>(fileName: string): Promise<T | null>;
  writeMsgpack(fileName: string, data: any): Promise<void>;
}
```

#### QueuePersistenceService
- 通用键值存储
- 支持任意 JSON 可序列化数据
- 防抖保存（300ms）
- 所有队列数据存储在单一文件

**接口**：
```typescript
interface IQueuePersistenceService {
  init(): Promise<void>;
  get<T>(key: string): T | null;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): string[];
  flush(): Promise<void>;
}
```

#### UnifiedStorageManager
- 卡片和 XiuYuan 统一存储
- CRUD 操作
- 关联关系维护
- 索引和查询优化

## 数据流

### 1. 读取流程

```
UI Component
    ↓ (调用)
Application Service
    ↓ (查询)
Domain Object
    ↓ (读取)
Infrastructure Service
    ↓ (加载)
File System
```

**示例**：读取设置
```typescript
// 1. UI 调用
const settings = context.getSettingsService().getSettings();

// 2. SettingsService 返回内存中的设置
return this.currentSettings;

// 3. 设置在初始化时从文件加载
async init() {
  const data = await this.fileService.readJSON('settings.json');
  this.currentSettings = data || DEFAULT_SETTINGS;
}
```

### 2. 写入流程

```
UI Component
    ↓ (调用)
Application Service
    ↓ (更新)
Domain Object
    ↓ (保存)
Infrastructure Service
    ↓ (写入)
File System
```

**示例**：更新设置
```typescript
// 1. UI 调用
await context.getSettingsService().updateSettings({ newCardsPerDay: 20 });

// 2. SettingsService 更新内存并触发保存
this.currentSettings = { ...this.currentSettings, ...settings };
this.debouncedSave();

// 3. 防抖后保存到文件
await this.fileService.writeJSON('settings.json', this.currentSettings);
```

### 3. 队列操作流程

```
Use Case
    ↓ (创建)
Queue Object
    ↓ (加载)
QueuePersistenceService
    ↓ (读取)
File System
    ↓
Queue Object (内存状态)
    ↓ (业务操作)
Queue Object
    ↓ (保存)
QueuePersistenceService
    ↓ (写入)
File System
```

**示例**：队列操作
```typescript
// 1. 创建队列对象
const queue = new RetrievalPracticeQueue(queuePersistence);

// 2. 加载状态
await queue.load();

// 3. 业务操作
queue.add(item);
const next = queue.next();

// 4. 保存状态
await queue.save();
```

## 依赖关系

### 依赖方向

```
Presentation → Application → Domain → Infrastructure
```

**规则**：
- 上层可以依赖下层
- 下层不能依赖上层
- 同层之间通过接口通信

### 依赖注入

```typescript
// 注册服务
context.registerServiceFactory('fileService', (ctx) => {
  return new FileService(ctx.getPlugin());
});

context.registerServiceFactory('settingsService', (ctx) => {
  return new SettingsService(ctx.getFileService());
});

context.registerServiceFactory('queuePersistenceService', (ctx) => {
  return new QueuePersistenceService(ctx.getFileService());
});

// 使用服务
const settingsService = context.getSettingsService();
const queuePersistence = context.getQueuePersistenceService();
```

## 存储结构

### 文件组织

```
data/
├── settings.json                    # 插件设置
├── riff-integration.json            # Riff 集成配置
├── queues.msgpack                   # 所有队列数据
├── unified-cards.msgpack            # 卡片和 XiuYuan 数据
├── riff-blacklist.json              # Riff 黑名单
└── review-logs/
    ├── 2024-01.json                 # 2024年1月的日志
    ├── 2024-02.json                 # 2024年2月的日志
    └── ...
```

### 队列数据结构

```typescript
// queues.msgpack
{
  "retrievalPracticeQueue": [
    { id: "card1", blockId: "block1", ... }
  ],
  "finalDrillQueue": {
    items: [...],
    config: {...}
  },
  "incrementalLearningQueue": [...],
  "filterGroupQueue": [...],
  "neuralRoamQueue": [...]
}
```

### 设置数据结构

```typescript
// settings.json
{
  "newCardsPerDay": 20,
  "reviewsPerDay": 100,
  "fsrs": {
    "requestRetention": 0.9,
    "maximumInterval": 36500,
    "weights": [...]
  },
  ...
}

// riff-integration.json
{
  "mode": "advanced",
  "fullSync": {
    "enabled": true,
    "interval": 3600000
  },
  "incrementalSync": {
    "enabled": true,
    "triggers": ["plugin-start", "browser-open"]
  }
}
```

## 性能优化

### 1. 防抖保存

所有写操作都使用防抖机制（300ms），避免频繁写入：

```typescript
private debouncedSave(): void {
  if (this.saveTimer) {
    clearTimeout(this.saveTimer);
  }
  
  this.saveTimer = setTimeout(async () => {
    await this.save();
  }, 300);
}
```

### 2. 内存缓存

所有服务都在内存中维护数据缓存，避免频繁读取文件：

```typescript
class SettingsService {
  private currentSettings: PluginSettings;
  
  getSettings(): PluginSettings {
    return this.currentSettings; // 直接返回内存中的数据
  }
}
```

### 3. 批量操作

支持批量操作以减少 I/O 次数：

```typescript
// 批量更新卡片
for (const card of cards) {
  unifiedStorage.updateCard(card);
}
// 一次性保存所有更改
await unifiedStorage.save();
```

### 4. 索引优化

UnifiedStorageManager 使用索引加速查询：

```typescript
class UnifiedStorageManager {
  private cardIndex: Map<string, FSRSCard>;
  private blockIndex: Map<string, FSRSCard>;
  
  getCard(cardId: string): FSRSCard | null {
    return this.cardIndex.get(cardId) || null; // O(1) 查询
  }
}
```

## 错误处理

### 错误类型

```typescript
// 文件操作错误
class FileOperationError extends Error {
  constructor(
    public readonly operation: 'read' | 'write',
    public readonly fileName: string,
    public readonly cause: Error
  ) {}
}

// 设置验证错误
class SettingsValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {}
}

// 队列持久化错误
class QueuePersistenceError extends Error {
  constructor(
    public readonly operation: string,
    public readonly key: string,
    public readonly cause: Error
  ) {}
}
```

### 错误处理策略

1. **优雅降级**：服务初始化失败时使用默认值
2. **重试机制**：临时错误使用指数退避重试
3. **错误日志**：记录详细的错误信息
4. **用户通知**：向用户显示清晰的错误消息

## 测试策略

### 1. 单元测试

每个服务都有独立的单元测试：

```typescript
describe('SettingsService', () => {
  test('should load settings', async () => {
    const service = new SettingsService(mockFileService);
    await service.init();
    expect(service.getSettings()).toBeDefined();
  });
});
```

### 2. 属性测试

验证通用正确性属性：

```typescript
test('settings round-trip property', async () => {
  fc.assert(
    fc.asyncProperty(
      fc.record({ /* settings */ }),
      async (settings) => {
        await service.updateSettings(settings);
        const loaded = service.getSettings();
        expect(loaded).toEqual(expect.objectContaining(settings));
      }
    )
  );
});
```

### 3. 集成测试

测试服务之间的协作：

```typescript
test('complete workflow', async () => {
  // 创建卡片 → 加入队列 → 复习 → 记录日志
  const card = createTestCard();
  unifiedStorage.addCard(card);
  await unifiedStorage.save();
  
  const queue = new RetrievalPracticeQueue(queuePersistence);
  await queue.load();
  queue.add({ cardId: card.id });
  await queue.save();
  
  await reviewLogService.addReviewLog({ /* log */ });
});
```

## 扩展指南

### 添加新服务

1. **确定层次**：应用层还是基础设施层
2. **定义接口**：创建服务接口
3. **实现服务**：实现接口方法
4. **注册服务**：在 ApplicationContext 中注册
5. **编写测试**：单元测试和集成测试

**示例**：添加新的应用层服务

```typescript
// 1. 定义接口
interface IMyService {
  doSomething(): Promise<void>;
}

// 2. 实现服务
class MyService implements IMyService {
  constructor(private fileService: IFileService) {}
  
  async doSomething(): Promise<void> {
    // 实现逻辑
  }
}

// 3. 注册服务
context.registerServiceFactory('myService', (ctx) => {
  return new MyService(ctx.getFileService());
});

// 4. 添加便捷方法
getMyService(): IMyService {
  return this.getService('myService');
}
```

## 相关文档

- [ADR-001: StorageManager DDD 重构](./ADR-001-storage-manager-refactoring.md)
- [重构指南](./REFACTORING-GUIDE.md)
- [Requirements](./requirements.md)
- [Design](./design.md)
