# FSRS 插件架构文档

> 本文档用于 AI 交接，描述项目的核心架构、模块职责和关键约束。

## 1. 项目概述

**siyuan-plugin-fsrs** 是思源笔记的间隔重复学习插件，实现了：
- FSRS v5/v6 算法调度
- Topic/Item 双轨制（渐进阅读 + 传统闪卡）
- 多种复习模式（提取练习、刻意练习、神经漫游、困难攻坚）
- 卡片浏览器（AG-Grid）
- 与思源原生闪卡系统的双向同步

## 2. 目录结构

```
src/
├── core/                    # 核心业务逻辑（与 UI 解耦）
│   ├── scheduler/           # 调度器（FSRS、SM-15、Topic）
│   ├── queue/               # 队列系统（策略、数据源、排序）
│   │   ├── strategies/      # 各类队列实现
│   │   ├── neural/          # 神经漫游引擎
│   │   └── datasource/      # 队列数据源
│   ├── storage/             # 持久化存储
│   ├── siyuan/              # 思源 API 封装
│   └── xiuyuan/             # Xiuyuan 抽象层（用户状态）
│
├── services/                # 服务层（协调 core 和 UI）
│   ├── ReviewDialogManager.ts   # 复习对话框管理
│   ├── CardService.ts           # 卡片操作服务
│   ├── MenuService.ts           # 菜单服务
│   └── ...
│
├── ui/                      # UI 层
│   ├── browser/             # 卡片浏览器
│   │   ├── SRSBrowser.vue       # 主组件 (1230行)
│   │   ├── BrowserPreview.vue   # 预览面板组件
│   │   ├── BrowserToolbar.vue   # 工具栏组件
│   │   ├── SRSBrowser.scss      # 样式
│   │   ├── composables/         # Vue composables
│   │   │   ├── useSorting.ts        # 排序逻辑
│   │   │   └── useCardActions.ts    # 卡片操作
│   │   ├── datasource/          # 浏览器数据源适配
│   │   └── utils/               # 工具函数
│   ├── review/v2/           # 复习界面 2.0
│   │   ├── ReviewView.vue       # 主复习视图
│   │   ├── adapters/            # 复习模式适配器
│   │   └── providers/           # 队列提供者
│   └── settings/            # 设置面板
│
├── index.ts                 # 插件入口 (1044行)
└── commands.ts              # 命令注册
```

## 3. 核心模块

### 3.1 调度器 (core/scheduler/)

| 文件 | 职责 |
|------|------|
| `SchedulerRouter.ts` | 调度器路由，根据卡片类型分发到对应调度器 |
| `FSRSV5.ts` | FSRS v5 算法实现（Item 卡片） |
| `TopicScheduler.ts` | Topic 调度器（渐进阅读） |
| `SM15Scheduler.ts` | SM-15 算法实现（A-Factor） |

**关键约束**：
- 调度器是无状态的，只接收卡片快照，返回调度结果
- Item 使用 FSRS，Topic 使用 A-Factor/SM-15

### 3.2 队列系统 (core/queue/)

**队列策略 (strategies/)**:
| 队列 | 用途 |
|------|------|
| `RetrievalPracticeQueue` | 提取练习（主队列） |
| `FinalDrillQueue` | 刻意练习（困难卡片强化） |
| `NeuralRoamQueue` | 神经漫游（随机游走） |
| `FilterGroupQueue` | 筛选复习 |
| `LeechQueue` | 难点攻坚 |
| `IncrementalLearningQueue` | 渐进学习 |

**神经漫游引擎 (neural/)**:
- `NeuralQueue.ts` - 神经队列核心
- `WeightedWalkEngine.ts` - 加权随机游走
- `QueryEngine.ts` - 查询引擎

### 3.3 服务层 (services/)

从 `index.ts` 重构抽取的服务：
| 服务 | 职责 |
|------|------|
| `ReviewDialogManager` | 管理复习对话框的创建/销毁 |
| `CardService` | 卡片 CRUD 操作 |
| `MenuService` | 菜单注册和处理 |
| `BlockMenuHandler` | 块菜单处理 |

### 3.4 UI 层

**卡片浏览器 (ui/browser/)**:
- 基于 AG-Grid v35+
- 支持四重筛选（队列 + 文档 + 预设 + 搜索）
- Composables 模式组织逻辑

**复习界面 (ui/review/v2/)**:
- Provider 模式提供队列
- Adapter 模式适配不同复习模式
- Session 管理复习会话状态

