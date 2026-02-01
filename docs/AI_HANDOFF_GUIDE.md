# FSRS 插件 AI 交接指南

> **目标读者**: 接手项目的 AI 助手  
> **用途**: 快速理解代码库、定位功能实现、开始工作  
> **最后更新**: 2026-02-02

---

## 🎯 核心理念

这是一个**思源笔记的间隔重复学习插件**，实现了：
- **多算法调度**：FSRS v5、SM-2、SM-15、A-Factor
- **双轨制卡片**：Item（问答卡片）+ Topic（渐进阅读）
- **多种复习模式**：提取练习、刻意练习、神经漫游、困难攻坚
- **强大的卡片浏览器**：基于 AG-Grid，支持四重筛选
- **与思源原生闪卡双向同步**：Riff API 集成

---

## 📂 项目结构速查

```
siyuan-plugin-fsrs/
├── src/
│   ├── index.ts                    # 🔑 插件入口（1044 行）
│   ├── core/                       # 核心业务逻辑
│   │   ├── scheduler/              # 调度器（算法实现）
│   │   │   ├── SchedulerRouter.ts  # 调度器路由
│   │   │   └── strategies/         # 各种算法
│   │   │       ├── FSRSV5.ts       # FSRS v5 算法
│   │   │       ├── SM2.ts          # SM-2 算法
│   │   │       ├── SM15Scheduler.ts # SM-15 适配器
│   │   │       └── sm15/           # SM-15 核心算法
│   │   ├── queue/                  # 队列系统
│   │   │   ├── strategies/         # 队列策略
│   │   │   │   ├── RetrievalPracticeQueue.ts    # 提取练习队列
│   │   │   │   ├── FinalDrillQueue.ts           # 刻意练习队列
│   │   │   │   └── NeuralRoamQueue.ts           # 神经漫游队列
│   │   │   ├── datasource/         # 数据源
│   │   │   └── sequencers/         # 排序器
│   │   ├── storage/                # 持久化存储
│   │   │   └── manager.ts          # 存储管理器
│   │   ├── siyuan/                 # 思源 API 封装
│   │   │   ├── api.ts              # 核心 API
│   │   │   ├── riff.ts             # Riff API
│   │   │   └── block.ts            # 块操作
│   │   ├── box/                    # 卡片管理
│   │   │   └── TransactionObserver.ts  # 自动制卡监听器
│   │   └── card-builder/           # 卡片构建
│   │       └── detectCardType.ts   # 类型检测算法
│   ├── services/                   # 服务层
│   │   ├── ReviewDialogManager.ts  # 复习对话框管理
│   │   ├── CardService.ts          # 卡片操作服务
│   │   └── MenuService.ts          # 菜单服务
│   ├── ui/                         # UI 层
│   │   ├── browser/                # 卡片浏览器
│   │   │   ├── SRSBrowser.vue      # 主组件（1230 行）
│   │   │   ├── BrowserPreview.vue  # 预览面板
│   │   │   └── composables/        # Vue composables
│   │   ├── review/v2/              # 复习界面 2.0
│   │   │   ├── ReviewView.vue      # 主复习视图
│   │   │   ├── adapters/           # 复习模式适配器
│   │   │   └── providers/          # 队列提供者
│   │   └── settings/               # 设置面板
│   └── types/                      # TypeScript 类型定义
│       ├── card.ts                 # FSRSCard 类型
│       ├── scheduler.ts            # 调度器类型
│       └── settings.ts             # 设置类型
├── docs/                           # 📖 文档目录
│   ├── AI_HANDOFF_GUIDE.md         # 本文档
│   ├── TASK_14_SUMMARY.md          # 最近完成的任务
│   └── ...                         # 其他文档
└── .kiro/specs/                    # 📋 规范文档
    ├── README.md                   # 规范索引
    ├── ARCHITECTURE_OVERVIEW.md    # 架构总览
    ├── CODE_ARCHITECTURE.md        # 代码架构详解
    └── ...                         # 各种规范
```

