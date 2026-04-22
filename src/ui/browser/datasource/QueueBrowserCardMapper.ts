import type { BrowserCard } from '../types';
import { CardState, formatDueDate, formatHistoryDate } from '../types';
import type { FSRSCard } from '@/types/card';
import {
  buildQueueCardProjection,
  type QueueCardFirstReviewMode,
} from '@/core/queue/domain/queueCardProjection';

export type { QueueCardFirstReviewMode };

export type QueueBrowserCardMapOptions = {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
  blockType?: string | null;
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
      return '鏂板崱';
    case CardState.Learning:
      return '瀛︿範涓?';
    case CardState.Review:
      return '澶嶄範';
    case CardState.Relearning:
      return '閲嶅';
    default:
      return '鏈煡';
  }
}

export function mapQueueFsrsCardToBrowserCard(
  card: FSRSCard,
  options?: QueueBrowserCardMapOptions
): BrowserCard {
  const projection = buildQueueCardProjection(card, {
    firstReviewMode: options?.firstReviewMode,
    queueIndex: options?.queueIndex,
  });
  const state = convertCardState(projection.state);
  const dueDate = new Date(projection.due);
  const lastReviewDate = projection.lastReview ? new Date(projection.lastReview) : null;
  const firstReviewDate = projection.firstReview ? new Date(projection.firstReview) : null;

  const browserCard: BrowserCard = {
    id: projection.id,
    fsrsCardId: projection.fsrsCardId,
    blockId: projection.blockId,
    deckId: projection.deckId,
    content: projection.content,
    fullContent: projection.fullContent,
    rootId: projection.rootId,
    state,
    stateLabel: getStateLabel(state),
    due: dueDate,
    dueFormatted: formatDueDate(dueDate),
    stability: projection.stability,
    difficulty: projection.difficulty,
    retrievability: projection.retrievability,
    reps: projection.reps,
    lapses: projection.lapses,
    elapsedDays: projection.elapsedDays,
    scheduledDays: projection.scheduledDays,
    lastReview: lastReviewDate,
    lastReviewFormatted: formatHistoryDate(lastReviewDate),
    interval: projection.interval,
    firstReview: firstReviewDate,
    firstReviewFormatted: formatHistoryDate(firstReviewDate),
    priority: projection.priority,
    suspended: projection.suspended,
    tags: projection.tags,
    note: projection.note,
    cardType: projection.cardType,
    aFactor: projection.aFactor,
    meta: options?.blockType
      ? { ...(card.meta || {}), blockType: options.blockType }
      : card.meta,
  };

  if (typeof projection.queueIndex === 'number' && Number.isFinite(projection.queueIndex)) {
    browserCard.queueIndex = projection.queueIndex;
  }

  if (options?.blockType === 'missing') {
    (browserCard as BrowserCard & { blockType?: string }).blockType = 'missing';
  }

  return browserCard;
}
