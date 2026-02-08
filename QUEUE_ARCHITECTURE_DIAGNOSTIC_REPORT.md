# 队列架构诊断报告

**生成时间**: 2026-02-05T07:43:13.097Z

## 摘要

| 指标 | 数量 |
|------|------|
| 总文件数 | 267 |
| 旧架构文件 | 49 |
| 新架构文件 | 26 |
| 混合使用文件 | 83 |
| 验证错误 | 28 |
| 验证警告 | 5 |

## 架构使用情况

### 旧架构
| 文件 | 行号 | 类型 | 架构 | 代码片段 |
|------|------|------|------|----------|
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 11 | import | old | import { ProgressiveLearningQueue } from '../src/core/queue/strategies/Progressi |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 12 | import | old | import { ExtractionPracticeQueue } from '../src/core/queue/strategies/Extraction |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 19 | instantiation | old | new Error(`❌ Assertion failed: ${message}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 63 | instantiation | old | new TopicScheduler() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 148 | instantiation | old | new ProgressiveLearningQueue({
    topicRatio: 0.3,
    autoSort: true,
  }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 196 | instantiation | old | new ProgressiveLearningQueue({ topicRatio: 0.3, autoSort: false }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 235 | instantiation | old | new Set(state.map((c) => c.cardID)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 257 | instantiation | old | new ExtractionPracticeQueue(storageStub as any) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts | 268 | instantiation | old | new Proxy(originalDetect, {
    get(target, prop) {
      if (prop === 'detectCa |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 6 | import | old | import { ExtractionPracticeQueue } from '../src/core/queue/strategies/Extraction |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 7 | import | old | import { DeliberatePracticeQueue } from '../src/core/queue/strategies/Deliberate |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 8 | import | old | import { NeuralWanderingQueue } from '../src/core/queue/strategies/NeuralWanderi |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 9 | import | old | import { FilterGroupQueue } from '../src/core/queue/strategies/FilterGroupQueue. |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 23 | instantiation | old | new Error(message) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 61 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 70 | instantiation | old | new Set(state.map((c) => c.cardID)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 92 | instantiation | old | new ExtractionPracticeQueue(storageStub as any) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 111 | instantiation | old | new DeliberatePracticeQueue(createMemoryAdapter() as any) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 143 | instantiation | old | new NeuralWanderingQueue(
  createMemoryAdapter() as any,
  { sql: sqlStub, ge |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 175 | instantiation | old | new NeuralWanderingQueue(
  createMemoryAdapter() as any,
  { sql: sqlTagStub, |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 195 | instantiation | old | new FilterGroupQueue([{ id: 'g1', weight: 2 }, { id: 'g2', weight: 1 }], createM |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 204 | instantiation | old | new QueueContext<QueueItem>({ initial: 'deliberate' }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts | 204 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 38 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 55 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 64 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 65 | instantiation | old | new Map<string, any>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 66 | instantiation | old | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 67 | instantiation | old | new Map<string, QueueItem>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 67 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 87 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 120 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 220 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 242 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 251 | instantiation | old | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 280 | instantiation | old | new Set((blockIDs \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts | 281 | instantiation | old | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 19 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 40 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 57 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 59 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 98 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 100 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts | 141 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 23 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 29 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 37 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 75 | instantiation | old | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 130 | instantiation | old | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 184 | instantiation | old | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 230 | instantiation | old | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 272 | instantiation | old | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 323 | instantiation | old | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 377 | instantiation | old | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 405 | instantiation | old | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 438 | instantiation | old | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts | 469 | instantiation | old | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts | 20 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts | 77 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts | 77 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts | 101 | instantiation | old | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts | 159 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts | 169 | instantiation | old | new LocalStorageDataSource({
        storage,
        filter: (card) => card.d |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts | 183 | instantiation | old | new RiffDataSource({
        deckId: BUILTIN_DECK_ID,
        mode: 'due-only' |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 21 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 26 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 31 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 48 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 49 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 50 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 178 | instantiation | old | new Set(topics.map(t => t.cardID)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 187 | instantiation | old | new Set(items_queue.map(i => i.cardID)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts | 260 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 35 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 36 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 45 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 50 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 67 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 72 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 82 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 92 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 99 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 162 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 168 | instantiation | old | new Set((items \|\| []).map((x) => String((x as any)?.cardID \|\| '')).filter(Bo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts | 196 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 20 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 23 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 35 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 35 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 38 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 49 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 50 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 72 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 110 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts | 130 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts | 25 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts | 69 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts | 91 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts | 141 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\ObservableDataSource.ts | 57 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 14 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 23 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 27 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 38 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 51 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 57 | instantiation | old | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 58 | instantiation | old | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 59 | instantiation | old | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 60 | instantiation | old | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 98 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts | 177 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 63 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 63 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 111 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 111 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 162 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 163 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 164 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 175 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 176 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts | 224 | instantiation | old | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\logging\LoggableQueue.ts | 139 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 23 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 74 | instantiation | old | new HistoryFilter(this.config.historyCapacity) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 75 | instantiation | old | new QueryEngine(this.config) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 76 | instantiation | old | new WeightedWalkEngine({
      [AssociationType.REF_LINK]: this.config.weights.r |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 93 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 105 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 175 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts | 204 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DualQueueSequencer.ts | 15 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DualQueueSequencer.ts | 43 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DynamicDrawSequencer.ts | 18 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DynamicDrawSequencer.ts | 48 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 43 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 96 | instantiation | old | new Error('Reorder failed: orderedItems is not an array') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 99 | instantiation | old | new Error(`Reorder failed: expected ${this.items.length} items, got ${orderedIte |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 102 | instantiation | old | new Set(this.items.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 103 | instantiation | old | new Set(orderedItems.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 107 | instantiation | old | new Error(`Reorder failed: item ${id} not found in current queue`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts | 112 | instantiation | old | new Error('Reorder failed: item count mismatch') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 22 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 37 | instantiation | old | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 38 | instantiation | old | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 39 | instantiation | old | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 40 | instantiation | old | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 53 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 65 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 75 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 88 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 103 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 118 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 133 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 150 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 178 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 191 | instantiation | old | new Promise((resolve) => setTimeout(resolve, 150)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 201 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 218 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 232 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 244 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 261 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 289 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 308 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 326 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 346 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 368 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 381 | instantiation | old | new Promise((resolve) => setTimeout(resolve, 70)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 390 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 408 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 435 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 448 | instantiation | old | new Promise((resolve) => setTimeout(resolve, 6000)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 459 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 470 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 488 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 507 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 521 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 544 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 559 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 576 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 588 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 601 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 612 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 635 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 657 | instantiation | old | new Promise((resolve) => setTimeout(resolve, 70)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 670 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts | 699 | instantiation | old | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.ts | 170 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GraphSequencer.ts | 10 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GraphSequencer.ts | 17 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GroupSequencer.ts | 16 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GroupSequencer.ts | 47 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 4 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 39 | instantiation | old | new Error('Reorder failed: orderedItems is not an array') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 42 | instantiation | old | new Error(`Reorder failed: expected ${this.items.length} items, got ${orderedIte |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 45 | instantiation | old | new Set(this.items.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 46 | instantiation | old | new Set(orderedItems.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 50 | instantiation | old | new Error(`Reorder failed: item ${id} not found in current queue`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts | 55 | instantiation | old | new Error('Reorder failed: item count mismatch') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\PrioritySequencer.ts | 91 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\PrioritySequencer.ts | 391 | instantiation | old | new Date(ms) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\SortedSequencer.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\SortedSequencer.ts | 184 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 29 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 43 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 44 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 47 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 61 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 78 | instantiation | old | new GroupDataSource({
      groupIds,
      persistence: persistenceWrapper,
 |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 84 | instantiation | old | new GroupSequencer<QueueItem>({
      getGroups: () => groupDataSource.getAllGr |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 84 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 102 | instantiation | old | new NullScheduler<QueueItem>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 102 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 145 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 166 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 192 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 193 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 203 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 210 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 214 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 222 | instantiation | old | new Map(allCurrent.map((x) => [String((x as any)?.cardID \|\| ''), x] as const)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 223 | instantiation | old | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 233 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts | 236 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 25 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 49 | instantiation | old | new StorageFileJsonAdapter<Snapshot>(storage, 'queue-final-drill.json') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 52 | instantiation | old | new FinalDrillSequencer<FinalDrillItem>(undefined, {
      lowestPick: 5,
     |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 59 | instantiation | old | new ConditionalScheduler<FinalDrillItem, 1 \| 2 \| 3 \| 4>({
      base: new Nu |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 60 | instantiation | old | new NullScheduler<FinalDrillItem>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 264 | instantiation | old | new Map(current.map((x) => [String(x.cardID), x] as const)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 351 | instantiation | old | new Set(toInsert.map((x) => String(x.cardID))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 364 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 382 | instantiation | old | new Set(current.map((x) => String(x.cardID))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts | 417 | instantiation | old | new Set((items \|\| []).map((x) => String((x as any)?.cardID \|\| '')).filter(Bo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 57 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 91 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 104 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 117 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 130 | instantiation | old | new Date(timestamp) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 134 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 148 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 173 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 176 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 177 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 178 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 179 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 179 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 183 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 189 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 222 | instantiation | old | new SchedulerSortingStrategy(options.scheduler) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 225 | instantiation | old | new RiffScheduler(async (card, grade) => {
      await this.api.reviewRiffCard( |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 318 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 344 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 360 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 397 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 401 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 405 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 405 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 410 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 495 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 531 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 540 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 560 | instantiation | old | new Set(this.localBuffer.map(item => String(item.cardID))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 588 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 599 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 606 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 616 | instantiation | old | new Set(this.localBuffer.map(item => String(item.cardID))) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 617 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 618 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 733 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 819 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 822 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 825 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts | 828 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 53 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 68 | instantiation | old | new RiffDataSource({
      deckId: deckID,
      filter: (item) => {
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 78 | instantiation | old | new RiffScheduler<QueueItem, 1 \| 2 \| 3 \| 4>(async (card, grade) => {
      a |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 78 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 84 | instantiation | old | new LeechScheduler<QueueItem, 1 \| 2 \| 3 \| 4>({
      base: baseScheduler,
  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 84 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 111 | instantiation | old | new PrioritySequencer<QueueItem>({
      fetchAll: async () => {
        const |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\LeechQueue.ts | 111 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 34 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 36 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 40 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 64 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 70 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 96 | instantiation | old | new QueryEngine(config) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 97 | instantiation | old | new WeightedWalkEngine({
      [AssociationType.REF_LINK]: config.weights.refLi |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 106 | instantiation | old | new GraphSequencer<string, QueueItem, any>({
      seed: undefined,
      getN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 106 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 113 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 118 | instantiation | old | new GraphDataSource(placeholderSequencer) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 121 | instantiation | old | new NullScheduler<QueueItem>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 121 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 154 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 194 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 195 | instantiation | old | new GraphSequencer<string, QueueItem, any>({
      seed: seedBlockId \|\| undef |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 195 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts | 228 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 16 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 42 | instantiation | old | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 69 | instantiation | old | new Error('Invalid queue data format: unable to detect version') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 83 | instantiation | old | new Error(`No migration found for version ${version}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 116 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 134 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts | 134 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 45 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 46 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 55 | instantiation | old | new RiffDataSource({
      deckId: deckID,
      notebook: options?.notebook, |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 65 | instantiation | old | new StorageDataSource({
      storage,
      deckId: deckID,
    }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 89 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 158 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 212 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 377 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 393 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 394 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 448 | instantiation | old | new RetrievalHybridDataSource(deckID, api, options?.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 452 | instantiation | old | new SchedulerSortingStrategy(options.localScheduler) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 458 | instantiation | old | new SortedSequencer<QueueItem>({
      getDueMs: (item) => {
        // Get du |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 458 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 475 | instantiation | old | new RiffScheduler<QueueItem, 1 \| 2 \| 3 \| 4>(async (card, grade) => {
      / |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 475 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 509 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 520 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 527 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 534 | instantiation | old | new RetrievalPracticeQueue(
      hybridSource,
      sequencer,
      schedu |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 573 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 574 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 580 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 581 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 587 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 588 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 594 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 602 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 638 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 647 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 649 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 652 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 701 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 721 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 735 | instantiation | old | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts | 761 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 19 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 22 | instantiation | old | new Map<string, Promise<string \| null>>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 29 | instantiation | old | new Set((options.blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 34 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 47 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 145 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\SubsetPracticeStrategy.ts | 181 | instantiation | old | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\types.ts | 71 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts | 26 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts | 26 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts | 49 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts | 56 | instantiation | old | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff\normalizers.ts | 101 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 83 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 173 | instantiation | old | new StorageManager(this.name) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 177 | instantiation | old | new RescheduleService(this.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 180 | instantiation | old | new SchedulerRouter({
        defaultScheduler: settings.scheduler?.defaultSche |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 196 | instantiation | old | new QueueContext<QueueItem>({
        initial: 'retrieval',
        monitors:  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 196 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 198 | instantiation | old | new ConsoleQueueMonitor() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 209 | instantiation | old | new FilterGroupQueue(
        configs,
        new StorageFileJsonAdapter(this |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 211 | instantiation | old | new StorageFileJsonAdapter(this.storage, 'queue-filter-group.json') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 218 | instantiation | old | new FinalDrillQueue(this.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 223 | instantiation | old | new LeechQueue() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 228 | instantiation | old | new NeuralRoamQueue({ config: neuralConfig }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 232 | instantiation | old | new IncrementalLearningQueue({
        storage: this.storage,
        schedule |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 254 | instantiation | old | new SimpleDataRouter() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 255 | instantiation | old | new AdvancedDataRouter(this.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 261 | instantiation | old | new DialogService({
        app: this.app,
        i18n: this.i18n \|\| {},
  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 271 | instantiation | old | new MenuService({
        i18n: this.i18n \|\| {},
        storage: this.stora |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 288 | instantiation | old | new ReviewDialogManager({
        app: this.app,
        i18n: this.i18n \|\|  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 302 | instantiation | old | new BlockMenuHandler({
        app: this.app,
        i18n: this.i18n \|\| {}, |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 316 | instantiation | old | new XiuyuanStorage(this.name) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 318 | instantiation | old | new XiuyuanService(this.xiuyuanStorage, this.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 331 | instantiation | old | new TransactionObserver(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 363 | instantiation | old | new HybridSyncService({
          deckId: riff.BUILTIN_DECK_ID,
          stor |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 546 | instantiation | old | new FinalDrillProvider({
              queue: plugin.finalDrillQueue,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 550 | instantiation | old | new FinalDrillAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 557 | instantiation | old | new LeechAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 564 | instantiation | old | new NeuralRoamAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 567 | instantiation | old | new RetrievalPracticeProvider({
              storage: plugin.storage,
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 571 | instantiation | old | new RetrievalPracticeAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 579 | instantiation | old | new FinalDrillAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 581 | instantiation | old | new LeechAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 583 | instantiation | old | new NeuralRoamAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 585 | instantiation | old | new RetrievalPracticeAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 764 | instantiation | old | new HybridSyncService({
                deckId: riff.BUILTIN_DECK_ID,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 789 | instantiation | old | new HybridSyncService({
                deckId: riff.BUILTIN_DECK_ID,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts | 1070 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 24 | instantiation | old | new StorageManager(this.plugin.name) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 28 | instantiation | old | new RescheduleService(this.plugin.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 31 | instantiation | old | new SchedulerRouter({
      defaultScheduler: settings.scheduler?.defaultSchedu |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 49 | instantiation | old | new QueueContext<QueueItem>({
      initial: 'retrieval',
      monitors: [new |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 49 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 51 | instantiation | old | new ConsoleQueueMonitor() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 62 | instantiation | old | new FilterGroupQueue(
      configs,
      new StorageFileJsonAdapter(this.plu |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 64 | instantiation | old | new StorageFileJsonAdapter(this.plugin.storage, 'queue-filter-group.json') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 71 | instantiation | old | new FinalDrillQueue(this.plugin.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 76 | instantiation | old | new LeechQueue() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 81 | instantiation | old | new NeuralRoamQueue({ config: neuralConfig }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 85 | instantiation | old | new IncrementalLearningQueue({
      storage: this.plugin.storage,
      sched |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 108 | instantiation | old | new DialogService({
      app: this.plugin.app,
      i18n: this.plugin.i18n \ |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts | 118 | instantiation | old | new MenuService({
      i18n: this.plugin.i18n \|\| {},
      storage: this.pl |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\QueueHelpers.ts | 15 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\QueueHelpers.ts | 50 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\logging.ts | 215 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 232 | instantiation | old | new CardBuilderContext() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 368 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 389 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 411 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 412 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 413 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 438 | instantiation | old | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts | 443 | instantiation | old | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts | 14 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts | 21 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts | 174 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\LeechAdapter.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\LeechAdapter.ts | 16 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\LeechAdapter.ts | 153 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts | 24 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts | 31 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts | 164 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts | 17 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts | 28 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts | 209 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\SubsetPracticeAdapter.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\SubsetPracticeAdapter.ts | 24 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\SubsetPracticeAdapter.ts | 140 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts | 17 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts | 22 | instantiation | old | new FinalDrillV2Session({
      queue: options.queue,
      storage: options.s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts | 43 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts | 165 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 9 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 10 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 11 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 24 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 60 | instantiation | old | new StorageFileJsonAdapter<ProgressSnapshot>(options.storage, 'review-v2-final-d |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 80 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 97 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 102 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 108 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 205 | type-annotation | old | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 226 | type-annotation | old | QueueItem |

### 新架构
| 文件 | 行号 | 类型 | 架构 | 代码片段 |
|------|------|------|------|----------|
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 48 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 113 | instantiation | new | new Error(`加载下一张卡片失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 137 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 212 | instantiation | new | new Error(`处理按钮点击失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 221 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 268 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 307 | instantiation | new | new Error('No current card or queue') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 318 | instantiation | new | new Error(`处理评分失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 340 | instantiation | new | new Error('No current card or queue') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts | 370 | instantiation | new | new Error(`处理操作失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts | 16 | instantiation | new | new QABuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts | 17 | instantiation | new | new ClozeBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts | 18 | instantiation | new | new DefaultBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts | 33 | instantiation | new | new DefaultBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\ClozeStrategy.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\DefaultStrategy.ts | 12 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\QAStrategy.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\types.ts | 12 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 17 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 17 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 37 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 45 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 45 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 46 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts | 46 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 44 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 56 | instantiation | new | new SimpleFSRSScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 59 | instantiation | new | new SM2Scheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 62 | instantiation | new | new SM15Scheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 65 | instantiation | new | new TopicScheduler() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 68 | instantiation | new | new ImprovedTopicScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 71 | instantiation | new | new RiffSchedulerAdapter(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 81 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 81 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 88 | instantiation | new | new Error(`Scheduler not found: ${schedulerType}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 121 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 158 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 207 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 207 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 212 | instantiation | new | new Error(`Scheduler not found: ${schedulerType}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 254 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts | 257 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 38 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 38 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 38 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 39 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 39 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 49 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 49 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 49 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 56 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 56 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 76 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts | 76 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 57 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 57 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 76 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 83 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 83 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 97 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 97 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 131 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 131 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 193 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 229 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 286 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 63 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 63 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 136 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 136 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 205 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 205 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 276 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts | 278 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 41 | instantiation | new | new SM15(requestedFI, intervalBase) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 62 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 62 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 70 | instantiation | new | new SM15Item(this.sm15, item.value) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 76 | instantiation | new | new Date(item.dueDate) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 77 | instantiation | new | new Date(item.previousDate) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 100 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 100 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 108 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 123 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 125 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 137 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 144 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 145 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 153 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 155 | instantiation | new | new SM15Item(this.sm15, card.id) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 175 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 197 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts | 197 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 24 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 24 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 24 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 25 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 32 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 32 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 32 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 36 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 36 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 47 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts | 47 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts | 23 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts | 31 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts | 31 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts | 9 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts | 9 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts | 11 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 37 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 37 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 42 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 126 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 133 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 145 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 152 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 171 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 171 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 188 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 200 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 235 | instantiation | new | new Set(this.practiceQueue.map(card => card.cardID)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 334 | instantiation | new | new Date(log.review) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 354 | instantiation | new | new Date(log.ts) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 397 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 403 | instantiation | new | new Date(now.getFullYear(), now.getMonth() - i, 1) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 542 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 552 | instantiation | new | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 569 | instantiation | new | new Set((blockIDs \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 570 | instantiation | new | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 648 | instantiation | new | new Uint8Array(binaryString.length) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 791 | instantiation | new | new Set(this.riffBlacklist) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 810 | instantiation | new | new Set(Array.isArray(data) ? data : []) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 819 | instantiation | new | new Set(Array.isArray(parsed) ? parsed : []) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 822 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts | 826 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts | 294 | instantiation | new | new Error(`Template not found: ${templateID}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts | 318 | instantiation | new | new Error('Template has no card rules') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts | 342 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 61 | instantiation | new | new UnifiedDataSourceManager() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 142 | instantiation | new | new Set<IDataSourceObserver>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 149 | instantiation | new | new QueueFactory(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 194 | instantiation | new | new Error(`路由器未初始化 (模式: ${this.currentMode})`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 254 | instantiation | new | new Error(`模式切换失败 (${oldMode} -> ${newMode}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 286 | instantiation | new | new Error('路由器未初始化，无法执行增量同步') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 303 | instantiation | new | new Set(localCards.map(card => card.id)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 334 | instantiation | new | new Error(`增量同步失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 352 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 352 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 414 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 443 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 451 | instantiation | new | new Error(`获取卡片失败 (${cardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 466 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 474 | instantiation | new | new Error(`获取卡片列表失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 495 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 518 | instantiation | new | new Error(`更新卡片失败 (${card.id}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts | 560 | instantiation | new | new Error(`删除卡片失败 (${cardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 82 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 86 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 101 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 124 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 181 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 248 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 248 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts | 262 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 78 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 83 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 99 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 125 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 127 | instantiation | new | new Error('Update not allowed in Simple Mode') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 188 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 193 | instantiation | new | new Date(riffCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 194 | instantiation | new | new Date(riffBlock.created) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 195 | instantiation | new | new Date(riffBlock.updated) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 196 | instantiation | new | new Date(riffCard.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 207 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 257 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 257 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts | 273 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts | 242 | instantiation | new | new Set(riffCards.map(c => c.id)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts | 243 | instantiation | new | new Set(this.storage.getAllCards().map(c => c.id)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts | 442 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts | 448 | instantiation | new | new Date(riffCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts | 457 | instantiation | new | new Date(riffCard.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 59 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 109 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 139 | instantiation | new | new Error(`获取下一张卡片失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 161 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 215 | instantiation | new | new Error(`处理反馈失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts | 241 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedReviewAdapter.ts | 72 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts | 113 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts | 155 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts | 161 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 102 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 119 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 130 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 134 | instantiation | new | new Error(`初始化队列视图失败 (${queueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 184 | instantiation | new | new Date(startTime) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 185 | instantiation | new | new Date(endTime) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 187 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 206 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 214 | instantiation | new | new Error(`加载卡片数据失败 (${this.currentQueueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 271 | instantiation | new | new Date(event.timestamp) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 370 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 391 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts | 392 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 91 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 98 | instantiation | new | new ReviewViewController(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 111 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 122 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 126 | instantiation | new | new Error(`初始化复习控制器失败 (${queueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 139 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 142 | instantiation | new | new Error('Controller not initialized, fallback to useReviewSession') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 179 | instantiation | new | new Error('Controller not initialized, fallback to useReviewSession') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 215 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 223 | instantiation | new | new Error(`评分失败 (卡片 ${this.currentCardId}, 评分 ${rating}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 239 | instantiation | new | new Error('Controller not initialized, fallback to useReviewSession') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 274 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 278 | instantiation | new | new Error(`跳过失败 (卡片 ${this.currentCardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 287 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts | 360 | instantiation | new | new Date(event.timestamp) |

### 混合使用
| 文件 | 行号 | 类型 | 架构 | 代码片段 |
|------|------|------|------|----------|
| H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts | 149 | instantiation | mixed | new Setting({
            confirmCallback: () => {
                this.saveDa |
| H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts | 355 | instantiation | mixed | new Dialog({
            title: `SiYuan ${Constants.SIYUAN_VERSION}`,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts | 375 | instantiation | mixed | new Protyle(this.app, dialog.element.querySelector("#protyle"), {
            b |
| H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts | 379 | instantiation | mixed | new Date(response.data) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts | 384 | instantiation | mixed | new Menu("topBarSample", () => {
            console.log(this.i18n.byeMenu);
  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts | 27 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts | 29 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts | 34 | instantiation | mixed | new CardBuilderContext() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\detectCardType.ts | 205 | instantiation | mixed | new Map<string, 'topic' \| 'item'>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\extractCardMeta.ts | 74 | instantiation | mixed | new Map<string, CardMeta>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 176 | instantiation | mixed | new Dialog({
      content: htmlContent,
      width: '80vw',
      height: ' |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 244 | instantiation | mixed | new Protyle(this.app, renderElement, {
        blockId: '',
        action: [C |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 340 | instantiation | mixed | new MouseEvent('click', {
          bubbles: false,
          cancelable: true |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 445 | instantiation | mixed | new Menu() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 554 | instantiation | mixed | new Protyle(this.app, renderElement, {
        blockId: card.blockID,  // 关键：传入 |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 646 | instantiation | mixed | new Protyle(this.app, answerContainer, {
          blockId: this.currentAnswerB |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts | 756 | instantiation | mixed | new Menu() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\abstraction\Command.ts | 10 | instantiation | mixed | new Map<string, IQueueCommand<TContext>>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 1 | instantiation | mixed | new TextEncoder() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 2 | instantiation | mixed | new TextDecoder() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 19 | instantiation | mixed | new Uint8Array(binary.length) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 74 | instantiation | mixed | new Uint8Array(12) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 84 | instantiation | mixed | new Uint8Array(encrypted) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts | 107 | instantiation | mixed | new Uint8Array(decrypted) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 70 | instantiation | mixed | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 305 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 345 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 389 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 434 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 464 | instantiation | mixed | new Error('Scheduler failed') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 485 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 509 | instantiation | mixed | new Error('Scheduler failed') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 531 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 558 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 579 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 599 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 629 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 661 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 691 | instantiation | mixed | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 764 | instantiation | mixed | new BaseCompositeQueue({
        dataSource: mockDataSource,
        sequencer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 872 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 954 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1035 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1116 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1186 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1247 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1315 | instantiation | mixed | new BaseCompositeQueue({
            dataSource: mockDataSource,
            s |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts | 1390 | instantiation | mixed | new BaseCompositeQueue({
      dataSource: mockDataSource,
      sequencer: mo |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 64 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 65 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 65 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 95 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 97 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 98 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 98 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 182 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 254 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 287 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 316 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 316 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 365 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts | 372 | instantiation | mixed | new Date(timestamp) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 108 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 129 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 133 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 140 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 200 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 200 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 259 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 344 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 344 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 350 | instantiation | mixed | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 350 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 435 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 449 | instantiation | mixed | new Date(againCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 449 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 450 | instantiation | mixed | new Date(hardCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 450 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 451 | instantiation | mixed | new Date(goodCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 451 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 452 | instantiation | mixed | new Date(easyCard.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 452 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 462 | instantiation | mixed | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 537 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 547 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 556 | instantiation | mixed | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 664 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts | 719 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\deprecation.ts | 6 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\HistoryFilter.ts | 26 | instantiation | mixed | new Error(`Invalid capacity: ${capacity}. Capacity must be at least 1.`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\HistoryFilter.ts | 29 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueueConfig.ts | 120 | instantiation | mixed | new ConfigValidationError(
        `Invalid configuration:\n${result.errors.map( |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\QueryEngine.ts | 471 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts | 6 | instantiation | mixed | new AsyncMutex() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts | 7 | instantiation | mixed | new Map<QueueId, QueueInterface<TItem>>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts | 73 | instantiation | mixed | new Error(`Queue strategy not registered: ${this.currentId}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\schedulers\CompositeScheduler.ts | 62 | instantiation | mixed | new Error(`No scheduler found for ID '${schedulerId}' and no default configured` |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts | 51 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts | 62 | instantiation | mixed | new QueueStateManager() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts | 81 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts | 119 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts | 24 | instantiation | mixed | new SM2Scheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts | 27 | instantiation | mixed | new ImprovedTopicScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts | 31 | instantiation | mixed | new SimpleFSRSScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 16 | instantiation | mixed | new Promise<void>((resolve) => setTimeout(resolve, ms)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 23 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 24 | instantiation | mixed | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 100 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 187 | instantiation | mixed | new Date(now + days * dayMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 214 | instantiation | mixed | new Date(currentDue.getTime() + clamped * dayMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 249 | instantiation | mixed | new Date(now + days * dayMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts | 316 | instantiation | mixed | new Date(currentDue.getTime() + days * dayMs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\FI_G.ts | 110 | instantiation | mixed | new FI_G(sm, data.points) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\ForgettingCurves.ts | 45 | instantiation | mixed | new ForgettingCurve(partialPoints) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\ForgettingCurves.ts | 125 | instantiation | mixed | new ForgettingCurves(sm, data) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 39 | instantiation | mixed | new FI_G(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 40 | instantiation | mixed | new ForgettingCurves(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 41 | instantiation | mixed | new RFM(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 42 | instantiation | mixed | new OFM(this) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 52 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 84 | instantiation | mixed | new SM15(data.requestedFI, data.intervalBase) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts | 98 | instantiation | mixed | new SM15(10, 1 * 24 * 60 * 60 * 1000) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 56 | instantiation | mixed | new Date(0) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 67 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 82 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 188 | instantiation | mixed | new Date(now.getTime() + this.optimumInterval) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 197 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 245 | instantiation | mixed | new SM15Item(sm, data.value) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 247 | instantiation | mixed | new Date(item.dueDate) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts | 249 | instantiation | mixed | new Date(item.previousDate) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 19 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 19 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 19 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 26 | instantiation | mixed | new Date(nextDues[rating]) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 61 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 61 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 64 | instantiation | mixed | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 65 | instantiation | mixed | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 66 | instantiation | mixed | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 67 | instantiation | mixed | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 89 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts | 92 | instantiation | mixed | new Date(nextDues[3]) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts | 23 | instantiation | mixed | new Error(`Siyuan API Error: ${result.msg}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts | 253 | instantiation | mixed | new FormData() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts | 258 | instantiation | mixed | new Blob([file], { type: 'application/json' }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts | 270 | instantiation | mixed | new Error(`Failed to write file: ${result.msg}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff.ts | 50 | instantiation | mixed | new Map(blockInfos.map(info => [info.id, info])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff.ts | 147 | instantiation | mixed | new Date(card.created) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 86 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 89 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 173 | instantiation | mixed | new Error(`Failed to load Xiuyuan data: ${response.statusText}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 221 | instantiation | mixed | new FormData() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 223 | instantiation | mixed | new Blob([JSON.stringify(this.data, null, 2)], { type: 'application/json' }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts | 231 | instantiation | mixed | new Error(`Failed to save Xiuyuan data: ${response.statusText}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 17 | instantiation | mixed | new SafetyAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 18 | instantiation | mixed | new PriorityCalculator() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 19 | instantiation | mixed | new DependencyAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 70 | instantiation | mixed | new Set(scanResult.oldArchitectureUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 71 | instantiation | mixed | new Set(scanResult.newArchitectureUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 73 | instantiation | mixed | new Map<string, Set<string>>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 75 | instantiation | mixed | new Set([...oldFiles, ...newFiles]) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts | 79 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts | 42 | instantiation | mixed | new ArchitectureScanner() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts | 43 | instantiation | mixed | new InterfaceValidator() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts | 44 | instantiation | mixed | new MigrationAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts | 45 | instantiation | mixed | new ReportGenerator() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts | 46 | instantiation | mixed | new ApiCompatibilityChecker() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\reporters\ReportGenerator.ts | 22 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts | 23 | instantiation | mixed | new ImportAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts | 24 | instantiation | mixed | new TypeUsageAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts | 151 | instantiation | mixed | new Set(oldUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts | 152 | instantiation | mixed | new Set(newUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts | 153 | instantiation | mixed | new Set(mixedUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ImportAnalyzer.ts | 25 | instantiation | mixed | new Map<string, ArchitectureType>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 29 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 56 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 131 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 131 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 133 | instantiation | mixed | new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 137 | instantiation | mixed | new Date(item.nextDues[4]) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 171 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 171 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 173 | instantiation | mixed | new Error(`[fsrsCardToQueueItem] Invalid FSRSCard: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 201 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 201 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 214 | instantiation | mixed | new Error(`[resolveCardId] Unknown card type: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 220 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 220 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 220 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 229 | instantiation | mixed | new Error(`[normalizeCardInput] Unknown card type: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 239 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 240 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 265 | instantiation | mixed | new Error(`[normalizeToFSRSCard] Conversion failed with ${errors.length} errors: |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 298 | instantiation | mixed | new RuntimeTypeValidator() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 306 | instantiation | mixed | new RuntimeTypeValidator() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 334 | instantiation | mixed | new TypeMismatchError(
                    `[${queueName}.${methodName}()] must  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 345 | instantiation | mixed | new TypeMismatchError(
                        `[${queueName}.${methodName}()] m |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 365 | instantiation | mixed | new TypeMismatchError(
                `[${consumerName}] Expected array of card |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts | 376 | instantiation | mixed | new TypeMismatchError(
                    `[${consumerName}] Card at index ${i} |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts | 30 | instantiation | mixed | new Set(['index.ts', 'QueueFactory.ts']) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts | 63 | instantiation | mixed | new Map(
                newClass.methods.map(method => [method.name, method])
  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts | 295 | instantiation | mixed | new Map<string, ApiClassSignature>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\InterfaceValidator.ts | 48 | instantiation | mixed | new MethodChecker(checker) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\InterfaceValidator.ts | 49 | instantiation | mixed | new TypeChecker(checker) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 202 | instantiation | mixed | new ModeError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 213 | instantiation | mixed | new QueueError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 224 | instantiation | mixed | new SyncError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 235 | instantiation | mixed | new StorageError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 251 | instantiation | mixed | new NetworkError(message, statusCode, context) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 268 | instantiation | mixed | new StorageError('存储空间不足，请清理旧数据', {
                originalError: error,
     |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 275 | instantiation | mixed | new NetworkError('网络连接失败，请检查网络连接', undefined, {
                originalError:  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts | 281 | instantiation | mixed | new DataSourceError(`${defaultMessage}: ${message}`, 'UNKNOWN_ERROR', {
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 84 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 105 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 133 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 138 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 169 | instantiation | mixed | new Set((cards \|\| []).map((c) => String(c?.blockID \|\| c?.blockId \|\| '')).f |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 183 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts | 184 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.plugin.i18n \|\| {}, label: title, queueN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 264 | instantiation | mixed | new RetrievalPracticeProvider({
        storage: this.plugin.storage,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 268 | instantiation | mixed | new RetrievalPracticeAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 329 | instantiation | mixed | new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Numb |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 346 | instantiation | mixed | new LeechAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 394 | instantiation | mixed | new FinalDrillProvider({
        queue: this.plugin.finalDrillQueue as any,
   |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 400 | instantiation | mixed | new FinalDrillAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 467 | instantiation | mixed | new RetrievalPracticeAdapter({
        i18n: this.plugin.i18n \|\| {},
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 528 | instantiation | mixed | new SubsetPracticeAdapter({
        i18n: this.plugin.i18n \|\| {},
        la |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 589 | instantiation | mixed | new LeechAdapter({
        i18n: this.plugin.i18n \|\| {}
      }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 637 | instantiation | mixed | new NeuralRoamQueue({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 643 | instantiation | mixed | new NeuralRoamAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 681 | instantiation | mixed | new Set((blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 686 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 688 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.plugin.i18n \|\| {}, label: title, queueN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 718 | instantiation | mixed | new Set((cards \|\| []).map((c) => String(c?.blockID \|\| c?.blockId \|\| '')).f |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 732 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts | 733 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.plugin.i18n \|\| {}, label: title, queueN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 44 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 80 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 95 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 106 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 122 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 122 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 137 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 208 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 208 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 223 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 223 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 266 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 306 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 306 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 312 | instantiation | mixed | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 312 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts | 318 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 66 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 93 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 121 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 121 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 240 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 241 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 259 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 259 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 259 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 260 | instantiation | mixed | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 260 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 281 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 281 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 299 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 314 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 336 | instantiation | mixed | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts | 341 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 81 | instantiation | mixed | new Map<string, FinalDrillEntry>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 110 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 116 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 150 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 150 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 276 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 281 | instantiation | mixed | new Map<string, FinalDrillEntry>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts | 364 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 59 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 86 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 92 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 118 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 118 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 216 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 217 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 235 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 235 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 235 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 236 | instantiation | mixed | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 236 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 257 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 257 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 275 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 290 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 312 | instantiation | mixed | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts | 317 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 81 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 87 | instantiation | mixed | new NeuralQueue(config, this.currentSeed \|\| undefined) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 111 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 117 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 142 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 142 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 231 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 263 | instantiation | mixed | new NeuralQueue(config, this.currentSeed) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 284 | instantiation | mixed | new NeuralQueue(config, this.currentSeed) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 351 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 373 | instantiation | mixed | new Set(newSeeds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 395 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 426 | instantiation | mixed | new Set(data.seeds \|\| []) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts | 432 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 46 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 83 | instantiation | mixed | new RetrievalPracticeQueue(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 86 | instantiation | mixed | new IncrementalLearningQueue(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 89 | instantiation | mixed | new FilterGroupQueue(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 92 | instantiation | mixed | new FinalDrillQueue(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 95 | instantiation | mixed | new NeuralRoamQueue(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts | 98 | instantiation | mixed | new QueueError(`Unknown queue type: ${type}`) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 67 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 98 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 106 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 135 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 135 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 261 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 262 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 287 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 287 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 287 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 288 | instantiation | mixed | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 288 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 315 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 315 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 350 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 388 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 416 | instantiation | mixed | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts | 421 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts | 322 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts | 347 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts | 382 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts | 388 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts | 216 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts | 237 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts | 323 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts | 328 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts | 79 | instantiation | mixed | new RetrievalPracticeProvider({
        storage: this.deps.storage,
        sc |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts | 83 | instantiation | mixed | new RetrievalPracticeAdapter({ i18n: this.deps.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts | 117 | instantiation | mixed | new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Numb |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts | 180 | instantiation | mixed | new NeuralRoamQueue({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts | 186 | instantiation | mixed | new NeuralRoamAdapter({ i18n: this.deps.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\MenuService.ts | 48 | instantiation | mixed | new Menu('fsrs-topbar-menu') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts | 24 | instantiation | mixed | new DialogService(plugin) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts | 25 | instantiation | mixed | new MenuService(plugin) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts | 26 | instantiation | mixed | new ReviewService(plugin) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts | 27 | instantiation | mixed | new CardService(plugin) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts | 30 | instantiation | mixed | new PluginUIAssembler(
      this.plugin,
      this.reviewService,
      thi |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 186 | instantiation | mixed | new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Numb |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 196 | instantiation | mixed | new LeechAdapter({ i18n: this.deps.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 290 | instantiation | mixed | new NeuralRoamQueue({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 300 | instantiation | mixed | new NeuralRoamAdapter({ i18n: this.deps.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 314 | instantiation | mixed | new Set((blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 323 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID, storag |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 324 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.deps.i18n \|\| {}, label: title, queueNam |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 334 | instantiation | mixed | new Set((cards \|\| []).map((c) => String(c?.blockID \|\| c?.blockId \|\| '')).f |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 349 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID, storag |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts | 350 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.deps.i18n \|\| {}, label: title, queueNam |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 92 | instantiation | mixed | new RetrievalPracticeProvider({
        storage: this.plugin.storage,
         |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 96 | instantiation | mixed | new RetrievalPracticeAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 141 | instantiation | mixed | new LeechQueue({
        deckID: riff.BUILTIN_DECK_ID,
        threshold: Numb |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 156 | instantiation | mixed | new LeechAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 190 | instantiation | mixed | new ProviderFinalDrillProvider({
        queue: this.plugin.finalDrillQueue as  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 196 | instantiation | mixed | new FinalDrillAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 251 | instantiation | mixed | new RetrievalPracticeAdapter({
        i18n: this.plugin.i18n \|\| {},
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 298 | instantiation | mixed | new SubsetPracticeAdapter({
        i18n: this.plugin.i18n \|\| {},
        la |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 345 | instantiation | mixed | new LeechAdapter({
        i18n: this.plugin.i18n \|\| {}
      }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 393 | instantiation | mixed | new NeuralRoamQueue({
        deckID: riff.BUILTIN_DECK_ID,
        i18n: this |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 399 | instantiation | mixed | new NeuralRoamAdapter({ i18n: this.plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 437 | instantiation | mixed | new Set((blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 442 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 444 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.plugin.i18n \|\| {}, label: title, queueN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 474 | instantiation | mixed | new Set((cards \|\| []).map((c) => String(c?.blockID \|\| c?.blockId \|\| '')).f |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 488 | instantiation | mixed | new SubsetPracticeStrategy({ blockIds: ids, deckID: riff.BUILTIN_DECK_ID }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts | 489 | instantiation | mixed | new SubsetPracticeAdapter({ i18n: this.plugin.i18n \|\| {}, label: title, queueN |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\RiffCleanupService.ts | 90 | instantiation | mixed | new Set(localCards.map(card => card.id)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\createUnifiedReviewDialog.ts | 62 | instantiation | mixed | new UnifiedQueueStrategy(queueType) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\createUnifiedReviewDialog.ts | 65 | instantiation | mixed | new UnifiedReviewAdapter() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 173 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 181 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 188 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 269 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 281 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 286 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 293 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 293 | type-annotation | mixed | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 305 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 347 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 347 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 352 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 352 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 382 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts | 518 | type-annotation | mixed | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 37 | instantiation | mixed | new Set<OnCacheUpdate>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 93 | instantiation | mixed | new Set(cards.map(c => c.blockId)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 122 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 161 | instantiation | mixed | new CardCacheManager() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 172 | instantiation | mixed | new Set(tags) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 303 | instantiation | mixed | new Set(states) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 321 | instantiation | mixed | new Date(Date.UTC(y, m, d, h, min, s)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 325 | instantiation | mixed | new Date(timeStr) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 343 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 413 | instantiation | mixed | new Set(parsed.decks) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 418 | instantiation | mixed | new Set(parsed.states) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 423 | instantiation | mixed | new Set(parsed.docs) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 485 | instantiation | mixed | new Map<string, Record<string, string>>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 486 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 487 | instantiation | mixed | new Map<string, string[]>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 581 | instantiation | mixed | new Promise<BrowserCard[]>((resolve) => {
                    resolveFn = resol |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 643 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 644 | instantiation | mixed | new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 749 | instantiation | mixed | new Set((rootIds \|\| []).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 768 | instantiation | mixed | new Set((blockIds \|\| []).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 776 | instantiation | mixed | new Map(cachedCards.map(c => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 786 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 807 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 826 | instantiation | mixed | new Date(Date.now() + (value as number) * 24 * 60 * 60 * 1000) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 831 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 832 | instantiation | mixed | new Set((blockIds \|\| []).map(x => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts | 863 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardActions.ts | 77 | instantiation | mixed | new Promise<boolean>((resolve) => {
      const dialog = document.createElement |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardData.ts | 60 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts | 20 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts | 50 | instantiation | mixed | new Set(data.blockIds \|\| []) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts | 126 | instantiation | mixed | new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('D |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts | 127 | instantiation | mixed | new Error('Detection timeout after 30s') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts | 162 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, remainingTime)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts | 138 | instantiation | mixed | new Menu('card-browser-context') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts | 331 | instantiation | mixed | new Menu('card-browser-batch') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts | 453 | instantiation | mixed | new Promise((resolve) => {
      const dlg = createVueDialog({
        title:  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\usePreviewPanel.ts | 101 | instantiation | mixed | new Protyle(props.app, previewBodyRef.value, {
        blockId: blockId,
      |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useSorting.ts | 157 | instantiation | mixed | new Map(
      currentItems.map((item: any) => [String(item.blockID \|\| ''), i |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\DeckDataSource.ts | 66 | instantiation | mixed | new Date(Date.UTC(y, m, d, h, min, s)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\DeckDataSource.ts | 68 | instantiation | mixed | new Date(timeStr) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts | 66 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts | 100 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts | 101 | instantiation | mixed | new Date(now.getFullYear(), now.getMonth(), now.getDate()) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts | 106 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts | 108 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts | 73 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts | 106 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts | 107 | instantiation | mixed | new Date(now.getFullYear(), now.getMonth(), now.getDate()) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts | 112 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts | 114 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts | 79 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts | 112 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts | 113 | instantiation | mixed | new Date(now.getFullYear(), now.getMonth(), now.getDate()) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts | 118 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts | 120 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 241 | instantiation | mixed | new RemoveCommand<any>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 271 | instantiation | mixed | new InsertAtCommand<any>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 303 | instantiation | mixed | new SetPriorityCommand<any>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 327 | instantiation | mixed | new AutoSortCommand() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 374 | instantiation | mixed | new RescheduleService(plugin.storage) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 392 | instantiation | mixed | new Date(Date.UTC(y, m, d, h, min, s)) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts | 394 | instantiation | mixed | new Date(timeStr) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\QueryDataSource.ts | 32 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\QueryDataSource.ts | 87 | instantiation | mixed | new Map(joined.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts | 76 | instantiation | mixed | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts | 109 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts | 110 | instantiation | mixed | new Date(now.getFullYear(), now.getMonth(), now.getDate()) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts | 115 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts | 117 | instantiation | mixed | new Date(c.due) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserQueueView.ts | 151 | instantiation | mixed | new Error('No queue type selected') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\types.ts | 152 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 49 | instantiation | mixed | new FinalDrillDataSource(plugin, {
        docId,
        preset,
        que |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 57 | instantiation | mixed | new RetrievalDataSource(plugin, {
        docId,
        preset,
        quer |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 65 | instantiation | mixed | new FilterGroupDataSource(plugin, {
        docId,
        preset,
        qu |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 73 | instantiation | mixed | new IncrementalLearningDataSource(plugin, {
        docId,
        preset,
   |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 98 | instantiation | mixed | new BlockIdsDataSource({
    id: queueId,
    label: queueId,
    blockIds,
 |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 122 | instantiation | mixed | new DeckDataSource(plugin, {
    preset,
    currentDocId: docId \|\| currentD |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 137 | instantiation | mixed | new QueryDataSource(sqlStmt) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 159 | instantiation | mixed | new FinalDrillDataSource(plugin, {
      preset,
      queryText,
      cardT |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 167 | instantiation | mixed | new RetrievalDataSource(plugin, {
      preset,
      queryText,
      cardTy |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 175 | instantiation | mixed | new FilterGroupDataSource(plugin, {
      preset,
      queryText,
      card |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 184 | instantiation | mixed | new IncrementalLearningDataSource(plugin, {
      preset,
      queryText,
   |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts | 200 | instantiation | mixed | new DeckDataSource(plugin, {
      preset,
      currentDocId: undefined,  //  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\formatters.ts | 51 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\formatters.ts | 195 | instantiation | mixed | new RegExp(`(${escapeRegex(keyword)})`, 'gi') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts | 19 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts | 26 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts | 126 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts | 288 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\validators.ts | 52 | instantiation | mixed | new Date(date) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\validators.ts | 281 | instantiation | mixed | new URL(url) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\TopBar.ts | 83 | instantiation | mixed | new Menu('fsrs-topbar-menu') |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\IncrementalLearningProvider.ts | 32 | instantiation | mixed | new IncrementalLearningQueue({
            deckID: this.deckId,
        }) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts | 56 | instantiation | mixed | new SessionManager<BrowserCard>({
      getDueMs: (card) => {
        // 使用 du |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts | 82 | instantiation | mixed | new RetrievalPracticeProvider(queue, {
      deckId: options?.deckId,
      st |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts | 215 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts | 221 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\utils\SessionManager.ts | 67 | instantiation | mixed | new SortedSequencer<TCard>({
      getDueMs: options.getDueMs,
      getPriori |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 50 | instantiation | mixed | new Dialog({
        title: options.hideTitle ? undefined : options.title,  //  |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 134 | instantiation | mixed | new MouseEvent('click', {
                        bubbles: false,  // 关键修改：不冒泡， |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 183 | instantiation | mixed | new Promise((resolve) => {
        const dialog = new Dialog({
            tit |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 184 | instantiation | mixed | new Dialog({
            title: options.title,
            content: `
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 221 | instantiation | mixed | new Promise((resolve) => {
        const inputId = `fsrs-input-${Date.now()}`; |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts | 224 | instantiation | mixed | new Dialog({
            title: options.title,
            content: `
        |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\errorReporter.ts | 137 | instantiation | mixed | new ConsoleErrorReporter() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\logger.ts | 121 | instantiation | mixed | new TaggedLogger(this, tag) |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\logger.ts | 164 | instantiation | mixed | new Logger() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\performance.ts | 6 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\performance.ts | 69 | instantiation | mixed | new Map() |

## 接口验证结果

### 错误

- **BaseReviewQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts:29)
- **BaseReviewQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts:29)
- **BaseReviewQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts:39)
- **BaseReviewQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts:39)
- **FilterGroupQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts:40)
- **FilterGroupQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts:40)
- **FilterGroupQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts:39)
- **FilterGroupQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts:39)
- **FilterGroupQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts:121)
- **FinalDrillQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts:52)
- **FinalDrillQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts:52)
- **FinalDrillQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts:39)
- **FinalDrillQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts:39)
- **IncrementalLearningQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts:40)
- **IncrementalLearningQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts:40)
- **IncrementalLearningQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts:39)
- **IncrementalLearningQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts:39)
- **IncrementalLearningQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts:118)
- **NeuralRoamQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts:51)
- **NeuralRoamQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts:51)
- **NeuralRoamQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts:39)
- **NeuralRoamQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts:39)
- **NeuralRoamQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts:142)
- **RetrievalPracticeQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts:40)
- **RetrievalPracticeQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts:40)
- **RetrievalPracticeQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts:39)
- **RetrievalPracticeQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts:39)
- **RetrievalPracticeQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts:135)

### 警告

- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for getCards
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for addCard
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for removeCard
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for handleReview
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for isDynamic

## 迁移计划

### 步骤 1: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 2: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 3: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 4: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 5: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 6: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 7: Migrate UnifiedDataSourceManager

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 8: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 9: Migrate QueueFactory

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 10: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 11: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 12: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 13: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 14: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 15: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 16: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 17: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 18: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 19: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 20: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 21: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 22: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 23: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 24: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 25: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 26: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 27: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 28: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 29: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 30: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 31: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 32: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 33: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 34: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 35: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 36: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 37: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 38: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 39: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 40: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 41: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 42: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 43: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 44: Migrate ReviewViewController

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 45: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 46: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 47: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 48: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 49: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 50: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 51: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 52: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 53: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 54: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 55: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 56: Migrate ReviewViewController.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 57: Migrate ReviewViewController.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 58: Migrate ReviewViewController.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 59: Migrate ReviewViewController.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\controllers\ReviewViewController.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 60: Migrate UnifiedDataSourceManager.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 61: Migrate UnifiedDataSourceManager.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 62: Migrate UnifiedDataSourceManager.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 63: Migrate UnifiedDataSourceManager.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 64: Migrate UnifiedDataSourceManager.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UnifiedDataSourceManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 65: Migrate AdvancedDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 66: Migrate AdvancedDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 67: Migrate AdvancedDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 68: Migrate AdvancedDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 69: Migrate AdvancedDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\AdvancedDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 70: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 71: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 72: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 73: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 74: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 75: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 76: Migrate SimpleDataRouter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\routers\SimpleDataRouter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 77: Migrate card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 78: Migrate card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 79: Migrate SRSBrowserAdapter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 80: Migrate ReviewViewAdapter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 81: Migrate ReviewViewAdapter.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\ReviewViewAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 82: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 83: Migrate TopicScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 84: Migrate ProgressiveLearningQueue

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 85: Migrate ProgressiveLearningQueue

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 86: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 87: Migrate ExtractionPracticeQueue

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 88: Migrate Proxy

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 89: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 90: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 91: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 92: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 93: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 94: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 95: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 96: Migrate HistoryFilter

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 97: Migrate QueryEngine

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 98: Migrate WeightedWalkEngine

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 99: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 100: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 101: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 102: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 103: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 104: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 105: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GraphSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 106: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 107: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 108: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 109: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 110: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 111: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 112: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\PrioritySequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 113: Migrate GroupDataSource

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 114: Migrate GroupSequencer

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 115: Migrate NullScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 116: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 117: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 118: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 119: Migrate StorageFileJsonAdapter

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 120: Migrate FinalDrillSequencer

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 121: Migrate ConditionalScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 122: Migrate NullScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 123: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 124: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 125: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 126: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 127: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 128: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 129: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 130: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 131: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 132: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 133: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 134: Migrate SchedulerSortingStrategy

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 135: Migrate RiffScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 136: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 137: Migrate Set

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 138: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 139: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 140: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 141: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 142: Migrate QueryEngine

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 143: Migrate WeightedWalkEngine

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 144: Migrate GraphSequencer

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 145: Migrate GraphDataSource

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 146: Migrate NullScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 147: Migrate GraphSequencer

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 148: Migrate Map

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 149: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 150: Migrate Error

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 151: Migrate RiffDataSource

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 152: Migrate StorageDataSource

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 153: Migrate RetrievalHybridDataSource

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 154: Migrate SchedulerSortingStrategy

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 155: Migrate SortedSequencer

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 156: Migrate RiffScheduler

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 157: Migrate RetrievalPracticeQueue

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 158: Migrate Date

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 159: Migrate FinalDrillV2Session

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 160: Migrate StorageFileJsonAdapter

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 161: Migrate test-topic-item.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 162: Migrate test-topic-item.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\test-topic-item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 163: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 164: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 165: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 166: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 167: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 168: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 169: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 170: Migrate FSRSRetrievalProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 171: Migrate BaseCompositeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 172: Migrate BaseCompositeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 173: Migrate BaseCompositeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 174: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 175: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 176: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 177: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 178: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 179: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 180: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 181: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 182: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 183: Migrate HybridDataSource.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\HybridDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 184: Migrate LoggableQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\logging\LoggableQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 185: Migrate NeuralQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 186: Migrate NeuralQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 187: Migrate NeuralQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 188: Migrate NeuralQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 189: Migrate NeuralQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 190: Migrate DualQueueSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DualQueueSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 191: Migrate DualQueueSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DualQueueSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 192: Migrate DynamicDrawSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DynamicDrawSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 193: Migrate DynamicDrawSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\DynamicDrawSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 194: Migrate FinalDrillSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FinalDrillSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 195: Migrate FSRSSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 196: Migrate FSRSSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 197: Migrate GraphSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GraphSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 198: Migrate GroupSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GroupSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 199: Migrate GroupSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\GroupSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 200: Migrate ListSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 201: Migrate PrioritySequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\PrioritySequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 202: Migrate SortedSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\SortedSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 203: Migrate SortedSequencer.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\SortedSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 204: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 205: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 206: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 207: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 208: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 209: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 210: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 211: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 212: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 213: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 214: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 215: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 216: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 217: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 218: Migrate FilterGroupQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 219: Migrate FinalDrillQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 220: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 221: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 222: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 223: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 224: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 225: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 226: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 227: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 228: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 229: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 230: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 231: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 232: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 233: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 234: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 235: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 236: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 237: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 238: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 239: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 240: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 241: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 242: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 243: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 244: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 245: Migrate IncrementalLearningQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 246: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 247: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 248: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 249: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 250: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 251: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 252: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 253: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 254: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 255: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 256: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 257: Migrate NeuralRoamQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 258: Migrate QueueMigrationManager.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 259: Migrate QueueMigrationManager.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 260: Migrate QueueMigrationManager.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 261: Migrate QueueMigrationManager.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\QueueMigrationManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 262: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 263: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 264: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 265: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 266: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 267: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 268: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 269: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 270: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 271: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 272: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 273: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 274: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 275: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 276: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 277: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 278: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 279: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 280: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 281: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 282: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 283: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 284: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 285: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 286: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 287: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 288: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 289: Migrate RetrievalPracticeQueue.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\strategies\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 290: Migrate types.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\types.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 291: Migrate normalizers.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff\normalizers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 292: Migrate logging.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\logging.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 293: Migrate FinalDrillAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 294: Migrate FinalDrillAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 295: Migrate FinalDrillAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\FinalDrillAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 296: Migrate NeuralRoamAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 297: Migrate NeuralRoamAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 298: Migrate NeuralRoamAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\NeuralRoamAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 299: Migrate RetrievalPracticeAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 300: Migrate RetrievalPracticeAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 301: Migrate RetrievalPracticeAdapter.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\adapters\RetrievalPracticeAdapter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 302: Migrate FinalDrillProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 303: Migrate FinalDrillProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 304: Migrate FinalDrillProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 305: Migrate FinalDrillProvider.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\FinalDrillProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 306: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 307: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 308: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 309: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 310: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 311: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 312: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 313: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 314: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 315: Migrate FinalDrillV2Session.ts

**预计时间**: 1-2 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\sessions\FinalDrillV2Session.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 316: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 317: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 318: Migrate ExtractionPracticeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 319: Migrate DeliberatePracticeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 320: Migrate NeuralWanderingQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 321: Migrate NeuralWanderingQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 322: Migrate FilterGroupQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 323: Migrate QueueContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 324: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 325: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 326: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 327: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 328: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 329: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 330: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 331: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 332: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 333: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 334: Migrate LocalStorageDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 335: Migrate RiffDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 336: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 337: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 338: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 339: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 340: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 341: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 342: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 343: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 344: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 345: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 346: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 347: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 348: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 349: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 350: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 351: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 352: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 353: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 354: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 355: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 356: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 357: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 358: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 359: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 360: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 361: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 362: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 363: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 364: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 365: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 366: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 367: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 368: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 369: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 370: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 371: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 372: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 373: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 374: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 375: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 376: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 377: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 378: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 379: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 380: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 381: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 382: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 383: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 384: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 385: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 386: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 387: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 388: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 389: Migrate StorageManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 390: Migrate RescheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 391: Migrate SchedulerRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 392: Migrate QueueContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 393: Migrate ConsoleQueueMonitor

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 394: Migrate FilterGroupQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 395: Migrate StorageFileJsonAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 396: Migrate FinalDrillQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 397: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 398: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 399: Migrate IncrementalLearningQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 400: Migrate SimpleDataRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 401: Migrate AdvancedDataRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 402: Migrate DialogService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 403: Migrate MenuService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 404: Migrate ReviewDialogManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 405: Migrate BlockMenuHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 406: Migrate XiuyuanStorage

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 407: Migrate XiuyuanService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 408: Migrate TransactionObserver

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 409: Migrate HybridSyncService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 410: Migrate FinalDrillProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 411: Migrate FinalDrillAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 412: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 413: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 414: Migrate RetrievalPracticeProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 415: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 416: Migrate FinalDrillAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 417: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 418: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 419: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 420: Migrate HybridSyncService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 421: Migrate HybridSyncService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 422: Migrate StorageManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 423: Migrate RescheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 424: Migrate SchedulerRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 425: Migrate QueueContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 426: Migrate ConsoleQueueMonitor

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 427: Migrate FilterGroupQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 428: Migrate StorageFileJsonAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 429: Migrate FinalDrillQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 430: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 431: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 432: Migrate IncrementalLearningQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 433: Migrate DialogService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 434: Migrate MenuService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 435: Migrate CardBuilderContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 436: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 437: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 438: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 439: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 440: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 441: Migrate QABuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 442: Migrate ClozeBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 443: Migrate DefaultBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 444: Migrate DefaultBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 445: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 446: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 447: Migrate SimpleFSRSScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 448: Migrate SM2Scheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 449: Migrate SM15Scheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 450: Migrate TopicScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 451: Migrate ImprovedTopicScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 452: Migrate RiffSchedulerAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 453: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 454: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 455: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 456: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 457: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 458: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 459: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 460: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 461: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 462: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 463: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 464: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 465: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 466: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 467: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 468: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 469: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 470: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 471: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 472: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 473: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 474: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 475: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 476: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 477: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 478: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 479: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 480: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 481: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 482: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 483: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 484: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 485: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 486: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 487: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 488: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 489: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 490: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 491: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 492: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 493: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 494: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts
- @/core/storage/manager
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/types
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 495: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts
- @/core/storage/manager
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/types
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 496: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts
- @/core/storage/manager
- @/types
- @/core/siyuan/riff
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 497: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts
- @/core/storage/manager
- @/types
- @/core/siyuan/riff
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 498: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts
- @/core/storage/manager
- @/types
- @/core/siyuan/riff
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 499: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts
- @/core/storage/manager
- @/types
- @/core/siyuan/riff
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 500: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 501: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 502: Migrate Setting

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 503: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 504: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 505: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 506: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 507: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 508: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 509: Migrate CardBuilderContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 510: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\detectCardType.ts
- @/core/siyuan/block
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 511: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\extractCardMeta.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 512: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 513: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 514: Migrate MouseEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 515: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 516: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 517: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 518: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 519: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\abstraction\Command.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 520: Migrate TextEncoder

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 521: Migrate TextDecoder

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 522: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 523: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 524: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 525: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 526: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 527: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 528: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 529: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 530: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 531: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 532: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 533: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 534: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 535: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 536: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 537: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 538: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 539: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 540: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 541: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 542: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 543: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 544: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 545: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 546: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 547: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 548: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 549: Migrate BaseCompositeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 550: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 551: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 552: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 553: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 554: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 555: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 556: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 557: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 558: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 559: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 560: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 561: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 562: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 563: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\deprecation.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 564: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\HistoryFilter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 565: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\HistoryFilter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 566: Migrate ConfigValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\NeuralQueueConfig.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 567: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\neural\QueryEngine.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 568: Migrate AsyncMutex

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 569: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 570: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\QueueContext.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 571: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\schedulers\CompositeScheduler.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 572: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 573: Migrate QueueStateManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 574: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 575: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sync\QueueStateManager.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 576: Migrate SM2Scheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 577: Migrate ImprovedTopicScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 578: Migrate SimpleFSRSScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 579: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 580: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 581: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 582: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 583: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 584: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 585: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 586: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\rescheduleService.ts
- @/core/siyuan
- @/core/siyuan/api
- @/core/storage
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 587: Migrate FI_G

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\FI_G.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 588: Migrate ForgettingCurve

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\ForgettingCurves.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 589: Migrate ForgettingCurves

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\ForgettingCurves.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 590: Migrate FI_G

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 591: Migrate ForgettingCurves

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 592: Migrate RFM

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 593: Migrate OFM

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 594: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 595: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 596: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 597: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 598: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 599: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 600: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 601: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 602: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 603: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 604: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 605: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 606: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 607: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 608: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 609: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 610: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 611: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 612: Migrate FormData

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 613: Migrate Blob

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 614: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 615: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 616: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\siyuan\riff.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 617: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 618: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 619: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 620: Migrate FormData

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 621: Migrate Blob

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 622: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\storage.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 623: Migrate SafetyAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 624: Migrate PriorityCalculator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 625: Migrate DependencyAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 626: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 627: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 628: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 629: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 630: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 631: Migrate ArchitectureScanner

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 632: Migrate InterfaceValidator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 633: Migrate MigrationAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 634: Migrate ReportGenerator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 635: Migrate ApiCompatibilityChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 636: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\reporters\ReportGenerator.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 637: Migrate ImportAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 638: Migrate TypeUsageAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 639: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 640: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 641: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 642: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\scanners\ImportAnalyzer.ts
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 643: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 644: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 645: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 646: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 647: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 648: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 649: Migrate RuntimeTypeValidator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 650: Migrate RuntimeTypeValidator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 651: Migrate TypeMismatchError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 652: Migrate TypeMismatchError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 653: Migrate TypeMismatchError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 654: Migrate TypeMismatchError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 655: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 656: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 657: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 658: Migrate MethodChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\InterfaceValidator.ts
- typescript
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 659: Migrate TypeChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\validators\InterfaceValidator.ts
- typescript
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 660: Migrate ModeError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 661: Migrate QueueError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 662: Migrate SyncError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 663: Migrate StorageError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 664: Migrate NetworkError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 665: Migrate StorageError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 666: Migrate NetworkError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 667: Migrate DataSourceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\errors\DataSourceErrors.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 668: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 669: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 670: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 671: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 672: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 673: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 674: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\handlers\BlockEventHandler.ts
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/ui/review/v2
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/core/siyuan/block
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 675: Migrate RetrievalPracticeProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 676: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 677: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 678: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 679: Migrate FinalDrillProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 680: Migrate FinalDrillAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 681: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 682: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 683: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 684: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 685: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 686: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 687: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 688: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 689: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 690: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 691: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\UIManager.ts
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/application/PluginAssembler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 692: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 693: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 694: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 695: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 696: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 697: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 698: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 699: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 700: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 701: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 702: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 703: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 704: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 705: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 706: Migrate NeuralQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 707: Migrate NeuralQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 708: Migrate NeuralQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 709: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 710: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 711: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 712: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 713: Migrate RetrievalPracticeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 714: Migrate IncrementalLearningQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 715: Migrate FilterGroupQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 716: Migrate FinalDrillQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 717: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 718: Migrate QueueError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\QueueFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 719: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 720: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 721: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 722: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 723: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 724: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts
- siyuan
- @/core/storage
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/types
- @/core/queue
- @/core/queue/types
- @/ui/srs/SrsEditorDialog.vue
- @/core/xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 725: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts
- siyuan
- @/core/storage
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/types
- @/core/queue
- @/core/queue/types
- @/ui/srs/SrsEditorDialog.vue
- @/core/xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 726: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts
- siyuan
- @/core/storage
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/types
- @/core/queue
- @/core/queue/types
- @/ui/srs/SrsEditorDialog.vue
- @/core/xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 727: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\BlockMenuHandler.ts
- siyuan
- @/core/storage
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/types
- @/core/queue
- @/core/queue/types
- @/ui/srs/SrsEditorDialog.vue
- @/core/xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 728: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts
- @/core/siyuan/api
- @/utils/dialog
- @/ui/srs/SrsEditorDialog.vue
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 729: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts
- @/core/siyuan/api
- @/utils/dialog
- @/ui/srs/SrsEditorDialog.vue
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 730: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts
- @/core/siyuan/api
- @/utils/dialog
- @/ui/srs/SrsEditorDialog.vue
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 731: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\CardService.ts
- @/core/siyuan/api
- @/utils/dialog
- @/ui/srs/SrsEditorDialog.vue
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 732: Migrate RetrievalPracticeProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts
- siyuan
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/storage/manager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 733: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts
- siyuan
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/storage/manager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 734: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts
- siyuan
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/storage/manager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 735: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts
- siyuan
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/storage/manager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 736: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\DialogService.ts
- siyuan
- @/core/siyuan/riff
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/storage/manager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 737: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\MenuService.ts
- siyuan
- @/core/storage/manager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 738: Migrate DialogService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 739: Migrate MenuService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 740: Migrate ReviewService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 741: Migrate CardService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 742: Migrate PluginUIAssembler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\PluginService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 743: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 744: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 745: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 746: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 747: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 748: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 749: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 750: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 751: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 752: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewDialogManager.ts
- siyuan
- @/core/storage
- @/core/scheduler
- @/core/siyuan
- @/core/siyuan/api
- @/utils/dialog
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/core/queue/strategies
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 753: Migrate RetrievalPracticeProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 754: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 755: Migrate LeechQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 756: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 757: Migrate ProviderFinalDrillProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 758: Migrate FinalDrillAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 759: Migrate RetrievalPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 760: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 761: Migrate LeechAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 762: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 763: Migrate NeuralRoamAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 764: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 765: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 766: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 767: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 768: Migrate SubsetPracticeStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 769: Migrate SubsetPracticeAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\ReviewService.ts
- @/core/siyuan/api
- @/utils/dialog
- siyuan
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/review/v2/providers/FinalDrillProvider
- @/core/queue/strategies
- @/core/siyuan
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/FinalDrillQueue
- @/strategies/createUnifiedReviewDialog
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 770: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\RiffCleanupService.ts
- @/core/storage/manager
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 771: Migrate UnifiedQueueStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\createUnifiedReviewDialog.ts
- @/utils/dialog
- @/ui/review/v2/ReviewView.vue
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 772: Migrate UnifiedReviewAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\createUnifiedReviewDialog.ts
- @/utils/dialog
- @/ui/review/v2/ReviewView.vue
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 773: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 774: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 775: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 776: Migrate CardCacheManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 777: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 778: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 779: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 780: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 781: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 782: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 783: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 784: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 785: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 786: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 787: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 788: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 789: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 790: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 791: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 792: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 793: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 794: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 795: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 796: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 797: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 798: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 799: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\browserService.ts
- @/core/siyuan
- @/utils/performance
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 800: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardActions.ts
- vue
- @/core/siyuan/api
- @/core/siyuan/block
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 801: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardData.ts
- vue
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 802: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 803: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 804: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 805: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 806: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useCardTypeDetection.ts
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 807: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts
- vue
- siyuan
- @/utils/dialog
- @/core/siyuan/api
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 808: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts
- vue
- siyuan
- @/utils/dialog
- @/core/siyuan/api
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 809: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useContextMenu.ts
- vue
- siyuan
- @/utils/dialog
- @/core/siyuan/api
- @/utils/dialog
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 810: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\usePreviewPanel.ts
- vue
- siyuan
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 811: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\composables\useSorting.ts
- vue
- ag-grid-community

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 812: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\DeckDataSource.ts
- @/core/scheduler/rescheduleService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 813: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\DeckDataSource.ts
- @/core/scheduler/rescheduleService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 814: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 815: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 816: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 817: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 818: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FilterGroupDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 819: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 820: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 821: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 822: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 823: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\FinalDrillDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 824: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 825: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 826: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 827: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 828: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\IncrementalLearningDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 829: Migrate RemoveCommand

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 830: Migrate InsertAtCommand

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 831: Migrate SetPriorityCommand

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 832: Migrate AutoSortCommand

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 833: Migrate RescheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 834: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 835: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/storage/StorageManager
- @/core/queue/commands

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 836: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\QueryDataSource.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 837: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\QueryDataSource.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 838: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 839: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 840: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 841: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 842: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\datasource\RetrievalDataSource.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 843: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\SRSBrowserQueueView.ts
- ag-grid-community

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 844: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\types.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 845: Migrate FinalDrillDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 846: Migrate RetrievalDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 847: Migrate FilterGroupDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 848: Migrate IncrementalLearningDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 849: Migrate BlockIdsDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 850: Migrate DeckDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 851: Migrate QueryDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 852: Migrate FinalDrillDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 853: Migrate RetrievalDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 854: Migrate FilterGroupDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 855: Migrate IncrementalLearningDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 856: Migrate DeckDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\dataSourceFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 857: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\formatters.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 858: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\formatters.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 859: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 860: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 861: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 862: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 863: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\validators.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 864: Migrate URL

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\browser\utils\validators.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 865: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\TopBar.ts
- siyuan
- @/index
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 866: Migrate IncrementalLearningQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\IncrementalLearningProvider.ts
- @/core/siyuan/riff
- @/core/extensions
- @/ui/browser/browserService
- @/core/queue/strategies/IncrementalLearningQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 867: Migrate SessionManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts
- @/core/extensions
- @/ui/browser/browserService
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/storage/StorageManager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 868: Migrate RetrievalPracticeProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts
- @/core/extensions
- @/ui/browser/browserService
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/storage/StorageManager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 869: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts
- @/core/extensions
- @/ui/browser/browserService
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/storage/StorageManager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 870: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\RetrievalPracticeProvider.ts
- @/core/extensions
- @/ui/browser/browserService
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/storage/StorageManager
- @/core/scheduler/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 871: Migrate SortedSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\review\v2\providers\utils\SessionManager.ts
- @/core/queue/sequencers/SortedSequencer

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 872: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 873: Migrate MouseEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 874: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 875: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 876: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 877: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\dialog.ts
- siyuan
- vue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 878: Migrate ConsoleErrorReporter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\errorReporter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 879: Migrate TaggedLogger

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\logger.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 880: Migrate Logger

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\logger.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 881: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\performance.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 882: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\utils\performance.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 883: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 884: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 885: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 886: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 887: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 888: Migrate unit-test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\scripts\unit-test.ts
- node:fs
- node:path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 889: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 890: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 891: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 892: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 893: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 894: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 895: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/core/queue/strategies/FilterGroupQueue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 896: Migrate BaseCompositeQueue.getAllCards.test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 897: Migrate BaseCompositeQueue.getAllCards.test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 898: Migrate BaseCompositeQueue.getAllCards.test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\composite\BaseCompositeQueue.getAllCards.test.ts
- vitest
- fast-check

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 899: Migrate DataSourceFactory.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DataSourceFactory.ts
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 900: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 901: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 902: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 903: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 904: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 905: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 906: Migrate DualQueueDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\DualQueueDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 907: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 908: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 909: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 910: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 911: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 912: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 913: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 914: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 915: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 916: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 917: Migrate GroupDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\GroupDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 918: Migrate IDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 919: Migrate IDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 920: Migrate IDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 921: Migrate IDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\IDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 922: Migrate ObservableDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\ObservableDataSource.ts
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 923: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 924: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 925: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 926: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 927: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 928: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 929: Migrate StorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\StorageDataSource.ts
- @/types/card
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 930: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 931: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 932: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 933: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 934: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 935: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 936: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 937: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 938: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 939: Migrate FSRSSequencer.test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 940: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 941: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 942: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 943: Migrate index.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 944: Migrate index.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 945: Migrate index.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\index.ts
- @/utils/disableLogs
- siyuan
- electron
- vue
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan/api
- @/ui/review/v2
- @/ui/review/v2/providers/RetrievalPracticeProvider
- @/ui/browser/SRSBrowser.vue
- @/ui/settings
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/types
- @/index.scss
- @/core/xiuyuan
- @/ui/xiuyuan
- @/core/queue
- @/core/queue/strategies
- @/core/box/TransactionObserver
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/core/native/adapter
- @/services
- @/core/native/session
- @/utils/configMigrator
- @/managers/UnifiedDataSourceManager
- @/routers/SimpleDataRouter
- @/routers/AdvancedDataRouter
- @/scripts/migrateToTopicItem

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 946: Migrate LifecycleManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\managers\LifecycleManager.ts
- @/core/storage
- @/core/scheduler
- @/core/scheduler/rescheduleService
- @/core/siyuan
- @/core/queue
- @/core/queue/monitors
- @/core/queue/strategies/RetrievalPracticeQueue
- @/core/queue/strategies/FilterGroupQueue
- @/core/queue/strategies/FinalDrillQueue
- @/core/queue/strategies/NeuralRoamQueue
- @/core/queue/strategies/LeechQueue
- @/core/queue/strategies/IncrementalLearningQueue
- @/core/queue/neural
- @/services
- @/scripts/migrateToTopicItem
- @/core/siyuan/api

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 947: Migrate QueueHelpers.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\QueueHelpers.ts
- @/core/siyuan/block
- @/core/siyuan/api
- @/core/queue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 948: Migrate QueueHelpers.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\QueueHelpers.ts
- @/core/siyuan/block
- @/core/siyuan/api
- @/core/queue

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 949: Migrate BlockMenu.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 950: Migrate BlockMenu.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\ui\menu\BlockMenu.ts
- @/index
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/siyuan/riff
- @/core/siyuan
- @/ui/srs/SrsEditorDialog.vue
- @/utils/dialog
- @/core/queue
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 951: Migrate index.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\index.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 952: Migrate ClozeStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\ClozeStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 953: Migrate DefaultStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\DefaultStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 954: Migrate QAStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\strategies\QAStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 955: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\card-builder\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 956: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 957: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 958: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 959: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 960: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 961: Migrate RiffSchedulerAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\adapters\RiffSchedulerAdapter.ts
- @/types
- @/core/siyuan/riff

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 962: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 963: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 964: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 965: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 966: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 967: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 968: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 969: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\SchedulerRouter.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 970: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 971: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 972: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 973: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 974: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 975: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 976: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 977: Migrate FSRSV5.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\FSRSV5.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 978: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 979: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 980: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 981: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 982: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 983: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 984: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 985: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 986: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 987: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 988: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 989: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 990: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 991: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 992: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 993: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 994: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 995: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 996: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 997: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 998: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 999: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1000: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\sm15\migration.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1001: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1002: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1003: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1004: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1005: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1006: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1007: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1008: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1009: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1010: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1011: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1012: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1013: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1014: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1015: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1016: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1017: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1018: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1019: Migrate SM2.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\strategies\SM2.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1020: Migrate TopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts
- @/types
- @/core/queue/abstraction

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1021: Migrate TopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts
- @/types
- @/core/queue/abstraction

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1022: Migrate TopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\TopicScheduler.ts
- @/types
- @/core/queue/abstraction

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1023: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1024: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1025: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1026: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1027: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1028: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1029: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1030: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1031: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1032: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1033: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1034: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1035: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\storage\manager.ts
- @/types
- @/types
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @/core/queue/strategies/QueueMigrationManager
- @msgpack/msgpack

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1036: Migrate service.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\xiuyuan\service.ts
- @/core/storage/manager
- @/core/siyuan/block
- @/core/siyuan/riff
- @/types
- @/types
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1037: Migrate HybridSyncService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\services\HybridSyncService.ts
- @/core/storage/manager
- @/types
- @/core/siyuan/riff
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/block

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1038: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1039: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1040: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1041: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/managers/UnifiedDataSourceManager

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1042: Migrate UnifiedReviewAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\strategies\UnifiedReviewAdapter.ts
- @/ui/review/v2/types
- @/types/card
- @/core/queue/abstraction/Strategy

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1043: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1044: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1045: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1046: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1047: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1048: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1049: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1050: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1051: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1052: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1053: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1054: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1055: Migrate LocalStorageDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\LocalStorageDataSource.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1056: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1057: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1058: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1059: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1060: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1061: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1062: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1063: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1064: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1065: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1066: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1067: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1068: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1069: Migrate RiffDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\queue\datasource\RiffDataSource.ts
- @/types
- @/utils/errorReporter
- @/utils/errorReporter
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1070: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1071: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1072: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1073: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1074: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1075: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1076: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1077: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1078: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1079: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1080: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1081: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1082: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1083: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1084: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1085: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1086: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1087: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1088: Migrate type-guards.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1089: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1090: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1091: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1092: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1093: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1094: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1095: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1096: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1097: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1098: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1099: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1100: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1101: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1102: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1103: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1104: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\BaseReviewQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1105: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1106: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1107: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1108: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1109: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1110: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1111: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1112: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1113: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1114: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1115: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1116: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1117: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FilterGroupQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1118: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1119: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1120: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1121: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1122: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\FinalDrillQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1123: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1124: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1125: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1126: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1127: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1128: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1129: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1130: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1131: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1132: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1133: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1134: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1135: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\IncrementalLearningQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1136: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1137: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1138: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1139: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1140: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1141: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1142: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\NeuralRoamQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1143: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1144: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1145: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1146: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1147: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1148: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1149: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1150: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1151: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1152: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1153: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1154: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1155: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\queues\RetrievalPracticeQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1156: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1157: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1158: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1159: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1160: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1161: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1162: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1163: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1164: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1165: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1166: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1167: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1168: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1169: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1170: Migrate unified-data-source.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-fsrs\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

## 建议

- 优先处理混合使用的文件，避免类型混用导致运行时错误
- 修复接口验证错误，确保所有队列实现 IReviewQueue
- 从高优先级迁移项开始逐步迁移到新架构
- 保留临时队列，待迁移窗口关闭后再逐步移除