---

## 🔍 快速定位功能实现

### 1. 调度器相关（决定下次复习时间）

**问题**：如何修改/添加调度算法？

**位置**：`src/core/scheduler/strategies/`

**关键文件**：
- `FSRSV5.ts` - FSRS v5 算法（默认）
- `SM2.ts` - SM-2 经典算法
- `SM15Scheduler.ts` - SM-15 适配器
- `sm15/SM15.ts` - SM-15 核心算法

**接口**：
```typescript
interface SchedulerEngineAdapter {
  preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard>
  review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard
  getRetrievability(card: FSRSCard, now?: Date): number
  updateParams(params: FSRSParameters): void
}
```

**如何添加新算法**：
1. 创建新类实现 `SchedulerEngineAdapter` 接口
2. 在 `SchedulerRouter.ts` 中注册
3. 在 `settings.ts` 中添加配置选项

---

### 2. 队列相关（管理复习顺序）

**问题**：如何修改/添加队列策略？

**位置**：`src/core/queue/strategies/`

**关键文件**：
- `RetrievalPracticeQueue.ts` - 提取练习队列（主队列）
- `FinalDrillQueue.ts` - 刻意练习队列（困难卡片强化）
- `NeuralRoamQueue.ts` - 神经漫游队列（随机游走）

**接口**：
```typescript
interface IQueueStrategy<TItem> {
  next(): Promise<TItem | null>
  onFeedback(item: TItem | null, feedback: QueueFeedback): Promise<void>
  getStats(): Promise<QueueStats>
  getUIConfig(currentItem: TItem | null): QueueUIConfig
}
```

**队列模式**：SuperMemo Outstanding 模式
- 包含所有待复习卡片
- 只返回到期的卡片
- 评分后保留在队列中
- 由 `due` 时间自动过滤

---

### 3. 存储相关（数据持久化）

**问题**：如何读写卡片数据？

**位置**：`src/core/storage/manager.ts`

**存储文件**：
```
data/storage/siyuan-plugin-fsrs/
├── cards.json                      # 卡片数据
├── settings.json                   # 插件设置
├── practice-queue.json             # 练习队列
├── practice-queue-backup.json      # 队列备份
└── logs/                           # 复习日志
```

**核心方法**：
```typescript
class StorageManager {
  getCard(cardId: string): FSRSCard | undefined
  setCard(card: FSRSCard): void
  getAllCards(): FSRSCard[]
  getDueCards(now?: Date): FSRSCard[]
  getSettings(): PluginSettings
  updateSettings(settings: Partial<PluginSettings>): Promise<void>
}
```

**缓存策略**：
- 内存缓存：`Map<string, FSRSCard>`
- 脏标记：`isDirty` 标记，批量保存
- 自动备份：每 10 次保存备份一次

---

### 4. UI 相关（用户界面）

**问题**：如何修改复习界面或卡片浏览器？

**复习界面**：`src/ui/review/v2/ReviewView.vue`
- 使用 Vue 3 Composition API
- 核心 Hook：`useReviewSession.ts`
- 适配器模式：不同队列有不同的 UI 表现

**卡片浏览器**：`src/ui/browser/SRSBrowser.vue`
- 基于 AG-Grid Community
- 四重筛选：队列 + 文档 + 预设 + 搜索
- Composables 模式：`useSorting.ts`、`useCardActions.ts`

**UI 状态结构**：
```typescript
interface ReviewUIState {
  header: { title, stats, breadcrumbs }
  content: { blockId, html, loading }
  actions: { grades, menu, toolbar }
  meta: { canReveal, canSkip, isEmpty }
}
```

---

### 5. 思源 API 相关（与思源交互）

**问题**：如何调用思源 API？

**位置**：`src/core/siyuan/`

