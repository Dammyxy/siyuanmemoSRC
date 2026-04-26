import { CardState, type FSRSCard } from '@/types/card';
import { repairFsrsReviewState } from './fsrsReviewStateRepair';

const DAY_MS = 24 * 60 * 60 * 1000;

export type NormalizedSchedulerCard = FSRSCard & {
  schedulerType: NonNullable<FSRSCard['schedulerType']>;
};

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
  return Math.max(0, toFiniteNumber(value, fallback));
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  return Math.max(0, Math.floor(toFiniteNumber(value, fallback)));
}

function toTimestamp(value: unknown, fallback: number): number {
  const timestamp = toFiniteNumber(value, fallback);
  return timestamp > 0 ? timestamp : fallback;
}

function clampPriority(value: unknown): number {
  return Math.max(0, Math.min(100, toFiniteNumber(value, 50)));
}

function clampDifficulty(value: unknown): number {
  return Math.max(1, Math.min(10, toFiniteNumber(value, 5)));
}

function normalizeState(value: unknown): CardState {
  const numericState = Math.floor(toFiniteNumber(value, CardState.New));
  switch (numericState) {
    case CardState.New:
    case CardState.Learning:
    case CardState.Review:
    case CardState.Relearning:
    case CardState.Suspended:
      return numericState;
    default:
      return CardState.New;
  }
}

export function normalizeSchedulerCard(
  card: FSRSCard,
  schedulerType: NonNullable<FSRSCard['schedulerType']>,
  options: {
    now?: number | Date;
  } = {},
): NormalizedSchedulerCard {
  const nowValue = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const now = Number.isFinite(nowValue) ? nowValue : Date.now();
  const state = normalizeState(card.state);

  const createdAt = toTimestamp(card.createdAt, now);
  const updatedAt = Math.max(createdAt, toTimestamp(card.updatedAt, createdAt));

  const normalized: NormalizedSchedulerCard = {
    ...card,
    xiuyuanID: String(card.xiuyuanID || '').trim(),
    blockId: String(card.blockId || '').trim(),
    due: toTimestamp(card.due, now),
    stability: toNonNegativeNumber(card.stability, 0),
    difficulty: schedulerType === 'fsrs-v6' && (state === CardState.Review || state === CardState.Relearning)
      ? toFiniteNumber(card.difficulty, 0)
      : clampDifficulty(card.difficulty),
    reps: toNonNegativeInteger(card.reps, 0),
    lapses: toNonNegativeInteger(card.lapses, 0),
    state,
    lastReview: toTimestamp(card.lastReview, 0),
    elapsedDays: toNonNegativeNumber(card.elapsedDays, 0),
    scheduledDays: toNonNegativeNumber(card.scheduledDays, 0),
    learning_step: toNonNegativeInteger(card.learning_step, 0),
    priority: clampPriority(card.priority),
    tags: Array.isArray(card.tags) ? card.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    leechCount: toNonNegativeInteger(card.leechCount, 0),
    isLeech: card.isLeech === true,
    skipped: card.skipped === true,
    createdAt,
    updatedAt,
    schedulerType,
    meta: card.meta && typeof card.meta === 'object'
      ? { ...card.meta }
      : undefined,
  };

  if (normalized.lastReview > 0 && normalized.elapsedDays <= 0) {
    normalized.elapsedDays = Math.max(0, Math.floor((now - normalized.lastReview) / DAY_MS));
  }

  const repaired = repairFsrsReviewState(normalized, { schedulerType, now });
  return {
    ...repaired.card,
    schedulerType,
  };
}
