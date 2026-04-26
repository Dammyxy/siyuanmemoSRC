import { CardState, type FSRSCard } from '@/types/card';
import { resolveEffectiveSchedulerTypeForCard } from './schedulerPolicy';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DIFFICULTY = 5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;
const MIN_RELIABLE_HISTORICAL_INTERVAL_DAYS = 7;
const LOW_REVIEW_MEMORY_DAYS = 1;

export type FsrsReviewStateRepairResult = {
  card: FSRSCard;
  repaired: boolean;
  reasons: string[];
};

export function buildFsrsSchedulingFingerprint(card: Partial<FSRSCard>): string {
  return [
    `schedulerType=${String(card.schedulerType ?? '')}`,
    `type=${String(card.type ?? '')}`,
    `state=${fingerprintValue(card.state)}`,
    `due=${fingerprintValue(card.due)}`,
    `lastReview=${fingerprintValue(card.lastReview)}`,
    `stability=${fingerprintValue(card.stability)}`,
    `difficulty=${fingerprintValue(card.difficulty)}`,
    `scheduledDays=${fingerprintValue(card.scheduledDays)}`,
    `elapsedDays=${fingerprintValue(card.elapsedDays)}`,
    `reps=${fingerprintValue(card.reps)}`,
    `lapses=${fingerprintValue(card.lapses)}`,
    `learning_step=${fingerprintValue(card.learning_step)}`,
  ].join('|');
}

export function repairFsrsReviewState(
  card: FSRSCard,
  options: {
    now?: number | Date;
    schedulerType?: unknown;
  } = {},
): FsrsReviewStateRepairResult {
  if (!isFsrsV6EffectiveCard(card, options.schedulerType)) {
    return { card, repaired: false, reasons: [] };
  }

  if (!isReviewLikeState(card.state)) {
    return { card, repaired: false, reasons: [] };
  }

  const now = resolveNow(options.now);
  const reasons: string[] = [];
  const repairedCard: FSRSCard = { ...card };

  const originalDue = toPositiveTimestamp(repairedCard.due, 0);
  let due = originalDue > 0 ? originalDue : now;
  if (due !== repairedCard.due) {
    reasons.push('due');
  }

  let lastReview = toPositiveTimestamp(repairedCard.lastReview, 0);
  if (lastReview !== repairedCard.lastReview) {
    reasons.push('lastReview');
  }

  let elapsedDays = toNonNegativeInteger(repairedCard.elapsedDays, 0);
  if (elapsedDays !== repairedCard.elapsedDays) {
    reasons.push('elapsedDays');
  }

  let scheduledDays = toNonNegativeInteger(repairedCard.scheduledDays, 0);
  if (scheduledDays !== repairedCard.scheduledDays) {
    reasons.push('scheduledDays');
  }

  const intervalDays = deriveIntervalDays(originalDue, lastReview);
  const historicalIntervalDays = Math.max(scheduledDays, intervalDays);
  const hasReliableHistoricalInterval = historicalIntervalDays >= MIN_RELIABLE_HISTORICAL_INTERVAL_DAYS;
  const derivedDays = Math.max(1, historicalIntervalDays);

  const rawStability = Number(repairedCard.stability);
  const hadInvalidStability = !Number.isFinite(rawStability) || rawStability <= 0;
  const hasImplausiblyLowStability =
    hasReliableHistoricalInterval && Number.isFinite(rawStability) && rawStability <= LOW_REVIEW_MEMORY_DAYS;
  let stability = toFiniteNumber(repairedCard.stability, 0);
  if (hadInvalidStability || hasImplausiblyLowStability) {
    stability = derivedDays;
    reasons.push('stability');
  }

  const hasImplausiblyLowScheduledDays =
    hasReliableHistoricalInterval && scheduledDays <= LOW_REVIEW_MEMORY_DAYS;
  if (
    (scheduledDays <= 0 || hasImplausiblyLowScheduledDays)
    && (card.state === CardState.Review || hadInvalidStability || intervalDays > 0)
  ) {
    scheduledDays = Math.max(1, intervalDays, Math.ceil(stability));
    reasons.push('scheduledDays');
  }

  if (lastReview <= 0 && (card.state === CardState.Review || hadInvalidStability)) {
    lastReview = Math.max(0, due - scheduledDays * DAY_MS);
    reasons.push('lastReview');
  }

  if (due <= 0) {
    due = now + scheduledDays * DAY_MS;
    reasons.push('due');
  }

  if (lastReview > 0) {
    const actualElapsedDays = Math.max(0, Math.floor((now - lastReview) / DAY_MS));
    if (elapsedDays <= 0 || elapsedDays !== actualElapsedDays) {
      elapsedDays = actualElapsedDays;
      reasons.push('elapsedDays');
    }
  }

  const difficulty = clampDifficulty(repairedCard.difficulty);
  if (difficulty !== repairedCard.difficulty) {
    reasons.push('difficulty');
  }

  const uniqueReasons = Array.from(new Set(reasons));
  if (uniqueReasons.length === 0) {
    return { card, repaired: false, reasons: [] };
  }

  return {
    card: {
      ...repairedCard,
      due,
      stability,
      difficulty,
      lastReview,
      elapsedDays,
      scheduledDays,
    },
    repaired: true,
    reasons: uniqueReasons,
  };
}

function isReviewLikeState(state: unknown): boolean {
  return state === CardState.Review || state === CardState.Relearning;
}

function isFsrsV6EffectiveCard(card: FSRSCard, schedulerType: unknown): boolean {
  return resolveEffectiveSchedulerTypeForCard({
    ...card,
    schedulerType: typeof schedulerType === 'string' ? schedulerType : card.schedulerType,
  }) === 'fsrs-v6';
}

function resolveNow(value: number | Date | undefined): number {
  const timestamp = value instanceof Date ? value.getTime() : Number(value ?? Date.now());
  return Number.isFinite(timestamp) ? timestamp : Date.now();
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toPositiveTimestamp(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function toNonNegativeInteger(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
}

function deriveIntervalDays(due: number, lastReview: number): number {
  if (due <= 0 || lastReview <= 0 || due <= lastReview) {
    return 0;
  }

  return Math.max(1, Math.floor((due - lastReview) / DAY_MS));
}

function clampDifficulty(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return DEFAULT_DIFFICULTY;
  }
  return Math.min(Math.max(num, MIN_DIFFICULTY), MAX_DIFFICULTY);
}

function fingerprintValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NaN';
  }
  return value === undefined || value === null ? '' : String(value);
}