**核心 API**：`api.ts`
```typescript
// 块操作
async function getBlock(blockId: string): Promise<Block>
async function getBlockAttrs(blockId: string): Promise<Record<string, string>>
async function setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>

// SQL 查询
async function sql(query: string): Promise<any[]>

// 文件操作
async function getFile(path: string): Promise<string | null>
async function putFile(path: string, content: string): Promise<void>
```

**Riff API**：`riff.ts`
```typescript
// Riff 卡片操作
async function getRiffDueCards(deckId: string): Promise<RiffDueCardsResponse>
async function reviewRiffCard(deckId: string, cardId: string, rating: number): Promise<void>
async function getRiffCardsByBlockIDs(blockIds: string[]): Promise<any[]>
```

**块属性常量**：`block.ts`
```typescript
export const ATTR_CARD_ID = 'custom-fsrs-card-id'
export const ATTR_PRIORITY = 'custom-fsrs-priority'
export const ATTR_CARD_TYPE = 'custom-fsrs-card-type'
export const ATTR_SCHEDULER = 'custom-fsrs-scheduler'
```

---

### 6. 自动制卡相关（实时监听）

**问题**：如何实现自动识别新卡片？

**位置**：`src/core/box/TransactionObserver.ts`

**工作原理**：
1. 监听 WebSocket 事件（`ws-main`）
2. 捕获块的 `insert` 和 `update` 操作
3. 防抖处理（2 秒）
4. 批量检测卡片类型
5. 自动同步到 Riff 和本地存储

**类型检测**：`src/core/card-builder/detectCardType.ts`
- **Item 判断**：包含标记语法 `==...==`、分隔符 `::`、标题块、列表项有子级、超级块有子级
- **Topic 判断**：不符合以上任何 Item 条件的块

**初始化**：在 `src/index.ts` 的 `onload()` 方法中
```typescript
this.transactionObserver = new TransactionObserver(this);
this.transactionObserver.init();
this.transactionObserver.setEnabled(settings.incremental?.autoCardEnabled || false);
```

---

## 🔄 核心数据流

### 复习流程

```
用户点击"开始复习"
  ↓
FSRSPlugin.openReviewDialog()
  ↓
创建 RetrievalPracticeQueue
  ├─> 加载 Riff 卡片 (getRiffDueCards)
  └─> 加载本地队列 (storage.getQueueData)
  ↓
创建 ReviewView (Vue 组件)
  ├─> useReviewSession(queue, adapter)
  └─> 调用 queue.next() 获取第一张卡片
  ↓
显示卡片内容 (getBlock API)
  ↓
用户评分 (1-4)
  ↓
queue.onFeedback({ action: 'rate', rating })
  ├─> 本地卡片: sortingStrategy.review() → 更新 nextDues
  └─> Riff 卡片: reviewRiffCard() → 同步到 Riff
  ↓
queue.next() 获取下一张卡片
  ↓
重复...
```

### 自动制卡流程

```
用户创建/编辑块
  ↓
WebSocket 事件 (ws-main)
  ↓
TransactionObserver.handleTransaction()
  ↓
queueBlockCheck() - 添加到待处理队列
  ↓
防抖 2 秒
  ↓
processQueue() - 批量处理
  ↓
checkAndCreateCard() - 逐个检测
  ↓
1. 获取块内容 (getBlockKramdown)
2. 匹配策略 (CardBuilderContext.matchStrategy)
3. 检查现有状态 (Riff DB, Riff Attr, FSRS Attr)
4. 同步卡片 (addRiffCards, markBlockAsCard)
5. 检测类型 (detectCardType)
6. 初始化 A-Factor (Topic 卡片)
7. 保存到存储 (storage.setCard)
```

---

## 🎨 设计模式

### 1. 策略模式（调度器）

不同的调度算法实现相同的接口：
- `SimpleFSRSScheduler` - FSRS v5
- `SM2Scheduler` - SM-2
- `SM15Scheduler` - SM-15
- `TopicScheduler` - A-Factor

### 2. 适配器模式（UI 适配器）

