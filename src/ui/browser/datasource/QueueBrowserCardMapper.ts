import type { BrowserCard } from '../types';
import {
  CardState,
  calculateRetrievability,
  formatDueDate,
  formatHistoryDate,
  truncateContent,
} from '../types';
import type { FSRSCard } from '@/types/card';
import { isCardDismissed } from '@/core/card/domain/services/dismissState';

export type QueueCardFirstReviewMode = 'created-or-last' | 'last-review';

export type QueueBrowserCardMapOptions = {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
};

function convertCardState(state: number): CardState {
  switch (state) {
    case 0:
      return CardState.New;
    case 1:
      return CardState.Learning;
    case 2:
      return CardState.Review;
    case 3:
      return CardState.Relearning;
    default:
      return CardState.New;
  }
}

function getStateLabel(state: CardState): string {
  switch (state) {
    case CardState.New:
      return '新卡';
    case CardState.Learning:
      return '学习中';
    case CardState.Review:
      return '复习';
    case CardState.Relearning:
      return '重学';
    default:
      return '未知';
  }
}

function resolveFirstReview(
  card: FSRSCard,
  lastReviewDate: Date | null,
  mode: QueueCardFirstReviewMode
): Date | null {
  if (mode === 'last-review') {
    return lastReviewDate;
  }

  if ((card.reps || 0) <= 0) {
    return null;
  }

  if (card.createdAt) {
    return new Date(card.createdAt);
  }

  return lastReviewDate;
}

export function mapQueueFsrsCardToBrowserCard(
  card: FSRSCard,
  options?: QueueBrowserCardMapOptions
): BrowserCard {
  const firstReviewMode = options?.firstReviewMode ?? 'last-review';

  const now = Date.now();
  const elapsedDays = card.lastReview
    ? Math.floor((now - card.lastReview) / (1000 * 60 * 60 * 24))
    : 0;

  const stability = card.stability || 0;
  const difficulty = card.difficulty || 0;
  const scheduledDays = card.scheduledDays || 0;
  const dueDate = new Date(card.due);
  const lastReviewDate = card.lastReview ? new Date(card.lastReview) : null;
  const firstReviewDate = resolveFirstReview(card, lastReviewDate, firstReviewMode);
  const imagePrompt = (card.meta?.imageOcclusionPrompt as string) || '';
  const title = (card.meta?.title as string) || '';
  const fullContent = (card.meta?.content as string) || imagePrompt || title || '';
  const deckId = (card.meta?.deckId as string) || '';
  const cardType = card.type as
    | 'topic'
    | 'item'
    | 'concept'
    | 'descriptor'
    | 'incremental'
    | 'webpage'
    | undefined;
  const state = convertCardState(card.state);

  const browserCard: BrowserCard = {
    id: card.riffCardId || card.id,
    fsrsCardId: card.id,
    blockId: card.blockId,
    deckId,
    content: truncateContent(fullContent, 100),
    fullContent,
    rootId: (card.meta?.rootId as string) || '',
    state,
    stateLabel: getStateLabel(state),
    due: dueDate,
    dueFormatted: formatDueDate(dueDate),
    stability,
    difficulty,
    retrievability: calculateRetrievability(stability, elapsedDays),
    reps: card.reps || 0,
    lapses: card.lapses || 0,
    elapsedDays,
    scheduledDays,
    lastReview: lastReviewDate,
    lastReviewFormatted: formatHistoryDate(lastReviewDate),
    interval: scheduledDays,
    firstReview: firstReviewDate,
    firstReviewFormatted: formatHistoryDate(firstReviewDate),
    priority: card.priority ?? 50,
    suspended: isCardDismissed(card),
    tags: card.tags || [],
    note: (card.meta?.note as string) || '',
    cardType,
    aFactor: card.aFactor,
    meta: card.meta,
  };

  if (typeof options?.queueIndex === 'number' && Number.isFinite(options.queueIndex)) {
    browserCard.queueIndex = options.queueIndex;
  }

  return browserCard;
}
