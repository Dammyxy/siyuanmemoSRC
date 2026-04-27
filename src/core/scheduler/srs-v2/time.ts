import type { FSRSCard } from '@/types/card';
import type { SchedulerTimingOptions } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveReviewDate(options: SchedulerTimingOptions = {}): Date {
  if (options.reviewTime instanceof Date) {
    const timestamp = options.reviewTime.getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return new Date(timestamp);
    }
  }

  if (typeof options.reviewTime === 'number' && Number.isFinite(options.reviewTime) && options.reviewTime > 0) {
    return new Date(options.reviewTime);
  }

  return new Date();
}

export function resolveOptionalDate(value: Date | number | undefined): Date | null {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
  }

  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value);
  }

  return null;
}

export function buildMemoryAnchoredCard(
  card: FSRSCard,
  reviewDate: Date,
  options: SchedulerTimingOptions = {},
): FSRSCard {
  const memoryDate = resolveOptionalDate(options.memoryStateAsOf);
  if (!memoryDate) {
    return card;
  }

  const reviewTime = reviewDate.getTime();
  const memoryTime = memoryDate.getTime();
  if (memoryTime <= reviewTime) {
    return card;
  }

  const offset = memoryTime - reviewTime;
  const anchoredCard: FSRSCard = {
    ...card,
    due: shiftTimestamp(card.due, offset, reviewTime),
    lastReview: shiftTimestamp(card.lastReview, offset, 0),
  };

  const originalLastReview = Number(card.lastReview);
  if (Number.isFinite(originalLastReview) && originalLastReview > 0 && memoryTime > originalLastReview) {
    anchoredCard.elapsedDays = Math.max(0, Math.floor((memoryTime - originalLastReview) / DAY_MS));
  } else {
    const shiftedLastReview = Number(anchoredCard.lastReview);
    if (Number.isFinite(shiftedLastReview) && shiftedLastReview > 0) {
      anchoredCard.elapsedDays = Math.max(0, Math.floor((reviewTime - shiftedLastReview) / DAY_MS));
    }
  }

  return anchoredCard;
}

function shiftTimestamp(value: unknown, offset: number, fallback: number): number {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp - offset : fallback;
}
