# FSRS 插件 API 参考文档

> **目标读者**: AI 助手、开发者  
> **用途**: 快速查找可用的 API 和方法，避免重复造轮子  
> **最后更新**: 2026-01-31

---

## 📋 目录

1. [核心 API](#核心-api)
2. [思源 API 封装](#思源-api-封装)
3. [调度器 API](#调度器-api)
4. [队列 API](#队列-api)
5. [存储 API](#存储-api)
6. [UI 工具](#ui-工具)
7. [工具函数](#工具函数)
8. [类型定义](#类型定义)

---

## 🔑 核心 API

### 插件实例

**文件**: `src/index.ts`

```typescript
class FSRSPlugin extends Plugin {
  // 核心模块
  storage: StorageManager;
  scheduler: SchedulerEngineAdapter;
  schedulerRouter: SchedulerRouter;
  
  // 队列
  retrievalQueue: RetrievalPracticeQueue;
  neuralQueue: NeuralRoamQueue;
  finalDrillQueue: FinalDrillQueue;
  leechQueue: LeechQueue;
  incrementalQueue: IncrementalLearningQueue;
  
  // 服务
  xiuyuanService: XiuyuanService;
  
  // 方法
  openReviewDialog(): void;
  openNeuralRoamDialog(options?: { seedBlockId?: string }): void;
  openSRSBrowser(): void;
}

// 获取插件实例
FSRSPlugin.getInstance(): FSRSPlugin | null;
```

**使用示例**:
```typescript
const plugin = FSRSPlugin.getInstance();
if (plugin) {
  plugin.openReviewDialog();
}
```

---

## 🔗 思源 API 封装

### 块操作

**文件**: `src/core/siyuan/block.ts`

```typescript
// 标记块为卡片
markBlockAsCard(blockId: string, cardId: string): Promise<void>;

// 取消标记
unmarkBlockAsCard(blockId: string): Promise<void>;

// 获取卡片块 ID 列表
getCardBlockIds(): Promise<string[]>;

// 块属性常量
const ATTR_CARD_ID = 'custom-fsrs-card-id';
const ATTR_PRIORITY = 'custom-fsrs-priority';
const ATTR_CARD_TYPE = 'custom-fsrs-card-type';
const ATTR_SCHEDULER = 'custom-fsrs-scheduler';
const DEFAULT_PRIORITY = 50;
```

**使用示例**:
```typescript
import { markBlockAsCard, ATTR_CARD_ID } from '@/core/siyuan/block';

await markBlockAsCard('block-id-123', 'card-id-456');
```

### 思源 API

**文件**: `src/core/siyuan/api.ts`

```typescript
// 块操作
getBlock(blockId: string): Promise<Block>;
getBlockAttrs(blockId: string): Promise<Record<string, string>>;
setBlockAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
updateBlock(blockId: string, markdown: string): Promise<void>;
getBlockKramdown(blockId: string): Promise<string>;

// SQL 查询
sql(query: string): Promise<any[]>;

// 文件操作
getFile(path: string): Promise<string | null>;
putFile(path: string, content: string): Promise<void>;

// 消息提示
pushMsg(msg: string, timeout?: number): void;
pushErrMsg(msg: string, timeout?: number): void;

// 插件数据路径
getPluginDataPath(pluginName: string): string;
```

**使用示例**:
```typescript
import { getBlock, sql, pushMsg } from '@/core/siyuan/api';

const block = await getBlock('block-id-123');
const cards = await sql('SELECT * FROM blocks WHERE type = "d"');
pushMsg('操作成功！');
```

### Riff API

**文件**: `src/core/siyuan/riff.ts`

```typescript
// 获取到期卡片
getRiffDueCards(deckId: string): Promise<RiffDueCardsResponse>;

// 复习卡片
reviewRiffCard(
  deckId: string, 
  cardId: string, 
  rating: number, 
  reviewedCards: any[]
): Promise<void>;

// 跳过卡片
skipReviewRiffCard(deckId: string, cardId: string): Promise<void>;

// 根据块 ID 获取卡片
getRiffCardsByBlockIDs(blockIds: string[]): Promise<any[]>;

// 批量设置到期时间
batchSetRiffCardsDueTime(dues: Array<{ id: string; due: string }>): Promise<void>;

// 内置卡包 ID
const BUILTIN_DECK_ID = '20230218211946-2kw8jgx';
```

**使用示例**:
```typescript
import { getRiffDueCards, reviewRiffCard, BUILTIN_DECK_ID } from '@/core/siyuan/riff';

const response = await getRiffDueCards(BUILTIN_DECK_ID);
await reviewRiffCard(BUILTIN_DECK_ID, 'card-id', 3, []);
```

---

## 📅 调度器 API

### 创建调度器

**文件**: `src/core/scheduler/index.ts`

```typescript
// 创建调度器
createScheduler(
  params: FSRSParameters, 
  engine: SchedulerEngine
): SchedulerEngineAdapter;

// 调度器类型
type SchedulerEngine = 'simple-fsrs' | 'sm2' | 'sm15' | 'a-factor-v2';
```

**使用示例**:
```typescript
import { createScheduler } from '@/core/scheduler';

const scheduler = createScheduler(params, 'simple-fsrs');
const updatedCard = scheduler.review(card, Rating.Good);
```

### 调度器路由

**文件**: `src/core/scheduler/SchedulerRouter.ts`

```typescript
class SchedulerRouter {
  constructor(config: SchedulerConfig, storage: StorageManager);
  
  // 复习卡片（自动选择调度器）
  review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard;
  
  // 预览评分结果
  preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard>;
  
  // 获取可回忆度
  getRetrievability(card: FSRSCard, now?: Date): number;
}
```

**使用示例**:
```typescript
import { SchedulerRouter } from '@/core/scheduler';

const router = new SchedulerRouter(config, storage);
const updatedCard = router.review(card, Rating.Good);
```

### 调度器接口

**文件**: `src/core/scheduler/types.ts`

```typescript
interface SchedulerEngineAdapter {
  preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard>;
  review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard;
  getRetrievability(card: FSRSCard, now?: Date): number;
  updateParams(params: FSRSParameters): void;
}

// 评分
enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}
```

---

## 📦 队列 API

### 队列接口

**文件**: `src/core/queue/abstraction/Strategy.ts`

```typescript
interface IQueueStrategy<TItem> {
  // 获取下一张卡片
  next(): Promise<TItem | null>;
  
  // 处理反馈
  onFeedback(item: TItem | null, feedback: QueueFeedback): Promise<void>;
  
  // 获取统计信息
  getStats(): Promise<QueueStats>;
  
  // 获取 UI 配置
  getUIConfig(currentItem: TItem | null): QueueUIConfig;
  
  // 可选特性
  getPrioritizableTrait?(): IPrioritizableTrait<TItem>;
  getMutableTrait?(): IMutableTrait<TItem>;
  getRemovableTrait?(): IRemovableTrait<TItem>;
}

type QueueFeedback = 
  | { action: 'rate'; rating: 1 | 2 | 3 | 4 }
  | { action: 'skip' }
  | { action: 'custom'; customActionId: string };
```

### 提取练习队列

**文件**: `src/core/queue/strategies/RetrievalPracticeQueue.ts`

```typescript
class RetrievalPracticeQueue implements IQueueStrategy<QueueItem> {
  constructor(options: {
    storage: StorageManager;
    localScheduler: SchedulerEngineAdapter;
    schedulerRouter: SchedulerRouter;
  });
  
  // 核心方法
  async next(): Promise<QueueItem | null>;
  async onFeedback(item: QueueItem | null, feedback: QueueFeedback): Promise<void>;
  async getStats(): Promise<QueueStats>;
  
  // 队列管理
  getAllItems(): QueueItem[];
  async addItems(items: QueueItem[]): Promise<number>;
  async removeItems(items: QueueItem[]): Promise<number>;
  async clear(): Promise<void>;
}
```

**使用示例**:
```typescript
import { RetrievalPracticeQueue } from '@/core/queue/strategies';

const queue = new RetrievalPracticeQueue({ storage, localScheduler, schedulerRouter });
const item = await queue.next();
await queue.onFeedback(item, { action: 'rate', rating: 3 });
```

### 神经漫游队列

**文件**: `src/core/queue/strategies/NeuralRoamQueue.ts`

```typescript
class NeuralRoamQueue implements IQueueStrategy<QueueItem> {
  constructor(
    storage: NeuralQueueStorage,
    scheduler: SchedulerEngineAdapter,
    options?: NeuralRoamOptions
  );
  
  // 设置种子块
  setSeedBlock(blockId: string): Promise<void>;
  
  // 核心方法
  async next(): Promise<QueueItem | null>;
  async onFeedback(item: QueueItem | null, feedback: QueueFeedback): Promise<void>;
}
```

---

## 💾 存储 API

### 存储管理器

**文件**: `src/core/storage/manager.ts`

```typescript
class StorageManager {
  constructor(pluginName: string);
  
  // 初始化
  async init(): Promise<void>;
  
  // 卡片管理
  getCard(cardId: string): FSRSCard | undefined;
  setCard(card: FSRSCard): void;
  getAllCards(): FSRSCard[];
  getDueCards(now?: Date): FSRSCard[];
  removeCard(cardId: string): void;
  
  // 设置管理
  getSettings(): PluginSettings;
  async updateSettings(settings: Partial<PluginSettings>): Promise<void>;
  
  // 队列管理
  getQueueData(): QueueData | null;
  async setQueueData(data: QueueData): Promise<void>;
  async getQueueBackup(): Promise<QueueData | null>;
  async setQueueBackup(data: QueueData): Promise<void>;
  
  // 日志管理
  async addReviewLog(log: ReviewLog): Promise<void>;
  async getReviewLogs(year: number, month: number): Promise<ReviewLog[]>;
  
  // 文件操作
  async readPluginData(filename: string): Promise<string | null>;
  async writePluginData(filename: string, content: string): Promise<void>;
}
```

**使用示例**:
```typescript
import { StorageManager } from '@/core/storage';

const storage = new StorageManager('siyuan-plugin-fsrs');
await storage.init();

const card = storage.getCard('card-id-123');
storage.setCard(updatedCard);
await storage.saveCards();
```

---

## 🎨 UI 工具

### 对话框工具

**文件**: `src/utils/dialog.ts`

```typescript
// 创建 Vue 对话框
createVueDialog<T extends Component>(options: {
  title?: string;
  hideTitle?: boolean;
  component: T;
  props?: any;
  width?: string;
  height?: string;
  isReview?: boolean;
  dataKey?: string;
  onClose?: () => void;
}): Dialog;

// 确认对话框
confirmDialog(options: {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<boolean>;

// 输入对话框
inputDialog(options: {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
}): Promise<string | null>;
```

**使用示例**:
```typescript
import { createVueDialog, confirmDialog } from '@/utils/dialog';
import MyComponent from './MyComponent.vue';

const dialog = createVueDialog({
  title: '我的对话框',
  component: MyComponent,
  props: { data: myData },
});

const confirmed = await confirmDialog({
  title: '确认',
  content: '确定要删除吗？',
});
```

### 复习会话 Hook

**文件**: `src/ui/review/v2/useReviewSession.ts`

```typescript
function useReviewSession<TItem>(
  queue: IQueueStrategy<TItem>,
  adapter: IAdapter<TItem>
): ReviewSessionHook;

interface ReviewSessionHook {
  state: Ref<ReviewUIState>;
  context: Ref<AdapterContext>;
  reveal: () => void;
  grade: (rating: number) => Promise<void>;
  skip: () => Promise<void>;
  executeCommand: (commandId: string) => Promise<void>;
}
```

**使用示例**:
```vue
<script setup lang="ts">
import { useReviewSession } from '@/ui/review/v2';

const hook = useReviewSession(queue, adapter);

// 显示答案
hook.reveal();

// 评分
await hook.grade(3);

// 跳过
await hook.skip();
</script>
```

---

## 🛠️ 工具函数

### 日志工具

**文件**: `src/utils/logger.ts`

```typescript
// 日志管理器
class Logger {
  setEnabled(enabled: boolean): void;
  debug(message: string, ...args: any[]): void;
  log(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  group(label: string): void;
  groupEnd(): void;
  withTag(tag: string): TaggedLogger;
}

// 单例
export const logger: Logger;

// 创建带标签的日志器
export const createLogger: (tag: string) => TaggedLogger;
```

**使用示例**:
```typescript
import { logger, createLogger } from '@/utils/logger';

logger.log('普通日志', data);
logger.warn('警告', warning);
logger.error('错误', error);

const log = createLogger('MyModule');
log.log('模块日志', data);
```

### 验证工具

**文件**: `src/ui/browser/utils/validators.ts`

```typescript
// 验证优先级
validatePriority(priority: number | undefined): number;

// 验证块 ID
validateBlockId(blockId: any): string | null;

// 验证卡片 ID
validateCardId(cardId: any): string | null;

// 验证日期
validateDate(date: any): Date | null;

// 验证数字范围
validateNumberRange(value: number | undefined, min: number, max: number, defaultValue: number): number;

// 验证整数
validateInteger(value: any, defaultValue?: number): number;

// 验证正整数
validatePositiveInteger(value: any, defaultValue?: number): number;

// 验证百分比（0-1）
validatePercentage(value: any, defaultValue?: number): number;

// 验证数组
validateArray<T>(value: any): T[];

// 验证非空数组
validateNonEmptyArray<T>(value: any, defaultValue?: T[]): T[];

// 验证对象
validateObject<T extends object>(value: any): T | null;

// 验证布尔值
validateBoolean(value: any, defaultValue?: boolean): boolean;

// 验证枚举值
validateEnum<T extends string>(value: any, validValues: readonly T[], defaultValue: T): T;

// 验证卡片状态
validateCardState(state: any): 0 | 1 | 2 | 3;

// 验证卡片类型
validateCardType(type: any): 'topic' | 'item' | undefined;

// 批量验证卡片数据
validateCardData(data: any): ValidatedCard | null;
```

**使用示例**:
```typescript
import { validatePriority, validateBlockId, validateCardData } from '@/ui/browser/utils/validators';

const priority = validatePriority(userInput); // 返回有效的优先级
const blockId = validateBlockId(data.blockId); // 返回有效的块 ID 或 null
const card = validateCardData(rawData); // 返回验证后的卡片数据或 null
```

### 性能监控

**文件**: `src/utils/performance.ts`

```typescript
class PerformanceMonitor {
  // 开始计时
  static start(name: string): void;
  
  // 结束计时
  static end(name: string): void;
  
  // 获取统计信息
  static getStats(name: string): { count: number; total: number; avg: number; min: number; max: number } | null;
  
  // 获取所有统计信息
  static getAllStats(): Map<string, any>;
  
  // 打印报告
  static printReport(): void;
  
  // 清除统计
  static clear(name?: string): void;
}
```

**使用示例**:
```typescript
import { PerformanceMonitor } from '@/utils/performance';

PerformanceMonitor.start('myOperation');
// ... 执行操作
PerformanceMonitor.end('myOperation');

const stats = PerformanceMonitor.getStats('myOperation');
console.log(`平均耗时: ${stats.avg}ms`);
```

---

## 📝 类型定义

### 卡片类型

**文件**: `src/types/card.ts`

```typescript
interface FSRSCard {
  id: string;
  blockID: string;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview?: Date;
  cardType?: 'topic' | 'item';
  schedulerType?: 'fsrs-v5' | 'sm2' | 'sm15' | 'a-factor';
  priority?: number;
  aFactor?: number; // Topic 卡片的 A-Factor
}

enum State {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

enum Rating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}
```

### 设置类型

**文件**: `src/types/settings.ts`

```typescript
interface PluginSettings {
  fsrs: FSRSParameters;
  schedulerEngine: SchedulerEngine;
  scheduler?: SchedulerConfig;
  newCardsPerDay: number;
  reviewsPerDay: number;
  defaultPriority: number;
  priorityRandomness: number;
  leech: LeechSettings;
  ui: UISettings;
  incremental: IncrementalSettings;
  drill: DrillSettings;
  queues: QueueSettings;
  savedFilters: ReviewFilter[];
  collectStats: boolean;
}

interface FSRSParameters {
  requestRetention: number;
  maximumInterval: number;
  weights: number[];
  enableFuzz: boolean;
  enableShortTerm: boolean;
}

interface UISettings {
  defaultMode: 'dialog' | 'dock';
  showTimer: boolean;
  showProgress: boolean;
  showStats: boolean;
  autoAdvance: boolean;
  autoAdvanceDelay: number;
  enableDebugLogs: boolean;
}
```

### 队列类型

**文件**: `src/core/queue/types.ts`

```typescript
interface QueueItem {
  cardID: string;
  blockID: string;
  nextDues: [number, number, number, number];
  priority: number;
  cardType?: 'topic' | 'item';
  aFactor?: number;
}

interface QueueStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  review: number;
}

interface QueueUIConfig {
  title: string;
  showNewCount: boolean;
  showReviewCount: boolean;
  customActions?: Array<{
    id: string;
    label: string;
    icon?: string;
  }>;
}
```

---

## 🎯 常见使用场景

### 场景 1：创建并复习卡片

```typescript
import { FSRSPlugin } from '@/index';
import { markBlockAsCard } from '@/core/siyuan/block';
import { createDefaultCard } from '@/types';

const plugin = FSRSPlugin.getInstance();
if (!plugin) return;

// 1. 标记块为卡片
await markBlockAsCard('block-id-123', 'card-id-456');

// 2. 创建卡片数据
const card = createDefaultCard('block-id-123');
plugin.storage.setCard(card);

// 3. 复习卡片
const updatedCard = plugin.schedulerRouter.review(card, Rating.Good);
plugin.storage.setCard(updatedCard);
await plugin.storage.saveCards();
```

### 场景 2：打开自定义复习对话框

```typescript
import { createVueDialog } from '@/utils/dialog';
import { ReviewView } from '@/ui/review/v2';
import { RetrievalPracticeAdapter } from '@/ui/review/v2/adapters';

const plugin = FSRSPlugin.getInstance();
if (!plugin) return;

const dialog = createVueDialog({
  title: '复习',
  component: ReviewView,
  props: {
    queue: plugin.retrievalQueue,
    adapter: new RetrievalPracticeAdapter({ i18n: plugin.i18n }),
  },
  isReview: true,
});
```

### 场景 3：查询和筛选卡片

```typescript
import { sql } from '@/core/siyuan/api';
import { getCardBlockIds } from '@/core/siyuan/block';

// 获取所有卡片块 ID
const blockIds = await getCardBlockIds();

// SQL 查询特定文档的卡片
const cards = await sql(`
  SELECT * FROM blocks 
  WHERE id IN (
    SELECT block_id FROM attributes 
    WHERE name = 'custom-fsrs-card-id'
  )
  AND root_id = '${docId}'
`);
```

### 场景 4：使用日志系统

```typescript
import { createLogger } from '@/utils/logger';

const log = createLogger('MyFeature');

log.log('功能初始化');
log.debug('调试信息', { data });
log.warn('警告：配置缺失');
log.error('错误：操作失败', error);
```

### 场景 5：验证用户输入

```typescript
import { 
  validatePriority, 
  validateBlockId, 
  validateCardData 
} from '@/ui/browser/utils/validators';

// 验证优先级
const priority = validatePriority(userInput); // 自动限制在 0-100

// 验证块 ID
const blockId = validateBlockId(data.blockId);
if (!blockId) {
  logger.error('无效的块 ID');
  return;
}

// 批量验证卡片数据
const card = validateCardData(rawData);
if (!card) {
  logger.error('无效的卡片数据');
  return;
}
```

---

## 📚 相关文档

- **[AI 交接指南](./AI_HANDOFF_GUIDE.md)** - 快速理解代码库
- **[代码架构详解](../.kiro/specs/CODE_ARCHITECTURE.md)** - 完整的架构文档
- **[日志系统指南](./LOGGING_GUIDE.md)** - 日志系统使用说明

---

## 💡 最佳实践

### 1. 使用类型安全

```typescript
// ✅ 好：使用类型定义
import type { FSRSCard, Rating } from '@/types';

function reviewCard(card: FSRSCard, rating: Rating): FSRSCard {
  // ...
}

// ❌ 不好：使用 any
function reviewCard(card: any, rating: any): any {
  // ...
}
```

### 2. 使用日志系统

```typescript
// ✅ 好：使用统一的日志系统
import { createLogger } from '@/utils/logger';
const log = createLogger('MyModule');
log.log('操作完成', result);

// ❌ 不好：直接使用 console
console.log('[MyModule] 操作完成', result);
```

### 3. 验证用户输入

```typescript
// ✅ 好：验证输入
import { validatePriority } from '@/ui/browser/utils/validators';
const priority = validatePriority(userInput);

// ❌ 不好：直接使用
const priority = userInput; // 可能是 undefined、NaN 等
```

### 4. 使用错误处理

```typescript
// ✅ 好：完整的错误处理
try {
  const card = await getCard(cardId);
  if (!card) {
    logger.warn('卡片不存在', cardId);
    return;
  }
  // ...
} catch (error) {
  logger.error('获取卡片失败', error);
  pushErrMsg('操作失败');
}

// ❌ 不好：忽略错误
const card = await getCard(cardId);
// 没有检查 card 是否存在
```

---

**最后更新**：2026-01-31
