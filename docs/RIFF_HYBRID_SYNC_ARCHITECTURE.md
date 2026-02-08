# Riff 混合同步架构文档

## 概述

本文档详细说明 Riff 混合同步方案的架构设计、数据流和组件关系。混合同步方案结合了增量同步（性能优化）和全量同步（数据一致性），在高性能和数据完整性之间取得平衡。

## 架构图

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    配置层（Config）                          │
│  - mode: 'advanced' | 'simple'                              │
│  - incrementalSync / fullSync / deleteSync 配置             │
└─────────────────────────────────────────────────────────────┘
                         ↓
              ┌──────────┴──────────┐
              ↓                     ↓
    ┌─────────────────┐   ┌─────────────────┐
    │  高阶模式        │   │  简单模式        │
    │  (Advanced)      │   │  (Simple)        │
    └─────────────────┘   └─────────────────┘
              ↓                     ↓
┌─────────────────────────┐ ┌─────────────────────────┐
│  混合同步服务            │ │  RiffDataSource         │
│  (HybridSyncService)    │ │  - 实时获取             │
│  - 增量同步              │ │  - Riff 调度            │
│  - 全量同步              │ │                         │
│  - 删除同步              │ │                         │
└─────────────────────────┘ └─────────────────────────┘
              ↓                     ↓
┌─────────────────────────┐ ┌─────────────────────────┐
│  本地存储                │ │  Riff API               │
│  (StorageManager)        │ │                         │
└─────────────────────────┘ └─────────────────────────┘
              ↓                     ↓
┌─────────────────────────┐ ┌─────────────────────────┐
│  LocalStorageDataSource  │ │  RiffDataSource         │
└─────────────────────────┘ └─────────────────────────┘
              ↓                     ↓
              └──────────┬──────────┘
                         ↓
              ┌─────────────────────┐
              │  队列系统            │
              │  (Queue System)     │
              └─────────────────────┘
                         ↓
              ┌─────────────────────┐
              │  UI 层               │
              │  - SRS 浏览器        │
              │  - 复习界面          │
              └─────────────────────┘
```

### 高阶模式架构

```
┌─────────────────────────────────────────────────────────┐
│                    Riff 系统（远程）                     │
│  - 卡片数据源                                            │
│  - 新卡片提供者                                          │
└─────────────────────────────────────────────────────────┘
                         ↓
              后台混合同步（异步）
                         ↓
┌─────────────────────────────────────────────────────────┐
│              HybridSyncService（同步服务）               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ 增量同步     │  │ 全量同步     │  │ 删除同步     │    │
│  │ (快速)      │  │ (完整)      │  │ (双向)      │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│              本地存储（主数据源）                         │
│  - FSRSCard 数据                                         │
│  - 黑名单数据                                            │
│  - 同步状态                                              │
└─────────────────────────────────────────────────────────┘
                         ↓
              LocalStorageDataSource（直接读取）
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    队列系统                              │
│  - RetrievalPracticeQueue（复习队列）                   │
│  - IncrementalLearningQueue（增量学习队列）             │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                      UI 层                               │
│  - SRS 浏览器（卡片管理）                                │
│  - 复习界面（学习体验）                                  │
│  - 同步状态指示器                                        │
└─────────────────────────────────────────────────────────┘
```

**特点**：
- ✅ 数据源：LocalStorageDataSource（直接读本地）
- ✅ 同步：后台混合同步（增量 + 全量）
- ✅ 调度：本地调度器（FSRS/SM-15/A-Factor）
- ✅ 性能：极快（无网络请求）
- ✅ 离线：完全可用

### 简单模式架构

```
┌─────────────────────────────────────────────────────────┐
│              Riff 系统（远程数据源 + 调度器）             │
│  - 卡片数据                                              │
│  - 调度算法                                              │
│  - 复习记录                                              │
└─────────────────────────────────────────────────────────┘
                         ↓
              RiffDataSource（实时获取）
                         ↓