## 4. 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        思源笔记                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Riff 原生闪卡数据库                      │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              ↕ 双向同步
┌─────────────────────────────────────────────────────────────┐
│                     core/siyuan/                            │
│              思源 API 封装 & 数据同步层                       │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                     core/storage/                           │
│                    FSRS 数据存储层                           │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│              core/scheduler/  ←→  core/queue/               │
│                调度器           队列系统                      │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                       services/                             │
│                  服务层（协调器）                             │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                          ui/                                │
│             Vue 组件（浏览器、复习、设置）                     │
└─────────────────────────────────────────────────────────────┘
```

## 5. 关键设计约束

### 5.1 架构契约

1. **数据源唯一性**：思源双向同步层是唯一数据出口，UI 层禁止直接读写思源数据库
2. **不可变状态通信**：队列引擎与调度器通过 immutable 卡片状态对象通信，禁止共享可变状态
3. **快照驱动**：所有复习模式基于同一张卡片状态快照驱动

### 5.2 Vue 组件规范

1. **禁止重复声明**：`<script setup>` 中禁止重复声明同名函数/变量
2. **Composables 模式**：复杂逻辑抽取到 `composables/` 目录
3. **样式分离**：大组件样式抽取到独立 `.scss` 文件

### 5.3 命名约定

- 队列策略：`XxxQueue.ts` / `XxxQueueV2.ts`
- 数据源：`XxxDataSource.ts`
- 适配器：`XxxAdapter.ts`
- 提供者：`XxxProvider.ts`

### 5.4 架构模式

#### 5.4.1 观察者模式 (Observer Pattern)

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

#### 5.4.2 Result 类型模式

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

#### 5.4.3 Branded Types（品牌类型）

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

#### 5.4.4 操作日志系统

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

## 6. 重构状态

### 已完成的重构

| 原文件 | 原行数 | 现行数 | 减少 |
|--------|--------|--------|------|
| index.ts | 1735 | 1044 | -40% |
| SRSBrowser.vue | 2172 | 1230 | -43% |

### 抽取的模块

**从 index.ts 抽取**:
- `services/ReviewDialogManager.ts`
- `services/CardService.ts`
- `services/MenuService.ts`

**从 SRSBrowser.vue 抽取**:
- `BrowserPreview.vue` (212行)
- `BrowserToolbar.vue` (152行)
- `SRSBrowser.scss` (331行)
- `composables/useSorting.ts` (237行)
- `composables/useCardActions.ts` (169行)

## 7. 开发指南

### 7.1 构建命令

```bash
npm run dev      # 开发模式（热重载）
npm run build    # 生产构建
```

### 7.2 关键依赖

- **Vue 3** + Composition API
- **AG-Grid v35+** (社区版)
- **TypeScript 5.x**
- **Vite** 构建工具

### 7.3 测试

```bash
npm run test     # 运行单元测试
```

测试文件位于 `__tests__/` 目录。

## 8. 常见问题

### Q1: 为什么使用观察者模式而不是手动 reset()？
A: 观察者模式实现了自动缓存失效，消除了手动调用 reset() 的需要。当数据源修改数据时，所有注册的 Sequencer 会自动收到通知并失效缓存，避免了缓存不一致的问题。参考 `docs/adr/ADR-002-observer-pattern.md`。

### Q2: Topic 和 Item 的区别？
A: Topic 是纯阅读材料（使用 A-Factor 算法），Item 是问答卡片（使用 FSRS 算法）。

### Q3: 神经漫游是什么？
A: 基于知识图谱的随机游走复习模式，模拟大脑联想记忆。

### Q4: 为什么使用 Result 类型而不是抛出异常？
A: Result 类型提供了类型安全的错误处理，强制调用者显式处理成功和失败情况，避免了静默失败。这种模式在 Rust 等语言中被广泛采用，提供了更好的错误处理体验。

### Q5: Branded Types 有什么用？
A: Branded Types 在编译时防止不同类型的 ID 混淆（如 BlockID 和 CardID），提供零运行时开销的类型安全。这避免了将错误的 ID 类型传递给函数的常见错误。

### Q6: 如何查看队列操作历史？
A: 使用 `LoggableQueue` 装饰器包装队列，然后调用 `getOperationLog()` 方法获取操作历史。日志包含操作类型、时间戳、耗时和详细信息，用于调试和性能分析。

---

*文档更新时间: 2026-02-01*
*最后编辑: AI 架构优化会话*
