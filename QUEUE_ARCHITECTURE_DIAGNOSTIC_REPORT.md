# 队列架构诊断报告

**生成时间**: 2026-02-26T14:13:59.636Z

## 摘要

| 指标 | 数量 |
|------|------|
| 总文件数 | 459 |
| 旧架构文件 | 0 |
| 新架构文件 | 92 |
| 混合使用文件 | 141 |
| 验证错误 | 49 |
| 验证警告 | 5 |

## 架构使用情况

### 旧架构
_无使用点_
### 新架构
| 文件 | 行号 | 类型 | 架构 | 代码片段 |
|------|------|------|------|----------|
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 16 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 57 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 63 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 86 | instantiation | new | new CacheManagerObserver({
            nextDuesCacheSize: 100,
            cardT |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 99 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 149 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 150 | instantiation | new | new Date(Date.now()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 160 | instantiation | new | new Error(`Failed to get next card: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 164 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 220 | instantiation | new | new Error(`Failed to process feedback: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 224 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 301 | instantiation | new | new Error(`Queue type ${this.queueType} does not support insertAt`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 352 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts | 378 | instantiation | new | new Date(previewCard.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedReviewAdapter.ts | 13 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedReviewAdapter.ts | 25 | instantiation | new | new Set<string>([
    'builtin-list-item',
    'builtin-basic-qa',
    'builtin- |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\commands\card\UpdateFSRSCardCommand.ts | 112 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 51 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 116 | instantiation | new | new Error(`加载下一张卡片失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 140 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 215 | instantiation | new | new Error(`处理按钮点击失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 224 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 271 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 310 | instantiation | new | new Error('No current card or queue') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 321 | instantiation | new | new Error(`处理评分失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 343 | instantiation | new | new Error('No current card or queue') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts | 373 | instantiation | new | new Error(`处理操作失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts | 33 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts | 40 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts | 54 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts | 62 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts | 69 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 99 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 117 | instantiation | new | new ManagerSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 154 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 169 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 170 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 171 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 205 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 205 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 220 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 234 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 247 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 248 | instantiation | new | new Set(cards.map(card => card.blockId).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 263 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 318 | instantiation | new | new Promise((resolve) => {
      const { Dialog } = require('siyuan');
      c |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 320 | instantiation | new | new Dialog({
        title: this.deps.i18n?.finalDrillQueueTitle \|\| '刻意练习队列', |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 369 | instantiation | new | new Promise((resolve) => {
      const { Dialog } = require('siyuan');
      c |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 371 | instantiation | new | new Dialog({
        title: this.deps.i18n?.startPracticeTitle \|\| '开始练习？',
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 409 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 647 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 806 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 836 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 882 | instantiation | new | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 888 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts | 1190 | instantiation | new | new Promise(resolve => setTimeout(resolve, 200)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 17 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 19 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 32 | instantiation | new | new ManagerSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 65 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 82 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts | 84 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 73 | instantiation | new | new QuerySiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 185 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 185 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 222 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 237 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 244 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 258 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 281 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 307 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 343 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 370 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 405 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 416 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 417 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 486 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 487 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 488 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 489 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 493 | instantiation | new | new Map<string, Record<string, string>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 494 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 495 | instantiation | new | new Map<string, string[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts | 496 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetCardsQuery.ts | 32 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetCardsQuery.ts | 52 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts | 38 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts | 52 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts | 68 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts | 81 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts | 98 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 150 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 173 | instantiation | new | new QuerySiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 176 | instantiation | new | new CardFilterService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 177 | instantiation | new | new BlockRepository() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 219 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 223 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 253 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 258 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 334 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 354 | instantiation | new | new Error(`Failed to update card ${card.id}: ${result.error}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 390 | instantiation | new | new Error(`Failed to delete card ${cardId}: ${result.error}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 425 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 489 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 489 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 515 | instantiation | new | new Date(dayEnd) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 605 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 617 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts | 629 | instantiation | new | new Error('[SiYuanMemo][DataAccessFacade] CardContentQueryService is required bu |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 88 | instantiation | new | new GetDueCardsQueryHandler(
      readModel,
      scheduleService
    ) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 92 | instantiation | new | new GetCardQueryHandler(readModel) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 93 | instantiation | new | new GetCardsQueryHandler(readModel) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 96 | instantiation | new | new UpdateFSRSCardUseCase(this.unifiedStorage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 97 | instantiation | new | new DeleteFSRSCardUseCase(this.unifiedStorage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 387 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 417 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 419 | instantiation | new | new Error('setCard() is deprecated. Please use updateCard() or appropriate Use C |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 442 | instantiation | new | new Error('removeCard() is deprecated. Please use deleteCard() Use Case.') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 481 | instantiation | new | new Error(`[${context}] ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 491 | instantiation | new | new Error(`[${context}] No persistence method available on unifiedStorage`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 494 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 495 | instantiation | new | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 495 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 498 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 510 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 522 | instantiation | new | new Error(errorMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts | 533 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 74 | instantiation | new | new ReviewSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 105 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 109 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 112 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 145 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 146 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 166 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts | 176 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 85 | instantiation | new | new UnifiedDataSourceManager() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 161 | instantiation | new | new Set<IDataSourceObserver>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 167 | instantiation | new | new Map<QueueType, IReviewQueue>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 169 | instantiation | new | new Map<string, DataChangeEvent>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 212 | instantiation | new | new Error('AdvancedDataRouter not initialized. Call setAdvancedRouter() first.') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 237 | instantiation | new | new Error('SchedulerRouter not available - plugin initialization failed') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 302 | instantiation | new | new Set([...(previous.cardIds ?? []), ...(next.cardIds ?? [])]) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 335 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 400 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 413 | instantiation | new | new Error(`获取卡片失败 (${cardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 428 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 436 | instantiation | new | new Error(`获取卡片列表失败: ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 457 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 468 | instantiation | new | new Error(`更新卡片失败 (${card.id}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 479 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 482 | instantiation | new | new Set([card.id, card.blockId].filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 526 | instantiation | new | new Set([cardId, deletedBlockId].filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 537 | instantiation | new | new Error(`删除卡片失败 (${cardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 597 | instantiation | new | new QueueError('QueuePersistence not initialized. Call setQueuePersistence() fir |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 604 | instantiation | new | new RetrievalPracticeQueue(this, this.queuePersistence!, { autoFailedSink }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 607 | instantiation | new | new IncrementalLearningQueue(this, this.queuePersistence!, { autoFailedSink }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 610 | instantiation | new | new FilterGroupQueue(this, this.queuePersistence!, {}, { autoFailedSink }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 613 | instantiation | new | new FinalDrillQueue(this, this.queuePersistence!) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 616 | instantiation | new | new NeuralRoamQueue(this, this.queuePersistence!, {
                    cardType |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 617 | instantiation | new | new SiyuanNeuralRoamCardTypeResolverAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 621 | instantiation | new | new LeechReviewQueue(this, {
                    effects: new SiyuanLeechActionE |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 622 | instantiation | new | new SiyuanLeechActionEffectsAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts | 626 | instantiation | new | new QueueError(`Unknown queue type: ${type}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts | 70 | instantiation | new | new Error(`Card not found: ${command.cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts | 81 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts | 98 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts | 102 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts | 80 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts | 82 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts | 87 | instantiation | new | new CardBuilderContext() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts | 127 | instantiation | new | new Error(errorMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts | 132 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 27 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 55 | instantiation | new | new Set(states) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 68 | instantiation | new | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 85 | instantiation | new | new Set(cardTypes) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 101 | instantiation | new | new Set(filtered.map(c => c.type \|\| readMetaString(c, 'cardType'))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 140 | instantiation | new | new Set(tags) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 161 | instantiation | new | new Set(deckIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 232 | instantiation | new | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 245 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 255 | instantiation | new | new Date(dueDate.gte) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 328 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 331 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 351 | instantiation | new | new Date(card.updatedAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 407 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 410 | instantiation | new | new Date(card.updatedAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts | 528 | instantiation | new | new Set(filtered.map(c => readMetaString(c, 'rootId'))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts | 19 | instantiation | new | new QABuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts | 20 | instantiation | new | new ClozeBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts | 21 | instantiation | new | new DefaultBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts | 28 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts | 36 | instantiation | new | new DefaultBuilderStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\ClozeStrategy.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\DefaultStrategy.ts | 12 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\QAStrategy.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\types.ts | 12 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 32 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 52 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 139 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 174 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 198 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts | 222 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 11 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 15 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 23 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 43 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts | 50 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\adapter.ts | 13 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\adapter.ts | 46 | instantiation | new | new Error('Native review adapter requires queue.getAllCards()') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 47 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 118 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 133 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 145 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 161 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 161 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 176 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 216 | instantiation | new | new Error(`[${this.type}] SchedulerRouter provider not available on manager`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 221 | instantiation | new | new Error(`[${this.type}] SchedulerRouter not available - plugin initialization  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 271 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 298 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 299 | instantiation | new | new Date(dayEnd) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 319 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 320 | instantiation | new | new Date(now.getFullYear(), now.getMonth(), now.getDate(), dayStartHour, 0, 0, 0 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 386 | instantiation | new | new Error(`Scheduler returned invalid due date for card ${cardId}: ${updatedCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 566 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 566 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 581 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 581 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 622 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 622 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 623 | instantiation | new | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 623 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 635 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 635 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 664 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 700 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 700 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 706 | instantiation | new | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 706 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 712 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 752 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 787 | instantiation | new | new Error(`Invalid position: ${position}, queue size: ${size}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts | 798 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts | 131 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts | 142 | instantiation | new | new Set(data.temporaryBlacklist) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts | 198 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts | 231 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts | 231 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 105 | instantiation | new | new Map<string, FinalDrillEntry>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 134 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 196 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 204 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 255 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 255 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 368 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 374 | instantiation | new | new Map<string, FinalDrillEntry>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts | 493 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts | 126 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts | 134 | instantiation | new | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts | 157 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts | 157 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts | 52 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts | 73 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts | 73 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts | 103 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 31 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 45 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 79 | instantiation | new | new ManualCardSetStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 140 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 140 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 191 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 196 | instantiation | new | new Map(Array.from(options.cardPool, (card) => [card.id, card] as const)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 221 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 222 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 224 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 257 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 259 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 275 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 302 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts | 302 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts | 14 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts | 17 | instantiation | new | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts | 45 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts | 47 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts | 48 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 88 | instantiation | new | new ConceptNeuralQueue() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 169 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 182 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 241 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 349 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts | 390 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 16 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 27 | instantiation | new | new Set((blockIds \|\| []).map((id) => String(id \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 34 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 37 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 61 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 111 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 111 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 147 | instantiation | new | new Map<string, FSRSCard[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts | 147 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 110 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 117 | instantiation | new | new Date(dayEnd) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 117 | instantiation | new | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 123 | instantiation | new | new Date(dayEnd) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 148 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 148 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts | 211 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts | 30 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts | 30 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts | 36 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 72 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 72 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 95 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 118 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 118 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 140 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 168 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 169 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 170 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 181 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 182 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 203 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 228 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts | 257 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\logging\LoggableQueue.ts | 90 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 23 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 24 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts | 26 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 37 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 38 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 40 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 45 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 51 | instantiation | new | new ConceptQueryEngine() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 59 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 171 | instantiation | new | new Error(`Block ${blockId} is not a concept card`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts | 360 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 27 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 53 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 56 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 62 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 77 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 110 | instantiation | new | new HistoryFilter(this.config.historyCapacity) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 111 | instantiation | new | new QueryEngine(this.config) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 112 | instantiation | new | new WeightedWalkEngine({
      [AssociationType.REF_LINK]: this.config.weights. |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 153 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 169 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 246 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 349 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 373 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 562 | instantiation | new | new Error(`Cannot set seed: block ${blockId} does not exist`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 566 | instantiation | new | new Error(`Cannot set seed: block ${blockId} is invalid`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 635 | instantiation | new | new Map(this.missedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 733 | instantiation | new | new Map(this.missedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 745 | instantiation | new | new Map(missedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 783 | instantiation | new | new Map<AssociationType, import('./types.ts').WeightedNeighbor[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 852 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 853 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 854 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 879 | instantiation | new | new Map(this.missedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 880 | instantiation | new | new Map(this.directionMissedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 890 | instantiation | new | new Map(this.directionMissedBlocks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 984 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 1008 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 1125 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts | 1179 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DualQueueSequencer.ts | 18 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DualQueueSequencer.ts | 46 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DynamicDrawSequencer.ts | 18 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DynamicDrawSequencer.ts | 48 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 46 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 99 | instantiation | new | new Error('Reorder failed: orderedItems is not an array') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 102 | instantiation | new | new Error(`Reorder failed: expected ${this.items.length} items, got ${orderedIte |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 105 | instantiation | new | new Set(this.items.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 106 | instantiation | new | new Set(orderedItems.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 110 | instantiation | new | new Error(`Reorder failed: item ${id} not found in current queue`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts | 115 | instantiation | new | new Error('Reorder failed: item count mismatch') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 22 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 37 | instantiation | new | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 38 | instantiation | new | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 39 | instantiation | new | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 40 | instantiation | new | new Date(dueMs) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 53 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 65 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 75 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 88 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 103 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 118 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 133 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 150 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 178 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 191 | instantiation | new | new Promise((resolve) => setTimeout(resolve, 150)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 201 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 218 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 232 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 244 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 261 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 289 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 308 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 326 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 346 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 368 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 381 | instantiation | new | new Promise((resolve) => setTimeout(resolve, 70)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 390 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 408 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 435 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 448 | instantiation | new | new Promise((resolve) => setTimeout(resolve, 6000)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 459 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 470 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 488 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 507 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 521 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 544 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 559 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 576 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 588 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 601 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      initia |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 612 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 635 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 657 | instantiation | new | new Promise((resolve) => setTimeout(resolve, 70)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 670 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
      getPri |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts | 699 | instantiation | new | new FSRSSequencer<TestItem>({
      getDueMs: (item) => item.due,
    }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.ts | 9 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.ts | 170 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GraphSequencer.ts | 10 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GraphSequencer.ts | 17 | instantiation | new | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GroupSequencer.ts | 19 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GroupSequencer.ts | 50 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 4 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 39 | instantiation | new | new Error('Reorder failed: orderedItems is not an array') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 42 | instantiation | new | new Error(`Reorder failed: expected ${this.items.length} items, got ${orderedIte |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 45 | instantiation | new | new Set(this.items.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 46 | instantiation | new | new Set(orderedItems.map((item) => this.getItemId(item))) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 50 | instantiation | new | new Error(`Reorder failed: item ${id} not found in current queue`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts | 55 | instantiation | new | new Error('Reorder failed: item count mismatch') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts | 94 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts | 109 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts | 406 | instantiation | new | new Date(ms) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\SortedSequencer.ts | 12 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\SortedSequencer.ts | 187 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\types.ts | 71 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts | 17 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts | 23 | instantiation | new | new Map<string, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts | 23 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts | 35 | instantiation | new | new Error(
          `Failed to persist card "${cardId}" in scheduler adapter: $ |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts | 41 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts | 49 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts | 96 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts | 99 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 13 | instantiation | new | new BatchProcessor() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 21 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 34 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 38 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 65 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 86 | instantiation | new | new Date(lastEntry.oldDue) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts | 88 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 38 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 65 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 66 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 75 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 91 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 146 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 147 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 167 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 168 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts | 220 | instantiation | new | new Array(tasks.length) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts | 5 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts | 13 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts | 14 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 40 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 83 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 87 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 89 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 120 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 170 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 170 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts | 231 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 26 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 41 | instantiation | new | new PostponeEngine(unifiedStorage, cardUpdater) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 42 | instantiation | new | new AdvanceEngine(unifiedStorage, cardUpdater) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 43 | instantiation | new | new SpreadEngine(unifiedStorage, cardUpdater) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 88 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 94 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 94 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 132 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 158 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 224 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts | 250 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 55 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 67 | instantiation | new | new TSFSRSScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 69 | instantiation | new | new TSFSRSScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 72 | instantiation | new | new SM15Scheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 75 | instantiation | new | new ImprovedTopicScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 85 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 85 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 96 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 98 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 108 | instantiation | new | new Error(`Scheduler not found: ${schedulerType}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 123 | instantiation | new | new Date(updatedCard.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 134 | instantiation | new | new Error(`Scheduler ${schedulerType} returned undefined for card ${card.id}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 167 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 185 | instantiation | new | new Error(`Card ${card.id} has unsupported scheduler type: ${card.schedulerType} |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 200 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 238 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 238 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 243 | instantiation | new | new Error(`Scheduler not found: ${schedulerType}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 285 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 288 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts | 297 | instantiation | new | new Error(`Scheduler migration not supported: ${oldScheduler} -> ${newScheduler} |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 41 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 93 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 96 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 118 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 121 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 180 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts | 183 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 56 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 57 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 57 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 67 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 76 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 83 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 83 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 97 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 97 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 131 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 131 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 193 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 229 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts | 286 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 66 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 66 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 139 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 139 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 208 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 208 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 279 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts | 281 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 41 | instantiation | new | new SM15(requestedFI, intervalBase) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 62 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 62 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 70 | instantiation | new | new SM15Item(this.sm15, item.value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 76 | instantiation | new | new Date(item.dueDate) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 77 | instantiation | new | new Date(item.previousDate) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 100 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 100 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 108 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 123 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 125 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 137 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 144 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 145 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 153 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 155 | instantiation | new | new SM15Item(this.sm15, card.id) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 175 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 197 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts | 197 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 35 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 65 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 144 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 144 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 144 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 158 | instantiation | new | new Map<Rating, FSRSCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 158 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 190 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 190 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 190 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 215 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 216 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 217 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 218 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 243 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 243 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 265 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 326 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 330 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 333 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 340 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 375 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 375 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts | 386 | instantiation | new | new Date(dueTime) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts | 9 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts | 9 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts | 11 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 19 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 19 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 19 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 26 | instantiation | new | new Date(nextDues[rating]) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 61 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 61 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 64 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 65 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 66 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 67 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 89 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts | 92 | instantiation | new | new Date(nextDues[3]) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts | 26 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts | 26 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts | 49 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts | 56 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\siyuan\riff\normalizers.ts | 16 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 140 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 140 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 232 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 239 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 254 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 255 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 267 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 274 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 409 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 440 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 450 | instantiation | new | new Date(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 478 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 532 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 574 | instantiation | new | new Set(this.practiceQueue.map(resolveQueueItemCardId).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 674 | instantiation | new | new Date(log.review) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 694 | instantiation | new | new Date(log.ts) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 737 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 743 | instantiation | new | new Date(now.getFullYear(), now.getMonth() - i, 1) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 872 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 882 | instantiation | new | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 902 | instantiation | new | new Set((blockIDs \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 903 | instantiation | new | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts | 981 | instantiation | new | new Uint8Array(binaryString.length) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts | 8 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts | 9 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts | 10 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts | 17 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts | 52 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 39 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 62 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 63 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 64 | instantiation | new | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 67 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 68 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 69 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 70 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 71 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 89 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 93 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 96 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 99 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 102 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 108 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 131 | instantiation | new | new Error('Load callback not set') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 163 | instantiation | new | new Set(
          store.riffBlacklist.filter((id): id is string => typeof id = |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 172 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 182 | instantiation | new | new Error('Save callback not set') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 198 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 245 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 355 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 376 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 384 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 404 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 407 | instantiation | new | new Error('Invalid xiuyuan: missing id') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 410 | instantiation | new | new Error('Invalid cards: empty array') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 416 | instantiation | new | new Error('Invalid card: missing id') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 420 | instantiation | new | new Error(`Card ${card.id} xiuyuanID mismatch: expected ${xiuyuan.id}, got ${car |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 423 | instantiation | new | new Error(`Card ${card.id} already exists`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 432 | instantiation | new | new Map(this.indexByBlockID) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 433 | instantiation | new | new Map(this.indexByXiuyuanID) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 434 | instantiation | new | new Map(this.indexByType) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 435 | instantiation | new | new Map(this.indexByPriority) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 484 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 516 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 537 | instantiation | new | new Error('Storage not initialized: cardDTOs Map is undefined') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 542 | instantiation | new | new Error(`Card not found: ${dto.id}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 578 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 590 | instantiation | new | new Error('Invalid xiuyuan: missing id') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 593 | instantiation | new | new Error('Invalid dtos: empty array') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 599 | instantiation | new | new Error('Invalid dto: missing id') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 602 | instantiation | new | new Error(`DTO ${dto.id} xiuyuanID mismatch: expected ${xiuyuan.id}, got ${dto.x |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 605 | instantiation | new | new Error(`Card ${dto.id} already exists`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 614 | instantiation | new | new Map(this.indexByBlockID) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 615 | instantiation | new | new Map(this.indexByXiuyuanID) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 616 | instantiation | new | new Map(this.indexByType) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 617 | instantiation | new | new Map(this.indexByPriority) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 665 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 774 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 784 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 792 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 804 | instantiation | new | new Error(`Card not found: ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 830 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 842 | instantiation | new | new Error(`XiuYuan not found: ${xiuyuanId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 866 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 876 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 878 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 896 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 908 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 920 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 931 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1097 | instantiation | new | new Set(this.riffBlacklist) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1124 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1136 | instantiation | new | new Error(`[UnifiedStorageManager] Cannot create card without xiuyuanID: ${card. |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1141 | instantiation | new | new Error(`[UnifiedStorageManager] Xiuyuan not found: ${xiuyuanId}. Cannot creat |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1181 | instantiation | new | new Error(errorMsg) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts | 1189 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 124 | instantiation | new | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 130 | instantiation | new | new TemplateRegistry() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 167 | instantiation | new | new Set(cards.map(card => card.getId().getValue())) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 216 | instantiation | new | new Error('Failed to save after deletion') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 331 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 350 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 378 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 409 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 465 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 485 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 505 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 548 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 746 | instantiation | new | new Error(`Invalid CardId: ${dto.id}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 749 | instantiation | new | new Date(dto.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 755 | instantiation | new | new Date(dto.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 760 | instantiation | new | new Error('Invalid ScheduleInfo') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 767 | instantiation | new | new Date(dto.createdAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 768 | instantiation | new | new Date(dto.updatedAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 773 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 788 | instantiation | new | new Error(`Invalid XiuyuanId: ${data.id}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 793 | instantiation | new | new Error(`Invalid BlockId in blockIDs`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 798 | instantiation | new | new Error(`Invalid TemplateId: ${data.templateID}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 810 | instantiation | new | new Error(`Invalid CardFace in faces`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 823 | instantiation | new | new Map<CardId, Card>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 855 | instantiation | new | new Date(data.createdAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 856 | instantiation | new | new Date(data.updatedAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts | 861 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 78 | instantiation | new | new Date(dueCandidate) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 98 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 98 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 114 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 124 | instantiation | new | new Error(`[normalizeToFSRSCard] Unsupported card at index ${index}: ${details}` |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 138 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 153 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 185 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 185 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 187 | instantiation | new | new Error(`[queueItemToFSRSCard] Invalid QueueItem: ${JSON.stringify(item)}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 194 | instantiation | new | new Error(`[queueItemToFSRSCard] Missing card identity: ${JSON.stringify(item)}` |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 231 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 231 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 233 | instantiation | new | new Error(`[fsrsCardToQueueItem] Invalid FSRSCard: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 261 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 261 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 278 | instantiation | new | new Error(`[resolveCardId] Unknown card type: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 284 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 284 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 284 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 293 | instantiation | new | new Error(`[normalizeCardInput] Unknown card type: ${JSON.stringify(card)}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 303 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 304 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 317 | instantiation | new | new Error(`[normalizeToFSRSCard] Conversion failed with ${errors.length} errors: |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 350 | instantiation | new | new RuntimeTypeValidator() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 358 | instantiation | new | new RuntimeTypeValidator() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 384 | instantiation | new | new TypeMismatchError(
                `[${queueName}.${methodName}()] must retu |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 395 | instantiation | new | new TypeMismatchError(
                    `[${queueName}.${methodName}()] must  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 414 | instantiation | new | new TypeMismatchError(
                `[${consumerName}] Expected array of card |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts | 425 | instantiation | new | new TypeMismatchError(
                    `[${consumerName}] Card at index ${in |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 25 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 26 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 36 | instantiation | new | new Error('Card ID cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 38 | instantiation | new | new CardId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 54 | instantiation | new | new Error('Block ID cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 56 | instantiation | new | new BlockId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 72 | instantiation | new | new Error('Priority must be between 0 and 100') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 74 | instantiation | new | new Priority(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 78 | instantiation | new | new Priority(50) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 271 | instantiation | new | new Card(props) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 274 | instantiation | new | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 311 | instantiation | new | new Error('Stability must be non-negative') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 314 | instantiation | new | new Error('Difficulty must be between 1 and 10') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 317 | instantiation | new | new Error('Reps must be non-negative') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts | 320 | instantiation | new | new Error('Lapses must be non-negative') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 110 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 214 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 241 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 310 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 320 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts | 505 | instantiation | new | new Error(`Failed to convert ${errors.length} cards: ${errors.map(e => e.message |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts | 36 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts | 70 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts | 126 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts | 44 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts | 54 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts | 64 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts | 74 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts | 84 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts | 143 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts | 144 | instantiation | new | new Error(
        'DeprecationError: createDefaultCard() is deprecated. ' +
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts | 158 | instantiation | new | new Error(
        'DeprecationError: createWebpageCard() is deprecated. ' +
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts | 165 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts | 171 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\logging.ts | 215 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 104 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 105 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 106 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 231 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 239 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 246 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 327 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 339 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 344 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 351 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 351 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 363 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 428 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 428 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 433 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 433 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 463 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts | 647 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 146 | instantiation | new | new Error('Browser Siyuan API not initialized. Please initialize browser context |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 225 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 226 | instantiation | new | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 227 | instantiation | new | new Map<string, FSRSCard[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 227 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 250 | instantiation | new | new Set<OnCacheUpdate>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 297 | instantiation | new | new Set(cards.map(c => c.blockId)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 324 | instantiation | new | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 326 | instantiation | new | new Set(this.cache.cards.map(c => c.blockId)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 350 | instantiation | new | new CardCacheManager() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 364 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 382 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 383 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 575 | instantiation | new | new Map<string, Record<string, string>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 576 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 577 | instantiation | new | new Map<string, string[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 578 | instantiation | new | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 897 | instantiation | new | new Set(states) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 923 | instantiation | new | new Set(parsed.decks) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 928 | instantiation | new | new Set(parsed.states) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 933 | instantiation | new | new Set(parsed.docs) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 965 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 971 | instantiation | new | new Date(dayEndTimestamp) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 973 | instantiation | new | new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1054 | instantiation | new | new Set((rootIds \|\| []).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1065 | instantiation | new | new Set(rows.map((row) => row.id)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1089 | instantiation | new | new Set((blockIds \|\| []).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1097 | instantiation | new | new Map(cachedCards.map(c => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1105 | instantiation | new | new Map(cards.map((c) => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1112 | instantiation | new | new Map(allCards.map(c => [c.blockId, c])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1143 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1238 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1238 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1240 | instantiation | new | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1292 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1298 | instantiation | new | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1327 | instantiation | new | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1335 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1370 | instantiation | new | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1387 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1430 | instantiation | new | new Set(blockIds.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1489 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts | 1493 | instantiation | new | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 33 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 34 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 105 | instantiation | new | new Error(`[${scope}] Queue removeCard is unavailable`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 141 | instantiation | new | new Error(`[${scope}] Queue insertAt is unavailable`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 250 | instantiation | new | new Error(`[${scope}] Spread action is not supported`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 285 | instantiation | new | new Date(newDue) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 336 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 337 | instantiation | new | new Date(now.getFullYear(), now.getMonth(), now.getDate()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 342 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 344 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 445 | instantiation | new | new Set(values.filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts | 508 | instantiation | new | new Set(deletedCardIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts | 50 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts | 289 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts | 290 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts | 294 | instantiation | new | new Date(card.createdAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts | 399 | instantiation | new | new Error('UnifiedDataSourceManager.deleteCard is unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\FinalDrillDataSource.ts | 31 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts | 49 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts | 62 | instantiation | new | new Date(card.createdAt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts | 69 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts | 82 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts | 83 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 104 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 121 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 132 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 136 | instantiation | new | new Error(`初始化队列视图失败 (${queueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 186 | instantiation | new | new Date(startTime) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 187 | instantiation | new | new Date(endTime) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 189 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 208 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 216 | instantiation | new | new Error(`加载卡片数据失败 (${this.currentQueueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 273 | instantiation | new | new Date(event.timestamp) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 378 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 404 | instantiation | new | new Date(card.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts | 405 | instantiation | new | new Date(card.lastReview) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 95 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 102 | instantiation | new | new ReviewViewController(this.manager) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 115 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 126 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 130 | instantiation | new | new Error(`初始化复习控制器失败 (${queueType}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 143 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 213 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 221 | instantiation | new | new Error(`评分失败 (卡片 ${this.currentCardId}, 评分 ${rating}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 269 | instantiation | new | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 273 | instantiation | new | new Error(`跳过失败 (卡片 ${this.currentCardId}): ${errorMessage}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 282 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 355 | instantiation | new | new Date(event.timestamp) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts | 391 | instantiation | new | new Error('Review controller is not initialized') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 11 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 12 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 13 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 26 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 63 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 69 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 75 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 80 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 112 | instantiation | new | new Error('FinalDrillV2Session requires review siyuan api') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 116 | instantiation | new | new StorageFileJsonAdapter<ProgressSnapshot>(options.storage, 'review-v2-final-d |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 155 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 159 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 164 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 258 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 279 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts | 286 | type-annotation | new | QueueItem |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\types.ts | 49 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 32 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 32 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 68 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 68 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 85 | type-annotation | new | FSRSCard |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts | 103 | type-annotation | new | FSRSCard |

### 混合使用
| 文件 | 行号 | 类型 | 架构 | 代码片段 |
|------|------|------|------|----------|
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts | 149 | instantiation | mixed | new Setting({
            confirmCallback: () => {
                this.saveDa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts | 355 | instantiation | mixed | new Dialog({
            title: `SiYuan ${Constants.SIYUAN_VERSION}`,
         |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts | 375 | instantiation | mixed | new Protyle(this.app, dialog.element.querySelector("#protyle"), {
            b |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts | 379 | instantiation | mixed | new Date(response.data) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts | 384 | instantiation | mixed | new Menu("topBarSample", () => {
            console.log(this.i18n.byeMenu);
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 161 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 168 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 174 | instantiation | mixed | new Set<ServiceName>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 180 | instantiation | mixed | new Map<ServiceName, Error>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 272 | instantiation | mixed | new EventBus(false) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 279 | instantiation | mixed | new FileService(context.getPlugin() as unknown as SiyuanMemoPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 284 | instantiation | mixed | new QueuePersistenceService(fileService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 293 | instantiation | mixed | new SettingsService(fileService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 301 | instantiation | mixed | new ReviewLogService(fileService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 305 | instantiation | mixed | new RiffBlacklistService(
        context.getUnifiedStorage(),
        { enabled |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 313 | instantiation | mixed | new CardContentQueryService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 319 | instantiation | mixed | new DialogManager(context, context.getPlugin()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 323 | instantiation | mixed | new MenuManager(
        context, 
        context.getPlugin(), 
        cont |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 332 | instantiation | mixed | new TabManager(context, context.getPlugin()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 336 | instantiation | mixed | new TabApplicationService(context.getPlugin().app) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 340 | instantiation | mixed | new DockManager(context.getPlugin(), context.getStorage(), context.getI18n()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 344 | instantiation | mixed | new PracticeQueueManager(
        context.getRetrievalQueue(),
        context |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 358 | instantiation | mixed | new CardTypeDetectionService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 360 | instantiation | mixed | new XiuyuanRepository(
        context.getUnifiedStorage(),  // ✅ 使用 UnifiedSto |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 366 | instantiation | mixed | new CardCreationService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 367 | instantiation | mixed | new CardDeletionService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 372 | instantiation | mixed | new Error('[ApplicationContext] deletionTracker should have been created during  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 376 | instantiation | mixed | new CreateCardUseCase(xiuyuanRepo, cardCreationService, context.getEventBus()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 377 | instantiation | mixed | new DeleteCardUseCase(xiuyuanRepo, cardDeletionService, context.getEventBus()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 378 | instantiation | mixed | new DeleteCardsUseCase(xiuyuanRepo, cardDeletionService, context.getEventBus(),  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 379 | instantiation | mixed | new UpdateCardUseCase(xiuyuanRepo) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 383 | instantiation | mixed | new CardReadModel(unifiedStorage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 386 | instantiation | mixed | new CardScheduleService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 388 | instantiation | mixed | new CardApplicationService(
        createCardUseCase,
        deleteCardUseCa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 402 | instantiation | mixed | new CardScheduleService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 403 | instantiation | mixed | new CardFilterService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 404 | instantiation | mixed | new CardSortService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 407 | instantiation | mixed | new BrowserApplicationService(
        context.getUnifiedStorage(),  // ✅ 使用 Uni |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 418 | instantiation | mixed | new ReviewApplicationService(
        context.getUnifiedStorage(),  // ✅ 使用 Unif |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 494 | instantiation | mixed | new Error(
        `Circular dependency detected: ${chain} -> ${serviceName}\n` |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 503 | instantiation | mixed | new Error(`Service '${serviceName}' is not registered in the service container`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 586 | instantiation | mixed | new StorageManager(config.plugin.name) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 590 | instantiation | mixed | new UnifiedStorageManager() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 598 | instantiation | mixed | new Error(`[ApplicationContext] Failed to load unified storage: ${loadResult.err |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 665 | instantiation | mixed | new Date(orphanCard.due) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 671 | instantiation | mixed | new Date(orphanCard.lastReview \|\| Date.now()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 687 | instantiation | mixed | new Date(orphanCard.createdAt \|\| Date.now()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 688 | instantiation | mixed | new Date(orphanCard.updatedAt \|\| Date.now()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 704 | instantiation | mixed | new (await import('@/core/xiuyuan/infrastructure/XiuyuanRepository')).XiuyuanRep |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 743 | instantiation | mixed | new CardTypeDetectionServiceClass() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 745 | instantiation | mixed | new XiuyuanRepository(
      unifiedStorageManager,
      cardTypeDetectionSer |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 751 | instantiation | mixed | new CardCreationService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 752 | instantiation | mixed | new CardDeletionService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 753 | instantiation | mixed | new CardScheduleService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 757 | instantiation | mixed | new EventBus(false) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 761 | instantiation | mixed | new InMemoryDeletionTracker() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 765 | instantiation | mixed | new CreateCardUseCase(xiuyuanRepoTemp, cardCreationService, sharedEventBus) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 766 | instantiation | mixed | new DeleteCardUseCase(xiuyuanRepoTemp, cardDeletionService, sharedEventBus) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 767 | instantiation | mixed | new DeleteCardsUseCase(xiuyuanRepoTemp, cardDeletionService, sharedEventBus, del |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 768 | instantiation | mixed | new UpdateCardUseCase(xiuyuanRepoTemp) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 771 | instantiation | mixed | new CardReadModel(unifiedStorageManager) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 774 | instantiation | mixed | new CardApplicationService(
      createCardUseCase,
      deleteCardUseCase, |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 785 | instantiation | mixed | new UnifiedStorageCardUpdateAdapter(unifiedStorageManager) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 786 | instantiation | mixed | new SiyuanErrorNotificationAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 787 | instantiation | mixed | new RescheduleService(
      unifiedStorageManager,
      schedulerCardUpdater,
 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 794 | instantiation | mixed | new SchedulerRouter(
      {
        defaultScheduler: settings.scheduler?.defau |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 804 | instantiation | mixed | new CardCreationHelper(cardApplicationService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 820 | instantiation | mixed | new BlockMenuHandler({
      app: config.plugin.app,
      i18n: config.i18n,
   |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 858 | instantiation | mixed | new ApplicationContext(config, {
      storageManager,
      unifiedStorageMan |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 889 | instantiation | mixed | new AdvancedDataRouter(
      cardApplicationService, 
      unifiedStorageManag |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 911 | instantiation | mixed | new XiuyuanSyncSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 919 | instantiation | mixed | new CardTypeDetectionServiceClass2() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 922 | instantiation | mixed | new XiuyuanRepository(
        unifiedStorageManager,
        cardTypeDetectio |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 926 | instantiation | mixed | new CardTypeDetectionService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 931 | instantiation | mixed | new Error('[ApplicationContext] deletionTracker should have been created during  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 937 | instantiation | mixed | new XiuyuanSyncService(
        {
          deckId: syncSiyuanApi.BUILTIN_DECK_I |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 967 | instantiation | mixed | new RiffSyncEventHandler(sharedEventBus, hybridSyncService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 990 | instantiation | mixed | new TransactionWebSocketService(config.plugin as unknown as SiyuanMemoPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 991 | instantiation | mixed | new RiffSyncHandler(hybridSyncService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 992 | instantiation | mixed | new AutoCardHandler(config.plugin as unknown as SiyuanMemoPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1114 | instantiation | mixed | new CardTypeDetectionService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1117 | instantiation | mixed | new XiuyuanRepository(
        this.unifiedStorageManager,
        cardTypeDet |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1125 | instantiation | mixed | new Map<string, ICardTemplate>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1133 | instantiation | mixed | new XiuyuanApplicationService(
        xiuyuanRepository,
        templateRegi |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1218 | instantiation | mixed | new TransactionWebSocketService(this.config.plugin as unknown as SiyuanMemoPlugi |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1221 | instantiation | mixed | new RiffSyncHandler(this.hybridSyncService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1225 | instantiation | mixed | new AutoCardHandler(this.config.plugin as unknown as SiyuanMemoPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1541 | instantiation | mixed | new Error(saveResult.error?.message \|\| 'Unknown error') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1548 | instantiation | mixed | new Error(`Failed to save storage data during disposal: ${error}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts | 1625 | instantiation | mixed | new Error('ApplicationContext has been disposed') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts | 88 | instantiation | mixed | new Error('ApplicationContext not found in plugin') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts | 93 | instantiation | mixed | new UnifiedQueueStrategy(queueInstance ?? queueType, manager, eventBus, schedule |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts | 96 | instantiation | mixed | new UnifiedReviewAdapter({ i18n: plugin.i18n \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 88 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 89 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 90 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 96 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 131 | instantiation | mixed | new AutoCardSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 132 | instantiation | mixed | new AutoCardRiffAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 148 | instantiation | mixed | new Error('[AutoCard] ApplicationContext is unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 162 | instantiation | mixed | new Error('[AutoCard] SettingsService is unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 170 | instantiation | mixed | new Error('[AutoCard] CardApplicationService is unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 183 | instantiation | mixed | new Error('[AutoCard] XiuyuanApplicationService is unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 190 | instantiation | mixed | new CardCreationHelper(cardService) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 773 | instantiation | mixed | new Error(`Failed to create cards with back cloze: ${result.error?.message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 794 | instantiation | mixed | new Error(`Failed to create symbol card: ${result.error}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 850 | instantiation | mixed | new Error(`Failed to create bidirectional card with back cloze: ${result.error?. |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts | 869 | instantiation | mixed | new Error('Failed to create bidirectional card via Xiuyuan') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\RiffSyncHandler.ts | 64 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, 500)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.test.ts | 65 | instantiation | mixed | new DialogManager(mockContext, mockPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.test.ts | 197 | instantiation | mixed | new DialogManager(mockContext, mockPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 127 | instantiation | mixed | new ManagerSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 530 | instantiation | mixed | new LeechReviewQueue(manager, {
        threshold: Number(leech?.threshold) \|\| |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 534 | instantiation | mixed | new SiyuanLeechActionEffectsAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 559 | instantiation | mixed | new Set((blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 567 | instantiation | mixed | new SubsetReviewQueue(manager, ids) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 612 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 636 | instantiation | mixed | new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRout |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 637 | instantiation | mixed | new UnifiedReviewAdapter({ i18n: this.context.getI18n() \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 702 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 726 | instantiation | mixed | new UnifiedQueueStrategy(QueueType.FilterGroup, manager, eventBus, schedulerRout |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 727 | instantiation | mixed | new UnifiedReviewAdapter({ i18n: this.context.getI18n() \|\| {} }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 774 | instantiation | mixed | new Set((blockIds \|\| []).map((x) => String(x \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts | 782 | instantiation | mixed | new TemporaryDrillQueue(manager, ids) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\MenuManager.test.ts | 67 | instantiation | mixed | new MenuManager(mockContext, mockPlugin, mockI18n, mockDialogManager) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\MenuManager.ts | 121 | instantiation | mixed | new Menu('fsrs-topbar-menu') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\ReviewSyncManager.ts | 220 | instantiation | mixed | new ReviewSyncDomainEvent(eventName, eventData) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\ReviewSyncManager.ts | 236 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts | 57 | instantiation | mixed | new TabManager(mockContext, mockPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts | 138 | instantiation | mixed | new TabManager(newMockContext, mockPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts | 154 | instantiation | mixed | new TabManager(newMockContext, mockPlugin) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts | 233 | instantiation | mixed | new Error('Failed to open tab') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts | 72 | instantiation | mixed | new ManagerSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts | 118 | instantiation | mixed | new UnifiedReviewAdapter({ i18n: self.getPluginI18n() }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts | 294 | instantiation | mixed | new UnifiedQueueStrategy(
      queueType,
      this.context.getUnifiedDataSour |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts | 144 | instantiation | mixed | new LRUCache(options?.nextDuesCacheSize ?? 100) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts | 145 | instantiation | mixed | new LRUCache(options?.cardTypeCacheSize ?? 50) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts | 146 | instantiation | mixed | new LRUCache(options?.formattedDataCacheSize ?? 50) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetDueCardsQueryHandler.ts | 62 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 48 | instantiation | mixed | new QuerySiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 56 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 69 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 90 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 99 | instantiation | mixed | new Map<string, BlockContentResult>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts | 153 | instantiation | mixed | new Map<string, BlockContentResult>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts | 60 | instantiation | mixed | new BrowserSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts | 62 | instantiation | mixed | new GetBrowserCardsQueryHandler(
      storageManager,
      cardScheduleService |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts | 198 | instantiation | mixed | new DeckDataSource(
        this.unifiedDataSourceManager,
        { preset, que |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts | 214 | instantiation | mixed | new Error(`Unknown queue data source: ${queueId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts | 224 | instantiation | mixed | new Error(`Unknown data source type: ${type}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts | 72 | instantiation | mixed | new Date(log.review) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts | 83 | instantiation | mixed | new Date(log.ts) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts | 111 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts | 69 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts | 72 | instantiation | mixed | new Set(this.storage.getRiffBlacklist()) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts | 128 | instantiation | mixed | new Error('Invalid block ID') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 198 | instantiation | mixed | new SettingsValidationError(
            'requestRetention must be between 0.7  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 207 | instantiation | mixed | new SettingsValidationError(
            'maximumInterval must be at least 1', |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 216 | instantiation | mixed | new SettingsValidationError(
            'weights must be an array of 19 number |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 227 | instantiation | mixed | new SettingsValidationError(
          'newCardsPerDay must be non-negative',
 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 236 | instantiation | mixed | new SettingsValidationError(
          'reviewsPerDay must be non-negative',
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 246 | instantiation | mixed | new SettingsValidationError(
          'defaultPriority must be between 0 and 1 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 255 | instantiation | mixed | new SettingsValidationError(
          'priorityRandomness must be between 0 an |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 270 | instantiation | mixed | new SettingsValidationError(
          'mode must be "advanced" or "simple"',
 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 280 | instantiation | mixed | new SettingsValidationError(
          'fullSync.interval must be non-negative' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts | 292 | instantiation | mixed | new SettingsValidationError(
            `Invalid trigger: ${trigger}. Must be  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 80 | instantiation | mixed | new CreateXiuyuanFromBlocksUseCase(
      xiuyuanRepository,
      templateReg |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 84 | instantiation | mixed | new DeleteXiuyuanUseCase(xiuyuanRepository) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 85 | instantiation | mixed | new GetXiuyuanQueryHandler(xiuyuanRepository) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 86 | instantiation | mixed | new GetAllXiuyuansQueryHandler(xiuyuanRepository) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 87 | instantiation | mixed | new CreateListTemplateCardsUseCase(
      xiuyuanRepository,
      templateReg |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 91 | instantiation | mixed | new CreateConceptDescriptorCardsUseCase(
      xiuyuanRepository,
      templa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 95 | instantiation | mixed | new CreateConceptDescriptorAutoUseCase(
      xiuyuanRepository,
      templat |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 99 | instantiation | mixed | new RebindDescriptorConceptUseCase(
      xiuyuanRepository,
      templateReg |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 103 | instantiation | mixed | new CreateTemplateUseCase(templateRegistry) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 104 | instantiation | mixed | new GetTemplateQueryHandler(templateRegistry) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts | 105 | instantiation | mixed | new GetAllTemplatesQueryHandler(templateRegistry) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 91 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 92 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 108 | instantiation | mixed | new XiuyuanSyncSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 132 | instantiation | mixed | new XiuyuanSyncBridgeEvent(domainEventName, eventData) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 197 | instantiation | mixed | new Map<(data: unknown) => void, EventHandler<DomainEvent>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 289 | instantiation | mixed | new Promise<void>((resolve) => {
            releaseLock = resolve;
        }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 505 | instantiation | mixed | new Set(filtered.map(c => c.id)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 595 | instantiation | mixed | new Set(riffCards.map(c => c.id)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 602 | instantiation | mixed | new Error(`Failed to get all Xiuyuans: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 997 | instantiation | mixed | new Date(dateStr) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1018 | instantiation | mixed | new Error(`Failed to create XiuyuanId: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1036 | instantiation | mixed | new Error(`Failed to create BlockId: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1042 | instantiation | mixed | new Error(`Failed to create TemplateId: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1056 | instantiation | mixed | new Error(`Failed to create CardFace: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1077 | instantiation | mixed | new Error(`Failed to create Xiuyuan: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1090 | instantiation | mixed | new Error(`Failed to create CardId: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1094 | instantiation | mixed | new Date(parseValidDate(riffCard?.due) \|\| now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1100 | instantiation | mixed | new Date(parseValidDate(riffCard?.lastReview) \|\| now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1108 | instantiation | mixed | new Error(`Failed to create ScheduleInfo: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1116 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1117 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1122 | instantiation | mixed | new Error(`Failed to create Card: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1129 | instantiation | mixed | new Error(`Failed to add Card to Xiuyuan: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts | 1243 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, ms)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 55 | instantiation | mixed | new CardCreationSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 68 | instantiation | mixed | new Error(`Invalid command: ${validationError}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 80 | instantiation | mixed | new Error('Failed to select template') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 347 | instantiation | mixed | new Error('At least one blockId is required') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 352 | instantiation | mixed | new Error('templateId is required') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 400 | instantiation | mixed | new Error(`Template ${templateId} requires at least 2 blocks`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts | 451 | instantiation | mixed | new Error(defaultMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts | 64 | instantiation | mixed | new CardDeletionSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts | 79 | instantiation | mixed | new Error(`Invalid command: ${validationError}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts | 163 | instantiation | mixed | new CardsDeletedEvent('batch-delete', deletedCardIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts | 188 | instantiation | mixed | new Map<string, string[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 54 | instantiation | mixed | new CardDeletionSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 67 | instantiation | mixed | new Error(`Invalid command: ${validationError}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 175 | instantiation | mixed | new Error(`Card ${cardId.getValue()} has no Xiuyuan index mapping`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 180 | instantiation | mixed | new Error(`Invalid xiuyuanId in index: ${xiuyuanIdStr}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 188 | instantiation | mixed | new Error(`Xiuyuan ${xiuyuanIdStr} not found for card ${cardId.getValue()}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts | 194 | instantiation | mixed | new Error(`Card ${cardId.getValue()} not found in Xiuyuan ${xiuyuan.getId().getV |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts | 61 | instantiation | mixed | new CardDeletionSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts | 112 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts | 126 | instantiation | mixed | new Error(`Failed to delete card via removeCard(): ${cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts | 131 | instantiation | mixed | new Error('No available delete capability on DeleteFSRSCardStoragePort') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\shared\StorageOperationResult.ts | 20 | instantiation | mixed | new Error(defaultMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\shared\WarmupXiuyuanCardIndex.ts | 13 | instantiation | mixed | new Error('Failed to warm up Xiuyuan card index') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 54 | instantiation | mixed | new Error(`Invalid command: ${validationError}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 60 | instantiation | mixed | new Error(`Invalid xiuyuanId: ${xiuyuanIdResult.error.message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 65 | instantiation | mixed | new Error(`Invalid cardId: ${cardIdResult.error.message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 79 | instantiation | mixed | new Error(`Xiuyuan not found: ${command.xiuyuanId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 85 | instantiation | mixed | new Error(`Card not found: ${command.cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 91 | instantiation | mixed | new Error(`Card not found: ${command.cardId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 102 | instantiation | mixed | new Error(`Invalid faceIndex: ${command.faceIndex}. Must be between 0 and ${face |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 112 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts | 131 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts | 92 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts | 104 | instantiation | mixed | new Error('未提供描述符块 ID') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts | 112 | instantiation | mixed | new Error('未找到概念块（标题块或文档块）') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts | 137 | instantiation | mixed | new CreateXiuyuanFromBlocksUseCase(
          this.xiuyuanRepository,
           |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 97 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 111 | instantiation | mixed | new Error('List item paragraph not found') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 118 | instantiation | mixed | new Error('Concept reference not found in parent block') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 132 | instantiation | mixed | new Error('Referenced concept block does not exist') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 135 | instantiation | mixed | new Error('Concept reference must point to a document block') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 150 | instantiation | mixed | new Map<string, BlockRow>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 237 | instantiation | mixed | new Error('No descriptor or definition block found') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts | 245 | instantiation | mixed | new CreateXiuyuanFromBlocksUseCase(
        this.xiuyuanRepository,
        this |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 100 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 136 | instantiation | mixed | new Error('List template card already exists for this parent block') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 142 | instantiation | mixed | new Error(`Template not found: ${command.templateId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 146 | instantiation | mixed | new Error('Template has no card rules') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 152 | instantiation | mixed | new Error(`At least 2 ordered child list items are required (current: ${command. |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 166 | instantiation | mixed | new Error('Parent list item has no paragraph block') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 179 | instantiation | mixed | new Error('Failed to fetch children content') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 287 | instantiation | mixed | new Error(error) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts | 289 | instantiation | mixed | new Error(defaultMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts | 84 | instantiation | mixed | new Error('Template must have id and name') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts | 88 | instantiation | mixed | new Error('Template must have at least one field') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts | 92 | instantiation | mixed | new Error('Template must have at least one card rule') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts | 97 | instantiation | mixed | new Error(`Template already exists: ${template.id}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 69 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 105 | instantiation | mixed | new Error('姝ゅ潡宸茬粡鍒涘缓杩囦慨缂樺崱鐗囷紝璇峰嬁閲嶅鍒涘缓') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 111 | instantiation | mixed | new Error(`Template not found: ${command.templateId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 137 | instantiation | mixed | new Error('Template has no card rules') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 359 | instantiation | mixed | new Error(error) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts | 361 | instantiation | mixed | new Error(defaultMessage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetTemplateQueryHandler.ts | 73 | instantiation | mixed | new Error(`Template not found: ${query.templateId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetXiuyuanQueryHandler.ts | 64 | instantiation | mixed | new Error(`Invalid xiuyuanId: ${query.xiuyuanId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetXiuyuanQueryHandler.ts | 82 | instantiation | mixed | new Error(`Xiuyuan not found: ${query.xiuyuanId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 56 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 68 | instantiation | mixed | new Error('描述符块没有关联的卡片') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 77 | instantiation | mixed | new Error('未找到概念块（标题块或文档块）') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 95 | instantiation | mixed | new Error('无效的 Xiuyuan ID') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 101 | instantiation | mixed | new Error('未找到描述符卡片的 Xiuyuan 实体') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts | 124 | instantiation | mixed | new Error('更新 Xiuyuan meta 失败') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts | 34 | instantiation | mixed | new Error('Concept block does not exist') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts | 43 | instantiation | mixed | new CreateXiuyuanFromBlocksUseCase(
      xiuyuanRepository,
      templateRegis |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts | 58 | instantiation | mixed | new Error(`Failed to create concept card: ${errorMsg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptLocator.ts | 6 | instantiation | mixed | new XiuyuanSiyuanAdapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 13 | instantiation | mixed | new Set([
  'builtin-concept-descriptor',
  'builtin-concept-descriptor-reverse' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 19 | instantiation | mixed | new Set([
  'builtin-concept-definition',
  'builtin-concept-definition-forward' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 25 | instantiation | mixed | new RegExp(`;<>\|${FW_SEMICOLON}${L_ANGLE}${R_ANGLE}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 26 | instantiation | mixed | new RegExp(`;<\|${FW_SEMICOLON}${L_ANGLE}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 27 | instantiation | mixed | new RegExp(`::\|${FW_COLON}${FW_COLON}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 28 | instantiation | mixed | new RegExp(`:>\|${FW_COLON}${R_ANGLE}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts | 29 | instantiation | mixed | new RegExp(`:<\|${FW_COLON}${L_ANGLE}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\FinalizeXiuyuanCreation.ts | 64 | instantiation | mixed | new Error(`Failed to create card for face ${i}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\common\application\BaseCardRenderService.ts | 279 | instantiation | mixed | new Map<string, BreadcrumbItem>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 69 | instantiation | mixed | new Error('No xiuyuanID found in card') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 75 | instantiation | mixed | new Error(`Xiuyuan not found: ${xiuyuanID}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 81 | instantiation | mixed | new Error('Missing concept block ID in field mapping') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 90 | instantiation | mixed | new Error(`Concept block has no content: ${conceptBlockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 139 | instantiation | mixed | new Error('Plugin not found') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 145 | instantiation | mixed | new Error('XiuyuanApplicationService not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 175 | instantiation | mixed | new Error(`Block not found: ${blockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts | 187 | instantiation | mixed | new Error('Lute not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 112 | instantiation | mixed | new Error('No xiuyuanID found in card') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 120 | instantiation | mixed | new Error(`Xiuyuan not found: ${xiuyuanID}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 128 | instantiation | mixed | new Error(`Invalid faceIndex: ${faceIndex}, total faces: ${faces?.length \|\| 0} |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 154 | instantiation | mixed | new Error('Missing concept or definition block ID in CardFace') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 183 | instantiation | mixed | new Error(`Definition block has no content: ${definitionBlockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 299 | instantiation | mixed | new Error('Plugin not found') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 306 | instantiation | mixed | new Error('XiuyuanApplicationService not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 328 | instantiation | mixed | new Error(`Xiuyuan not found: ${xiuyuanID}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 348 | instantiation | mixed | new Error(`Concept block not found: ${conceptBlockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts | 490 | instantiation | mixed | new Error('Lute not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\descriptor-card\application\DescriptorCardRenderService.ts | 86 | instantiation | mixed | new DescriptorCard(data) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\descriptor-card\infrastructure\SiyuanBlockAdapter.ts | 34 | instantiation | mixed | new SiyuanKramdownGateway(logger) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts | 61 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts | 78 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts | 89 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 53 | instantiation | mixed | new Map<QuickCardType, ICardFaceStrategy>([
    ['basic', new BasicCardStrategy |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 54 | instantiation | mixed | new BasicCardStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 55 | instantiation | mixed | new ConceptCardStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 56 | instantiation | mixed | new DescriptorCardStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 57 | instantiation | mixed | new ClozeCardStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 58 | instantiation | mixed | new MultiLineCardStrategy() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts | 90 | instantiation | mixed | new Error(`Unknown card type: ${type}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts | 61 | instantiation | mixed | new Adapter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts | 62 | instantiation | mixed | new Repository(adapter, configProvider) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts | 63 | instantiation | mixed | new Service(repository) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardConfigProvider.ts | 66 | instantiation | mixed | new DefaultQuickCardConfigProvider() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardConfigProvider.ts | 72 | instantiation | mixed | new DefaultQuickCardConfigProvider() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts | 53 | instantiation | mixed | new DefaultQuickCardConfigProvider() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts | 187 | instantiation | mixed | new CardFace({
        html: frontHtmlRendered,
        hiddenTypes: front.hid |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts | 191 | instantiation | mixed | new CardFace({
        html: backHtmlRendered,
        hiddenTypes: back.hidde |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts | 197 | instantiation | mixed | new QuickCard({
        id: cardId \|\| `quick-card-${blockId}`,
        block |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\SiyuanBlockAdapter.ts | 48 | instantiation | mixed | new SiyuanKramdownGateway(logger) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\detectCardType.ts | 184 | instantiation | mixed | new Map<string, CardType>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\extractCardMeta.ts | 93 | instantiation | mixed | new Map<string, CardMeta>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\ProviderBackedQueueStrategy.ts | 184 | instantiation | mixed | new Error(`Provider ${this.provider.id} does not support insertAt`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 65 | instantiation | mixed | new Map<string, riff.RiffReviewCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 66 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 67 | instantiation | mixed | new Map<string, LegacyQueueItem>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 252 | instantiation | mixed | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 288 | instantiation | mixed | new Set((blockIDs \|\| []).map((id) => String(id \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts | 289 | instantiation | mixed | new Map<string, number>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts | 41 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts | 42 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts | 120 | instantiation | mixed | new WebSocket(url) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 202 | instantiation | mixed | new Dialog({
      content: htmlContent,
      width: '80vw',
      height: ' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 271 | instantiation | mixed | new Protyle(this.app, renderElement, {
        blockId: '',
        action: [C |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 367 | instantiation | mixed | new MouseEvent('click', {
          bubbles: false,
          cancelable: true |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 472 | instantiation | mixed | new Menu() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 580 | instantiation | mixed | new Protyle(this.app, renderElement, {
        blockId: card.blockID,  // 关键：传入 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 672 | instantiation | mixed | new Protyle(this.app, answerContainer, {
          blockId: this.currentAnswerB |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts | 783 | instantiation | mixed | new Menu() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\abstraction\Command.ts | 10 | instantiation | mixed | new Map<string, IQueueCommand<TContext>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 1 | instantiation | mixed | new TextEncoder() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 2 | instantiation | mixed | new TextDecoder() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 19 | instantiation | mixed | new Uint8Array(binary.length) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 81 | instantiation | mixed | new Uint8Array(12) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 91 | instantiation | mixed | new Uint8Array(encrypted) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts | 114 | instantiation | mixed | new Uint8Array(decrypted) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\storageFile.ts | 31 | instantiation | mixed | new Error('writePluginFile is not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\storageFile.ts | 38 | instantiation | mixed | new Error('writePluginFile is not available') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 50 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 79 | instantiation | mixed | new QueryCache<Neighbor[]>(5000, 50) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 80 | instantiation | mixed | new QueryCache<string[]>(10000, 100) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 81 | instantiation | mixed | new QueryCache<BlockData \| null>(30000, 200) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 258 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 271 | instantiation | mixed | new Map<string, boolean>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 288 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 307 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 324 | instantiation | mixed | new Map<string, BlockData>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 347 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts | 370 | instantiation | mixed | new Map<string, Neighbor>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts | 49 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts | 77 | instantiation | mixed | new QueryCache<Neighbor[]>(5000, 80) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts | 78 | instantiation | mixed | new QueryCache<string[]>(10000, 120) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts | 79 | instantiation | mixed | new QueryCache<BlockData>(30000, 300) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts | 429 | instantiation | mixed | new Map<string, Neighbor>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\HistoryFilter.ts | 25 | instantiation | mixed | new Error(`Invalid capacity: ${capacity}. Capacity must be at least 1.`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\HistoryFilter.ts | 28 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueueConfig.ts | 120 | instantiation | mixed | new ConfigValidationError(
        `Invalid configuration:\n${result.errors.map |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueueStorage.ts | 393 | instantiation | mixed | new Map<string, MissedBlock[]>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 61 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 72 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 85 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 199 | instantiation | mixed | new Error(`API request failed: ${response.status}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 205 | instantiation | mixed | new Error(`API error: ${message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts | 715 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\WeightedWalkEngine.ts | 120 | instantiation | mixed | new Error('Weighted random selection invariant violated: no candidate selected') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\schedulers\CompositeScheduler.ts | 62 | instantiation | mixed | new Error(`No scheduler found for ID '${schedulerId}' and no default configured` |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts | 55 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts | 66 | instantiation | mixed | new QueueStateManager() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts | 85 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts | 123 | instantiation | mixed | new Set(blockIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts | 23 | instantiation | mixed | new ImprovedTopicScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts | 26 | instantiation | mixed | new SM15Scheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts | 28 | instantiation | mixed | new Error('Engine "sm2" is no longer supported. Please migrate to "simple-fsrs", |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts | 31 | instantiation | mixed | new TSFSRSScheduler(params) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts | 33 | instantiation | mixed | new Error(`Unsupported scheduler engine: ${engine}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\FI_G.ts | 111 | instantiation | mixed | new FI_G(sm, data.points) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\ForgettingCurves.ts | 47 | instantiation | mixed | new ForgettingCurve(partialPoints) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\ForgettingCurves.ts | 127 | instantiation | mixed | new ForgettingCurves(sm, data) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 39 | instantiation | mixed | new FI_G(this) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 40 | instantiation | mixed | new ForgettingCurves(this) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 41 | instantiation | mixed | new RFM(this) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 42 | instantiation | mixed | new OFM(this) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 52 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 84 | instantiation | mixed | new SM15(data.requestedFI, data.intervalBase) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts | 98 | instantiation | mixed | new SM15(10, 1 * 24 * 60 * 60 * 1000) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 56 | instantiation | mixed | new Date(0) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 67 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 82 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 188 | instantiation | mixed | new Date(now.getTime() + this.optimumInterval) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 197 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 245 | instantiation | mixed | new SM15Item(sm, data.value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 247 | instantiation | mixed | new Date(item.dueDate) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts | 249 | instantiation | mixed | new Date(item.previousDate) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\shared\domain\events\DomainEvent.ts | 70 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\shared\domain\events\EventBus.ts | 59 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\siyuan\riff.ts | 68 | instantiation | mixed | new Map(blockInfos.map(info => [info.id, info])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\infrastructure\BlockRepository.ts | 35 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStoragePersistence.ts | 62 | instantiation | mixed | new Error('Invalid unified storage structure') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStoragePersistence.ts | 85 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts | 27 | instantiation | mixed | new Error('BlockId cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts | 34 | instantiation | mixed | new Error(`Invalid BlockId format: ${value}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts | 37 | instantiation | mixed | new BlockId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 48 | instantiation | mixed | new Error('FaceIndex must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 51 | instantiation | mixed | new Card(
      props.id,
      props.xiuyuanId,
      props.faceIndex,
     |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 75 | instantiation | mixed | new Error('FaceIndex must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 78 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 79 | instantiation | mixed | new Card(
      id,
      xiuyuanId,
      faceIndex,
      ScheduleInfo.cre |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 127 | instantiation | mixed | new Error(`Invalid rating: ${rating}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 131 | instantiation | mixed | new Card(
      this.id,
      this.xiuyuanId,
      this.faceIndex,
      n |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 137 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 150 | instantiation | mixed | new Error('New due date cannot be earlier than creation date') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 172 | instantiation | mixed | new Card(
      this.id,
      this.xiuyuanId,
      this.faceIndex,
      n |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 178 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts | 185 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts | 45 | instantiation | mixed | new Error('Question cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts | 51 | instantiation | mixed | new Error('Answer must be provided (can be empty string)') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts | 58 | instantiation | mixed | new Error(`Invalid questionBlockId format: ${props.questionBlockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts | 65 | instantiation | mixed | new Error(`Invalid answerBlockId format: ${props.answerBlockId}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts | 69 | instantiation | mixed | new CardFace(
      props.question.trim(),
      props.answer, // 不 trim，保留空字符 |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts | 27 | instantiation | mixed | new Error('CardId cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts | 32 | instantiation | mixed | new Error('CardId cannot exceed 100 characters') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts | 35 | instantiation | mixed | new CardId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts | 38 | instantiation | mixed | new Error('Priority must be a number') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts | 43 | instantiation | mixed | new Error('Priority must be an integer') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts | 48 | instantiation | mixed | new Error(`Priority must be between ${Priority.MIN_PRIORITY} and ${Priority.MAX_ |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts | 51 | instantiation | mixed | new Priority(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts | 58 | instantiation | mixed | new Priority(Priority.DEFAULT_PRIORITY) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 52 | instantiation | mixed | new Error('Stability must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 57 | instantiation | mixed | new Error('Difficulty must be between 0 and 10') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 62 | instantiation | mixed | new Error('Reps must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 67 | instantiation | mixed | new Error('Lapses must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 72 | instantiation | mixed | new Error('ElapsedDays must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 77 | instantiation | mixed | new Error('ScheduledDays must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 82 | instantiation | mixed | new Error('Learning step must be >= 0') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 85 | instantiation | mixed | new ScheduleInfo(
      props.due,
      props.stability,
      props.difficu |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 103 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 104 | instantiation | mixed | new ScheduleInfo(
      now,
      0,
      0,
      0,
      0,
      Car |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 111 | instantiation | mixed | new Date(0) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts | 139 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts | 49 | instantiation | mixed | new Error(
        `Invalid faceIndex: ${faceIndex}. Must be between 0 and ${fa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts | 58 | instantiation | mixed | new Error(
          `Card with ID ${cardId.getValue()} already exists in this  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts | 93 | instantiation | mixed | new Error(
          `Failed to create card for face ${i}: ${cardResult.error.m |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts | 121 | instantiation | mixed | new Error('Xiuyuan must have at least one face to create a card') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts | 126 | instantiation | mixed | new Error(
        `Invalid faceIndex: ${faceIndex}. Must be between 0 and ${fa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 42 | instantiation | mixed | new Error(
        `Card with ID ${cardId.getValue()} not found in Xiuyuan ${xi |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 49 | instantiation | mixed | new Error(
        `Card ${cardId.getValue()} does not belong to Xiuyuan ${xiuy |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 83 | instantiation | mixed | new Error(
          `Card with ID ${cardId.getValue()} not found in Xiuyuan ${ |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 93 | instantiation | mixed | new Error(
          `Failed to delete card ${cardId.getValue()}: ${deleteResul |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 140 | instantiation | mixed | new Error(
        `Card with ID ${cardId.getValue()} not found in Xiuyuan ${xi |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts | 147 | instantiation | mixed | new Error(
        `Card ${cardId.getValue()} does not belong to Xiuyuan ${xiuy |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardTypeDetectionService.ts | 77 | instantiation | mixed | new Map<string, CardType>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts | 27 | instantiation | mixed | new Error('TemplateId cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts | 32 | instantiation | mixed | new Error('TemplateId cannot exceed 50 characters') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts | 38 | instantiation | mixed | new Error('TemplateId can only contain letters, numbers, underscores, and hyphen |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts | 41 | instantiation | mixed | new TemplateId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 74 | instantiation | mixed | new Error('Xiuyuan must have at least one BlockId') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 79 | instantiation | mixed | new Error('Xiuyuan must have at least one CardFace') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 94 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 98 | instantiation | mixed | new Xiuyuan(
      id,
      props.blockIDs,
      props.templateID,
      p |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 104 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 111 | instantiation | mixed | new XiuyuanCreatedEvent(
      xiuyuan.id.getValue(),
      xiuyuan.templateID |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 129 | instantiation | mixed | new Error('Xiuyuan must have at least one BlockId') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 134 | instantiation | mixed | new Error('Xiuyuan must have at least one CardFace') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 137 | instantiation | mixed | new Xiuyuan(
      props.id,
      props.blockIDs,
      props.templateID,
  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 162 | instantiation | mixed | new Error(`Invalid faceIndex: ${faceIndex}. Must be between 0 and ${this.faces.l |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 189 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 192 | instantiation | mixed | new CardCreatedEvent(
      this.id.getValue(),
      card.getId().getValue(), |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 213 | instantiation | mixed | new Error('Card does not belong to this Xiuyuan') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 219 | instantiation | mixed | new Error(`Card already exists: ${card.getId().getValue()}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 226 | instantiation | mixed | new Error(`Invalid faceIndex: ${faceIndex}. Must be between 0 and ${this.faces.l |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 233 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 236 | instantiation | mixed | new CardCreatedEvent(
      this.id.getValue(),
      card.getId().getValue(), |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 263 | instantiation | mixed | new Error(`Card not found: ${cardId.getValue()}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 270 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 273 | instantiation | mixed | new CardDeletedEvent(
      this.id.getValue(),
      cardId.getValue()
    ) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 300 | instantiation | mixed | new Error(`Card not found: ${cardId.getValue()}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 305 | instantiation | mixed | new Error('Card does not belong to this Xiuyuan') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 313 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 513 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 525 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 542 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 559 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 574 | instantiation | mixed | new Error(`Invalid A-Factor: ${aFactor}. Must be between 1.0 and 6.5`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts | 581 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts | 27 | instantiation | mixed | new Error('XiuyuanId cannot be empty') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts | 32 | instantiation | mixed | new Error('XiuyuanId cannot exceed 100 characters') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts | 35 | instantiation | mixed | new XiuyuanId(value) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\InMemoryDeletionTracker.ts | 25 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts | 51 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts | 82 | instantiation | mixed | new Error(`Template validation failed: ${errors.join(', ')}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts | 196 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 18 | instantiation | mixed | new SafetyAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 19 | instantiation | mixed | new PriorityCalculator() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 20 | instantiation | mixed | new DependencyAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 71 | instantiation | mixed | new Set(scanResult.oldArchitectureUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 72 | instantiation | mixed | new Set(scanResult.newArchitectureUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 74 | instantiation | mixed | new Map<string, Set<string>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 76 | instantiation | mixed | new Set([...oldFiles, ...newFiles]) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts | 80 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts | 43 | instantiation | mixed | new ArchitectureScanner() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts | 44 | instantiation | mixed | new InterfaceValidator() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts | 45 | instantiation | mixed | new MigrationAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts | 46 | instantiation | mixed | new ReportGenerator() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts | 47 | instantiation | mixed | new ApiCompatibilityChecker() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\reporters\ReportGenerator.ts | 23 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts | 24 | instantiation | mixed | new ImportAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts | 25 | instantiation | mixed | new TypeUsageAnalyzer() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts | 152 | instantiation | mixed | new Set(oldUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts | 153 | instantiation | mixed | new Set(newUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts | 154 | instantiation | mixed | new Set(mixedUsages.map(u => u.filePath)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ImportAnalyzer.ts | 25 | instantiation | mixed | new Map<string, ArchitectureType>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\utils\output.ts | 53 | instantiation | mixed | new NodeDiagnosticsOutput() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts | 31 | instantiation | mixed | new Set(['queues-index.ts']) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts | 64 | instantiation | mixed | new Map(
                newClass.methods.map(method => [method.name, method]) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts | 296 | instantiation | mixed | new Map<string, ApiClassSignature>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\InterfaceValidator.ts | 49 | instantiation | mixed | new MethodChecker(checker) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\InterfaceValidator.ts | 50 | instantiation | mixed | new TypeChecker(checker) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 210 | instantiation | mixed | new ModeError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 221 | instantiation | mixed | new QueueError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 232 | instantiation | mixed | new SyncError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 243 | instantiation | mixed | new StorageError(message, context) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 259 | instantiation | mixed | new NetworkError(message, statusCode, context) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 280 | instantiation | mixed | new StorageError('存储空间不足，请清理旧数据', {
                originalError: error,
       |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 287 | instantiation | mixed | new NetworkError('网络连接失败，请检查网络连接', undefined, {
                originalError: e |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts | 293 | instantiation | mixed | new DataSourceError(`${defaultMessage}: ${message}`, 'UNKNOWN_ERROR', {
        |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 81 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 95 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 116 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 135 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 154 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 173 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 192 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 200 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 214 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 235 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 252 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 266 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 280 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 294 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 308 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 317 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 326 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 335 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 345 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts | 353 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 122 | instantiation | mixed | new FileOperationError(
        'read',
        fileName,
        error insta |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 125 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 138 | instantiation | mixed | new FileOperationError(
        'write',
        fileName,
        error inst |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 141 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 199 | instantiation | mixed | new FileOperationError(
        'read',
        fileName,
        error insta |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 202 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 219 | instantiation | mixed | new FileOperationError(
          'write',
          fileName,
          new  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 222 | instantiation | mixed | new Error(`Data is not JSON-serializable: ${error.message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 228 | instantiation | mixed | new FileOperationError(
        'write',
        fileName,
        error inst |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 231 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 258 | instantiation | mixed | new FileOperationError(
        'read',
        fileName,
        error insta |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 261 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 275 | instantiation | mixed | new FileOperationError(
        'write',
        fileName,
        error inst |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts | 278 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 90 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 112 | instantiation | mixed | new Map(Object.entries(data)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 121 | instantiation | mixed | new QueuePersistenceError(
        'init',
        'all',
        error insta |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 124 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 147 | instantiation | mixed | new QueuePersistenceError(
        'set',
        key,
        new Error('Ser |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 150 | instantiation | mixed | new Error('Service not initialized') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 166 | instantiation | mixed | new QueuePersistenceError(
          'set',
          key,
          new Erro |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 169 | instantiation | mixed | new Error(`Value is not JSON-serializable: ${error.message}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 181 | instantiation | mixed | new QueuePersistenceError(
        'delete',
        key,
        new Error(' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 184 | instantiation | mixed | new Error('Service not initialized') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 211 | instantiation | mixed | new QueuePersistenceError(
        'flush',
        'all',
        new Error( |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 214 | instantiation | mixed | new Error('Service not initialized') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 263 | instantiation | mixed | new QueuePersistenceError(
        'save',
        'all',
        error instance |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts | 266 | instantiation | mixed | new Error(String(error)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 42 | instantiation | mixed | new Error(`Siyuan API Error: invalid response envelope from ${endpoint}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 46 | instantiation | mixed | new Error(`Siyuan API Error: ${result.msg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 284 | instantiation | mixed | new FormData() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 289 | instantiation | mixed | new Blob([file], { type: 'application/json' }) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 301 | instantiation | mixed | new Error('Failed to write file: invalid response envelope') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts | 304 | instantiation | mixed | new Error(`Failed to write file: ${result.msg}`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\scripts\migrate-xiuyuan-priority.ts | 69 | instantiation | mixed | new Error('Failed to save migrated data') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\scripts\migrateToTopicItem.ts | 70 | instantiation | mixed | new Error('Unexpected riff response format while migrating cards') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts | 19 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts | 20 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts | 98 | instantiation | mixed | new SRSBrowserAdapter(manager) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardActions.ts | 48 | instantiation | mixed | new CardTypeMarkerService(storage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardActions.ts | 137 | instantiation | mixed | new Promise<boolean>((resolve) => {
      const dialog = document.createElement |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts | 23 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts | 53 | instantiation | mixed | new Set(data.blockIds \|\| []) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts | 129 | instantiation | mixed | new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(' |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts | 130 | instantiation | mixed | new Error('Detection timeout after 30s') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts | 165 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, remainingTime)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 25 | instantiation | mixed | new Set(rows.map((row) => String(row.blockId \|\| '')).filter(Boolean)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 30 | instantiation | mixed | new Map<string, BrowserCard>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 62 | instantiation | mixed | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 82 | instantiation | mixed | new Map(updatedCards.map((card) => [card.blockId, card])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 83 | instantiation | mixed | new Set(updatedCards.map((card) => card.blockId)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 123 | instantiation | mixed | new Set(cardIds) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts | 132 | instantiation | mixed | new Set(rowsToRemove.map((row) => row.blockId)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\usePreviewPanel.ts | 92 | instantiation | mixed | new Protyle(props.app, previewBodyRef.value, {
        blockId: blockId,
        |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useQueueBridge.ts | 22 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\BlockIdsDataSource.ts | 166 | instantiation | mixed | new Error('set-priority requires UnifiedDataSourceManager') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts | 271 | instantiation | mixed | new Date(Date.UTC(y, m, d, h, min, s)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts | 274 | instantiation | mixed | new Date(timeStr) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts | 382 | instantiation | mixed | new Map(selectedRows.map((row) => [row.blockId, row])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts | 456 | instantiation | mixed | new ConfigManager(storage) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts | 503 | instantiation | mixed | new Error('Queue unavailable') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueryDataSource.ts | 54 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueryDataSource.ts | 107 | instantiation | mixed | new Map(joined.map((card) => [card.blockId, card])) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 224 | instantiation | mixed | new Map<string, string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 441 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 441 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 442 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 442 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 446 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 447 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 519 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 520 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 527 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 528 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 536 | instantiation | mixed | new Set(types) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 541 | instantiation | mixed | new Set(filter.cardStatus) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 684 | instantiation | mixed | new Date(dateRangeValue.gte) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 685 | instantiation | mixed | new Date(dateRangeValue.lte) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts | 715 | instantiation | mixed | new FilterService() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserQueueView.ts | 174 | instantiation | mixed | new Error('No queue type selected') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\types.ts | 205 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 91 | instantiation | mixed | new FinalDrillDataSource(manager, {
        docId,
        preset,
        query |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 99 | instantiation | mixed | new RetrievalDataSource(manager, {
        docId,
        preset,
        queryT |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 107 | instantiation | mixed | new FilterGroupDataSource(manager, {
        docId,
        preset,
        quer |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 115 | instantiation | mixed | new IncrementalLearningDataSource(manager, {
        docId,
        preset,
     |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 126 | instantiation | mixed | new BlockIdsDataSource({
        id: 'neural-roam',
        label: resolveI18nLa |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 160 | instantiation | mixed | new BlockIdsDataSource({
    id: queueId,
    label: queueId,
    blockIds,
     |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 187 | instantiation | mixed | new DeckDataSource(
    manager, 
    {
      preset,
      currentDocId: docId  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 206 | instantiation | mixed | new QueryDataSource(sqlStmt) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 228 | instantiation | mixed | new FinalDrillDataSource(manager, {
      preset,
      queryText,
      cardTyp |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 236 | instantiation | mixed | new RetrievalDataSource(manager, {
      preset,
      queryText,
      cardType |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 244 | instantiation | mixed | new FilterGroupDataSource(manager, {
      preset,
      queryText,
      cardTy |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 253 | instantiation | mixed | new IncrementalLearningDataSource(manager, {
      preset,
      queryText,
     |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 263 | instantiation | mixed | new BlockIdsDataSource({
      id: 'neural-roam',
      label: resolveI18nLabel( |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts | 279 | instantiation | mixed | new DeckDataSource(
      manager, 
      {
        preset,
        currentDocId |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\formatters.ts | 51 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\formatters.ts | 207 | instantiation | mixed | new RegExp(`(${escapeRegex(keyword)})`, 'gi') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts | 29 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts | 36 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts | 142 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts | 304 | instantiation | mixed | new Set<string>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\validators.ts | 56 | instantiation | mixed | new Date(date) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\validators.ts | 286 | instantiation | mixed | new URL(url) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\menu\TopBar.ts | 86 | instantiation | mixed | new Menu('fsrs-topbar-menu') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\composables\useCardTypeCache.ts | 64 | instantiation | mixed | new LRUCache<string, CardTypeDetectionResult>(maxSize) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\adapters\SubsetPracticeAdapter.ts | 283 | instantiation | mixed | new Error('SubsetPracticeAdapter requires review siyuan api') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\composables\useCardTypeCache.ts | 29 | instantiation | mixed | new Map<string, CardTypeResult>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\providers\utils\SessionManager.ts | 74 | instantiation | mixed | new SortedSequencer<TCard>({
      getDueMs: options.getDueMs,
      getPriori |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts | 29 | instantiation | mixed | new Array(items.length) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts | 189 | instantiation | mixed | new Error(timeoutError) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts | 201 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, ms)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\configUtils.ts | 69 | instantiation | mixed | new Error(`Invalid dayStartHour: ${dayStartHour}, must be 0-23`) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\configUtils.ts | 75 | instantiation | mixed | new Error('SettingsService not initialized') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts | 59 | instantiation | mixed | new Date() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts | 67 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts | 72 | instantiation | mixed | new Date(now) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts | 77 | instantiation | mixed | new Date(todayStart) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts | 120 | instantiation | mixed | new Date(timestamp) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 88 | instantiation | mixed | new Dialog({
        title: options.hideTitle ? undefined : options.title,  //  |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 173 | instantiation | mixed | new MouseEvent('click', {
                        bubbles: false,  // 关键修改：不冒泡， |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 222 | instantiation | mixed | new Promise((resolve) => {
        const dialog = new Dialog({
            tit |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 223 | instantiation | mixed | new Dialog({
            title: options.title,
            content: `
        |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 260 | instantiation | mixed | new Promise((resolve) => {
        const inputId = `fsrs-input-${Date.now()}`; |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts | 263 | instantiation | mixed | new Dialog({
            title: options.title,
            content: `
        |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\errorReporter.ts | 137 | instantiation | mixed | new ConsoleErrorReporter() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\EventEmitter.ts | 13 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\EventEmitter.ts | 20 | instantiation | mixed | new Set() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\logger.ts | 133 | instantiation | mixed | new Logger() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\logger.ts | 136 | instantiation | mixed | new Logger(tag) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 92 | instantiation | mixed | new Map<K, V>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 211 | instantiation | mixed | new Map<K, { value: V; timestamp: number }>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 331 | instantiation | mixed | new Map<K, Promise<V>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 426 | instantiation | mixed | new Promise((resolve, reject) => {
      this.queue.push({ key, resolve, reject |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 489 | instantiation | mixed | new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      re |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts | 551 | instantiation | mixed | new Promise(resolve => setTimeout(resolve, delay)) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance.ts | 10 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance.ts | 136 | instantiation | mixed | new Map() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts | 14 | instantiation | mixed | new Map<string, CacheEntry<T>>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts | 96 | instantiation | mixed | new Map<K, V>() |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts | 179 | instantiation | mixed | new QueryCache<Awaited<ReturnType<T>>>(ttl, maxSize) |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\simpleModeRemovalMigrator.ts | 182 | instantiation | mixed | new Error('Sync failed') |
| H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\sqlOptimizer.ts | 224 | instantiation | mixed | new Error('FROM clause is required') |

## 接口验证结果

### 错误

- **BaseReviewQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts:32)
- **BaseReviewQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts:32)
- **BaseReviewQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts:42)
- **BaseReviewQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts:42)
- **FilterGroupQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts:61)
- **FilterGroupQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts:61)
- **FilterGroupQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts:42)
- **FilterGroupQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts:42)
- **FilterGroupQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts:231)
- **FinalDrillQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts:57)
- **FinalDrillQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts:57)
- **FinalDrillQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts:42)
- **FinalDrillQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts:42)
- **IncrementalLearningQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts:48)
- **IncrementalLearningQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts:48)
- **IncrementalLearningQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts:42)
- **IncrementalLearningQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts:42)
- **IncrementalLearningQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts:157)
- **LeechReviewQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts:27)
- **LeechReviewQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts:27)
- **LeechReviewQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts:42)
- **LeechReviewQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts:42)
- **LeechReviewQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\LeechReviewQueue.ts:73)
- **ManualCardCollectionQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts:32)
- **ManualCardCollectionQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts:32)
- **ManualCardCollectionQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts:42)
- **ManualCardCollectionQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts:42)
- **NeuralRoamQueue.IReviewQueue**: Class does not implement IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:52)
- **NeuralRoamQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:53)
- **NeuralRoamQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:53)
- **NeuralRoamQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:42)
- **NeuralRoamQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:42)
- **NeuralRoamQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:182)
- **NeuralRoamQueue.reorder**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts:322)
- **RetrievalPracticeQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts:45)
- **RetrievalPracticeQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts:45)
- **RetrievalPracticeQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts:42)
- **RetrievalPracticeQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts:42)
- **RetrievalPracticeQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts:148)
- **SubsetReviewQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts:7)
- **SubsetReviewQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts:7)
- **SubsetReviewQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts:42)
- **SubsetReviewQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts:42)
- **SubsetReviewQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts:61)
- **TemporaryDrillQueue.name**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts:7)
- **TemporaryDrillQueue.name**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts:7)
- **TemporaryDrillQueue.type**: Return type mismatch: expected undefined, got undefined (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts:42)
- **TemporaryDrillQueue.type**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts:42)
- **TemporaryDrillQueue.addCard**: Parameter types mismatch with IReviewQueue (H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts:61)

### 警告

- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for getCards
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for addCard
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for removeCard
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for handleReview
- **BaseReviewQueue**: BaseReviewQueue should provide default implementation for isDynamic

## 迁移计划

### 步骤 1: Migrate ManualCardSetStrategy

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 2: Migrate Map

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 3: Migrate Map

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 4: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 5: Migrate Map

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 6: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GraphSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 7: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 8: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 9: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 10: Migrate Set

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 11: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 12: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 13: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 14: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 15: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 16: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 17: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 18: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 19: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 20: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 21: Migrate RuntimeTypeValidator

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 22: Migrate RuntimeTypeValidator

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 23: Migrate TypeMismatchError

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 24: Migrate TypeMismatchError

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 25: Migrate TypeMismatchError

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 26: Migrate TypeMismatchError

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 27: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 28: Migrate CardId

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 29: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 30: Migrate BlockId

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 31: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 32: Migrate Priority

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 33: Migrate Priority

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 34: Migrate Card

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 35: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 36: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 37: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 38: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 39: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 40: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 41: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 42: Migrate Error

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 43: Migrate Date

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 44: Migrate ICardStorage.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 45: Migrate ICardStorage.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 46: Migrate ICardStorage.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 47: Migrate ICardStorage.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 48: Migrate ICardStorage.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\interfaces\ICardStorage.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 49: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 50: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 51: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 52: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 53: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 54: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 55: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 56: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 57: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 58: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 59: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 60: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 61: Migrate ManualCardCollectionQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardCollectionQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 62: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 63: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 64: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 65: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 66: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 67: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 68: Migrate OrderedStaticSubsetQueueBase.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\OrderedStaticSubsetQueueBase.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 69: Migrate LoggableQueue.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\logging\LoggableQueue.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 70: Migrate DynamicDrawSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DynamicDrawSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 71: Migrate DynamicDrawSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DynamicDrawSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 72: Migrate FSRSSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 73: Migrate FSRSSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 74: Migrate GraphSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GraphSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 75: Migrate ListSequencer.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\ListSequencer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 76: Migrate types.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\types.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 77: Migrate normalizers.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\siyuan\riff\normalizers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 78: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 79: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 80: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 81: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 82: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 83: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 84: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 85: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 86: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 87: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 88: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 89: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 90: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 91: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 92: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 93: Migrate type-guards.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\type-guards.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 94: Migrate Card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 95: Migrate Card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\domain\entities\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 96: Migrate CardMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 97: Migrate CardMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 98: Migrate CardMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 99: Migrate CardMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 100: Migrate CardMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\CardMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 101: Migrate RiffMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 102: Migrate RiffMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 103: Migrate RiffMapper.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\mappers\RiffMapper.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 104: Migrate card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 105: Migrate card.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 106: Migrate logging.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\logging.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 107: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 108: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 109: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 110: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 111: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 112: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 113: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 114: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 115: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 116: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 117: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 118: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 119: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 120: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 121: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 122: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 123: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 124: Migrate unified-data-source.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\types\unified-data-source.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 125: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 126: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 127: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 128: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 129: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 130: Migrate cardMigration.ts

**预计时间**: 0.5-1 day

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\cardMigration.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 131: Migrate CacheManagerObserver

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 132: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 133: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 134: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 135: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 136: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 137: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 138: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedReviewAdapter.ts
- @/ui/review/v2/types
- @/types/card
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/core/xiuyuan/cardMeta
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 139: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 140: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 141: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 142: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 143: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 144: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 145: Migrate ManagerSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 146: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 147: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 148: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 149: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 150: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 151: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 152: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 153: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 154: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 155: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 156: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 157: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 158: Migrate ManagerSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 159: Migrate QuerySiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 160: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 161: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 162: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 163: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 164: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 165: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 166: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 167: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 168: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 169: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 170: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 171: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 172: Migrate QuerySiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 173: Migrate CardFilterService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 174: Migrate BlockRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 175: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 176: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 177: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 178: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 179: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 180: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 181: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 182: Migrate GetDueCardsQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 183: Migrate GetCardQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 184: Migrate GetCardsQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 185: Migrate UpdateFSRSCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 186: Migrate DeleteFSRSCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 187: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 188: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 189: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 190: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 191: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 192: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 193: Migrate ReviewSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 194: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 195: Migrate UnifiedDataSourceManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 196: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 197: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 198: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 199: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 200: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 201: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 202: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 203: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 204: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 205: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 206: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 207: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 208: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 209: Migrate QueueError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 210: Migrate RetrievalPracticeQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 211: Migrate IncrementalLearningQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 212: Migrate FilterGroupQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 213: Migrate FinalDrillQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 214: Migrate NeuralRoamQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 215: Migrate SiyuanNeuralRoamCardTypeResolverAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 216: Migrate LeechReviewQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 217: Migrate SiyuanLeechActionEffectsAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 218: Migrate QueueError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 219: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts
- @/core/storage/ports
- @/types
- @/types/result
- @/application/commands/card/UpdateFSRSCardCommand
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 220: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts
- @/core/storage/ports
- @/types
- @/types/result
- @/application/commands/card/UpdateFSRSCardCommand
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 221: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block
- @/utils/logger
- @/types
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 222: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block
- @/utils/logger
- @/types
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 223: Migrate CardBuilderContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block
- @/utils/logger
- @/types
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 224: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block
- @/utils/logger
- @/types
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 225: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 226: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 227: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 228: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 229: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 230: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 231: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 232: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 233: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 234: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 235: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 236: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 237: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 238: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 239: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 240: Migrate QABuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 241: Migrate ClozeBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 242: Migrate DefaultBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 243: Migrate DefaultBuilderStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 244: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 245: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 246: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 247: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 248: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 249: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 250: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 251: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 252: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 253: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 254: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 255: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 256: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 257: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 258: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 259: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 260: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 261: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 262: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 263: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 264: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 265: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 266: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 267: Migrate ConceptNeuralQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 268: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 269: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 270: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 271: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 272: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 273: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 274: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 275: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 276: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 277: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 278: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 279: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 280: Migrate ConceptQueryEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 281: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 282: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 283: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 284: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 285: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 286: Migrate HistoryFilter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 287: Migrate QueryEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 288: Migrate WeightedWalkEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 289: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 290: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 291: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 292: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 293: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 294: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 295: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 296: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 297: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 298: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 299: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 300: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 301: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 302: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 303: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 304: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 305: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 306: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 307: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 308: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 309: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 310: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 311: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 312: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 313: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 314: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 315: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 316: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 317: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 318: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 319: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 320: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 321: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 322: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 323: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 324: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 325: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 326: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 327: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 328: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 329: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 330: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 331: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 332: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 333: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 334: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 335: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 336: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 337: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 338: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 339: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 340: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 341: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 342: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 343: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 344: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 345: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 346: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 347: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 348: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 349: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 350: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 351: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 352: Migrate FSRSSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 353: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 354: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts
- @/types/card
- @/core/storage/UnifiedStorageManager
- @/core/scheduler/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 355: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts
- @/types/card
- @/core/storage/UnifiedStorageManager
- @/core/scheduler/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 356: Migrate BatchProcessor

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 357: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 358: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 359: Migrate Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 360: Migrate PostponeEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 361: Migrate AdvanceEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 362: Migrate SpreadEngine

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 363: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 364: Migrate TSFSRSScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 365: Migrate TSFSRSScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 366: Migrate SM15Scheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 367: Migrate ImprovedTopicScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 368: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 369: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 370: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 371: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 372: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 373: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 374: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 375: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 376: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 377: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 378: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 379: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 380: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 381: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 382: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 383: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 384: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 385: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 386: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 387: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 388: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 389: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 390: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 391: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 392: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 393: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 394: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 395: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 396: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 397: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 398: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 399: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 400: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 401: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 402: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 403: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 404: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 405: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 406: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 407: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 408: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 409: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 410: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 411: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 412: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 413: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 414: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 415: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 416: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 417: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 418: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 419: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 420: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 421: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 422: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 423: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 424: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 425: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 426: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 427: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 428: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 429: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 430: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 431: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 432: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 433: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 434: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 435: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 436: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 437: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 438: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 439: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 440: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 441: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 442: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 443: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 444: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 445: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 446: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 447: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 448: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 449: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 450: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 451: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 452: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 453: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 454: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 455: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 456: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 457: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 458: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 459: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 460: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 461: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 462: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 463: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 464: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 465: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 466: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 467: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 468: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 469: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 470: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 471: Migrate TemplateRegistry

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 472: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 473: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 474: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 475: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 476: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 477: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 478: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 479: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 480: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 481: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 482: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 483: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 484: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 485: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 486: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 487: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 488: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 489: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 490: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 491: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 492: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 493: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 494: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 495: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 496: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 497: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 498: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 499: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 500: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 501: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 502: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 503: Migrate CardCacheManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 504: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 505: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 506: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 507: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 508: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 509: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 510: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 511: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 512: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 513: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 514: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 515: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 516: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 517: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 518: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 519: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 520: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 521: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 522: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 523: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 524: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 525: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 526: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 527: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 528: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 529: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 530: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 531: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 532: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 533: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 534: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 535: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 536: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 537: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 538: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 539: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 540: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts
- @/application/interfaces/ICardDataSource
- @/types/unified-data-source
- @/core/scheduler/rescheduleService
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 541: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts
- @/application/interfaces/ICardDataSource
- @/types/unified-data-source
- @/core/scheduler/rescheduleService
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 542: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts
- @/application/interfaces/ICardDataSource
- @/types/unified-data-source
- @/core/scheduler/rescheduleService
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 543: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts
- @/application/interfaces/ICardDataSource
- @/types/unified-data-source
- @/core/scheduler/rescheduleService
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 544: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 545: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 546: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 547: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 548: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 549: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 550: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 551: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 552: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 553: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 554: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 555: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 556: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 557: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 558: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 559: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 560: Migrate ReviewViewController

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 561: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 562: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 563: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 564: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 565: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 566: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 567: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 568: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 569: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 570: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 571: Migrate StorageFileJsonAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 572: Migrate Setting

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 573: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 574: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 575: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 576: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\plugin-sample\src\index.ts
- siyuan
- siyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 577: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 578: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 579: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 580: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 581: Migrate EventBus

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 582: Migrate FileService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 583: Migrate QueuePersistenceService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 584: Migrate SettingsService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 585: Migrate ReviewLogService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 586: Migrate RiffBlacklistService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 587: Migrate CardContentQueryService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 588: Migrate DialogManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 589: Migrate MenuManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 590: Migrate TabManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 591: Migrate TabApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 592: Migrate DockManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 593: Migrate PracticeQueueManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 594: Migrate CardTypeDetectionService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 595: Migrate XiuyuanRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 596: Migrate CardCreationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 597: Migrate CardDeletionService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 598: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 599: Migrate CreateCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 600: Migrate DeleteCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 601: Migrate DeleteCardsUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 602: Migrate UpdateCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 603: Migrate CardReadModel

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 604: Migrate CardScheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 605: Migrate CardApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 606: Migrate CardScheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 607: Migrate CardFilterService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 608: Migrate CardSortService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 609: Migrate BrowserApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 610: Migrate ReviewApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 611: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 612: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 613: Migrate StorageManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 614: Migrate UnifiedStorageManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 615: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 616: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 617: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 618: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 619: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 620: Migrate XiuyuanRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 621: Migrate CardTypeDetectionServiceClass

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 622: Migrate XiuyuanRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 623: Migrate CardCreationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 624: Migrate CardDeletionService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 625: Migrate CardScheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 626: Migrate EventBus

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 627: Migrate InMemoryDeletionTracker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 628: Migrate CreateCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 629: Migrate DeleteCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 630: Migrate DeleteCardsUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 631: Migrate UpdateCardUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 632: Migrate CardReadModel

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 633: Migrate CardApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 634: Migrate UnifiedStorageCardUpdateAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 635: Migrate SiyuanErrorNotificationAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 636: Migrate RescheduleService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 637: Migrate SchedulerRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 638: Migrate CardCreationHelper

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 639: Migrate BlockMenuHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 640: Migrate ApplicationContext

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 641: Migrate AdvancedDataRouter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 642: Migrate XiuyuanSyncSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 643: Migrate CardTypeDetectionServiceClass2

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 644: Migrate XiuyuanRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 645: Migrate CardTypeDetectionService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 646: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 647: Migrate XiuyuanSyncService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 648: Migrate RiffSyncEventHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 649: Migrate TransactionWebSocketService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 650: Migrate RiffSyncHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 651: Migrate AutoCardHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 652: Migrate CardTypeDetectionService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 653: Migrate XiuyuanRepository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 654: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 655: Migrate XiuyuanApplicationService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 656: Migrate TransactionWebSocketService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 657: Migrate RiffSyncHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 658: Migrate AutoCardHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 659: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 660: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 661: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\ApplicationContext.ts
- siyuan
- @/index
- @/core/storage
- @/core/storage/UnifiedStorageManager
- @/core/storage/UnifiedStoragePersistence
- @/core/scheduler
- @/core/scheduler/adapters/UnifiedStorageCardUpdateAdapter
- @/infrastructure/notifications/SiyuanErrorNotificationAdapter
- @/application/services/UnifiedDataSourceManager
- @/application/managers/DialogManager
- @/application/managers/MenuManager
- @/application/managers/TabManager
- @/application/managers/DockManager
- @/application/managers/PracticeQueueManager
- @/application/services/TabApplicationService
- @/application/services/XiuyuanApplicationService
- @/application/managers/BlockMenuHandler
- @/application/services/XiuyuanSyncService
- @/core/infrastructure/websocket/TransactionWebSocketService
- @/types/unified-data-source
- @/application/queries/DataAccessFacade
- @/core/xiuyuan/infrastructure/XiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/application/usecases/card/CreateCardUseCase
- @/application/usecases/card/DeleteCardUseCase
- @/application/usecases/card/DeleteCardsUseCase
- @/application/usecases/card/UpdateCardUseCase
- @/application/services/CardApplicationService
- @/infrastructure/queries/CardReadModel
- @/application/helpers/CardCreationHelper
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/application/services/BrowserApplicationService
- @/application/services/ReviewApplicationService
- @/core/shared/domain/events/EventBus
- @/infrastructure/services/FileService
- @/infrastructure/services/QueuePersistenceService
- @/application/services/SettingsService
- @/application/services/ReviewLogService
- @/application/services/RiffBlacklistService
- @/application/queries/CardContentQueryService
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/utils/logger
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/infrastructure/events/RiffSyncEventHandler
- @/types/settings

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 662: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts
- @/utils/dialog
- @/ui/review/v2/ReviewView.vue
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 663: Migrate UnifiedQueueStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts
- @/utils/dialog
- @/ui/review/v2/ReviewView.vue
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 664: Migrate UnifiedReviewAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\factories\createUnifiedReviewDialog.ts
- @/utils/dialog
- @/ui/review/v2/ReviewView.vue
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 665: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 666: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 667: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 668: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 669: Migrate AutoCardSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 670: Migrate AutoCardRiffAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 671: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 672: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 673: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 674: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 675: Migrate CardCreationHelper

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 676: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 677: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 678: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 679: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\AutoCardHandler.ts
- @/index
- @/infrastructure/siyuan/AutoCardSiyuanAdapter
- @/infrastructure/siyuan/AutoCardRiffAdapter
- @/utils/logger
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 680: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\handlers\RiffSyncHandler.ts
- @/application/services/XiuyuanSyncService
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 681: Migrate DialogManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 682: Migrate DialogManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 683: Migrate ManagerSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 684: Migrate LeechReviewQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 685: Migrate SiyuanLeechActionEffectsAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 686: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 687: Migrate SubsetReviewQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 688: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 689: Migrate UnifiedQueueStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 690: Migrate UnifiedReviewAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 691: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 692: Migrate UnifiedQueueStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 693: Migrate UnifiedReviewAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 694: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 695: Migrate TemporaryDrillQueue

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\DialogManager.ts
- siyuan
- @/utils/dialog
- @/ui/settings
- @/ui/browser/SRSBrowser.vue
- @/ui/xiuyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/application/factories/createUnifiedReviewDialog
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/ui/review/v2
- @/core/queue/domain/LeechReviewQueue
- @/core/queue/domain/SubsetReviewQueue
- @/core/queue/domain/TemporaryDrillQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/utils/logger
- @/types/settings
- @/core/xiuyuan/types
- @/application/services/XiuyuanApplicationService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 696: Migrate MenuManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\MenuManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 697: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\MenuManager.ts
- siyuan
- siyuan
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 698: Migrate ReviewSyncDomainEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\ReviewSyncManager.ts
- @/application/services/XiuyuanSyncService
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 699: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\ReviewSyncManager.ts
- @/application/services/XiuyuanSyncService
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 700: Migrate TabManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 701: Migrate TabManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 702: Migrate TabManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 703: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.test.ts
- vitest
- siyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 704: Migrate ManagerSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts
- siyuan
- siyuan
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/review/v2
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/core/extensions/QueueProvider
- @/core/queue/abstraction/Strategy
- @/ui/review/v2/types
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/utils/logger
- electron

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 705: Migrate UnifiedReviewAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts
- siyuan
- siyuan
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/review/v2
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/core/extensions/QueueProvider
- @/core/queue/abstraction/Strategy
- @/ui/review/v2/types
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/utils/logger
- electron

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 706: Migrate UnifiedQueueStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\TabManager.ts
- siyuan
- siyuan
- vue
- @/ui/browser/SRSBrowser.vue
- @/ui/review/v2
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/core/extensions/QueueProvider
- @/core/queue/abstraction/Strategy
- @/ui/review/v2/types
- @/application/adapters/UnifiedQueueStrategy
- @/application/adapters/UnifiedReviewAdapter
- @/types/unified-data-source
- @/utils/logger
- electron

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 707: Migrate LRUCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts
- @/types/unified-data-source
- @/utils/performance-helpers
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 708: Migrate LRUCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts
- @/types/unified-data-source
- @/utils/performance-helpers
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 709: Migrate LRUCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\observers\CacheManagerObserver.ts
- @/types/unified-data-source
- @/utils/performance-helpers
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 710: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetDueCardsQueryHandler.ts
- @/core/card/domain/services/CardScheduleService

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 711: Migrate QuerySiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 712: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 713: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 714: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 715: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 716: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\CardContentQueryService.ts
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 717: Migrate BrowserSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types/unified-data-source
- @/application/ports/BrowserSiyuanPort
- @/infrastructure/siyuan/BrowserSiyuanAdapter
- @/ui/browser/datasource/DeckDataSource
- @/ui/browser/utils/dataSourceFactory
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 718: Migrate GetBrowserCardsQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types/unified-data-source
- @/application/ports/BrowserSiyuanPort
- @/infrastructure/siyuan/BrowserSiyuanAdapter
- @/ui/browser/datasource/DeckDataSource
- @/ui/browser/utils/dataSourceFactory
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 719: Migrate DeckDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types/unified-data-source
- @/application/ports/BrowserSiyuanPort
- @/infrastructure/siyuan/BrowserSiyuanAdapter
- @/ui/browser/datasource/DeckDataSource
- @/ui/browser/utils/dataSourceFactory
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 720: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types/unified-data-source
- @/application/ports/BrowserSiyuanPort
- @/infrastructure/siyuan/BrowserSiyuanAdapter
- @/ui/browser/datasource/DeckDataSource
- @/ui/browser/utils/dataSourceFactory
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 721: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\BrowserApplicationService.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types/unified-data-source
- @/application/ports/BrowserSiyuanPort
- @/infrastructure/siyuan/BrowserSiyuanAdapter
- @/ui/browser/datasource/DeckDataSource
- @/ui/browser/utils/dataSourceFactory
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 722: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts
- @/types/review
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 723: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts
- @/types/review
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 724: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewLogService.ts
- @/types/review
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 725: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 726: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 727: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\RiffBlacklistService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 728: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 729: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 730: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 731: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 732: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 733: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 734: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 735: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 736: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 737: Migrate SettingsValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\SettingsService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 738: Migrate CreateXiuyuanFromBlocksUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 739: Migrate DeleteXiuyuanUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 740: Migrate GetXiuyuanQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 741: Migrate GetAllXiuyuansQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 742: Migrate CreateListTemplateCardsUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 743: Migrate CreateConceptDescriptorCardsUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 744: Migrate CreateConceptDescriptorAutoUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 745: Migrate RebindDescriptorConceptUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 746: Migrate CreateTemplateUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 747: Migrate GetTemplateQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 748: Migrate GetAllTemplatesQueryHandler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 749: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 750: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 751: Migrate XiuyuanSyncSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 752: Migrate XiuyuanSyncBridgeEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 753: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 754: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 755: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 756: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 757: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 758: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 759: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 760: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 761: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 762: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 763: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 764: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 765: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 766: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 767: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 768: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 769: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 770: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 771: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 772: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\XiuyuanSyncService.ts
- @/core/card-builder
- @/application/ports/XiuyuanSyncSiyuanPort
- @/infrastructure/siyuan/XiuyuanSyncSiyuanAdapter
- @/core/shared/domain/events/EventBus
- @/core/shared/domain/events/DomainEvent
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/CardTypeDetectionService
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/utils/logger
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 773: Migrate CardCreationSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 774: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 775: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 776: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 777: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 778: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 779: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\CreateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardCreationService
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/shared/domain/events/EventBus
- @/application/ports/CardCreationSiyuanPort
- @/infrastructure/siyuan/CardCreationSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 780: Migrate CardDeletionSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/XiuyuanId
- @/core/shared/domain/events/EventBus
- @/core/xiuyuan/domain/events/CardsDeletedEvent
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 781: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/XiuyuanId
- @/core/shared/domain/events/EventBus
- @/core/xiuyuan/domain/events/CardsDeletedEvent
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 782: Migrate CardsDeletedEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/XiuyuanId
- @/core/shared/domain/events/EventBus
- @/core/xiuyuan/domain/events/CardsDeletedEvent
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 783: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/XiuyuanId
- @/core/shared/domain/events/EventBus
- @/core/xiuyuan/domain/events/CardsDeletedEvent
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/services/IDeletionTracker
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 784: Migrate CardDeletionSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 785: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 786: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 787: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 788: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 789: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/services/CardDeletionService
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/Xiuyuan
- @/core/shared/domain/events/EventBus
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 790: Migrate CardDeletionSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts
- @/core/storage/ports
- @/types/result
- @/application/commands/card/DeleteFSRSCardCommand
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 791: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts
- @/core/storage/ports
- @/types/result
- @/application/commands/card/DeleteFSRSCardCommand
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 792: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts
- @/core/storage/ports
- @/types/result
- @/application/commands/card/DeleteFSRSCardCommand
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 793: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\DeleteFSRSCardUseCase.ts
- @/core/storage/ports
- @/types/result
- @/application/commands/card/DeleteFSRSCardCommand
- @/application/ports/CardDeletionSiyuanPort
- @/infrastructure/siyuan/CardDeletionSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 794: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\shared\StorageOperationResult.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 795: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\shared\WarmupXiuyuanCardIndex.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 796: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 797: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 798: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 799: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 800: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 801: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 802: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 803: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 804: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateCardUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/CardId
- @/core/xiuyuan/domain/Card
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 805: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 806: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 807: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 808: Migrate CreateXiuyuanFromBlocksUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorAutoUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 809: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 810: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 811: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 812: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 813: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 814: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 815: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 816: Migrate CreateXiuyuanFromBlocksUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateConceptDescriptorCardsUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 817: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 818: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 819: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 820: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 821: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 822: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 823: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 824: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 825: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateListTemplateCardsUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 826: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts
- @/types/result
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 827: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts
- @/types/result
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 828: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts
- @/types/result
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 829: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateTemplateUseCase.ts
- @/types/result
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 830: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 831: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 832: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 833: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 834: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 835: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\CreateXiuyuanFromBlocksUseCase.ts
- @/types/result
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan
- @/core/xiuyuan/domain/XiuyuanId
- @/core/xiuyuan/domain/BlockId
- @/core/xiuyuan/domain/TemplateId
- @/core/xiuyuan/domain/CardFace
- @/core/xiuyuan/domain/Priority
- @/core/xiuyuan/domain/services/ClozeCardGenerator
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 836: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetTemplateQueryHandler.ts
- @/core/xiuyuan/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 837: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetXiuyuanQueryHandler.ts
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 838: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\GetXiuyuanQueryHandler.ts
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 839: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 840: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 841: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 842: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 843: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 844: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\RebindDescriptorConceptUseCase.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/core/xiuyuan/domain/XiuyuanId
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 845: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts
- @/application/ports/XiuyuanSiyuanPort
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 846: Migrate CreateXiuyuanFromBlocksUseCase

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts
- @/application/ports/XiuyuanSiyuanPort
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 847: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptCardResolver.ts
- @/application/ports/XiuyuanSiyuanPort
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 848: Migrate XiuyuanSiyuanAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\ConceptLocator.ts
- @/application/ports/XiuyuanSiyuanPort
- @/infrastructure/siyuan/XiuyuanSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 849: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 850: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 851: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 852: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 853: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 854: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 855: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\DescriptorTemplateStrategy.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 856: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\xiuyuan\shared\FinalizeXiuyuanCreation.ts
- @/types/result
- @/application/ports/XiuyuanSiyuanPort
- @/core/xiuyuan/domain/repositories/IXiuyuanRepository
- @/core/xiuyuan/domain/Xiuyuan

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 857: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\common\application\BaseCardRenderService.ts
- @/core/siyuan/api
- @/core/xiuyuan/cardMeta
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 858: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 859: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 860: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 861: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 862: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 863: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 864: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 865: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept\application\ConceptCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger
- @/core/card/concept-definition/application/runtime

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 866: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 867: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 868: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 869: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 870: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 871: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 872: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 873: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 874: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 875: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\concept-definition\application\ConceptDefinitionCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 876: Migrate DescriptorCard

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\descriptor-card\application\DescriptorCardRenderService.ts
- @/core/card/common/application/BaseCardRenderService
- @/core/card/common/application/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 877: Migrate SiyuanKramdownGateway

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\descriptor-card\infrastructure\SiyuanBlockAdapter.ts
- @/core/siyuan
- @/utils/logger
- @/core/card/common/infrastructure/SiyuanKramdownGateway

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 878: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 879: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 880: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardScheduleService.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 881: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 882: Migrate BasicCardStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 883: Migrate ConceptCardStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 884: Migrate DescriptorCardStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 885: Migrate ClozeCardStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 886: Migrate MultiLineCardStrategy

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 887: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\domain\strategies\CardFaceStrategyFactory.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 888: Migrate Adapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 889: Migrate Repository

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 890: Migrate Service

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\index.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 891: Migrate DefaultQuickCardConfigProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardConfigProvider.ts
- @/types/settings
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 892: Migrate DefaultQuickCardConfigProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardConfigProvider.ts
- @/types/settings
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 893: Migrate DefaultQuickCardConfigProvider

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 894: Migrate CardFace

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 895: Migrate CardFace

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 896: Migrate QuickCard

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\QuickCardRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 897: Migrate SiyuanKramdownGateway

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\quick-card\infrastructure\SiyuanBlockAdapter.ts
- @/utils/logger
- @/core/card/common/infrastructure/SiyuanKramdownGateway

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 898: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\detectCardType.ts
- @/core/siyuan/api
- @/utils/logger
- @/core/card-type/detectionRules

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 899: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\extractCardMeta.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 900: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\ProviderBackedQueueStrategy.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 901: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 902: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 903: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 904: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 905: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 906: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\providers\FSRSRetrievalProvider.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 907: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts
- @/index
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 908: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts
- @/index
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 909: Migrate WebSocket

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\infrastructure\websocket\QuickCardWebSocketService.ts
- @/index
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 910: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 911: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 912: Migrate MouseEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 913: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 914: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 915: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 916: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\session.ts
- siyuan
- siyuan
- siyuan
- siyuan
- siyuan
- @/global
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 917: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\abstraction\Command.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 918: Migrate TextEncoder

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 919: Migrate TextDecoder

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 920: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 921: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 922: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 923: Migrate Uint8Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\blockPracticeProgress.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 924: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\storageFile.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 925: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\adapters\storageFile.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 926: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 927: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 928: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 929: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 930: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 931: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 932: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 933: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 934: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 935: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 936: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.optimized.ts
- @/utils/logger
- @/utils/queryCache
- @/utils/performance

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 937: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts
- @/utils/logger
- @/utils/queryCache

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 938: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts
- @/utils/logger
- @/utils/queryCache

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 939: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts
- @/utils/logger
- @/utils/queryCache

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 940: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts
- @/utils/logger
- @/utils/queryCache

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 941: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptQueryEngine.ts
- @/utils/logger
- @/utils/queryCache

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 942: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\HistoryFilter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 943: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\HistoryFilter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 944: Migrate ConfigValidationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueueConfig.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 945: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueueStorage.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 946: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 947: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 948: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 949: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 950: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 951: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\QueryEngine.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 952: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\WeightedWalkEngine.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 953: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\schedulers\CompositeScheduler.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 954: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 955: Migrate QueueStateManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 956: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 957: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sync\QueueStateManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 958: Migrate ImprovedTopicScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 959: Migrate SM15Scheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 960: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 961: Migrate TSFSRSScheduler

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 962: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 963: Migrate FI_G

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\FI_G.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 964: Migrate ForgettingCurve

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\ForgettingCurves.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 965: Migrate ForgettingCurves

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\ForgettingCurves.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 966: Migrate FI_G

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 967: Migrate ForgettingCurves

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 968: Migrate RFM

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 969: Migrate OFM

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 970: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 971: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 972: Migrate SM15

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 973: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 974: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 975: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 976: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 977: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 978: Migrate SM15Item

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 979: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 980: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\SM15Item.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 981: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\shared\domain\events\DomainEvent.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 982: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\shared\domain\events\EventBus.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 983: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\siyuan\riff.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 984: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\infrastructure\BlockRepository.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 985: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStoragePersistence.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 986: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStoragePersistence.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 987: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 988: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 989: Migrate BlockId

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\BlockId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 990: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 991: Migrate Card

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 992: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 993: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 994: Migrate Card

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 995: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 996: Migrate Card

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 997: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 998: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 999: Migrate Card

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1000: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1001: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Card.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1002: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1003: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1004: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1005: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1006: Migrate CardFace

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardFace.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1007: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1008: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1009: Migrate CardId

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\CardId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1010: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1011: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1012: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1013: Migrate Priority

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1014: Migrate Priority

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1015: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1016: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1017: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1018: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1019: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1020: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1021: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1022: Migrate ScheduleInfo

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1023: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1024: Migrate ScheduleInfo

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1025: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1026: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\ScheduleInfo.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1027: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1028: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1029: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1030: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1031: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardCreationService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1032: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1033: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1034: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1035: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1036: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1037: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardDeletionService.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1038: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\services\CardTypeDetectionService.ts
- @/core/siyuan/api
- @/utils/logger
- @/utils/batchQuery
- @/core/card-type/detectionRules

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1039: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1040: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1041: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1042: Migrate TemplateId

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\TemplateId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1043: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1044: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1045: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1046: Migrate Xiuyuan

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1047: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1048: Migrate XiuyuanCreatedEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1049: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1050: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1051: Migrate Xiuyuan

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1052: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1053: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1054: Migrate CardCreatedEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1055: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1056: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1057: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1058: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1059: Migrate CardCreatedEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1060: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1061: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1062: Migrate CardDeletedEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1063: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1064: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1065: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1066: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1067: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1068: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1069: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1070: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1071: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\Xiuyuan.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1072: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1073: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1074: Migrate XiuyuanId

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\domain\XiuyuanId.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1075: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\InMemoryDeletionTracker.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1076: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts
- @/types/result
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1077: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts
- @/types/result
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1078: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\templates\TemplateRegistry.ts
- @/types/result
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1079: Migrate SafetyAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1080: Migrate PriorityCalculator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1081: Migrate DependencyAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1082: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1083: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1084: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1085: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1086: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\analyzers\MigrationAnalyzer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1087: Migrate ArchitectureScanner

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1088: Migrate InterfaceValidator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1089: Migrate MigrationAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1090: Migrate ReportGenerator

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1091: Migrate ApiCompatibilityChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\cli.ts
- minimist
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1092: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\reporters\ReportGenerator.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1093: Migrate ImportAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1094: Migrate TypeUsageAnalyzer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1095: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1096: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1097: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ArchitectureScanner.ts
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1098: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\scanners\ImportAnalyzer.ts
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1099: Migrate NodeDiagnosticsOutput

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\utils\output.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1100: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1101: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1102: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\ApiCompatibilityChecker.ts
- fs
- path
- typescript

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1103: Migrate MethodChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\InterfaceValidator.ts
- typescript
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1104: Migrate TypeChecker

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\diagnostics\validators\InterfaceValidator.ts
- typescript
- fs
- path

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1105: Migrate ModeError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1106: Migrate QueueError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1107: Migrate SyncError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1108: Migrate StorageError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1109: Migrate NetworkError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1110: Migrate StorageError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1111: Migrate NetworkError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1112: Migrate DataSourceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\errors\DataSourceErrors.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1113: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1114: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1115: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1116: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1117: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1118: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1119: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1120: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1121: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1122: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1123: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1124: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1125: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1126: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1127: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1128: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1129: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1130: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1131: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1132: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\persistence\CardRepository.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1133: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1134: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1135: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1136: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1137: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1138: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1139: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1140: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1141: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1142: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1143: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1144: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1145: Migrate FileOperationError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1146: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\FileService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1147: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1148: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1149: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1150: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1151: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1152: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1153: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1154: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1155: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1156: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1157: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1158: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1159: Migrate QueuePersistenceError

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1160: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\services\QueuePersistenceService.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1161: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1162: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1163: Migrate FormData

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1164: Migrate Blob

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1165: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1166: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\siyuan\api.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1167: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\scripts\migrate-xiuyuan-priority.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1168: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\scripts\migrateToTopicItem.ts
- @/core/siyuan/block
- @/core/card-builder/detectCardType
- @/core/siyuan/api
- @/core/siyuan/riff
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1169: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts
- vue
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1170: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts
- vue
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1171: Migrate SRSBrowserAdapter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useBrowserAdapterSync.ts
- vue
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1172: Migrate CardTypeMarkerService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardActions.ts
- vue
- @/scripts/migrateToTopicItem
- @/core/card-type/CardTypeMarkerService
- @/core/storage/ports
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1173: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardActions.ts
- vue
- @/scripts/migrateToTopicItem
- @/core/card-type/CardTypeMarkerService
- @/core/storage/ports
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1174: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1175: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1176: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1177: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1178: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useCardTypeDetection.ts
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1179: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1180: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1181: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1182: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1183: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1184: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1185: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useIncrementalGridUpdates.ts
- vue
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1186: Migrate Protyle

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\usePreviewPanel.ts
- vue
- siyuan
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1187: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\composables\useQueueBridge.ts
- vue
- @/application/interfaces/IBrowserApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1188: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\BlockIdsDataSource.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1189: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/scheduler/ConfigManager
- @/core/storage/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1190: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/scheduler/ConfigManager
- @/core/storage/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1191: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/scheduler/ConfigManager
- @/core/storage/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1192: Migrate ConfigManager

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/scheduler/ConfigManager
- @/core/storage/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1193: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\MenuActions.ts
- @/core/scheduler/rescheduleService
- @/core/scheduler/ConfigManager
- @/core/storage/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1194: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueryDataSource.ts
- @/application/interfaces/ICardDataSource

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1195: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueryDataSource.ts
- @/application/interfaces/ICardDataSource

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1196: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1197: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1198: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1199: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1200: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1201: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1202: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1203: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1204: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1205: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1206: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1207: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1208: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1209: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1210: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1211: Migrate FilterService

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\services\FilterService.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1212: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserQueueView.ts
- @/types/unified-data-source
- ag-grid-community
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1213: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\types.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1214: Migrate FinalDrillDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1215: Migrate RetrievalDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1216: Migrate FilterGroupDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1217: Migrate IncrementalLearningDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1218: Migrate BlockIdsDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1219: Migrate BlockIdsDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1220: Migrate DeckDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1221: Migrate QueryDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1222: Migrate FinalDrillDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1223: Migrate RetrievalDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1224: Migrate FilterGroupDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1225: Migrate IncrementalLearningDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1226: Migrate BlockIdsDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1227: Migrate DeckDataSource

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\dataSourceFactory.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1228: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\formatters.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1229: Migrate RegExp

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\formatters.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1230: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1231: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1232: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1233: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1234: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\validators.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1235: Migrate URL

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\utils\validators.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1236: Migrate Menu

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\menu\TopBar.ts
- siyuan
- @/index
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1237: Migrate LRUCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\composables\useCardTypeCache.ts
- vue
- @/utils/performance-helpers
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1238: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\composables\useCardTypeCache.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1239: Migrate SortedSequencer

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\providers\utils\SessionManager.ts
- @/core/queue/sequencers/SortedSequencer
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1240: Migrate Array

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1241: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1242: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\asyncHelpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1243: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\configUtils.ts
- @/types/settings
- siyuan
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1244: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\configUtils.ts
- @/types/settings
- siyuan
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1245: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1246: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1247: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1248: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1249: Migrate Date

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dateUtils.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1250: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1251: Migrate MouseEvent

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1252: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1253: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1254: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1255: Migrate Dialog

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\dialog.ts
- siyuan
- vue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1256: Migrate ConsoleErrorReporter

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\errorReporter.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1257: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\EventEmitter.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1258: Migrate Set

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\EventEmitter.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1259: Migrate Logger

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\logger.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1260: Migrate Logger

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\logger.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1261: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1262: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1263: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1264: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1265: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1266: Migrate Promise

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance-helpers.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1267: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1268: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\performance.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1269: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1270: Migrate Map

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1271: Migrate QueryCache

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\queryCache.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1272: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\simpleModeRemovalMigrator.ts
- @/types/settings
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1273: Migrate Error

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\utils\sqlOptimizer.ts

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1274: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1275: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1276: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1277: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1278: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1279: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1280: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1281: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1282: Migrate UnifiedQueueStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedQueueStrategy.ts
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/types/card
- @/types/unified-data-source
- @/types/unified-data-source
- @/application/services/UnifiedDataSourceManager
- @/core/shared/domain/events/EventBus
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1283: Migrate UnifiedReviewAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\adapters\UnifiedReviewAdapter.ts
- @/ui/review/v2/types
- @/types/card
- @/core/queue/abstraction/Strategy
- @/core/queue/types
- @/core/xiuyuan/cardMeta
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1284: Migrate UpdateFSRSCardCommand.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\commands\card\UpdateFSRSCardCommand.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1285: Migrate ReviewViewController.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1286: Migrate ReviewViewController.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1287: Migrate ReviewViewController.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1288: Migrate ReviewViewController.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\controllers\ReviewViewController.ts
- @/types/unified-data-source
- @/types/card
- @/types/unified-data-source
- @/core/queue/domain/NeuralRoamQueue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1289: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1290: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1291: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1292: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1293: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1294: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1295: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1296: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1297: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1298: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1299: Migrate BlockMenuHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\BlockMenuHandler.ts
- siyuan
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/dialog
- @/core/queue
- @/core/queue/types
- @/types/unified-data-source
- @/types/card
- @/ui/srs/SrsEditorDialog.vue
- @/application/ApplicationContext
- @/application/managers/DialogManager
- @/core/storage
- @/application/helpers/CardCreationHelper
- @/application/services/CardApplicationService
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1300: Migrate PracticeQueueManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1301: Migrate PracticeQueueManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1302: Migrate PracticeQueueManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1303: Migrate PracticeQueueManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1304: Migrate PracticeQueueManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\managers\PracticeQueueManager.ts
- @/application/managers/BlockMenuHandler
- @/core/queue
- @/application/ports/ManagerSiyuanPort
- @/infrastructure/siyuan/ManagerSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1305: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1306: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1307: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1308: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1309: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1310: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1311: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1312: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1313: Migrate GetBrowserCardsQueryHandler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\browser\GetBrowserCardsQueryHandler.ts
- @/core/storage/ports
- @/core/card/domain/services/CardScheduleService
- @/core/card/domain/services/CardFilterService
- @/core/card/domain/services/CardSortService
- @/types
- @/application/ports/QuerySiyuanPort
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/ui/browser/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1314: Migrate GetCardsQuery.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetCardsQuery.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1315: Migrate GetCardsQuery.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\GetCardsQuery.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1316: Migrate ICardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1317: Migrate ICardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1318: Migrate ICardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1319: Migrate ICardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1320: Migrate ICardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\card\ICardReadModel.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1321: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1322: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1323: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1324: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1325: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1326: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1327: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1328: Migrate DataAccessFacade.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\queries\DataAccessFacade.ts
- siyuan
- @/infrastructure/siyuan/QuerySiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1329: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1330: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1331: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1332: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1333: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1334: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1335: Migrate CardApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\CardApplicationService.ts
- @/types/result
- @/core/xiuyuan/domain/Card
- @/types/card
- @/core/card/domain/services/CardScheduleService
- @/utils/logger
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1336: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1337: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1338: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1339: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1340: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1341: Migrate ReviewApplicationService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\ReviewApplicationService.ts
- @/core/storage/ports
- @/core/scheduler
- @/types
- @/application/ports/ReviewSiyuanPort
- @/infrastructure/siyuan/ReviewSiyuanAdapter
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1342: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1343: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1344: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1345: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\services\UnifiedDataSourceManager.ts
- @/types/unified-data-source
- @/types/card
- @/core/queue/domain/RetrievalPracticeQueue
- @/core/queue/domain/IncrementalLearningQueue
- @/core/queue/domain/FilterGroupQueue
- @/core/queue/domain/FinalDrillQueue
- @/core/queue/domain/NeuralRoamQueue
- @/core/queue/domain/LeechReviewQueue
- @/infrastructure/queue/SiyuanLeechActionEffectsAdapter
- @/infrastructure/queue/SiyuanNeuralRoamCardTypeResolverAdapter
- @/core/queue/managers/UnifiedDataSourceManager
- @/core/queue/domain/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1346: Migrate UpdateFSRSCardUseCase.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts
- @/core/storage/ports
- @/types
- @/types/result
- @/application/commands/card/UpdateFSRSCardCommand
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1347: Migrate UpdateFSRSCardUseCase.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\application\usecases\card\UpdateFSRSCardUseCase.ts
- @/core/storage/ports
- @/types
- @/types/result
- @/application/commands/card/UpdateFSRSCardCommand
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1348: Migrate TransactionObserver.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\box\TransactionObserver.ts
- @/index
- @/core/card-builder
- @/core/siyuan/api
- @/core/siyuan/riff
- @/core/siyuan/block
- @/utils/logger
- @/types
- @/core/storage/ports

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1349: Migrate CardFilterService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card\domain\services\CardFilterService.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1350: Migrate index.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\index.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1351: Migrate ClozeStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\ClozeStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1352: Migrate DefaultStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\DefaultStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1353: Migrate QAStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\strategies\QAStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1354: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-builder\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1355: Migrate CardTypeMarkerService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1356: Migrate CardTypeMarkerService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1357: Migrate CardTypeMarkerService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1358: Migrate CardTypeMarkerService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\card-type\CardTypeMarkerService.ts
- @/types/card
- @/types/card
- @/core/storage/ports
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1359: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1360: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1361: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1362: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1363: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1364: Migrate QueueBackedStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\extensions\QueueBackedStrategy.ts
- @/types/unified-data-source
- @/types/fsrs

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1365: Migrate adapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\native\adapter.ts
- @/global
- @/core/siyuan
- @/core/queue
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1366: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1367: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1368: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1369: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1370: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1371: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1372: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1373: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1374: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1375: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1376: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1377: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1378: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1379: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1380: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1381: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1382: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1383: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1384: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1385: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1386: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1387: Migrate BaseReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\BaseReviewQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1388: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1389: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1390: Migrate FilterGroupQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FilterGroupQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1391: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1392: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1393: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1394: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1395: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1396: Migrate FinalDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\FinalDrillQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1397: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1398: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1399: Migrate IncrementalLearningQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\IncrementalLearningQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1400: Migrate ManualCardSetStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1401: Migrate ManualCardSetStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1402: Migrate ManualCardSetStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\ManualCardSetStrategy.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1403: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1404: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1405: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1406: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1407: Migrate NeuralRoamQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\NeuralRoamQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1408: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1409: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1410: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1411: Migrate RetrievalPracticeQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\RetrievalPracticeQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1412: Migrate SubsetReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts
- @/types/unified-data-source
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1413: Migrate SubsetReviewQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\SubsetReviewQueue.ts
- @/types/unified-data-source
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1414: Migrate TemporaryDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts
- @/types/unified-data-source
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1415: Migrate TemporaryDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts
- @/types/unified-data-source
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1416: Migrate TemporaryDrillQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\domain\TemporaryDrillQueue.ts
- @/types/unified-data-source
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1417: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1418: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1419: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1420: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1421: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1422: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1423: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1424: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1425: Migrate TopicFilter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\filters\TopicFilter.ts
- @/core/siyuan/api
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1426: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1427: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1428: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1429: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1430: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1431: Migrate UnifiedDataSourceManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\managers\UnifiedDataSourceManager.ts
- @/types/card
- @/types/unified-data-source

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1432: Migrate ConceptNeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1433: Migrate ConceptNeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\ConceptNeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1434: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1435: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1436: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1437: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1438: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1439: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1440: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1441: Migrate NeuralQueue.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\neural\NeuralQueue.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1442: Migrate DualQueueSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DualQueueSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1443: Migrate DualQueueSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\DualQueueSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1444: Migrate FinalDrillSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FinalDrillSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1445: Migrate FSRSSequencer.test.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\FSRSSequencer.test.ts
- vitest

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1446: Migrate GroupSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GroupSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1447: Migrate GroupSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\GroupSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1448: Migrate PrioritySequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1449: Migrate PrioritySequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\PrioritySequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1450: Migrate SortedSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\SortedSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1451: Migrate SortedSequencer.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\queue\sequencers\SortedSequencer.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1452: Migrate UnifiedStorageCardUpdateAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts
- @/types/card
- @/core/storage/UnifiedStorageManager
- @/core/scheduler/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1453: Migrate UnifiedStorageCardUpdateAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\adapters\UnifiedStorageCardUpdateAdapter.ts
- @/types/card
- @/core/storage/UnifiedStorageManager
- @/core/scheduler/ports
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1454: Migrate AdvanceEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1455: Migrate AdvanceEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1456: Migrate AdvanceEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1457: Migrate AdvanceEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\AdvanceEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1458: Migrate BaseRescheduleEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1459: Migrate BaseRescheduleEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1460: Migrate BaseRescheduleEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1461: Migrate BaseRescheduleEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BaseRescheduleEngine.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1462: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1463: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1464: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1465: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1466: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1467: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1468: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1469: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1470: Migrate BatchProcessor.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\BatchProcessor.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1471: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1472: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1473: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1474: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\ports.ts
- @/types/card
- @/types/scheduler

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1475: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1476: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1477: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1478: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1479: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1480: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1481: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1482: Migrate PostponeEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\PostponeEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1483: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1484: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1485: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1486: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1487: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1488: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1489: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1490: Migrate rescheduleService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\rescheduleService.ts
- @/types
- @/types/card
- @/types/reschedule
- @/types/reschedule-error
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1491: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1492: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1493: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1494: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1495: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1496: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1497: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1498: Migrate SchedulerRouter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SchedulerRouter.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1499: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1500: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1501: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1502: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1503: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1504: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1505: Migrate SpreadEngine.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\SpreadEngine.ts
- @/types/card
- @/types/reschedule

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1506: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1507: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1508: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1509: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1510: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1511: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1512: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1513: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1514: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1515: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1516: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1517: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1518: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1519: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1520: Migrate ImprovedTopicScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\ImprovedTopicScheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1521: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1522: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1523: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1524: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1525: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1526: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1527: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1528: Migrate migration.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\sm15\migration.ts
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1529: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1530: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1531: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1532: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1533: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1534: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1535: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1536: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1537: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1538: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1539: Migrate SM15Scheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\SM15Scheduler.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1540: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1541: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1542: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1543: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1544: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1545: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1546: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1547: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1548: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1549: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1550: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1551: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1552: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1553: Migrate TSFSRSScheduler.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\strategies\TSFSRSScheduler.ts
- ts-fsrs
- @/types
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1554: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1555: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1556: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1557: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1558: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduler\types.ts
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1559: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1560: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1561: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1562: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1563: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1564: Migrate CardStorage.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\CardStorage.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1565: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1566: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1567: Migrate SortingStrategy.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\scheduling\SortingStrategy.ts
- @/types
- @/types

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1568: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1569: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1570: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1571: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1572: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1573: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1574: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1575: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1576: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1577: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1578: Migrate manager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\manager.ts
- @/types
- @/types
- @/types/card
- @/core/siyuan/api
- @/core/siyuan/block
- @/core/queue/abstraction/IPriority
- @msgpack/msgpack
- @/utils/cardMigration
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1579: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1580: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1581: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1582: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1583: Migrate ports.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\ports.ts
- @/types/card
- @/types/result

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1584: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1585: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1586: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1587: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1588: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1589: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1590: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1591: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1592: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1593: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1594: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1595: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1596: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1597: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1598: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1599: Migrate UnifiedStorageManager.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\storage\UnifiedStorageManager.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1600: Migrate XiuyuanRepository.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\core\xiuyuan\infrastructure\XiuyuanRepository.ts
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1601: Migrate CardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts
- @/core/storage/UnifiedStorageManager
- @/application/queries/card/ICardReadModel
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1602: Migrate CardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts
- @/core/storage/UnifiedStorageManager
- @/application/queries/card/ICardReadModel
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1603: Migrate CardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts
- @/core/storage/UnifiedStorageManager
- @/application/queries/card/ICardReadModel
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1604: Migrate CardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts
- @/core/storage/UnifiedStorageManager
- @/application/queries/card/ICardReadModel
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1605: Migrate CardReadModel.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\infrastructure\queries\CardReadModel.ts
- @/core/storage/UnifiedStorageManager
- @/application/queries/card/ICardReadModel
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1606: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1607: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1608: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1609: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1610: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1611: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1612: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1613: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1614: Migrate browserService.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\browserService.ts
- siyuan
- @/application/ports/BrowserSiyuanPort
- @/application/services/UnifiedDataSourceManager
- @/types
- @/utils/performance
- @/utils/dateUtils
- @/utils/configUtils
- @/utils/logger
- @/core/card-builder

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1615: Migrate DataSourceUtils.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1616: Migrate DataSourceUtils.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DataSourceUtils.ts
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1617: Migrate DeckDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\DeckDataSource.ts
- @/application/interfaces/ICardDataSource
- @/types/unified-data-source
- @/core/scheduler/rescheduleService
- @/types/card
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1618: Migrate FinalDrillDataSource.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\FinalDrillDataSource.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1619: Migrate QueueBrowserCardMapper.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1620: Migrate QueueBrowserCardMapper.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\datasource\QueueBrowserCardMapper.ts
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1621: Migrate SRSBrowserAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\browser\SRSBrowserAdapter.ts
- @/types/unified-data-source
- @/application/interfaces/ICardDataSource
- @/types/card
- @/diagnostics/type-guards
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1622: Migrate ReviewViewAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1623: Migrate ReviewViewAdapter.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\ReviewViewAdapter.ts
- @/types/unified-data-source
- @/utils/logger

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1624: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1625: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1626: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1627: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1628: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1629: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1630: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1631: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1632: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1633: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1634: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1635: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1636: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1637: Migrate FinalDrillV2Session.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\sessions\FinalDrillV2Session.ts
- @/application/ports/ReviewSiyuanPort

**测试策略**:
Run unit tests and integration tests for affected queues

### 步骤 1638: Migrate types.ts

**预计时间**: 3-5 days

**涉及文件**:
- H:\project-F\flashcard\siyuan-plugin-siyuanmemo\src\ui\review\v2\types.ts
- @/core/queue/abstraction/Command
- vue
- @/core/extensions
- @/types/card

**测试策略**:
Run unit tests and integration tests for affected queues

## 建议

- 优先处理混合使用的文件，避免类型混用导致运行时错误
- 修复接口验证错误，确保所有队列实现 IReviewQueue
- 从高优先级迁移项开始逐步迁移到新架构
- 保留临时队列，待迁移窗口关闭后再逐步移除
