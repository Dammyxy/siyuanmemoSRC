import { CardState, type FSRSCard } from '@/types/card';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_REVIEW_STABILITY = 0.01;
const MIN_REVIEW_SCHEDULED_DAYS = 1;

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

  let due = toTimestamp(card.due, now);
  let lastReview = toTimestamp(card.lastReview, 0);
  let scheduledDays = toNonNegativeNumber(card.scheduledDays, 0);
  let elapsedDays = toNonNegativeNumber(card.elapsedDays, 0);
  let stability = toNonNegativeNumber(card.stability, 0);

  if (state === CardState.Review) {
    stability = Math.max(MIN_REVIEW_STABILITY, stability);

    if (scheduledDays < MIN_REVIEW_SCHEDULED_DAYS) {
      const derivedDays = lastReview > 0
        ? Math.floor(Math.max(0, due - lastReview) / DAY_MS)
        : 0;
      scheduledDays = Math.max(MIN_REVIEW_SCHEDULED_DAYS, derivedDays);
    }

    if (lastReview <= 0) {
      lastReview = Math.max(0, now - scheduledDays * DAY_MS);
    }

    if (elapsedDays <= 0 && lastReview > 0) {
      elapsedDays = Math.max(0, Math.floor((now - lastReview) / DAY_MS));
    }

    if (due <= 0) {
      due = now + scheduledDays * DAY_MS;
    }
  } else if (lastReview > 0 && elapsedDays <= 0) {
    elapsedDays = Math.max(0, Math.floor((now - lastReview) / DAY_MS));
  }

  const createdAt = toTimestamp(card.createdAt, now);
  const updatedAt = Math.max(createdAt, toTimestamp(card.updatedAt, createdAt));

  return {
    ...card,
    xiuyuanID: String(card.xiuyuanID || '').trim(),
    blockId: String(card.blockId || '').trim(),
    due,
    stability,
    difficulty: clampDifficulty(card.difficulty),
    reps: toNonNegativeInteger(card.reps, 0),
    lapses: toNonNegativeInteger(card.lapses, 0),
    state,
    lastReview,
    elapsedDays,
    scheduledDays,
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
}
