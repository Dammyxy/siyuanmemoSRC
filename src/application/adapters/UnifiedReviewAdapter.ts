import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueStats } from '@/core/queue/types';
import { isXiuyuanCard } from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import {
  isNeuralRoamSessionQueue,
  type QueueCounterSnapshot,
  type ReviewQueueProgressSnapshot,
} from '@/types/unified-data-source';
import {
  type AdapterContext,
  type IAdapter,
  type ReviewCardKind,
  type ReviewHeaderPriorityBadge,
  type ReviewHeaderVariant,
  type ReviewUIState,
  resolveReviewHeaderVariant,
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
};

type QueueWithUnderlying = {
  getUnderlyingQueue?: () => unknown;
};

type CachedHeaderState = {
  queueType: string;
  stats: ReviewUIState['header']['stats'];
  counterSummary: ReviewUIState['header']['counterSummary'];
  counterBadges: ReviewUIState['header']['counterBadges'];
  queueSize: number;
  remainingSize: number;
  queueProgress: ReviewQueueProgressSnapshot;
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
    return null;
  }
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

function resolveContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
  if (isXiuyuanCard(card) && card.meta.templateID === 'builtin-riff-sync') {
    return fallbackBlockId || card.meta.frontBlockIDs[0] || '';
  }

  if (card.type === 'descriptor' && isXiuyuanCard(card)) {
    const descriptorId = card.meta.fieldMapping?.descriptor;
    if (descriptorId) {
      logger.debug('Descriptor card uses descriptor field for content block', { descriptorId });
      return descriptorId;
    }

    if (fallbackBlockId) {
      logger.debug('Descriptor card uses representative block for content block', { fallbackBlockId });
      return fallbackBlockId;
    }

    if (card.meta.frontBlockIDs.length > 1) {
      const descriptorFromFrontBlocks = card.meta.frontBlockIDs[1];
      logger.debug('Descriptor card falls back to second front block for content block', {
        descriptorFromFrontBlocks,
      });
      return descriptorFromFrontBlocks;
    }

    if (card.meta.frontBlockIDs.length > 0) {
      const fallbackFrontBlockId = card.meta.frontBlockIDs[0];
      logger.warn('Descriptor card falls back to first front block for content block', {
        fallbackFrontBlockId,
      });
      return fallbackFrontBlockId;
    }

    logger.warn('Descriptor card has no resolvable content block ID', {
      cardId: card.id,
    });
    return '';
  }

  if (isXiuyuanCard(card) && card.meta.frontBlockIDs.length > 0) {
    return card.meta.frontBlockIDs[0];
  }

  return fallbackBlockId;
}

function resolveAnswerBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
  if (!isXiuyuanCard(card)) {
    return '';
  }

  const templateID = card.meta.templateID;
  const backBlockIDs = card.meta.backBlockIDs;
  if (templateID === 'builtin-riff-sync') {
    // Native riff-sync cards must render from the container/root block.
    return fallbackBlockId || card.meta.frontBlockIDs[0] || backBlockIDs[0] || '';
  }

  if (ANSWER_TEMPLATE_IDS.has(templateID) && backBlockIDs.length > 0) {
    return backBlockIDs[0];
  }

  return '';
}

function isNativeInlineHiddenCard(card: UnifiedReviewItem): boolean {
  if (!isXiuyuanCard(card)) {
    return false;
  }

  if (normalizeCardType(card.type) !== 'item') {
    return false;
  }

  if (card.meta.templateID !== 'builtin-riff-sync') {
    return false;
  }

  const renderProfile = card.meta.renderProfile;
  return typeof renderProfile !== 'string' || renderProfile.length === 0;
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

function resolveQueueLabel(i18n: Record<string, string> | undefined, queueType: string): string {
  switch (queueType) {
    case 'retrieval-practice':
      return t(i18n, 'retrievalPractice', '提取练习');
    case 'incremental-learning':
      return t(i18n, 'incrementalLearning', '渐进学习');
    case 'final-drill':
      return t(i18n, 'finalDrill', '刻意练习');
    case 'filter-group':
      return t(i18n, 'filterGroup', '筛选组');
    case 'neural-roam':
      return t(i18n, 'neuralRoam', '神经漫游');
    default:
      return t(i18n, 'unifiedQueue', '统一队列');
  }
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
    queueLabel: resolveQueueLabel(i18n, queueType),
    completed,
    remaining,
    total,
  };
}