┌─────────────────────────────────────────────────────────┐
│                    队列系统                              │
│  - 使用 Riff 调度器                                      │
│  - 实时数据                                              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│                      UI 层                               │
│  - SRS 浏览器                                            │
│  - 复习界面                                              │
└─────────────────────────────────────────────────────────┘
```

**特点**：
- ✅ 数据源：RiffDataSource（实时获取）
- ✅ 同步：无需同步
- ✅ 调度：Riff 原生调度器
- ✅ 性能：依赖网络
- ✅ 离线：不可用

## 数据流详解

### 1. 插件启动流程

```
用户启动插件
  ↓
加载配置（loadSettings）
  ↓
检测配置迁移（ConfigMigrator.needsMigration）
  ├─ 需要迁移 → ConfigMigrator.migrate()
  │              ↓
  │           保存新配置
  │              ↓
  │           显示迁移提示
  └─ 不需要 → 继续
  ↓
检查模式（config.mode）
  ├─ advanced → 初始化 HybridSyncService
  │              ├─ 启动全量同步定时器
  │              └─ 执行初始增量同步
  └─ simple → 跳过同步服务
  ↓
创建数据源（DataSourceFactory）
  ├─ advanced → LocalStorageDataSource
  └─ simple → RiffDataSource
  ↓
初始化队列系统
  ↓
插件就绪
```

### 2. 增量同步流程（高阶模式）

```
触发时机：
- 插件启动（plugin-start）
- SRS 浏览器打开（browser-open）
- 复习界面打开（review-open）

流程：
HybridSyncService.incrementalSync()
  ↓
1. 获取新卡片
   getRiffNewCards(deckId, lastSyncTime)
  ↓
2. 过滤黑名单
   blacklist = storage.getRiffBlacklist()
   filtered = cards.filter(c => !blacklist.has(c.id))
  ↓
3. 检查本地存在性
   for each card:
     if (!storage.getCard(card.id)):
       storage.setCard(convertToFSRSCard(card))
       addedCount++
     else:
       skippedCount++
  ↓
4. 保存数据
   storage.saveCards()
  ↓
5. 自动检测卡片类型（如果启用）
   detectCardTypesForNewCards(addedCards)
   ├─ batchDetectCardType(blockIds)
   ├─ setBlockAttrs(id, { cardType, aFactor })
   └─ 返回检测数量
  ↓
6. 更新时间戳
   lastSyncTime = Date.now()
  ↓
返回结果：
{
  success: true,
  addedCount: 5,
  deletedCount: 0,
  skippedCount: 3,
  detectedCount: 5
}
```

### 3. 全量同步流程（高阶模式）

```
触发时机：
- 定时器（每24小时）
- 用户手动触发

流程：
HybridSyncService.fullSync()
  ↓
1. 获取所有卡片 ID
   riffCards = getRiffCards(deckId, { dueOnly: false })
   riffCardIDs = Set(riffCards.map(c => c.id))
   localCardIDs = Set(storage.getAllCards().map(c => c.id))
  ↓
2. 计算差异
   toAdd = riffCards.filter(c => !localCardIDs.has(c.id))
   toDelete = localCardIDs.filter(id => !riffCardIDs.has(id))
  ↓
3. 执行新增
   for each card in toAdd:
     storage.setCard(convertToFSRSCard(card))
  ↓
4. 执行删除
   for each id in toDelete:
     storage.removeCard(id)
  ↓
5. 清理黑名单
   blacklist = storage.getRiffBlacklist()
   toRemove = blacklist.filter(id => !riffCardIDs.has(id))
   for each id in toRemove:
     storage.removeFromRiffBlacklist(id)
  ↓
6. 保存数据
   storage.saveCards()
  ↓
7. 自动检测卡片类型（如果启用）
   detectCardTypesForNewCards(toAdd)
  ↓
8. 更新时间戳
   lastFullSyncTime = Date.now()
  ↓