不同的队列有不同的 UI 表现：
- `RetrievalPracticeAdapter` - 提取练习
- `NeuralRoamAdapter` - 神经漫游
- `FinalDrillAdapter` - 刻意练习

### 3. 组合模式（队列 V2）

组合多个数据源：
- `LocalDataSource` - 本地存储
- `RiffDataSource` - Riff API
- `HybridDataSource` - 混合数据源

### 4. 单例模式（插件实例）

全局唯一的插件实例：
```typescript
FSRSPlugin.getInstance()
```

### 5. 观察者模式（缓存失效）🆕

**用途**：自动同步数据源和缓存状态，消除手动 reset() 调用。

**实现**：
```typescript
// 数据源实现 IObservableDataSource
class RiffDataSource extends ObservableDataSource<ReviewCard> {
  async remove(items: ReviewCard[]): Promise<Result<number>> {
    const result = await this.doRemove(items);
    if (result.ok) {
      this.notifyObservers(); // 自动通知观察者
    }
    return result;
  }
}

// Sequencer 实现 IDataSourceObserver
class PrioritySequencer implements IDataSourceObserver {
  onDataChanged(): void {
    this.loaded = false; // 自动失效缓存
    this.items.length = 0;
  }
}
```

**优势**：
- 消除手动缓存管理
- 数据变化自动传播
- 降低耦合度

**参考**：`docs/adr/ADR-002-observer-pattern.md`

### 6. Result 类型模式（错误处理）🆕

**用途**：统一错误处理，强制调用者显式处理成功和失败情况。

