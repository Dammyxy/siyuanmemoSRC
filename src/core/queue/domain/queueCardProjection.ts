import { isCardDismissed } from '@/core/card/domain/services/dismissState';
import type { CardType, FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';

export type QueueCardFirstReviewMode = 'created-or-last' | 'last-review';

export type QueueCardProjectionOptions = {
  firstReviewMode?: QueueCardFirstReviewMode;
  queueIndex?: number;
};

export interface QueueCardProjection {
  id: string;
  fsrsCardId: string;
  blockId: string;
  deckId: string;
  rootId: string;
  content: string;
  fullContent: string;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: number | null;
  interval: number;
  firstReview: number | null;
  priority: number;
  suspended: boolean;
  tags: string[];
  note: string;
  cardType?: CardType;
  aFactor?: number;
  queueIndex?: number;
  blockType?: string | null;
}

function truncateContent(text: string, maxLength = 100): string {
  const cleaned = String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength)}...`;
}

function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) {
    return 0;
  }
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}

function resolveFirstReview(
  card: FSRSCard,
  lastReview: number | null,
  mode: QueueCardFirstReviewMode,
): number | null {
  if (mode === 'last-review') {
    return lastReview;
  }
  if ((card.reps || 0) <= 0) {
    return null;
  }
  if (card.createdAt) {
    return Number(card.createdAt) || null;
  }
  return lastReview;
}

export function buildQueueCardProjection(
  card: FSRSCard,
  options: QueueCardProjectionOptions = {},
): QueueCardProjection {
  const firstReviewMode = options.firstReviewMode ?? 'last-review';
  const now = Date.now();
  const lastReview = Number(card.lastReview) || null;
  const elapsedDays = lastReview
    ? Math.max(0, Math.floor((now - lastReview) / (1000 * 60 * 60 * 24)))
    : 0;
  const stability = Number(card.stability) || 0;
  const difficulty = Number(card.difficulty) || 0;
  const scheduledDays = Number(card.scheduledDays) || 0;
  const fullContent = String(
    (card.meta?.content as string)
      || (card.meta?.imageOcclusionPrompt as string)
      || (card.meta?.title as string)
      || '',
  );

  return {
    id: String(card.riffCardId || card.id || ''),
    fsrsCardId: String(card.id || ''),
    blockId: String(card.blockId || ''),
    deckId: String((card.meta?.deckId as string) || ''),
    rootId: String((card.meta?.rootId as string) || ''),
    content: truncateContent(fullContent, 100),
    fullContent,
    state: Number(card.state) || 0,
    due: Number(card.due) || 0,
    stability,
    difficulty,
    retrievability: calculateRetrievability(stability, elapsedDays),
    reps: Number(card.reps) || 0,
    lapses: Number(card.lapses) || 0,
    elapsedDays,
    scheduledDays,
    lastReview,
    interval: scheduledDays,
    firstReview: resolveFirstReview(card, lastReview, firstReviewMode),
    priority: card.priority ?? 50,
    suspended: isCardDismissed(card),
    tags: Array.isArray(card.tags) ? [...card.tags] : [],
    note: String((card.meta?.note as string) || ''),
    cardType: card.type as CardType | undefined,
    aFactor: card.aFactor,
    queueIndex: typeof options.queueIndex === 'number' ? options.queueIndex : undefined,
    blockType: typeof card.meta?.blockType === 'string' ? card.meta.blockType : null,
  };
}

export function buildQueueSnapshotRow(
  card: FSRSCard,
  options: QueueCardProjectionOptions = {},
): QueueSnapshotRow {
  const projection = buildQueueCardProjection(card, options);
  return {
    id: projection.id,
    fsrsCardId: projection.fsrsCardId,
    blockId: projection.blockId,
    deckId: projection.deckId,
    rootId: projection.rootId,
    content: projection.content,
    fullContent: projection.fullContent,
    state: projection.state,
    due: projection.due,
    stability: projection.stability,
    difficulty: projection.difficulty,
    retrievability: projection.retrievability,
    reps: projection.reps,
    lapses: projection.lapses,
    elapsedDays: projection.elapsedDays,
    scheduledDays: projection.scheduledDays,
    lastReview: projection.lastReview,
    interval: projection.interval,
    firstReview: projection.firstReview,
    priority: projection.priority,
    suspended: projection.suspended,
    cardType: projection.cardType,
    aFactor: projection.aFactor,
    queueIndex: projection.queueIndex,
    tags: projection.tags,
    blockType: projection.blockType,
  };
}