返回结果：
{
  success: true,
  addedCount: 3,
  deletedCount: 2,
  skippedCount: 0,
  blacklistCleanedCount: 1,
  detectedCount: 3
}
```

### 4. 删除同步流程（高阶模式）

```
用户在 SRS 浏览器删除卡片
  ↓
1. 从本地删除
   storage.removeCard(cardId)
   storage.saveCards()
  ↓
2. 尝试从 Riff 删除
   HybridSyncService.deleteSync(cardId)
     ↓
   try:
     removeRiffCards(deckId, [cardId])
     ↓
     成功 → 返回 true
            显示："已从 Riff 删除"
   catch error:
     失败 → storage.addToRiffBlacklist(cardId)
            返回 false
            显示："删除失败，已加入黑名单"
  ↓
3. 刷新 UI
   重新加载卡片列表
```

### 5. 复习卡片流程（高阶模式）

```
用户打开复习界面
  ↓
触发增量同步（后台）
  ↓
LocalStorageDataSource.getAll()
  ├─ storage.getAllCards()
  ├─ 过滤到期卡片（card.due <= Date.now()）
  ├─ 按优先级排序
  └─ 转换为 QueueItem
  ↓
Queue.getNextCard()
  ↓
显示卡片
  ↓
用户评分（1-4）
  ↓
SchedulerRouter.route(card, rating)
  ├─ 选择调度器（FSRS/SM-15/A-Factor）
  ├─ 计算下次复习时间
  └─ 返回更新后的卡片
  ↓
storage.setCard(updatedCard)
storage.saveCards()
  ↓
显示下一张卡片
```

### 6. SRS 浏览器流程（高阶模式）

```
用户打开 SRS 浏览器
  ↓
触发增量同步（后台）
  ↓
LocalStorageDataSource.getAll()
  ├─ storage.getAllCards()
  ├─ 应用过滤器（可选）
  ├─ 应用排序（可选）
  └─ 转换为 QueueItem
  ↓
渲染卡片列表
  ├─ 显示卡片信息
  ├─ 显示同步状态
  └─ 提供操作按钮
  ↓
用户操作：
  ├─ 删除卡片 → 删除同步流程
  ├─ 手动同步 → 增量同步流程
  └─ 全量同步 → 全量同步流程
```

## 组件关系图

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                  HybridSyncService                       │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 配置 (HybridSyncConfig)                         │   │
│  │  - deckId: string                               │   │
│  │  - storage: StorageManager                      │   │
│  │  - incrementalSync: {...}                       │   │
│  │  - fullSync: {...}                              │   │
│  │  - deleteSync: {...}                            │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 状态                                            │   │
│  │  - lastSyncTime: number                         │   │
│  │  - lastFullSyncTime: number                     │   │
│  │  - syncStatus: 'idle' | 'syncing' | ...        │   │
│  │  - fullSyncTimer: NodeJS.Timeout                │   │
│  └─────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 方法                                            │   │
│  │  + start(): Promise<void>                       │   │
│  │  + stop(): void                                 │   │
│  │  + incrementalSync(): Promise<SyncResult>       │   │
│  │  + fullSync(): Promise<SyncResult>              │   │
│  │  + deleteSync(cardID): Promise<boolean>         │   │
│  │  + getSyncStatus(): {...}                       │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
                         ↓ 使用
┌─────────────────────────────────────────────────────────┐
│                  StorageManager                          │
│  + getAllCards(): FSRSCard[]                            │
│  + getCard(id): FSRSCard | undefined                    │
│  + setCard(card): void                                  │
│  + removeCard(id): void                                 │
│  + saveCards(): Promise<void>                           │
│  + getRiffBlacklist(): Set<string>                      │
│  + addToRiffBlacklist(id): void                         │
│  + removeFromRiffBlacklist(id): void                    │
└─────────────────────────────────────────────────────────┘
                         ↓ 使用
┌─────────────────────────────────────────────────────────┐
│              LocalStorageDataSource                      │
│  + getAll(): Promise<QueueItem[]>                       │
│  - convertToQueueItem(card): QueueItem                  │
│  - extractNextDues(card): NextDues                      │
└─────────────────────────────────────────────────────────┘
```