**定义**：
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };
```

**使用示例**：
```typescript
// 返回 Result
async function removeCards(items: ReviewCard[]): Promise<Result<number>> {
  try {
    const count = await dataSource.remove(items);
    return { ok: true, value: count };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}

// 调用方必须处理两种情况
const result = await removeCards(selectedCards);
if (result.ok) {
  showNotice(`成功删除 ${result.value} 张卡片`);
} else {
  showNotice(`删除失败: ${result.error.message}`);
  errorReporter.report(result.error);
}
```

**优势**：
- 消除静默失败
- 类型安全的错误处理
- 强制错误处理

### 7. Branded Types（品牌类型）🆕

**用途**：防止不同类型的 ID 混淆，提供编译时类型安全。

**定义**：
```typescript
type BlockID = string & { readonly __brand: 'BlockID' };
type CardID = string & { readonly __brand: 'CardID' };
type XiuyuanID = string & { readonly __brand: 'XiuyuanID' };

// 工厂函数
function createBlockID(id: string): BlockID {
  return id as BlockID;
}
```

**使用示例**：
```typescript
interface ReviewCard {
  blockID: BlockID;  // 不能传入 CardID
  cardID: CardID;    // 不能传入 BlockID
}

// 编译时错误检查
const blockId = createBlockID('123');
const cardId = createCardID('456');

function processCard(blockID: BlockID) { /* ... */ }

processCard(blockId);  // ✅ 正确
processCard(cardId);   // ❌ 编译错误
```

**优势**：
- 编译时类型检查
- 防止参数传递错误
- 零运行时开销

### 8. 操作日志系统（调试支持）🆕

**用途**：记录队列操作历史，用于调试和性能分析。

**实现**：
```typescript
interface QueueOperation {
  type: 'next' | 'insert' | 'remove' | 'rotate' | 'reset';
  timestamp: number;
  duration?: number;
  details: Record<string, any>;
}

class LoggableQueue<TItem> implements ILoggableQueue<TItem> {
  private operationLog: QueueOperation[] = [];
  private readonly MAX_LOG_SIZE = 1000;

  async next(): Promise<TItem | null> {
    const start = performance.now();
    const result = await this.wrappedQueue.next();
    
    this.logOperation({
      type: 'next',
      timestamp: Date.now(),
      duration: performance.now() - start,
      details: { hasResult: result !== null }
    });
    
    return result;
  }

  getOperationLog(limit?: number): QueueOperation[] {
    return this.operationLog.slice(-(limit || 100));
  }
}
```

**优势**：
- 调试复杂队列行为
- 性能分析
- 用户行为追踪

---

## 📋 常见任务速查

### 任务 1：修改调度算法参数

**文件**：`src/types/settings.ts`

```typescript
export interface FSRSParameters {
  w: number[]           // FSRS 权重
  requestRetention: number  // 目标记忆率
  maximumInterval: number   // 最大间隔
  // ...
}
```

**修改后**：重启插件生效

---

### 任务 2：添加新的菜单项

**文件**：`src/index.ts` - `handleBlockIconClick()` 方法

```typescript
menu.addItem({
  icon: 'iconMyIcon',
  label: this.i18n?.myLabel || '我的功能',
  click: async () => {
    // 菜单逻辑
  }
})
```

---

### 任务 3：修改卡片数据结构

**文件**：`src/types/card.ts`

```typescript
export interface FSRSCard {
  // 添加新字段
  myNewField?: string
}
```

**注意**：需要同时修改：
1. 类型定义（`card.ts`）
2. 存储逻辑（`storage/manager.ts`）
3. UI 显示（`ui/browser/SRSBrowser.vue`）

---

### 任务 4：添加新的块属性

**文件**：`src/core/siyuan/block.ts`

```typescript
export const ATTR_MY_FIELD = 'custom-fsrs-my-field'

// 使用
await setBlockAttrs(blockId, {
  [ATTR_MY_FIELD]: 'my-value'
})
```

---

### 任务 5：修改复习界面 UI

**文件**：`src/ui/review/v2/ReviewView.vue`

**核心 Hook**：`useReviewSession.ts`

```typescript
const { state, context, reveal, grade, skip } = useReviewSession(queue, adapter)
```

**UI 状态**：通过 `adapter.toUIState()` 生成

---

### 任务 6：修改卡片浏览器

**文件**：`src/ui/browser/SRSBrowser.vue`

**AG-Grid 配置**：
```typescript
const columnDefs = [
  { field: 'blockId', headerName: '块 ID' },
  { field: 'due', headerName: '到期时间' },
  { field: 'priority', headerName: '优先级', editable: true },
  // ...
]
```

**筛选逻辑**：`composables/useSorting.ts`

---

## 🐛 调试技巧

### 1. 快速禁用所有日志

**最快方法**（在浏览器控制台执行）：
```javascript
window.FSRS_DISABLE_LOGS = true;
```

然后刷新思源笔记（`Ctrl+R` 或 `Cmd+R`）。

**详细说明**：参见 [QUICK_DISABLE_LOGS.md](./QUICK_DISABLE_LOGS.md)

### 2. 查看控制台日志

所有日志都以 `[FSRS]` 开头：
```typescript
console.log('[FSRS] My debug message:', data)
console.error('[FSRS] Error:', error)
console.warn('[FSRS] Warning:', warning)
```

**过滤日志**：
- 只看 FSRS 日志：输入 `[FSRS]`
- 只看特定模块：输入 `[FSRS] [ReviewView]`
- 只看错误：点击"Errors"按钮

### 3. 查看存储数据

**Windows**：`%APPDATA%\SiYuan\data\storage\siyuan-plugin-fsrs\`
**macOS**：`~/Library/Application Support/SiYuan/data/storage/siyuan-plugin-fsrs/`
**Linux**：`~/.config/SiYuan/data/storage/siyuan-plugin-fsrs/`

### 3. 使用 Vue DevTools

安装 Vue DevTools 浏览器扩展，查看组件树和状态

### 4. 查看网络请求

打开 Chrome DevTools 的 Network 面板，查看 Riff API 请求

### 5. 使用日志系统

**新的日志系统**（推荐）：
```typescript
import { logger } from '@/utils/logger';
logger.log('My message', data);
logger.warn('Warning', data);
logger.error('Error', error);
```

**详细说明**：参见 [LOGGING_GUIDE.md](./LOGGING_GUIDE.md)

---

## 📚 重要文档

### 架构文档
- **[架构总览](../.kiro/specs/ARCHITECTURE_OVERVIEW.md)** - 5 分钟快速参考
- **[代码架构详解](../.kiro/specs/CODE_ARCHITECTURE.md)** - 完整的代码库架构
- **[FSRS 架构分析](../.kiro/specs/fsrs-architecture-analysis/architecture-and-dataflow.md)** - 详细的架构和数据流
- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - 核心架构文档（包含新架构模式）🆕

### 规范文档
- **[规范索引](../.kiro/specs/README.md)** - 所有规范的索引
- **[调度器路由架构](../.kiro/specs/scheduler-router-architecture/design.md)** - 多调度器支持
- **[SM-15 集成](../.kiro/specs/sm15-integration/migration-plan.md)** - SM-15 算法集成
- **[队列强化](../.kiro/specs/queue-enhancement/design.md)** - 队列性能优化
- **[架构优化](../.kiro/specs/architecture-optimization/)** - 架构优化规范 🆕
- **[TODO 清理](../.kiro/specs/todo-cleanup/tasks.md)** - 待实施功能清单

### ADR 文档（架构决策记录）🆕
- **[ADR-001: Trait 模式](./adr/ADR-001-trait-pattern.md)** - Trait 模式设计决策
- **[ADR-002: 观察者模式](./adr/ADR-002-observer-pattern.md)** - 观察者模式设计决策
- **[ADR-003: 抽象层评估](./adr/ADR-003-abstraction-layers.md)** - 抽象层设计决策
- **[ADR-004: Xiuyuan 卡片来源](./adr/ADR-004-xiuyuan-card-source.md)** - Xiuyuan 设计决策

### 任务文档
- **[Task 14 总结](./TASK_14_SUMMARY.md)** - 自动制卡功能修复
- **[类型检测触发方式](./TOPIC_ITEM_DETECTION_TRIGGERS.md)** - 卡片类型检测说明
- **[日志清理总结](./LOG_CLEANUP_SUMMARY.md)** - 日志系统说明
- **[架构优化总结](./architecture-optimization-summary.md)** - 架构优化完整报告 🆕
- **[Phase 3 验收报告](./phase-3-checkpoint-report.md)** - Phase 3 验收详情 🆕
- **[代码重复分析](./code-duplication-analysis.md)** - 代码重复率分析 🆕

---

## 🎯 当前状态

### 已完成的功能

✅ **核心功能**：
- FSRS v5、SM-2、SM-15 调度器
- 提取练习、刻意练习、神经漫游队列
- 卡片浏览器（AG-Grid）
- 与 Riff 双向同步
- 自动制卡（TransactionObserver）
- 卡片类型检测（Item/Topic）

✅ **架构优化**（2026-02-02）🆕：
- **观察者模式**：自动缓存失效，消除手动 reset()
- **Result 类型**：统一错误处理，强制显式处理
- **Branded Types**：编译时 ID 类型检查
- **操作日志系统**：队列操作追踪和调试
- **性能优化**：批量查询性能提升 98.8%
- **测试覆盖**：642/643 测试通过（99.8%）
- **代码质量**：代码重复率 < 5%，消除所有 `any` 类型
- **文档完善**：JSDoc 覆盖率 100%，4 个 ADR 文档

✅ **最近完成**：
- 架构优化规范全部任务（2026-02-02）
- Task 14：修复自动制卡功能（2026-01-30）
- TransactionObserver 正确初始化
- 卡片类型自动检测

### 待实施的功能

📝 **P0（必须实现）**：
- 队列持久化机制优化
- Riff 调度器适配器完善
- 队列清空功能
- 修复 RetrievalPracticeProvider 卡片轮换 bug 🆕

📝 **P1（应该实现）**：
- 渐进学习提供者
- SM-15 回归分析
- 复习日志查询

📝 **P2（可以实现）**：
- 改进的 Topic 调度器
- 动态 A-Factor 更新

**详细清单**：参见 `.kiro/specs/todo-cleanup/tasks.md`

### 性能指标 🆕

**批量操作性能**：
- 600 个 ID 批量查询：8906ms → 107ms（提升 **98.8%**）
- 配置：batchSize=200, maxConcurrency=3

**队列性能**：
- 1000 张卡片处理：< 1 秒 ✅
- 1000 次插入操作：< 2 秒 ✅
- 操作日志自动限制：1000 条以内 ✅

**测试覆盖**：
- 单元测试：642/643 通过（99.8%）
- 属性测试：16 个（使用 fast-check）
- 性能测试：15 个
- 边界条件测试：22 个

---

## 🚀 快速开始

### 1. 环境搭建

```bash
# 克隆仓库
cd siyuan-plugin-fsrs

# 安装依赖
pnpm install

# 开发模式（热重载）
pnpm dev

# 构建生产版本
pnpm build
```

### 2. 理解架构

1. 阅读本文档（AI_HANDOFF_GUIDE.md）
2. 查看 `ARCHITECTURE_OVERVIEW.md` 了解整体架构
3. 查看 `CODE_ARCHITECTURE.md` 了解代码细节

### 3. 定位代码

使用"快速定位功能实现"部分快速找到相关文件

### 4. 开始工作

1. 选择要实施的功能（参考 `todo-cleanup/tasks.md`）
2. 阅读对应的设计文档
3. 定位相关代码文件
4. 开始实施

---

## 💡 关键约束

### 1. 数据源唯一性

思源双向同步层是唯一数据出口，UI 层禁止直接读写思源数据库

### 2. 不可变状态通信

队列引擎与调度器通过 immutable 卡片状态对象通信，禁止共享可变状态

### 3. 快照驱动

所有复习模式基于同一张卡片状态快照驱动

### 4. Vue 组件规范

- `<script setup>` 中禁止重复声明同名函数/变量
- 复杂逻辑抽取到 `composables/` 目录
- 大组件样式抽取到独立 `.scss` 文件

---

## 🔑 关键概念

### 卡片类型

- **Item**：普通闪卡（基于块），使用 FSRS 算法
- **Topic**：主题（增量阅读），使用 A-Factor 算法
- **Incremental**：增量内容
- **Webpage**：网页卡片

### 队列模式

**Outstanding 模式**（SuperMemo）：
- 包含所有待复习卡片
- 只返回到期的卡片
- 评分后保留在队列中
- 由 `due` 时间自动过滤

### 调度器选择

```typescript
// 默认规则
Item 卡片      → FSRS v5    // 通用算法
Topic 卡片     → SM-15       // 增量阅读
Incremental   → SM-15       // SuperMemo 风格
Webpage       → SM-15       // 渐进阅读

// 用户可以手动覆盖
card.schedulerType = 'sm15';
```

---

## 📞 需要帮助？

### 查看文档

1. 本文档（AI_HANDOFF_GUIDE.md）
2. 架构总览（ARCHITECTURE_OVERVIEW.md）
3. 代码架构详解（CODE_ARCHITECTURE.md）
4. 规范索引（.kiro/specs/README.md）

### 查看代码

1. 使用"快速定位功能实现"部分
2. 查看类图理解模块关系
3. 阅读数据流分析理解业务逻辑

### 查看任务

1. TODO 清理任务（.kiro/specs/todo-cleanup/tasks.md）
2. 最近完成的任务（docs/TASK_14_SUMMARY.md）

---

## ✅ 检查清单

在开始工作前，确保你已经：

- [ ] 阅读本文档（AI_HANDOFF_GUIDE.md）
- [ ] 理解三层架构（UI → 业务逻辑 → 数据）
- [ ] 知道如何定位功能实现
- [ ] 理解核心数据流（复习流程、自动制卡流程）
- [ ] 知道如何查看日志和调试
- [ ] 知道如何查找相关文档

---

**祝你工作顺利！如有疑问，随时查看文档或代码注释。** 🚀
