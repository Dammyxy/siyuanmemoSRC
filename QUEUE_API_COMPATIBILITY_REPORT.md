# 队列 API 兼容性报告

**兼容状态**: ❌ 存在破坏性变更

## 摘要

| 指标 | 数量 |
|------|------|
| 对比类数量 | 5 |
| 对比方法数量 | 43 |
| 破坏性变更 | 43 |
| 警告 | 42 |

## 兼容性问题

| 严重性 | 类 | 方法 | 问题 | 旧签名 | 新签名 |
|------|------|------|------|--------|--------|
| error | FilterGroupQueue | init | Missing method in new architecture | init() => Promise<void> | - |
| error | FilterGroupQueue | onFeedback | Missing method in new architecture | onFeedback(QueueItem | null, QueueFeedback) => Promise<void> | - |
| error | FilterGroupQueue | getStats | Missing method in new architecture | getStats() => Promise<QueueStats> | - |
| error | FilterGroupQueue | getAllItems | Missing method in new architecture | getAllItems() => QueueItem[] | - |
| error | FilterGroupQueue | addItems | Missing method in new architecture | addItems(QueueItem[]) => Promise<number> | - |
| error | FilterGroupQueue | reorder | Missing method in new architecture | reorder(QueueItem[]) => Promise<boolean> | - |
| warning | FilterGroupQueue | isDynamic | New method added (non-breaking) | - | isDynamic() => boolean |
| warning | FilterGroupQueue | getCards | New method added (non-breaking) | - | getCards() => Promise<FSRSCard[]> |
| warning | FilterGroupQueue | addCard | New method added (non-breaking) | - | addCard(FSRSCard | QueueItem | string) => Promise<void> |
| warning | FilterGroupQueue | removeCard | New method added (non-breaking) | - | removeCard(string) => Promise<void> |
| warning | FilterGroupQueue | handleReview | New method added (non-breaking) | - | handleReview(string, number) => Promise<void> |
| warning | FilterGroupQueue | setFilter | New method added (non-breaking) | - | setFilter(CardFilter) => void |
| warning | FilterGroupQueue | getFilter | New method added (non-breaking) | - | getFilter() => CardFilter |
| error | FinalDrillQueue | init | Missing method in new architecture | init() => Promise<void> | - |
| error | FinalDrillQueue | onFeedback | Missing method in new architecture | onFeedback(FinalDrillItem | null, any) => Promise<void> | - |
| error | FinalDrillQueue | getStats | Missing method in new architecture | getStats() => Promise<QueueStats> | - |
| error | FinalDrillQueue | getAllItems | Missing method in new architecture | getAllItems() => FinalDrillItem[] | - |
| error | FinalDrillQueue | insertAt | Missing method in new architecture | insertAt(FinalDrillItem[], number) => Promise<void> | - |
| error | FinalDrillQueue | addItems | Missing method in new architecture | addItems(FinalDrillItem[]) => Promise<number> | - |
| error | FinalDrillQueue | removeItems | Missing method in new architecture | removeItems(FinalDrillItem[]) => Promise<number> | - |
| error | FinalDrillQueue | setPriority | Missing method in new architecture | setPriority(string, number) => Promise<boolean> | - |
| error | FinalDrillQueue | sort | Missing method in new architecture | sort() => Promise<void> | - |
| error | FinalDrillQueue | reorder | Method signature changed | reorder(FinalDrillItem[]) => Promise<boolean> | reorder(FSRSCard[]) => Promise<boolean> |
| error | FinalDrillQueue | clear | Missing method in new architecture | clear() => Promise<void> | - |
| error | FinalDrillQueue | getMutableTrait | Missing method in new architecture | getMutableTrait() => IMutableTrait<FinalDrillItem> | - |
| error | FinalDrillQueue | getRemovableTrait | Missing method in new architecture | getRemovableTrait() => IRemovableTrait<FinalDrillItem> | - |
| error | FinalDrillQueue | getPrioritizableTrait | Missing method in new architecture | getPrioritizableTrait() => IPrioritizableTrait<FinalDrillItem> | - |
| error | FinalDrillQueue | getAutoSortableTrait | Missing method in new architecture | getAutoSortableTrait() => IAutoSortableTrait | - |
| warning | FinalDrillQueue | isDynamic | New method added (non-breaking) | - | isDynamic() => boolean |
| warning | FinalDrillQueue | getCards | New method added (non-breaking) | - | getCards() => Promise<FSRSCard[]> |
| warning | FinalDrillQueue | addCard | New method added (non-breaking) | - | addCard(FSRSCard | QueueItem | string, 'manual' | 'auto-failed') => Promise<void> |
| warning | FinalDrillQueue | removeCard | New method added (non-breaking) | - | removeCard(string) => Promise<void> |
| warning | FinalDrillQueue | handleReview | New method added (non-breaking) | - | handleReview(string, number) => Promise<void> |
| warning | FinalDrillQueue | getEntry | New method added (non-breaking) | - | getEntry(string) => FinalDrillEntry | undefined |
| warning | FinalDrillQueue | getAllEntries | New method added (non-breaking) | - | getAllEntries() => FinalDrillEntry[] |
| error | IncrementalLearningQueue | getUIConfig | Missing method in new architecture | getUIConfig(QueueItem | null) => QueueUIConfig | - |
| error | IncrementalLearningQueue | getStats | Missing method in new architecture | getStats() => Promise<QueueStats> | - |
| error | IncrementalLearningQueue | next | Missing method in new architecture | next() => Promise<QueueItem | null> | - |
| error | IncrementalLearningQueue | getPrioritizableTrait | Missing method in new architecture | getPrioritizableTrait() => IPrioritizableTrait<QueueItem> | - |
| error | IncrementalLearningQueue | getMutableTrait | Missing method in new architecture | getMutableTrait() => IMutableTrait<QueueItem> | undefined | - |
| error | IncrementalLearningQueue | getRemovableTrait | Missing method in new architecture | getRemovableTrait() => IMutableTrait<QueueItem> & IRemovableTrait<QueueItem> | undefined | - |
| error | IncrementalLearningQueue | onFeedback | Missing method in new architecture | onFeedback(QueueItem | null, QueueFeedback) => Promise<void> | - |
| error | IncrementalLearningQueue | addItems | Missing method in new architecture | addItems(QueueItem[]) => Promise<number> | - |
| error | IncrementalLearningQueue | getAllCards | Missing method in new architecture | getAllCards() => Promise<QueueItem[]> | - |
| error | IncrementalLearningQueue | getAllItems | Missing method in new architecture | getAllItems() => QueueItem[] | - |
| error | IncrementalLearningQueue | reorder | Missing method in new architecture | reorder(QueueItem[]) => Promise<boolean> | - |
| warning | IncrementalLearningQueue | isDynamic | New method added (non-breaking) | - | isDynamic() => boolean |
| warning | IncrementalLearningQueue | getCards | New method added (non-breaking) | - | getCards() => Promise<FSRSCard[]> |
| warning | IncrementalLearningQueue | addCard | New method added (non-breaking) | - | addCard(FSRSCard | QueueItem | string) => Promise<void> |
| warning | IncrementalLearningQueue | removeCard | New method added (non-breaking) | - | removeCard(string) => Promise<void> |
| warning | IncrementalLearningQueue | handleReview | New method added (non-breaking) | - | handleReview(string, number) => Promise<void> |
| warning | LeechQueue | - | No corresponding class found in new architecture | - | - |
| error | NeuralRoamQueue | getUIConfig | Missing method in new architecture | getUIConfig(QueueItem | null) => QueueUIConfig | - |
| error | NeuralRoamQueue | getStats | Missing method in new architecture | getStats() => Promise<QueueStats> | - |
| warning | NeuralRoamQueue | isDynamic | New method added (non-breaking) | - | isDynamic() => boolean |
| warning | NeuralRoamQueue | getCards | New method added (non-breaking) | - | getCards() => Promise<FSRSCard[]> |
| warning | NeuralRoamQueue | addCard | New method added (non-breaking) | - | addCard(FSRSCard | QueueItem | string) => Promise<void> |
| warning | NeuralRoamQueue | removeCard | New method added (non-breaking) | - | removeCard(string) => Promise<void> |
| warning | NeuralRoamQueue | handleReview | New method added (non-breaking) | - | handleReview(string, number) => Promise<void> |
| warning | NeuralRoamQueue | getNextCard | New method added (non-breaking) | - | getNextCard() => Promise<FSRSCard | null> |
| warning | NeuralRoamQueue | lockCurrentAsSeed | New method added (non-breaking) | - | lockCurrentAsSeed(string) => Promise<void> |
| warning | NeuralRoamQueue | startRoamingFromSeed | New method added (non-breaking) | - | startRoamingFromSeed(string) => Promise<void> |
| warning | NeuralRoamQueue | clearHistory | New method added (non-breaking) | - | clearHistory() => void |
| warning | NeuralRoamQueue | getSeedBlocks | New method added (non-breaking) | - | getSeedBlocks() => string[] |
| warning | NeuralRoamQueue | getCurrentSeed | New method added (non-breaking) | - | getCurrentSeed() => string | null |
| warning | NeuralRoamQueue | getHistorySnapshot | New method added (non-breaking) | - | getHistorySnapshot() => string[] |
| warning | NeuralRoamQueue | restoreHistory | New method added (non-breaking) | - | restoreHistory(string[]) => void |
| warning | NeuralRoamQueue | reorder | New method added (non-breaking) | - | reorder(FSRSCard[]) => Promise<boolean> |
| warning | QueueMigrationManager | - | No corresponding class found in new architecture | - | - |
| warning | QueueRecoveryManager | - | No corresponding class found in new architecture | - | - |
| error | RetrievalPracticeQueue | create | Missing method in new architecture | create({
    deckID?: string;
    api?: Partial<RiffApi>;
    storage?: StorageManager;
    localScheduler?: SchedulerEngineAdapter;
    schedulerRouter?: SchedulerRouter;
  }?) => Promise<RetrievalPracticeQueue> | - |
