import type { IQueueStrategy } from '@/core/queue/abstraction/Strategy';
import type { QueueStats } from '@/core/queue/types';
import { isXiuyuanCard } from '@/core/xiuyuan/cardMeta';
import type { FSRSCard } from '@/types/card';
import { isNeuralRoamSessionQueue } from '@/types/unified-data-source';
import {
  type AdapterContext,
  type IAdapter,
  type ReviewCardKind,
  type ReviewHeaderCounterSummaryPart,
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
type NextDuesMap = Partial<Record<RatingValue, string>>;
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

type HeaderBaselineSnapshot = {
  totalCards: number;
  buckets: Map<HeaderBucket, number>;
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

function normalizeHeaderBucket(type: unknown): HeaderBucket | null {
  const normalized = normalizeCardType(type);
  if (normalized === 'item' || normalized === 'descriptor' || normalized === 'topic' || normalized === 'concept') {
    return normalized;
  }
  return null;
}

function isTopicLikeCardType(cardType: ReviewCardKind): boolean {
  return cardType === 'topic' || cardType === 'concept';
}

function resolveContentBlockId(card: UnifiedReviewItem, fallbackBlockId: string): string {
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

function resolveAnswerBlockId(card: UnifiedReviewItem): string {
  if (!isXiuyuanCard(card)) {
    return '';
  }

  const templateID = card.meta.templateID;
  const backBlockIDs = card.meta.backBlockIDs;
  if (ANSWER_TEMPLATE_IDS.has(templateID) && backBlockIDs.length > 0) {
    return backBlockIDs[0];
  }

  return '';
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

function countHeaderBuckets(cards: FSRSCard[]): Map<HeaderBucket, number> {
  const buckets = createEmptyBucketMap();
  buckets.set('all', cards.length);

  for (const card of cards) {
    const bucket = normalizeHeaderBucket(card.type);
    if (!bucket) {
      continue;
    }
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  return buckets;
}

function readCount(buckets: Map<HeaderBucket, number>, bucket: HeaderBucket): number {
  return Math.max(0, Number(buckets.get(bucket)) || 0);
}

export class UnifiedReviewAdapter implements IAdapter<UnifiedReviewItem> {
  private readonly i18n?: Record<string, string>;
  private readonly headerVariant?: ReviewHeaderVariant;
  private headerBaselineVersion = -1;
  private headerBaseline: HeaderBaselineSnapshot | null = null;

  constructor(options?: { i18n?: Record<string, string>; headerVariant?: ReviewHeaderVariant }) {
    this.i18n = options?.i18n;
    this.headerVariant = options?.headerVariant;
  }

  async toUIState(
    queue: IQueueStrategy<UnifiedReviewItem>,
    item: UnifiedReviewItem | null,
    context: AdapterContext,
  ): Promise<ReviewUIState> {
    const queueType = hasQueueType(queue) ? queue.getType() : '';
    const headerVariant = this.headerVariant || resolveReviewHeaderVariant(queueType);
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

    const stats = normalizeStats(await queue.getStats?.());
    const liveCards = await this.loadLiveCards(queue);
    const liveBuckets = countHeaderBuckets(liveCards);
    const baseline = this.ensureHeaderBaseline(liveCards, liveBuckets, context);
    const overallRemaining = stats.size || readCount(liveBuckets, 'all');
    const overallTotal = Math.max(baseline.totalCards, overallRemaining, readCount(liveBuckets, 'all'));

    const { counterSummary, counterBadges } = this.buildCounterPresentation({
      headerVariant,
      liveBuckets,
      baseline,
      context,
      queue,
      total: overallTotal,
    });
    const priorityBadge = this.buildPriorityBadge(item, queueType);

    let toolbar: NonNullable<ReviewUIState['header']['toolbar']> = [
      { icon: '#iconFullscreen', type: 'fullscreen', ariaLabel: t(this.i18n, 'fullscreen', 'Fullscreen') },
      { icon: '#iconEdit', type: 'edit-srs', ariaLabel: t(this.i18n, 'editSrsData', 'Edit SRS Data') },
      { icon: '#iconOpen', type: 'sticktab', ariaLabel: t(this.i18n, 'openBy', 'Open By') },
    ];

    if (queueType === 'neural-roam') {
      toolbar.push(
        { icon: '#iconLock', type: 'lock-focus', ariaLabel: t(this.i18n, 'lockAsFocus', 'Start New Worldline') },
        { icon: '#iconList', type: 'neural-focuses', ariaLabel: t(this.i18n, 'neuralFocusMenu', 'Roam Seeds') },
        { icon: '#iconHistory', type: 'neural-history', ariaLabel: t(this.i18n, 'neuralHistoryMenu', 'Roam Path') },
      );
    }
    toolbar = toolbarWithFilterScope(toolbar);

    if (!item) {
      return {
        header: {
          title: t(this.i18n, 'reviewTitle', 'Review'),
          stats: {
            current: overallRemaining,
            total: overallTotal,
            label: stats.label,
            queueName: t(this.i18n, 'unifiedQueue', 'Unified Queue'),
          },
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
          queueSize: overallTotal,
          remainingSize: overallRemaining,
        },
        overlay: null,
      };
    }

    const uiConfig = queue.getUIConfig(item);
    const blockId = resolveBlockId(item);
    const cardId = resolveCardId(item);
    const cardType = normalizeCardType(item.type);
    const contentBlockId = resolveContentBlockId(item, blockId);
    const answerBlockID = resolveAnswerBlockId(item);
    const isTopicLike = isTopicLikeCardType(cardType);

    logger.debug('Building review UI state', {
      cardId,
      blockId,
      cardType,
      headerVariant,
      remaining: overallRemaining,
      total: overallTotal,
    });

    return {
      header: {
        title: t(this.i18n, 'reviewTitle', 'Review'),
        stats: {
          current: overallRemaining,
          total: overallTotal,
          label: stats.label,
          queueName: t(this.i18n, 'unifiedQueue', 'Unified Queue'),
        },
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
        hasHiddenContent: isTopicLike ? false : !context.showAnswer,
        queueSize: overallTotal,
        remainingSize: overallRemaining,
      },
      overlay: null,
    };
  }

  async fetchAuxiliaryData(item: UnifiedReviewItem | null): Promise<Partial<ReviewUIState>> {
    if (!item) {
      return {};
    }
    return {};
  }

  resetSessionState(): void {
    this.headerBaseline = null;
    this.headerBaselineVersion = -1;
  }

  cleanup(): void {
    this.resetSessionState();
  }

  private async loadLiveCards(queue: IQueueStrategy<UnifiedReviewItem>): Promise<FSRSCard[]> {
    const underlying = resolveUnderlyingQueue(queue);
    if (!underlying || typeof underlying.getCards !== 'function') {
      return [];
    }

    try {
      const cards = await underlying.getCards();
      return Array.isArray(cards) ? cards : [];
    } catch (error) {
      logger.warn('Failed to load live header cards from underlying queue:', error);
      return [];
    }
  }

  private ensureHeaderBaseline(
    liveCards: FSRSCard[],
    liveBuckets: Map<HeaderBucket, number>,
    context: AdapterContext,
  ): HeaderBaselineSnapshot {
    const baselineVersion = Math.max(0, Number(context.session?.baselineVersion) || 0);
    if (!this.headerBaseline || this.headerBaselineVersion !== baselineVersion) {
      this.headerBaselineVersion = baselineVersion;
      this.headerBaseline = {
        totalCards: liveCards.length,
        buckets: countHeaderBuckets(liveCards),
      };
      return this.headerBaseline;
    }

    this.headerBaseline.totalCards = Math.max(
      this.headerBaseline.totalCards,
      liveCards.length,
      readCount(liveBuckets, 'all'),
    );

    for (const bucket of ['item', 'descriptor', 'topic', 'concept'] as const) {
      const liveCount = readCount(liveBuckets, bucket);
      const baselineCount = readCount(this.headerBaseline.buckets, bucket);
      if (liveCount > baselineCount) {
        this.headerBaseline.buckets.set(bucket, liveCount);
      }
    }

    this.headerBaseline.buckets.set(
      'all',
      Math.max(readCount(this.headerBaseline.buckets, 'all'), readCount(liveBuckets, 'all')),
    );

    return this.headerBaseline;
  }

  private buildCounterPresentation(options: {
    headerVariant: ReviewHeaderVariant;
    liveBuckets: Map<HeaderBucket, number>;
    baseline: HeaderBaselineSnapshot;
    context: AdapterContext;
    queue: IQueueStrategy<UnifiedReviewItem>;
    total: number;
  }) {
    const { headerVariant, liveBuckets, baseline, context, queue, total } = options;
    const answeredCount = Math.max(0, Number(context.session?.answeredCount) || 0);
    const correctCount = Math.max(0, Number(context.session?.correctCount) || 0);
    const makeTotal = (bucket: HeaderBucket): number =>
      Math.max(readCount(baseline.buckets, bucket), readCount(liveBuckets, bucket));
    const makeRatioPart = (
      id: string,
      label: string,
      bucket: HeaderBucket,
      tone: ReviewHeaderCounterSummaryPart['tone'],
    ): ReviewHeaderCounterSummaryPart => ({
      id,
      label,
      tone,
      remaining: readCount(liveBuckets, bucket),
      total: makeTotal(bucket),
    });
    const makeRatioBadge = (
      id: string,
      label: string,
      bucket: HeaderBucket,
      tone: ReviewHeaderCounterBadgeInput['tone'],
    ): ReviewHeaderCounterBadgeInput => ({
      id,
      label,
      kind: 'ratio',
      tone,
      remaining: readCount(liveBuckets, bucket),
      total: makeTotal(bucket),
    });
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
        return createReviewHeaderCounterPresentation({
          total,
          parts: [
            makeRatioPart('item', t(this.i18n, 'headerItem', 'Item'), 'item', 'item'),
            makeRatioPart('descriptor', t(this.i18n, 'headerDescriptor', 'Descriptor'), 'descriptor', 'descriptor'),
          ],
        });
      case 'incremental-learning':
        return createReviewHeaderCounterPresentation({
          total,
          forceParentheses: true,
          showZeroVisible: true,
          parts: [
            makeRatioPart('item', t(this.i18n, 'headerItem', 'Item'), 'item', 'item'),
            makeRatioPart('descriptor', t(this.i18n, 'headerDescriptor', 'Descriptor'), 'descriptor', 'descriptor'),
            makeRatioPart('topic', t(this.i18n, 'headerTopic', 'Topic'), 'topic', 'topic'),
            makeRatioPart('concept', t(this.i18n, 'headerConcept', 'Concept'), 'concept', 'concept'),
          ],
        });
      case 'final-drill':
        return createReviewHeaderCounterPresentation({
          total,
          parts: [
            makeRatioPart('item', t(this.i18n, 'headerItem', 'Item'), 'item', 'item'),
            makeRatioPart('descriptor', t(this.i18n, 'headerDescriptor', 'Descriptor'), 'descriptor', 'descriptor'),
          ],
          badges: [
            makeValueBadge('answered', t(this.i18n, 'headerAnswered', '\u5df2\u7b54'), answeredCount, 'progress'),
            makeValueBadge('correct', t(this.i18n, 'headerCorrect', '\u7b54\u5bf9'), correctCount, 'success'),
          ],
        });
      case 'filter-group': {
        const dynamicBuckets = FIXED_CARD_TYPE_ORDER.filter((bucket) =>
          readCount(baseline.buckets, bucket) > 0 || readCount(liveBuckets, bucket) > 0,
        );
        return createReviewHeaderCounterPresentation({
          total,
          parts: dynamicBuckets.map((bucket) =>
            makeRatioPart(bucket, this.getCardTypeLabel(bucket), bucket, bucket),
          ),
        });
      }
      case 'neural-roam':
        return createReviewHeaderCounterPresentation({
          total,
          parts: [
            makeRatioPart('concept', t(this.i18n, 'headerConcept', 'Concept'), 'concept', 'concept'),
          ],
          badges: [
            this.buildNeuralPathBadge(queue),
          ],
        });
      case 'subset-review':
      case 'temporary-drill':
      case 'leech':
      default:
        return createReviewHeaderCounterPresentation({
          total,
          badges: [
            makeRatioBadge('remaining', t(this.i18n, 'headerRemaining', '\u5269\u4f59'), 'all', 'neutral'),
          ],
        });
    }
  }

  private buildNeuralPathBadge(queue: IQueueStrategy<UnifiedReviewItem>): ReviewHeaderCounterBadgeInput {
    const underlying = resolveUnderlyingQueue(queue);
    if (underlying && isNeuralRoamSessionQueue(underlying)) {
      const navigationState = underlying.getNavigationState();
      return {
        id: 'path',
        label: t(this.i18n, 'headerPath', '\u8def\u5f84'),
        kind: 'ratio',
        tone: 'progress',
        remaining: Math.max(0, navigationState.currentPathIndex + 1),
        total: Math.max(0, navigationState.pathLength),
      };
    }

    return {
      id: 'path',
      label: t(this.i18n, 'headerPath', '\u8def\u5f84'),
      kind: 'ratio',
      tone: 'progress',
      remaining: 0,
      total: 0,
    };
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
