import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueStats } from '@/core/queue/types';
import {
  isConceptDefinitionCard,
  isDescriptorSemanticCard,
  isXiuyuanCard,
} from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import {
  resolveReviewPresentationHeaderVariant,
  resolveReviewQueueLabel,
  resolveReviewSurfaceTitle,
} from '@/types/review-presentation-semantics';
import {
  isNeuralRoamSessionQueue,
  type NeuralRoamBatchSnapshot,
  type NeuralNavigationState,
  type ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source/neural-roam-session';
import type { QueueCounterSnapshot } from '@/types/unified-data-source/queue-core';
import type { BackendNeuralRoamViewState } from '../../../packages/contracts/src/backend-rpc';
import {
  buildReviewRenderableContext,
  normalizeReviewProgressiveRenderMetadata,
} from '@/application/adapters/reviewRenderableContext';
import {
  buildReviewRenderableRenderPolicy,
  type ReviewRenderableRenderPolicy,
} from '@/application/adapters/reviewRenderableRenderPolicy';
import {
  type AdapterContext,
  type IAdapter,
  type ReviewCardKind,
  type ReviewHeaderPriorityBadge,
  type ReviewHeaderVariant,
  type ReviewUIState,
} from '@/ui/review/v2/types';
import {
  type ReviewHeaderCounterBadgeInput,
  createReviewHeaderCounterPresentation,
} from '@/ui/review/v2/reviewHeaderCounterPresentation';
import { createLogger } from '@/utils/logger';

const logger = createLogger('UnifiedReviewAdapter');

type RatingValue = 1 | 2 | 3 | 4;
type NextDuesMap = Record<RatingValue, string>;
type HeaderBucket = 'all' | 'item' | 'descriptor' | 'topic' | 'concept';

type UnifiedReviewItem = FSRSCard & {
  blockID?: string;
  cardID?: string;
  deckID?: string;
  deckId?: string;
  nextDues?: NextDuesMap;
};

type QueueWithType = {
  getType: () => string;
};

type UnderlyingQueueLike = {
  getCards?: () => Promise<FSRSCard[]>;
  getNavigationState?: () => { engineMode?: string };
  getCurrentBatchSnapshot?: () => NeuralRoamBatchSnapshot | null;
  getBackendViewState?: () => BackendNeuralRoamViewState | null;
};

type QueueWithUnderlying = {
  getUnderlyingQueue?: () => unknown;
};

type CachedHeaderState = {
  cacheKey: string;
  stats: ReviewUIState['header']['stats'];
  counterSummary: ReviewUIState['header']['counterSummary'];
  counterBadges: ReviewUIState['header']['counterBadges'];
  queueSize: number;
  remainingSize: number;
  queueProgress: ReviewQueueProgressSnapshot;
};

type SessionCounterState = {
  total: number;
  remaining: number;
  answeredCount: number;
};

type HeaderCounterNumbers = {
  remaining: number;
  total: number;
  due: number;
};

const ANSWER_TEMPLATE_IDS = new Set<string>([
  'builtin-list-item',
  'builtin-basic-qa',
  'builtin-bidirectional',
]);

const FIXED_CARD_TYPE_ORDER: Array<Exclude<HeaderBucket, 'all'>> = [
  'item',
  'descriptor',
  'topic',
  'concept',
];

function shouldLogBidirectionalTemplateDiagnostic(card: UnifiedReviewItem | null | undefined): boolean {
  void card;
  return false;
}

function t(i18n: Record<string, string> | undefined, key: string, fallback: string): string {
  return i18n?.[key] || fallback;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createReviewDependencyUnavailableError(code: string, message: string, error: unknown): Error {
  return new Error(`${code}: ${message}: ${formatUnknownError(error)}`);
}

function hasQueueType(queue: unknown): queue is QueueWithType {
  return typeof queue === 'object'
    && queue !== null
    && 'getType' in queue
    && typeof (queue as QueueWithType).getType === 'function';
}

function resolveUnderlyingQueue(queue: unknown): UnderlyingQueueLike | null {
  if (typeof queue !== 'object' || queue === null) {
    return null;
  }

  const getUnderlyingQueue = (queue as QueueWithUnderlying).getUnderlyingQueue;
  if (typeof getUnderlyingQueue !== 'function') {
    return null;
  }

  try {
    const underlying = getUnderlyingQueue.call(queue);
    return typeof underlying === 'object' && underlying !== null
      ? (underlying as UnderlyingQueueLike)
      : null;
  } catch (error) {
    logger.warn('Failed to resolve underlying queue for header counts:', error);
    throw createReviewDependencyUnavailableError(
      'REVIEW_QUEUE_UNAVAILABLE',
      'failed to resolve underlying queue for header counts',
      error,
    );
  }
}

function resolveNeuralRoamBatchSnapshot(queue: IQueueStrategy<UnifiedReviewItem>): NeuralRoamBatchSnapshot | null {
  const underlying = resolveUnderlyingQueue(queue);
  if (!underlying || typeof underlying.getCurrentBatchSnapshot !== 'function') {
    return null;
  }

  try {
    const backendViewState = underlying.getBackendViewState?.();
    if (backendViewState?.batchProgress) {
      const engineMode = backendViewState.engineMode === 'hyperspace' ? 'hyperspace' : 'orbit';
      return {
        kind: backendViewState.batchProgress.kind === 'hyperspace-current-node' ? 'hyperspace-current-node' : 'orbit-round',
        engineMode,
        navigationState: backendViewState.navigationState as unknown as NeuralNavigationState,
        focusNodeId: backendViewState.currentNodeId,
        focusNodePreview: null,
        currentNodeId: backendViewState.currentNodeId,
        roundSize: backendViewState.batchProgress.totalCount,
        viewedCount: backendViewState.batchProgress.viewedCount,
        remainingCount: backendViewState.batchProgress.remainingCount,
        roundNodes: [],
        recentPath: [],
        sourceSnapshot: [],
        seedSnapshot: [],
        anchorSnapshot: [],
      };
    }
    return underlying.getCurrentBatchSnapshot();
  } catch (error) {
    logger.warn('Failed to resolve neural roam batch snapshot for header counts:', error);
    throw createReviewDependencyUnavailableError(
      'REVIEW_COUNTER_UNAVAILABLE',
      'failed to resolve neural roam batch snapshot for header counts',
      error,
    );
  }
}

function resolveHeaderCacheKey(
  queueType: string,
  headerVariant: ReviewHeaderVariant,
  queue: IQueueStrategy<UnifiedReviewItem>,
): string {
  if (queueType !== 'neural-roam') {
    return `${queueType}::${headerVariant}`;
  }

  const underlying = resolveUnderlyingQueue(queue);
  if (underlying && isNeuralRoamSessionQueue(underlying)) {
    const backendViewState = underlying.getBackendViewState?.() ?? null;
    const navigationState = backendViewState?.navigationState as NeuralNavigationState | undefined
      ?? underlying.getNavigationState();
    const engineMode = navigationState.engineMode ?? underlying.getEngineMode();
    const routeId = backendViewState?.route?.id ?? '';
    const currentNodeId = navigationState.currentNodeId ?? '';
    const currentEventId = navigationState.currentEventId ?? '';
    const currentPathIndex = navigationState.currentPathIndex ?? -1;
    const progressKey = backendViewState?.batchProgress
      ? `${backendViewState.batchProgress.viewedCount}:${backendViewState.batchProgress.totalCount}:${backendViewState.batchProgress.remainingCount}`
      : '';
    return `${queueType}::${headerVariant}::${engineMode}::${routeId}::${currentNodeId}::${currentEventId}::${currentPathIndex}::${progressKey}`;
  }

  return `${queueType}::${headerVariant}`;
}

function resolveBlockId(item: UnifiedReviewItem): string {
  return item.blockID ?? item.blockId ?? item.id ?? item.cardID ?? '';
}

function resolveCardId(item: UnifiedReviewItem): string {
  return item.cardID ?? item.id ?? '';
}

function resolveDeckId(item: UnifiedReviewItem): string {
  return item.deckID ?? item.deckId ?? '';
}

function getNextDue(item: UnifiedReviewItem, rating: RatingValue): string {
  return item.nextDues?.[rating] ?? '';
}

function normalizeCardType(type: unknown): ReviewCardKind {
  const value = String(type ?? 'item');
  if (value === 'topic') return 'topic';
  if (value === 'concept') return 'concept';
  if (value === 'descriptor') return 'descriptor';
  if (value === 'cloze') return 'cloze';
  return 'item';
}

function isTopicLikeCardType(cardType: ReviewCardKind): boolean {
  return cardType === 'topic' || cardType === 'concept';
}

function isTopicDocumentCard(item: UnifiedReviewItem, cardType: ReviewCardKind): boolean {
  if (cardType !== 'topic') {
    return false;
  }

  return item.meta?.isDocument === true || item.meta?.blockType === 'd';
}

function normalizeBlockId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readFieldMappingBlockId(
  meta: { fieldMapping?: Record<string, string> },
  key: string,
): string {
  return normalizeBlockId(meta.fieldMapping?.[key]);
}

function pickPreferredSemanticBlock(
  candidates: Array<unknown>,
  blockedBlockId: string,
): string {
  for (const candidate of candidates) {
    const normalized = normalizeBlockId(candidate);
    if (!normalized) {
      continue;
    }
    if (blockedBlockId && normalized === blockedBlockId) {
      continue;
    }
    return normalized;
  }

  for (const candidate of candidates) {
    const normalized = normalizeBlockId(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function isNativeRiffSyncXiuyuanCard(card: UnifiedReviewItem): boolean {
  return isXiuyuanCard(card) && card.meta.templateID === 'builtin-riff-sync';
}

function isXiuyuanListTemplateCard(card: UnifiedReviewItem): boolean {
  return isXiuyuanCard(card) && card.meta.templateID === 'builtin-list-item';
}

function resolveFallbackXiuyuanContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
  if (!isXiuyuanCard(card)) {
    return fallbackBlockId;
  }
  if (isNativeRiffSyncXiuyuanCard(card)) {
    return fallbackBlockId || card.meta.frontBlockIDs[0] || '';
  }
  return card.meta.frontBlockIDs[0] || fallbackBlockId;
}

function buildReviewCardDiagnosticProjection(item: UnifiedReviewItem): Record<string, unknown> {
  if (!isXiuyuanCard(item)) {
    return {};
  }
  return {
    templateID: item.meta.templateID,
    typeMarker: item.meta.typeMarker,
    faceIndex: item.meta.faceIndex,
    frontBlockIDs: item.meta.frontBlockIDs,
    backBlockIDs: item.meta.backBlockIDs,
  };
}

function resolveDefinitionContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
  const definitionId = readFieldMappingBlockId(card.meta, 'definition');
  if (definitionId) {
    logger.debug('Concept-definition card uses definition field for content block', { definitionId });
    return definitionId;
  }

  const conceptId = readFieldMappingBlockId(card.meta, 'concept');
  const frontDefinitionCandidate = card.meta.frontBlockIDs[0];
  const backDefinitionCandidate = card.meta.backBlockIDs[0];
  const preferFront = card.meta.templateID === 'builtin-concept-definition-reverse'
    || card.meta.typeMarker === 'concept-definition-reverse';
  const definitionFromFaces = pickPreferredSemanticBlock(
    preferFront
      ? [frontDefinitionCandidate, backDefinitionCandidate]
      : [backDefinitionCandidate, frontDefinitionCandidate],
    conceptId,
  );
  if (definitionFromFaces) {
    logger.debug('Concept-definition card resolved content block from definition-side faces', {
      definitionFromFaces,
      preferFront,
    });
    return definitionFromFaces;
  }

  if (fallbackBlockId) {
    logger.warn('Concept-definition card falls back to representative block for content block', {
      fallbackBlockId,
      cardId: card.id,
    });
    return fallbackBlockId;
  }

  logger.warn('Concept-definition card has no resolvable content block ID', {
    cardId: card.id,
  });
  return '';
}

function resolveDescriptorContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
  const descriptorId = readFieldMappingBlockId(card.meta, 'descriptor');
  if (descriptorId) {
    logger.debug('Descriptor card uses descriptor field for content block', { descriptorId });
    return descriptorId;
  }

  const conceptId = readFieldMappingBlockId(card.meta, 'concept');
  const descriptorFromFaces = pickPreferredSemanticBlock([
    card.meta.frontBlockIDs[1],
    card.meta.backBlockIDs[1],
    card.meta.frontBlockIDs[0],
    card.meta.backBlockIDs[0],
  ], conceptId);
  if (descriptorFromFaces) {
    logger.debug('Descriptor card resolved content block from descriptor-side faces', {
      descriptorFromFaces,
    });
    return descriptorFromFaces;
  }

  if (fallbackBlockId) {
    logger.warn('Descriptor card falls back to representative block for content block', {
      fallbackBlockId,
      cardId: card.id,
    });
    return fallbackBlockId;
  }

  logger.warn('Descriptor card has no resolvable content block ID', {
    cardId: card.id,
  });
  return '';
}

function resolveContentBlockId(
  card: UnifiedReviewItem,
  fallbackBlockId: string,
  renderPolicy: ReviewRenderableRenderPolicy,
): string {
  if (isXiuyuanCard(card)) {
    if (renderPolicy.specialRendererKind === 'descriptor') {
      return resolveDescriptorContentBlockId(card, fallbackBlockId);
    }

    if (renderPolicy.specialRendererKind === 'concept-definition') {
      return resolveDefinitionContentBlockId(card, fallbackBlockId);
    }

    if (isDescriptorSemanticCard(card)) {
      return resolveDescriptorContentBlockId(card, fallbackBlockId);
    }

    if (isConceptDefinitionCard(card)) {
      return resolveDefinitionContentBlockId(card, fallbackBlockId);
    }

    return resolveFallbackXiuyuanContentBlockId(card, fallbackBlockId);
  }

  return fallbackBlockId;
}

function resolveAnswerBlockId(
  card: UnifiedReviewItem,
  fallbackBlockId: string,
  renderPolicy: ReviewRenderableRenderPolicy,
): string {
  if (!isXiuyuanCard(card)) {
    return '';
  }

  if (
    renderPolicy.specialRendererKind === 'concept-definition'
    || renderPolicy.specialRendererKind === 'descriptor'
    || isConceptDefinitionCard(card)
    || isDescriptorSemanticCard(card)
  ) {
    return '';
  }

  const templateID = card.meta.templateID;
  const backBlockIDs = card.meta.backBlockIDs;
  if (isNativeRiffSyncXiuyuanCard(card)) {
    // Native riff-sync cards must render from the container/root block.
    return fallbackBlockId || card.meta.frontBlockIDs[0] || backBlockIDs[0] || '';
  }

  if (ANSWER_TEMPLATE_IDS.has(templateID) && backBlockIDs.length > 0) {
    return backBlockIDs[0];
  }

  return '';
}

function readCardMeta(card: UnifiedReviewItem): Record<string, unknown> {
  return card.meta && typeof card.meta === 'object' ? card.meta : {};
}

function isInlineFormulaClozeMeta(meta: Record<string, unknown>): boolean {
  return meta.clozeRenderMode === 'inline-formula-cloze'
    || meta.renderProfile === 'quick-inline-formula';
}

function isOrdinaryMultiClozeMeta(meta: Record<string, unknown>): boolean {
  return meta.templateID === 'builtin-multi-cloze' && !isInlineFormulaClozeMeta(meta);
}

function isProgressiveDerivedItemMeta(meta: Record<string, unknown>): boolean {
  const progressive = meta.progressive;
  return progressive !== null
    && typeof progressive === 'object'
    && (progressive as Record<string, unknown>).kind === 'derived-item';
}

function isNativeInlineHiddenCard(card: UnifiedReviewItem): boolean {
  if (normalizeCardType(card.type) !== 'item') {
    return false;
  }

  const meta = readCardMeta(card);
  if (isXiuyuanCard(card)) {
    if (isOrdinaryMultiClozeMeta(meta)) {
      return false;
    }

    if (isNativeRiffSyncXiuyuanCard(card)) {
      const renderProfile = card.meta.renderProfile;
      return typeof renderProfile !== 'string' || renderProfile.length === 0;
    }
  }

  return isProgressiveDerivedItemMeta(meta) || meta.cardSource === 'topic-derived';
}

function normalizeStats(stats: QueueStats | undefined): { size: number; label: string } {
  if (!stats) {
    return { size: 0, label: '' };
  }

  return {
    size: Math.max(0, Number(stats.size) || 0),
    label: stats.label ?? '',
  };
}

function buildQueueProgressSnapshot(
  i18n: Record<string, string> | undefined,
  queueType: string,
  queueSize: number,
  remainingSize: number,
): ReviewQueueProgressSnapshot {
  const total = Number.isFinite(queueSize) && queueSize > 0 ? queueSize : null;
  const remaining = Math.max(0, Number(remainingSize) || 0);
  const completed = total !== null ? Math.max(0, total - remaining) : 0;
  return {
    queueType: queueType || null,
    queueLabel: resolveReviewQueueLabel(i18n, queueType),
    completed,
    remaining,
    total,
  };
}

function isExplicitNeuralRoamNonFlashcard(item: UnifiedReviewItem, queueType: string): boolean {
  if (queueType !== 'neural-roam') {
    return false;
  }

  const neuralContext = item.meta?.neuralContext;
  if (!neuralContext || typeof neuralContext !== 'object') {
    return false;
  }

  return (neuralContext as Record<string, unknown>).isFlashcard === false;
}

function isRealFlashcardPriority(item: UnifiedReviewItem, queueType: string): boolean {
  return !isExplicitNeuralRoamNonFlashcard(item, queueType);
}

function resolveEffectiveCardType(item: UnifiedReviewItem, queueType: string): ReviewCardKind {
  const cardType = normalizeCardType(item.type);
  if (isExplicitNeuralRoamNonFlashcard(item, queueType)) {
    return 'topic';
  }
  return cardType;
}

function createEmptyBucketMap(): Map<HeaderBucket, number> {
  return new Map<HeaderBucket, number>([
    ['all', 0],
    ['item', 0],
    ['descriptor', 0],
    ['topic', 0],
    ['concept', 0],
  ]);
}

function readCount(buckets: Map<HeaderBucket, number>, bucket: HeaderBucket): number {
  return Math.max(0, Number(buckets.get(bucket)) || 0);
}

function toBucketMap(snapshot: QueueCounterSnapshot | null | undefined): Map<HeaderBucket, number> {
  const buckets = createEmptyBucketMap();
  if (!snapshot) {
    return buckets;
  }

  buckets.set('all', Math.max(0, Number(snapshot.buckets.all) || 0));
  buckets.set('item', Math.max(0, Number(snapshot.buckets.item) || 0));
  buckets.set('descriptor', Math.max(0, Number(snapshot.buckets.descriptor) || 0));
  buckets.set('topic', Math.max(0, Number(snapshot.buckets.topic) || 0));
  buckets.set('concept', Math.max(0, Number(snapshot.buckets.concept) || 0));
  return buckets;
}

function resolveSessionCounter(context?: AdapterContext): SessionCounterState | null {
  const session = context?.session;
  if (!session || session.initialTotal === undefined || session.initialTotal === null) {
    return null;
  }

  const rawTotal = Number(session.initialTotal);
  if (!Number.isFinite(rawTotal)) {
    return null;
  }

  const total = Math.max(0, rawTotal);
  const answeredCount = Math.max(0, Number(session.answeredCount) || 0);
  return {
    total,
    remaining: Math.max(0, total - answeredCount),
    answeredCount,
  };
}

function reconcileCounterWithSession(
  queueType: string,
  counter: HeaderCounterNumbers,
  context?: AdapterContext,
): HeaderCounterNumbers {
  if (queueType === 'neural-roam') {
    return counter;
  }

  const sessionCounter = resolveSessionCounter(context);
  if (!sessionCounter) {
    return counter;
  }

  const staleAfterNoScoreRemoval = sessionCounter.total < counter.total;
  const staleAfterAnsweredCard = sessionCounter.answeredCount > 0 && counter.remaining > sessionCounter.remaining;
  if (!staleAfterNoScoreRemoval && !staleAfterAnsweredCard) {
    return counter;
  }

  const remaining = Math.min(counter.remaining, sessionCounter.remaining);
  const total = staleAfterNoScoreRemoval ? sessionCounter.total : counter.total;
  return {
    remaining,
    total: Math.max(remaining, total),
    due: Math.min(counter.due, remaining),
  };
}

function withReconciledSnapshot(
  snapshot: QueueCounterSnapshot | null | undefined,
  counter: HeaderCounterNumbers,
): QueueCounterSnapshot | null | undefined {
  if (!snapshot) {
    return snapshot;
  }

  if (
    snapshot.remaining === counter.remaining
    && snapshot.due === counter.due
    && snapshot.total === counter.total
  ) {
    return snapshot;
  }

  return {
    ...snapshot,
    remaining: counter.remaining,
    due: counter.due,
    total: counter.total,
    buckets: {
      ...snapshot.buckets,
      all: Math.min(Math.max(0, Number(snapshot.buckets.all) || 0), counter.remaining),
    },
    source: 'reconciled',
  };
}

export class UnifiedReviewAdapter implements IAdapter<UnifiedReviewItem> {
  private readonly i18n?: Record<string, string>;
  private readonly headerVariant?: ReviewHeaderVariant;
  private cachedHeaderState: CachedHeaderState | null = null;

  constructor(options?: {
    i18n?: Record<string, string>;
    headerVariant?: ReviewHeaderVariant;
    progressiveExcerptEnabled?: boolean;
  }) {
    this.i18n = options?.i18n;
    this.headerVariant = options?.headerVariant;
    void options?.progressiveExcerptEnabled;
  }

  async toUIState(
    queue: IQueueStrategy<UnifiedReviewItem>,
    item: UnifiedReviewItem | null,
    context: AdapterContext,
  ): Promise<ReviewUIState> {
    const queueType = hasQueueType(queue) ? queue.getType() : '';
    const headerVariant = this.headerVariant || resolveReviewPresentationHeaderVariant(queueType);
    const cacheKey = resolveHeaderCacheKey(queueType, headerVariant, queue);
    const { stats, counterSummary, counterBadges, queueSize, remainingSize, queueProgress } = this.resolveHeaderPlaceholder(
      cacheKey,
      queueType,
      headerVariant,
      context,
    );
    const isFilterGroup = queueType === 'filter-group';
    const toolbarWithFilterScope = (
      base: NonNullable<ReviewUIState['header']['toolbar']>,
    ): NonNullable<ReviewUIState['header']['toolbar']> => {
      if (!isFilterGroup) {
        return base;
      }
      return [
        ...base,
        {
          icon: '#iconFilter',
          type: 'plan-review-scope',
          label: t(this.i18n, 'planReviewScope', '\u89c4\u5212\u590d\u4e60\u8303\u56f4'),
          ariaLabel: t(this.i18n, 'planReviewScope', '\u89c4\u5212\u590d\u4e60\u8303\u56f4'),
        },
      ];
    };

    const priorityBadge = this.buildPriorityBadge(item, queueType);

    let toolbar: NonNullable<ReviewUIState['header']['toolbar']> = [
      { icon: '#iconMore', type: 'more', ariaLabel: t(this.i18n, 'moreActions', 'More') },
    ];

    if (queueType === 'neural-roam') {
      toolbar.push(
        { icon: '#iconPin', type: 'lock-focus', ariaLabel: t(this.i18n, 'addAnchor', 'Build Station') },
        { icon: '#iconList', type: 'neural-focuses', ariaLabel: t(this.i18n, 'viewSourceList', 'View Source List') },
        { icon: '#iconHistory', type: 'neural-history', ariaLabel: t(this.i18n, 'neuralHistoryMenu', 'View Trajectory Path') },
      );
    }
    toolbar = toolbarWithFilterScope(toolbar);

    if (!item) {
      const renderContext = buildReviewRenderableContext({
        card: null,
        queueType,
        showAnswer: context.showAnswer,
        contentBlockId: '',
        answerBlockId: '',
        diagnostics: ['empty-review-target'],
      });
      return {
        header: {
          title: resolveReviewSurfaceTitle({ i18n: this.i18n, queueType, headerVariant }),
          stats,
          counterSummary,
          counterBadges,
          priorityBadge,
          breadcrumbs: [],
          toolbar,
        },
        content: {
          type: 'empty',
          data: '',
          id: '',
        },
        actions: {
          showAnswer: false,
          grades: [],
          menu: [],
        },
        meta: {
          transition: 'fade',
          emptyStateMode: 'completed',
          hasHiddenContent: false,
          queueSize,
          remainingSize,
          queueProgress,
          renderContext,
        },
        overlay: null,
      };
    }

    const uiConfig = queue.getUIConfig(item);
    const blockId = resolveBlockId(item);
    const cardId = resolveCardId(item);
    const cardType = resolveEffectiveCardType(item, queueType);
    const isTopicDocument = isTopicDocumentCard(item, cardType);
    const renderPolicy = buildReviewRenderableRenderPolicy(item);
    const contentBlockId = isTopicDocument
      ? blockId
      : resolveContentBlockId(item, blockId, renderPolicy);
    const isTopicLike = isTopicLikeCardType(cardType);
    const answerBlockID = isTopicDocument || isTopicLike
      ? ''
      : resolveAnswerBlockId(item, blockId, renderPolicy);
    const hasInlineHiddenContent = isNativeInlineHiddenCard(item);
    const renderContext = buildReviewRenderableContext({
      card: item,
      queueType,
      showAnswer: context.showAnswer,
      contentBlockId,
      answerBlockId: answerBlockID,
      progressive: normalizeReviewProgressiveRenderMetadata(item),
      diagnostics: contentBlockId ? [] : ['unsupported-content-type'],
      renderPolicy,
    });

    if (shouldLogBidirectionalTemplateDiagnostic(item)) {
      logger.warn('[SiYuanMemo][BidirectionalTemplateDiagnostic] adapter mapped review content', {
        cardId,
        blockId,
        contentBlockId,
        answerBlockID,
        ...buildReviewCardDiagnosticProjection(item),
        showAnswer: context.showAnswer,
      });
    }

    logger.debug('Building review UI state', {
      cardId,
      blockId,
      cardType,
      remaining: remainingSize,
      total: queueSize,
    });

    return {
      header: {
        title: resolveReviewSurfaceTitle({ i18n: this.i18n, queueType, headerVariant }),
        stats,
        counterSummary,
        counterBadges,
        priorityBadge,
        breadcrumbs: [],
        toolbar,
      },
      content: {
        type: 'protyle',
        data: contentBlockId,
        id: contentBlockId,
        answerBlockID,
        card: item,
        isXiuyuanListTemplate: isXiuyuanListTemplateCard(item),
        xiuyuanMeta: isXiuyuanCard(item) ? item.meta : null,
      },
      actions: {
        showAnswer: !context.showAnswer,
        grades: uiConfig.showRatingButtons
          ? [
              { label: t(this.i18n, 'cardRatingAgain', 'Again'), value: 1, color: 'var(--b3-theme-error)', kb: '1', emoji: '\uD83D\uDE48', nextDue: getNextDue(item, 1) },
              { label: t(this.i18n, 'cardRatingHard', 'Hard'), value: 2, color: 'var(--b3-theme-warning)', kb: '2', emoji: '\uD83D\uDE2C', nextDue: getNextDue(item, 2) },
              { label: t(this.i18n, 'cardRatingGood', 'Good'), value: 3, color: 'var(--b3-theme-info)', kb: '3', emoji: '\uD83D\uDE0A', nextDue: getNextDue(item, 3) },
              { label: t(this.i18n, 'cardRatingEasy', 'Easy'), value: 4, color: 'var(--b3-theme-success)', kb: '4', emoji: '\uD83C\uDF08', nextDue: getNextDue(item, 4) },
            ]
          : [],
        menu: [],
        cardMeta: {
          blockID: blockId,
          cardID: cardId,
          deckID: resolveDeckId(item),
          reps: item.reps,
          lapses: item.lapses,
          state: item.state,
          lastReview: item.lastReview,
          isReviewCard: item.reps > 0,
          type: cardType,
          cardType,
        },
      },
      meta: {
        transition: 'slide-left',
        hasHiddenContent: isTopicLike ? false : hasInlineHiddenContent,
        queueSize,
        remainingSize,
        queueProgress,
        renderContext,
      },
      overlay: null,
    };
  }

  async fetchAuxiliaryData(
    _item: UnifiedReviewItem | null,
    queue?: IQueueStrategy<UnifiedReviewItem>,
    context?: AdapterContext,
  ): Promise<Partial<ReviewUIState>> {
    if (!queue) {
      return {};
    }

    const queueType = hasQueueType(queue) ? queue.getType() : '';
    const headerVariant = this.headerVariant || resolveReviewPresentationHeaderVariant(queueType);
    const cacheKey = resolveHeaderCacheKey(queueType, headerVariant, queue);
    const stats = normalizeStats(await queue.getStats?.());
    const safeContext = context ?? { showAnswer: false };
    const neuralBatch = queueType === 'neural-roam' ? resolveNeuralRoamBatchSnapshot(queue) : null;

    let snapshot: QueueCounterSnapshot | null | undefined;
    if (typeof queue.getCounterSnapshot === 'function') {
      try {
        snapshot = await queue.getCounterSnapshot();
      } catch (error) {
        logger.warn('Failed to read live queue counter snapshot:', error);
        throw createReviewDependencyUnavailableError(
          'REVIEW_COUNTER_UNAVAILABLE',
          'failed to read live queue counter snapshot',
          error,
        );
      }
    }
    let overallRemaining = queueType === 'neural-roam' && neuralBatch
      ? Math.max(0, Number(neuralBatch.remainingCount) || 0)
      : Math.max(0, Number(snapshot?.remaining) || stats.size);
    let overallTotal = queueType === 'neural-roam' && neuralBatch
      ? Math.max(0, Number(neuralBatch.roundSize) || 0)
      : Math.max(0, Number(snapshot?.total) || overallRemaining);
    let overallDue = Math.max(0, Number(snapshot?.due) || 0);
    const reconciledCounter = reconcileCounterWithSession(queueType, {
      remaining: overallRemaining,
      total: overallTotal,
      due: overallDue,
    }, safeContext);
    overallRemaining = reconciledCounter.remaining;
    overallTotal = reconciledCounter.total;
    overallDue = reconciledCounter.due;
    snapshot = withReconciledSnapshot(snapshot, reconciledCounter);
    const presentation = this.buildCounterPresentation({
      headerVariant,
      queue,
      snapshot,
      context: safeContext,
    });
    const surfaceTitle = resolveReviewSurfaceTitle({ i18n: this.i18n, queueType, headerVariant });
    const label = neuralBatch
      ? `${presentation.counterSummary?.label || ''} ${Math.max(0, Number(presentation.counterSummary?.value) || 0)}/${Math.max(0, Number(neuralBatch.roundSize) || 0)}`
      : snapshot
        ? `${overallDue} due · ${overallRemaining} remaining`
        : (stats.label || `${overallRemaining} due`);
    logReviewHeaderCounterDiagnostic({
      queueType,
      headerVariant,
      cacheKey,
      statsSize: stats.size,
      statsLabel: stats.label ?? null,
      statsExtra: stats.extra ?? null,
      snapshotSource: snapshot?.source ?? null,
      snapshotRemaining: snapshot?.remaining ?? null,
      snapshotDue: snapshot?.due ?? null,
      snapshotTotal: snapshot?.total ?? null,
      overallRemaining,
      overallDue,
      overallTotal,
      sessionInitialTotal: safeContext.session?.initialTotal ?? null,
      sessionAnsweredCount: safeContext.session?.answeredCount ?? null,
      showAnswer: safeContext.showAnswer,
      label,
    });

    return this.cacheAndBuildAuxHeader(queueType, {
      cacheKey,
      stats: {
        current: overallRemaining,
        total: overallTotal,
        label,
        queueName: surfaceTitle,
      },
      counterSummary: presentation.counterSummary,
      counterBadges: presentation.counterBadges,
    });
  }

  resetSessionState(): void {
    this.cachedHeaderState = null;
  }

  cleanup(): void {
    this.resetSessionState();
  }

  private resolveHeaderPlaceholder(
    cacheKey: string,
    queueType: string,
    headerVariant: ReviewHeaderVariant,
    context: AdapterContext,
  ): Pick<ReviewUIState['header'], 'stats' | 'counterSummary' | 'counterBadges'> & Pick<ReviewUIState['meta'], 'queueSize' | 'remainingSize' | 'queueProgress'> {
    if (this.cachedHeaderState && this.cachedHeaderState.cacheKey === cacheKey) {
      const reconciledCounter = reconcileCounterWithSession(queueType, {
        remaining: this.cachedHeaderState.remainingSize,
        total: this.cachedHeaderState.queueSize,
        due: this.cachedHeaderState.remainingSize,
      }, context);
      if (
        reconciledCounter.remaining !== this.cachedHeaderState.remainingSize
        || reconciledCounter.total !== this.cachedHeaderState.queueSize
      ) {
        const surfaceTitle = resolveReviewSurfaceTitle({ i18n: this.i18n, queueType, headerVariant });
        return {
          stats: {
            current: reconciledCounter.remaining,
            total: reconciledCounter.total,
            label: reconciledCounter.total > 0 ? `${reconciledCounter.remaining} due` : '',
            queueName: this.cachedHeaderState.stats.queueName || surfaceTitle,
          },
          counterSummary: null,
          counterBadges: [],
          queueSize: reconciledCounter.total,
          remainingSize: reconciledCounter.remaining,
          queueProgress: buildQueueProgressSnapshot(
            this.i18n,
            queueType,
            reconciledCounter.total,
            reconciledCounter.remaining,
          ),
        };
      }
      return {
        stats: this.cachedHeaderState.stats,
        counterSummary: this.cachedHeaderState.counterSummary,
        counterBadges: this.cachedHeaderState.counterBadges,
        queueSize: this.cachedHeaderState.queueSize,
        remainingSize: this.cachedHeaderState.remainingSize,
        queueProgress: this.cachedHeaderState.queueProgress,
      };
    }

    const initialTotal = Math.max(0, Number(context.session?.initialTotal) || 0);
    const answeredCount = Math.max(0, Number(context.session?.answeredCount) || 0);
    const remainingSize = Math.max(0, initialTotal - answeredCount);
    const queueSize = Math.max(initialTotal, remainingSize);
    const surfaceTitle = resolveReviewSurfaceTitle({ i18n: this.i18n, queueType, headerVariant });

    return {
      stats: {
        current: remainingSize,
        total: queueSize,
        label: initialTotal > 0 ? `${remainingSize} due` : '',
        queueName: surfaceTitle,
      },
      counterSummary: null,
      counterBadges: [],
      queueSize,
      remainingSize,
      queueProgress: buildQueueProgressSnapshot(this.i18n, queueType, queueSize, remainingSize),
    };
  }

  private cacheAndBuildAuxHeader(
    queueType: string,
    payload: Pick<ReviewUIState['header'], 'stats' | 'counterSummary' | 'counterBadges'> & { cacheKey: string },
  ): Partial<ReviewUIState> {
    this.cachedHeaderState = {
      cacheKey: payload.cacheKey,
      stats: payload.stats,
      counterSummary: payload.counterSummary,
      counterBadges: payload.counterBadges,
      queueSize: payload.stats.total,
      remainingSize: payload.stats.current,
      queueProgress: buildQueueProgressSnapshot(this.i18n, queueType, payload.stats.total, payload.stats.current),
    };

    return {
      header: {
        stats: payload.stats,
        counterSummary: payload.counterSummary,
        counterBadges: payload.counterBadges,
      } as Partial<ReviewUIState['header']> as ReviewUIState['header'],
      meta: {
        transition: 'none',
        queueSize: payload.stats.total,
        remainingSize: payload.stats.current,
        queueProgress: this.cachedHeaderState.queueProgress,
      } as ReviewUIState['meta'],
    };
  }

  private buildCounterPresentation(options: {
    headerVariant: ReviewHeaderVariant;
    snapshot: QueueCounterSnapshot | null;
    context: AdapterContext;
    queue: IQueueStrategy<UnifiedReviewItem>;
  }) {
    const { headerVariant, snapshot, context, queue } = options;
    const liveBuckets = toBucketMap(snapshot);
    const answeredCount = Math.max(0, Number(context.session?.answeredCount) || 0);
    const correctCount = Math.max(0, Number(context.session?.correctCount) || 0);
    const total = Math.max(0, Number(snapshot?.total) || Number(snapshot?.remaining) || 0);
    const due = Math.max(0, Number(snapshot?.due) || 0);
    const remaining = Math.max(0, Number(snapshot?.remaining) || 0);
    const makeValueBadge = (
      id: string,
      label: string,
      value: number,
      tone: ReviewHeaderCounterBadgeInput['tone'],
    ): ReviewHeaderCounterBadgeInput => ({
      id,
      label,
      kind: 'value',
      tone,
      value,
    });
    switch (headerVariant) {
      case 'retrieval-practice':
      case 'incremental-learning':
      case 'filter-group':
        return createReviewHeaderCounterPresentation({
          total,
          summaryValue: {
            value: remaining,
            tooltip: `${remaining} remaining · ${due} due`,
            ariaLabel: `${remaining} remaining · ${due} due`,
          },
          badges: FIXED_CARD_TYPE_ORDER
            .filter((bucket) => readCount(liveBuckets, bucket) > 0)
            .map((bucket) => makeValueBadge(
              bucket,
              this.getCardTypeLabel(bucket),
              readCount(liveBuckets, bucket),
              bucket,
            )),
        });
      case 'final-drill':
        return createReviewHeaderCounterPresentation({
          total,
          summaryValue: {
            value: remaining,
            tooltip: `${remaining} remaining`,
            ariaLabel: `${remaining} remaining`,
          },
          badges: [
            makeValueBadge('answered', t(this.i18n, 'headerAnswered', '\u5df2\u7b54'), answeredCount, 'progress'),
            makeValueBadge('correct', t(this.i18n, 'headerCorrect', '\u7b54\u5bf9'), correctCount, 'success'),
          ],
        });
      case 'neural-roam': {
        const batch = resolveNeuralRoamBatchSnapshot(queue);
        const isHyperspaceBatch = batch?.engineMode === 'hyperspace' || batch?.kind === 'hyperspace-current-node';
        const progressLabel = isHyperspaceBatch
          ? t(this.i18n, 'headerDepth', '深度')
          : t(this.i18n, 'headerViewed', '已看');
        const scopeLabel = isHyperspaceBatch
          ? t(this.i18n, 'headerMaxDepth', '最大深度')
          : t(this.i18n, 'headerRoundTotal', '本轮总数');
        const progressValue = Math.max(0, Number(batch?.viewedCount) || 0);
        const totalValue = Math.max(0, Number(batch?.roundSize) || 0);
        const progressTooltip = totalValue > 0
          ? `${progressLabel} ${progressValue} / ${scopeLabel} ${totalValue}`
          : `${progressLabel} ${progressValue}`;
        return createReviewHeaderCounterPresentation({
          total,
          summaryValue: {
            label: progressLabel,
            value: progressValue,
            tooltip: progressTooltip,
            ariaLabel: progressTooltip,
          },
        });
      }
      case 'subset-review':
      case 'temporary-drill':
      case 'leech':
      default:
        return createReviewHeaderCounterPresentation({
          total,
          summaryValue: {
            value: remaining,
            tooltip: `${remaining} remaining`,
            ariaLabel: `${remaining} remaining`,
          },
          badges: total > 0 ? [
            makeValueBadge('due', t(this.i18n, 'headerDue', 'Due'), due, 'neutral'),
          ] : [],
        });
    }
  }

  private buildPriorityBadge(item: UnifiedReviewItem | null, queueType: string): ReviewHeaderPriorityBadge {
    const priorityLabel = t(this.i18n, 'headerPriority', 'Priority');
    if (!item || !isRealFlashcardPriority(item, queueType)) {
      return {
        label: 'P',
        value: '-',
        priority: null,
        ariaLabel: `${priorityLabel} -`,
      };
    }

    const priority = Number(item.priority);
    if (!Number.isFinite(priority)) {
      return {
        label: 'P',
        value: '-',
        priority: null,
        ariaLabel: `${priorityLabel} -`,
      };
    }

    return {
      label: 'P',
      value: String(priority),
      priority,
      ariaLabel: `${priorityLabel} ${priority}`,
    };
  }

  private getCardTypeLabel(bucket: Exclude<HeaderBucket, 'all'>): string {
    switch (bucket) {
      case 'descriptor':
        return t(this.i18n, 'headerDescriptor', 'Descriptor');
      case 'topic':
        return t(this.i18n, 'headerTopic', 'Topic');
      case 'concept':
        return t(this.i18n, 'headerConcept', 'Concept');
      case 'item':
      default:
        return t(this.i18n, 'headerItem', 'Item');
    }
  }
}

function logReviewHeaderCounterDiagnostic(input: {
  queueType: string;
  headerVariant: string;
  cacheKey: string;
  statsSize: number;
  statsLabel: string | null;
  statsExtra: string | null;
  snapshotSource: string | null;
  snapshotRemaining: number | null;
  snapshotDue: number | null;
  snapshotTotal: number | null;
  overallRemaining: number;
  overallDue: number;
  overallTotal: number;
  sessionInitialTotal: number | null;
  sessionAnsweredCount: number | null;
  showAnswer: boolean;
  label: string;
}): void {
  logger.info(
    '[SiYuanMemo][ReviewEntryDiagnostic] review header counter resolved'
    + ` queueType=${formatDiagnosticValue(input.queueType)}`
    + ` headerVariant=${formatDiagnosticValue(input.headerVariant)}`
    + ` cacheKey=${formatDiagnosticValue(input.cacheKey)}`
    + ` statsSize=${formatDiagnosticValue(input.statsSize)}`
    + ` statsLabel=${formatDiagnosticValue(input.statsLabel)}`
    + ` statsExtra=${formatDiagnosticValue(input.statsExtra)}`
    + ` snapshotSource=${formatDiagnosticValue(input.snapshotSource)}`
    + ` snapshotRemaining=${formatDiagnosticValue(input.snapshotRemaining)}`
    + ` snapshotDue=${formatDiagnosticValue(input.snapshotDue)}`
    + ` snapshotTotal=${formatDiagnosticValue(input.snapshotTotal)}`
    + ` overallRemaining=${formatDiagnosticValue(input.overallRemaining)}`
    + ` overallDue=${formatDiagnosticValue(input.overallDue)}`
    + ` overallTotal=${formatDiagnosticValue(input.overallTotal)}`
    + ` sessionInitialTotal=${formatDiagnosticValue(input.sessionInitialTotal)}`
    + ` sessionAnsweredCount=${formatDiagnosticValue(input.sessionAnsweredCount)}`
    + ` showAnswer=${formatDiagnosticValue(input.showAnswer)}`
    + ` label=${formatDiagnosticValue(input.label)}`,
  );
}

function formatDiagnosticValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}
