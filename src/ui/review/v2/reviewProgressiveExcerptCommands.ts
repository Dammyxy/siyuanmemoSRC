import type { App } from 'siyuan';
import type {
  ProgressiveExcerptSelectionSnapshot,
} from '@/application/entries/ProgressiveSelectionResolver';
import type { SelectionExcerptActionResult } from '@/application/services/SelectionExcerptService';
import type { FSRSCard } from '@/types/card';
import type { CardFilter, NeuralRoamSessionQueue } from '@/types/unified-data-source';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import type { ReviewFilterCommandClient } from './reviewFilterCommands';

export type ReviewProgressiveExcerptTrigger = 'hotkey' | 'toolbar' | 'command';

type ReviewProgressiveTranslate = (key: string, fallback: string) => string;

type ReviewProgressiveToastType = 'info' | 'error';

type ReviewProgressiveShowMessage = (
  message: string,
  timeout?: number,
  type?: ReviewProgressiveToastType,
) => void;

type ReviewProgressiveLogger = {
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

type ReviewProgressiveRuntimeSettingsLike = {
  progressiveReading?: {
    altXExcerptEnabled?: boolean;
    sourceMarkingEnabled?: boolean;
  };
};

export type ReviewProgressiveReadingServiceLike = {
  completeCurrentPiece: (pieceDocId: string) => Promise<{ nextPieceDocId?: string }>;
};

export type ReviewSelectionExcerptServiceLike = {
  executeSelectionExcerptAction: (input: {
    selection: ProgressiveExcerptSelectionSnapshot;
    origin: 'review';
    currentCardId?: string;
    sourceMarkingEnabled: boolean;
  }) => Promise<SelectionExcerptActionResult>;
};

export type ReviewTabApplicationServiceLike = {
  openDocumentTab: (options: { docId: string }) => Promise<void>;
  openBlockTab: (options: { blockId: string }) => Promise<void>;
};

export type ReviewProgressiveContextLike = {
  getProgressiveReadingService?: () => ReviewProgressiveReadingServiceLike | undefined;
  getSelectionExcerptService?: () => ReviewSelectionExcerptServiceLike | undefined;
  getTabApplicationService?: () => ReviewTabApplicationServiceLike | undefined;
  getSettingsService?: () => {
    getSettings?: () => ReviewProgressiveRuntimeSettingsLike;
  } | undefined;
};

export type ReviewProgressiveFilterQueueLike = {
  getFilter?: () => CardFilter;
};

export type ReviewProgressiveInsertQueueStrategy = {
  insertAt?: (cardId: string, position: number) => Promise<void> | void;
};

type ReviewProgressiveSelectionResolveOptions = {
  root?: HTMLElement | null;
  resolveProtyle?: (commonElement: HTMLElement) => unknown;
};

export type ReviewProgressiveExcerptCommandInput = {
  trigger: ReviewProgressiveExcerptTrigger;
  contexts: Array<ReviewProgressiveContextLike | null | undefined>;
  currentCard: FSRSCard | null | undefined;
  currentCardId: string;
  root: HTMLElement | null;
  resolveSelection: (options: ReviewProgressiveSelectionResolveOptions) => ProgressiveExcerptSelectionSnapshot | null;
  resolveProtyle: (commonElement: HTMLElement) => unknown;
  filterQueue: ReviewProgressiveFilterQueueLike | null | undefined;
  filterCommandClient: ReviewFilterCommandClient | null | undefined;
  queueStrategy: ReviewProgressiveInsertQueueStrategy | null | undefined;
  setAppliedReviewFilter: (filter: CardFilter) => void;
  neuralQueue: NeuralRoamSessionQueue | null;
  t: ReviewProgressiveTranslate;
  showMessage: ReviewProgressiveShowMessage;
  sourceMarkingEnabled?: boolean;
  logger?: ReviewProgressiveLogger;
};

type ReviewProgressiveRouteTarget = 'progressive' | 'hyperspace';

type CreateReviewProgressiveExcerptInput = {
  selection: ProgressiveExcerptSelectionSnapshot;
  trigger: ReviewProgressiveExcerptTrigger;
  selectionService: ReviewSelectionExcerptServiceLike;
  currentCardId: string;
  routeExcerpt: (excerptEntityId: string) => Promise<ReviewProgressiveRouteTarget | null>;
  t: ReviewProgressiveTranslate;
  showMessage: ReviewProgressiveShowMessage;
  sourceMarkingEnabled: boolean;
  logger?: ReviewProgressiveLogger;
};

type RouteReviewProgressiveExcerptInput = {
  excerptEntityId: string;
  currentCard: FSRSCard | null | undefined;
  filterQueue: ReviewProgressiveFilterQueueLike | null | undefined;
  filterCommandClient: ReviewFilterCommandClient | null | undefined;
  queueStrategy: ReviewProgressiveInsertQueueStrategy | null | undefined;
  setAppliedReviewFilter: (filter: CardFilter) => void;
  neuralQueue: NeuralRoamSessionQueue | null;
  logger?: ReviewProgressiveLogger;
};

type HandleProgressiveOpenSourceInput = {
  app?: App | null;
  sourceTargetId: string;
  t: ReviewProgressiveTranslate;
  showMessage: ReviewProgressiveShowMessage;
  openBlockAtSource?: typeof openReviewBlockAtSource;
};

type HandleProgressiveCompletePieceInput = {
  service: ReviewProgressiveReadingServiceLike | null;
  pieceDocId: string;
  gradeGood: () => void;
  t: ReviewProgressiveTranslate;
  showMessage: ReviewProgressiveShowMessage;
  logger?: ReviewProgressiveLogger;
};

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getFirstService<TService>(
  contexts: Array<ReviewProgressiveContextLike | null | undefined>,
  resolve: (context: ReviewProgressiveContextLike) => TService | undefined,
): TService | null {
  for (const context of contexts) {
    if (!context) {
      continue;
    }
    const service = resolve(context);
    if (service) {
      return service;
    }
  }
  return null;
}

export function getReviewProgressiveReadingService(
  contexts: Array<ReviewProgressiveContextLike | null | undefined>,
): ReviewProgressiveReadingServiceLike | null {
  return getFirstService(contexts, (context) => context.getProgressiveReadingService?.());
}

export function getReviewSelectionExcerptService(
  contexts: Array<ReviewProgressiveContextLike | null | undefined>,
): ReviewSelectionExcerptServiceLike | null {
  return getFirstService(contexts, (context) => context.getSelectionExcerptService?.());
}

export function isReviewProgressiveExcerptEnabled(input: {
  contexts: Array<ReviewProgressiveContextLike | null | undefined>;
  logger?: ReviewProgressiveLogger;
}): boolean {
  for (const context of input.contexts) {
    if (!context) {
      continue;
    }
    try {
      const enabled = context.getSettingsService?.()?.getSettings?.()?.progressiveReading?.altXExcerptEnabled;
      if (typeof enabled === 'boolean') {
        return enabled;
      }
    } catch (error) {
      input.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to read progressive excerpt setting:', error);
    }
  }
  return false;
}

export function isReviewProgressiveSourceMarkingEnabled(input: {
  contexts: Array<ReviewProgressiveContextLike | null | undefined>;
  logger?: ReviewProgressiveLogger;
}): boolean {
  for (const context of input.contexts) {
    if (!context) {
      continue;
    }
    try {
      const enabled = context.getSettingsService?.()?.getSettings?.()?.progressiveReading?.sourceMarkingEnabled;
      if (typeof enabled === 'boolean') {
        return enabled;
      }
    } catch (error) {
      input.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to read progressive source-mark setting:', error);
    }
  }
  return true;
}

export function isProgressiveExcerptCard(card: FSRSCard): boolean {
  if (card.type !== 'topic') {
    return false;
  }

  const progressive = isRecord(card.meta) ? card.meta.progressive : null;
  return isRecord(progressive) && String(progressive.kind || '').trim() === 'excerpt';
}

export function isProgressivePieceReviewCard(card: FSRSCard | null | undefined): boolean {
  const progressive = card?.meta?.progressive;
  return Boolean(progressive && typeof progressive === 'object' && (progressive as Record<string, unknown>).kind === 'piece');
}

export function isLinearPieceReviewCard(card: FSRSCard | null | undefined): boolean {
  if (!card || card.type !== 'topic' || !isRecord(card.meta)) {
    return false;
  }
  const progressive = card.meta.progressive;
  return isRecord(progressive)
    && String(progressive.kind || '').trim() === 'piece'
    && String(progressive.mode || '').trim() === 'linear';
}

export function resolveProgressiveSourceTargetId(card: FSRSCard | null | undefined): string {
  if (typeof card?.extractedFrom === 'string' && card.extractedFrom.trim().length > 0) {
    return card.extractedFrom.trim();
  }
  const progressive = card?.meta?.progressive;
  if (!progressive || typeof progressive !== 'object') {
    return '';
  }
  const sourceBlockId = (progressive as Record<string, unknown>).sourceBlockId;
  if (typeof sourceBlockId === 'string' && sourceBlockId.trim().length > 0) {
    return sourceBlockId.trim();
  }
  const sourceDocId = (progressive as Record<string, unknown>).sourceDocId;
  return typeof sourceDocId === 'string' ? sourceDocId.trim() : '';
}

export async function enqueueExcerptIntoCurrentProgressiveReview(input: {
  excerptEntityId: string;
  currentCard: FSRSCard | null | undefined;
  filterQueue: ReviewProgressiveFilterQueueLike | null | undefined;
  filterCommandClient: ReviewFilterCommandClient | null | undefined;
  queueStrategy: ReviewProgressiveInsertQueueStrategy | null | undefined;
  setAppliedReviewFilter: (filter: CardFilter) => void;
}): Promise<boolean> {
  if (!isProgressivePieceReviewCard(input.currentCard)) {
    return false;
  }

  const normalizedBlockId = normalizeId(input.excerptEntityId);
  if (!normalizedBlockId) {
    return false;
  }

  const filterQueue = input.filterQueue;
  const filterCommandClient = input.filterCommandClient;
  const queueStrategy = input.queueStrategy;
  if (
    !filterQueue?.getFilter
    || typeof filterCommandClient?.setFilterGroupFilter !== 'function'
    || !queueStrategy?.insertAt
  ) {
    return false;
  }

  const currentFilter = filterQueue.getFilter() || {};
  const currentBlockIds = Array.isArray(currentFilter.blockIds)
    ? currentFilter.blockIds.map(normalizeId).filter(Boolean)
    : [];

  if (currentBlockIds.length === 0) {
    return false;
  }

  const nextBlockIds = Array.from(new Set([...currentBlockIds, normalizedBlockId]));
  if (nextBlockIds.length !== currentBlockIds.length) {
    const nextFilter = {
      ...currentFilter,
      blockIds: nextBlockIds,
    };
    const updated = await filterCommandClient.setFilterGroupFilter(nextFilter);
    if (updated === false) {
      return false;
    }
    input.setAppliedReviewFilter(nextFilter);
  }

  await queueStrategy.insertAt(normalizedBlockId, 1);
  return true;
}

export async function injectExcerptIntoCurrentHyperspaceReview(input: {
  excerptEntityId: string;
  neuralQueue: NeuralRoamSessionQueue | null;
}): Promise<boolean> {
  const normalizedBlockId = normalizeId(input.excerptEntityId);
  if (!normalizedBlockId) {
    return false;
  }

  const neuralQueue = input.neuralQueue;
  if (!neuralQueue || neuralQueue.getEngineMode() !== 'hyperspace') {
    return false;
  }

  if (typeof neuralQueue.injectExcerptIntoHyperspace !== 'function') {
    return false;
  }

  const navigationState = neuralQueue.getNavigationState();
  return neuralQueue.injectExcerptIntoHyperspace(normalizedBlockId, {
    currentNodeId: navigationState.currentNodeId ?? null,
    currentEventId: navigationState.currentEventId ?? null,
  });
}

export async function routeProgressiveExcerptIntoCurrentReview(
  input: RouteReviewProgressiveExcerptInput,
): Promise<ReviewProgressiveRouteTarget | null> {
  try {
    const inserted = await enqueueExcerptIntoCurrentProgressiveReview(input);
    if (inserted) {
      return 'progressive';
    }
    const injected = await injectExcerptIntoCurrentHyperspaceReview(input);
    return injected ? 'hyperspace' : null;
  } catch (error) {
    input.logger?.warn?.('[SiYuanMemo][ReviewView] Failed to route progressive excerpt into current review:', error);
    return null;
  }
}

function getCreatedExcerptMessage(
  trigger: ReviewProgressiveExcerptTrigger,
  routedExcerptTarget: ReviewProgressiveRouteTarget | null,
  t: ReviewProgressiveTranslate,
): string {
  if (routedExcerptTarget === 'progressive') {
    return t('progressiveExcerptCreatedInserted', '已创建 Topic，并插入当前渐进复习');
  }
  if (routedExcerptTarget === 'hyperspace') {
    return t('progressiveExcerptCreatedMergedHyperspace', '已创建 Topic，并并入当前超空间神经漫游');
  }
  return trigger !== 'toolbar'
    ? t('progressiveExcerptCreatedHotkey', '已创建 Topic')
    : t('progressiveExcerptCreated', '已创建 Topic');
}

export async function createProgressiveExcerptFromReviewSelection(
  input: CreateReviewProgressiveExcerptInput,
): Promise<void> {
  const {
    selection,
    trigger,
    selectionService,
    currentCardId,
    routeExcerpt,
    t,
    showMessage,
    logger,
  } = input;

  try {
    const result = await selectionService.executeSelectionExcerptAction({
      selection,
      origin: 'review',
      currentCardId,
      sourceMarkingEnabled: input.sourceMarkingEnabled,
    });
    if (result.preservation.incomplete) {
      logger?.warn?.('[SiYuanMemo][ReviewView] Progressive excerpt created without DOM preservation evidence for likely inline references', {
        sourceBlockId: result.sourceBlockId,
        sourceBlockIds: result.sourceBlockIds,
      });
    }
    const routedExcerptTarget = await routeExcerpt(result.excerptEntityId);
    if (result.preservation.incomplete) {
      showMessage(
        t('progressiveExcerptPreservationDegraded', '已创建 Topic，但原文链接或块引用可能未完整保留'),
        5000,
        'info',
      );
    }
    showMessage(
      result.sourceMark.diagnostic
        ? t('progressiveExcerptCreatedSourceMarkFailed', '已创建 Topic，但原文标记未写入')
        : getCreatedExcerptMessage(trigger, routedExcerptTarget, t),
      3000,
      'info',
    );
  } catch (error) {
    logger?.error?.('[SiYuanMemo][ReviewView] Failed to create excerpt from review:', error);
    showMessage(
      t('progressiveExcerptFailed', '摘抄失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}

export async function runReviewProgressiveExcerptCommand(
  input: ReviewProgressiveExcerptCommandInput,
): Promise<void> {
  const { contexts, currentCard, t, showMessage, logger } = input;
  if (!isReviewProgressiveExcerptEnabled({ contexts, logger })) {
    showMessage(t('progressiveExcerptDisabled', '摘抄快捷键已关闭，请先在设置中开启'), 3000, 'info');
    return;
  }

  if (!currentCard || currentCard.type !== 'topic') {
    showMessage(t('progressiveExcerptTopicOnly', '⌥⇧X 当前先只支持 Topic 卡'), 3000, 'error');
    return;
  }

  const selectionService = getReviewSelectionExcerptService(contexts);
  if (!selectionService) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  const selection = input.resolveSelection({
    root: input.root,
    resolveProtyle: input.resolveProtyle,
  });
  if (!selection) {
    showMessage(t('progressiveExcerptNoSelection', '请先选中文本后再摘抄'), 3000, 'error');
    return;
  }

  await createProgressiveExcerptFromReviewSelection({
    selection,
    trigger: input.trigger,
    selectionService,
    currentCardId: input.currentCardId,
    routeExcerpt: (excerptEntityId) => routeProgressiveExcerptIntoCurrentReview({
      excerptEntityId,
      currentCard,
      filterQueue: input.filterQueue,
      filterCommandClient: input.filterCommandClient,
      queueStrategy: input.queueStrategy,
      setAppliedReviewFilter: input.setAppliedReviewFilter,
      neuralQueue: input.neuralQueue,
      logger,
    }),
    t,
    showMessage,
    sourceMarkingEnabled: isReviewProgressiveSourceMarkingEnabled({ contexts, logger }),
    logger,
  });
}

export function handleProgressiveOpenSource(input: HandleProgressiveOpenSourceInput): void {
  if (!input.app || !input.sourceTargetId) {
    input.showMessage(input.t('progressiveOpenSourceUnavailable', '当前卡片没有可回源的来源块'), 3000, 'error');
    return;
  }

  void (input.openBlockAtSource ?? openReviewBlockAtSource)({
    app: input.app,
    blockId: input.sourceTargetId,
  });
}

export async function handleProgressiveCompletePiece(
  input: HandleProgressiveCompletePieceInput,
): Promise<void> {
  const { service, pieceDocId, t, showMessage, gradeGood, logger } = input;
  if (!service || !pieceDocId) {
    showMessage(t('pluginNotReady', 'Plugin not ready'), 3000, 'error');
    return;
  }

  try {
    const result = await service.completeCurrentPiece(pieceDocId);
    showMessage(
      result.nextPieceDocId
        ? t('progressivePieceCompletedNext', '当前片已完成，下一片已激活')
        : t('progressivePieceCompletedFinal', '当前片已完成，已到最后一片'),
      3000,
      'info',
    );
    gradeGood();
  } catch (error) {
    logger?.error?.('[SiYuanMemo][ReviewView] Failed to complete current progressive piece:', error);
    showMessage(
      t('progressiveCompletePieceFailed', '完成当前片失败：{message}')
        .replace('{message}', error instanceof Error ? error.message : String(error)),
      5000,
      'error',
    );
  }
}