| error | RetrievalPracticeQueue | getStats | Missing method in new architecture | getStats() => Promise<QueueStats> | - |
| error | RetrievalPracticeQueue | getPrioritizableTrait | Missing method in new architecture | getPrioritizableTrait() => IPrioritizableTrait<QueueItem> | - |
| error | RetrievalPracticeQueue | getMutableTrait | Missing method in new architecture | getMutableTrait() => IMutableTrait<QueueItem> | undefined | - |
| error | RetrievalPracticeQueue | getRemovableTrait | Missing method in new architecture | getRemovableTrait() => IRemovableTrait<QueueItem> | undefined | - |
| error | RetrievalPracticeQueue | getAllItems | Missing method in new architecture | getAllItems() => QueueItem[] | - |
| error | RetrievalPracticeQueue | addItems | Missing method in new architecture | addItems(QueueItem[]) => Promise<number> | - |
| error | RetrievalPracticeQueue | clear | Missing method in new architecture | clear() => Promise<number> | - |
| error | RetrievalPracticeQueue | getAllCards | Missing method in new architecture | getAllCards() => Promise<QueueItem[]> | - |
| warning | RetrievalPracticeQueue | isDynamic | New method added (non-breaking) | - | isDynamic() => boolean |
| warning | RetrievalPracticeQueue | getCards | New method added (non-breaking) | - | getCards() => Promise<FSRSCard[]> |
| warning | RetrievalPracticeQueue | addCard | New method added (non-breaking) | - | addCard(FSRSCard | QueueItem | string) => Promise<void> |
| warning | RetrievalPracticeQueue | removeCard | New method added (non-breaking) | - | removeCard(string) => Promise<void> |
| warning | RetrievalPracticeQueue | handleReview | New method added (non-breaking) | - | handleReview(string, number) => Promise<void> |
| warning | SubsetPracticeStrategy | - | No corresponding class found in new architecture | - | - |