### 数据源对比

```
┌─────────────────────────┐     ┌─────────────────────────┐
│ LocalStorageDataSource  │     │   RiffDataSource        │
├─────────────────────────┤     ├─────────────────────────┤
│ 用于：高阶模式          │     │ 用于：简单模式          │
│ 数据源：本地存储        │     │ 数据源：Riff API        │
│ 性能：极快（< 10ms）    │     │ 性能：慢（100-500ms）   │
│ 离线：完全可用          │     │ 离线：不可用            │
│ 同步：后台混合同步      │     │ 同步：实时获取          │
└─────────────────────────┘     └─────────────────────────┘
```

## 模式对比

### 功能对比

| 功能 | 高阶模式 | 简单模式 |
|------|---------|---------|
| 数据源 | LocalStorageDataSource | RiffDataSource |
| 调度器 | 本地（FSRS/SM-15/A-Factor） | Riff 原生 |
| 同步方式 | 混合同步（增量 + 全量） | 实时获取 |
| 离线使用 | ✅ 完全可用 | ❌ 不可用 |
| 双向删除 | ✅ 支持 | ❌ 不支持 |
| 黑名单 | ✅ 使用 | ❌ 不使用 |
| 配置复杂度 | 中等 | 简单 |
| 适用场景 | 高级用户 | 简单用户 |

### 性能对比

| 操作 | 高阶模式 | 简单模式 |
|------|---------|---------|
| 打开浏览器 | < 10ms | 100-500ms |
| 获取卡片 | < 1ms | 50-200ms |
| 复习卡片 | < 10ms | 100-300ms |
| 删除卡片 | < 10ms（本地） + 异步同步 | 100-300ms |
| 增量同步 | < 1s（后台） | N/A |
| 全量同步 | < 5s（后台） | N/A |

### 可靠性对比

| 场景 | 高阶模式 | 简单模式 |
|------|---------|---------|
| 网络断开 | ✅ 继续工作 | ❌ 无法使用 |
| Riff 异常 | ✅ 继续工作 | ❌ 无法使用 |
| 数据一致性 | 定期同步（24h） | 实时一致 |
| 删除同步失败 | 黑名单后备 | N/A |

## 设计决策

### 1. 为什么选择混合同步？

**问题**：
- 纯增量同步：无法检测删除
- 纯全量同步：性能差，频繁网络请求

**解决方案**：混合同步
- **增量同步**：日常使用，快速获取新卡片（< 1s）
- **全量同步**：定期维护，检测双向删除（每24小时）

**优势**：
- ✅ 性能好：日常使用无感知
- ✅ 数据一致：定期检测删除
- ✅ 黑名单清理：不会无限增长

### 2. 为什么使用黑名单？

**问题**：删除 Riff 卡片可能失败（网络错误、权限问题）

**解决方案**：黑名单作为后备
- 删除成功：完成双向删除
- 删除失败：加入黑名单，防止重新出现
- 全量同步：自动清理黑名单

**优势**：
- ✅ 容错性好：删除失败不影响用户体验
- ✅ 自动清理：黑名单不会无限增长
- ✅ 数据一致：最终一致性保证

### 3. 为什么架构简化（LocalStorageDataSource vs RiffDataSource）？

**旧架构问题**：
- 高阶模式也使用 RiffDataSource
- 需要频繁网络请求
- 性能差，离线不可用

**新架构优势**：
- **高阶模式**：LocalStorageDataSource（直接读本地）
  - 性能极快（< 10ms）
  - 完全离线可用
  - 数据由混合同步维护
- **简单模式**：RiffDataSource（实时获取）
  - 开箱即用
  - 无需配置

### 4. 性能优化考虑

#### 批量操作
```typescript
// ❌ 不好：逐个操作
for (const card of cards) {
  await setBlockAttrs(card.id, attrs);
}

// ✅ 好：批量操作
const BATCH_SIZE = 50;
for (let i = 0; i < cards.length; i += BATCH_SIZE) {
  const batch = cards.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(card => setBlockAttrs(card.id, attrs)));
}
```