function isRealFlashcardPriority(item: UnifiedReviewItem, queueType: string): boolean {
  if (queueType !== 'neural-roam') {
    return true;
  }

  const neuralContext = item.meta?.neuralContext;
  if (!neuralContext || typeof neuralContext !== 'object') {
    return true;
  }

  return (neuralContext as Record<string, unknown>).isFlashcard === true;
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
    const { stats, counterSummary, counterBadges, queueSize, remainingSize, queueProgress } = this.resolveHeaderPlaceholder(
      queueType,
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
      { icon: '#iconSparkles', type: 'ai-sidebar', ariaLabel: t(this.i18n, 'aiSidebar', 'AI Sidebar') },
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
      return {
        header: {
          title: t(this.i18n, 'reviewTitle', 'Review'),
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
          hasHiddenContent: false,
          queueSize,
          remainingSize,
          queueProgress,
        },
        overlay: null,
      };
    }

    const uiConfig = queue.getUIConfig(item);
    const blockId = resolveBlockId(item);
    const cardId = resolveCardId(item);
    const cardType = normalizeCardType(item.type);
    const isTopicDocument = isTopicDocumentCard(item, cardType);
    const contentBlockId = isTopicDocument
      ? blockId
      : resolveContentBlockId(item, blockId);
    const answerBlockID = isTopicDocument
      ? ''
      : resolveAnswerBlockId(item, blockId);
    const isTopicLike = isTopicLikeCardType(cardType);
    const hasInlineHiddenContent = isNativeInlineHiddenCard(item);

    if (shouldLogBidirectionalTemplateDiagnostic(item)) {
      logger.warn('[SiYuanMemo][BidirectionalTemplateDiagnostic] adapter mapped review content', {
        cardId,
        blockId,
        contentBlockId,
        answerBlockID,
        templateID: item.meta.templateID,
        typeMarker: item.meta.typeMarker,
        faceIndex: item.meta.faceIndex,
        frontBlockIDs: item.meta.frontBlockIDs,
        backBlockIDs: item.meta.backBlockIDs,
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
        title: t(this.i18n, 'reviewTitle', 'Review'),
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
        isXiuyuanListTemplate: isXiuyuanCard(item) && item.meta.templateID === 'builtin-list-item',
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
    const headerVariant = this.headerVariant || resolveReviewHeaderVariant(queueType);
    const stats = normalizeStats(await queue.getStats?.());
    const safeContext = context ?? { showAnswer: false };

    const snapshot = await queue.getCounterSnapshot?.().catch((error) => {
      logger.warn('Failed to read live queue counter snapshot:', error);
      return null;
    });
    const overallRemaining = Math.max(0, Number(snapshot?.remaining) || stats.size);
    const overallTotal = Math.max(0, Number(snapshot?.total) || overallRemaining);
    const presentation = this.buildCounterPresentation({
      headerVariant,
      queue,
      snapshot,
      context: safeContext,
    });
    const label = snapshot
      ? `${Math.max(0, Number(snapshot.due) || 0)} due · ${overallRemaining} remaining`
      : (stats.label || `${overallRemaining} due`);

    return this.cacheAndBuildAuxHeader(queueType, {
      stats: {
        current: overallRemaining,
        total: overallTotal,
        label,
        queueName: t(this.i18n, 'unifiedQueue', 'Unified Queue'),
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
    queueType: string,
    context: AdapterContext,
  ): Pick<ReviewUIState['header'], 'stats' | 'counterSummary' | 'counterBadges'> & Pick<ReviewUIState['meta'], 'queueSize' | 'remainingSize' | 'queueProgress'> {
    if (this.cachedHeaderState && this.cachedHeaderState.queueType === queueType) {
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

    return {
      stats: {
        current: remainingSize,
        total: queueSize,
        label: initialTotal > 0 ? `${remainingSize} due` : '',
        queueName: t(this.i18n, 'unifiedQueue', 'Unified Queue'),
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
    payload: Pick<ReviewUIState['header'], 'stats' | 'counterSummary' | 'counterBadges'>,
  ): Partial<ReviewUIState> {
    this.cachedHeaderState = {
      queueType,
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
            label: t(this.i18n, 'headerRemaining', 'Remaining'),
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
            label: t(this.i18n, 'headerRemaining', 'Remaining'),
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
        const roamedCount = this.getNeuralRoamedCount(queue);
        const roamedTooltip = `${t(this.i18n, 'headerRoamed', '\u5df2\u6f2b\u6e38')} ${roamedCount} ${t(this.i18n, 'headerCardsUnit', '\u5f20\u5361')}`;
        return createReviewHeaderCounterPresentation({
          total,
          summaryValue: {
            label: t(this.i18n, 'headerRoamed', '\u5df2\u6f2b\u6e38'),
            value: roamedCount,
            tooltip: roamedTooltip,
            ariaLabel: roamedTooltip,
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
            label: t(this.i18n, 'headerRemaining', '\u5269\u4f59'),
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

  private getNeuralRoamedCount(queue: IQueueStrategy<UnifiedReviewItem>): number {
    const underlying = resolveUnderlyingQueue(queue);
    if (underlying && isNeuralRoamSessionQueue(underlying)) {
      return Math.max(0, underlying.getHistoryCount());
    }
    return 0;
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