#### 异步执行
```typescript
// ✅ 同步不阻塞 UI
async function openBrowser() {
  // 立即显示 UI
  this.show();
  
  // 后台同步
  this.hybridSyncService?.incrementalSync().catch(err => {
    console.error('Sync failed:', err);
  });
  
  // 加载卡片
  await this.loadCards();
}
```

#### 缓存优化
```typescript
// ✅ 使用 Set 进行快速查找
const blacklist = new Set(storage.getRiffBlacklist());
const filtered = cards.filter(c => !blacklist.has(c.id)); // O(1) 查找
```

## 扩展指南

### 添加新的同步触发时机

1. 在配置中添加新的触发器：
```typescript
interface HybridSyncConfig {
  incrementalSync: {
    triggers: Array<'plugin-start' | 'browser-open' | 'review-open' | 'custom-trigger'>;
  };
}
```

2. 在触发点调用同步：
```typescript
if (config.incrementalSync.triggers.includes('custom-trigger')) {
  await hybridSyncService.incrementalSync();
}
```

### 自定义同步间隔

修改配置：
```typescript
const config: HybridSyncConfig = {
  fullSync: {
    enabled: true,
    interval: 43200000, // 12小时
    cleanupBlacklist: true
  }
};
```

### 添加同步监听器

```typescript
class HybridSyncService {
  private listeners: Array<(result: SyncResult) => void> = [];
  
  onSyncComplete(listener: (result: SyncResult) => void) {
    this.listeners.push(listener);
  }
  
  private notifyListeners(result: SyncResult) {
    this.listeners.forEach(listener => listener(result));
  }
}

// 使用
hybridSyncService.onSyncComplete(result => {
  console.log('Sync completed:', result);
  updateUI(result);
});
```

### 自定义数据源

实现 `IDataSource` 接口：
```typescript
class CustomDataSource implements IDataSource<QueueItem> {
  async getAll(): Promise<QueueItem[]> {
    // 自定义实现
  }
  
  async add(items: QueueItem[]): Promise<Result<number>> {
    // 自定义实现
  }
  
  async remove(items: QueueItem[]): Promise<Result<number>> {
    // 自定义实现
  }
}
```

## 故障排除

### 同步失败

**症状**：增量同步或全量同步失败

**可能原因**：
1. 网络连接问题
2. Riff API 错误
3. 权限问题

**解决方案**：
1. 检查网络连接
2. 查看控制台错误日志
3. 手动重试同步
4. 如果持续失败，切换到简单模式

### 删除同步失败

**症状**：删除卡片后，下次同步又出现

**可能原因**：
1. Riff 删除 API 失败
2. 黑名单未生效

**解决方案**：
1. 检查黑名单配置是否启用
2. 手动触发全量同步
3. 查看黑名单内容：`storage.getRiffBlacklist()`

### 黑名单无限增长

**症状**：黑名单越来越大

**可能原因**：
1. 全量同步未启用
2. 黑名单清理未启用

**解决方案**：
1. 启用全量同步
2. 启用黑名单清理
3. 手动触发全量同步

### 性能问题

**症状**：同步很慢

**可能原因**：
1. 卡片数量太多
2. 网络速度慢
3. 批量操作未优化

**解决方案**：
1. 增加全量同步间隔
2. 优化批量操作大小
3. 使用增量同步代替全量同步

## 参考资料

- [需求文档](../../../.kiro/specs/riff-bidirectional-sync/requirements.md)
- [设计文档](../../../.kiro/specs/riff-bidirectional-sync/design.md)
- [HybridSyncService 实现](../../src/services/HybridSyncService.ts)
- [LocalStorageDataSource 实现](../../src/core/data-source/LocalStorageDataSource.ts)
- [RiffDataSource 实现](../../src/core/data-source/RiffDataSource.ts)
