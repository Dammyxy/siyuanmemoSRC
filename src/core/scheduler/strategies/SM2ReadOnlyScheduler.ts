import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import { CardState } from '@/types/card';
import type { SchedulerEngineAdapter } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeEaseFactor(card: FSRSCard): number {
  const fromMeta = Number((card.meta as Record<string, unknown> | undefined)?.sm2EaseFactor);
  if (Number.isFinite(fromMeta) && fromMeta >= 1.3 && fromMeta <= 2.8) {
    return fromMeta;
  }
  const difficulty = clamp(Number(card.difficulty) || 5, 1, 10);
  return clamp(2.7 - ((difficulty - 1) / 9) * 1.2, 1.3, 2.8);
}

function toQuality(rating: Rating): number {
  switch (rating) {
    case 1:
      return 1;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
    default:
      return 5;
  }
}

export class SM2ReadOnlyScheduler implements SchedulerEngineAdapter {
  constructor(private params: FSRSParameters) {}

  updateParams(params: FSRSParameters): void {
    this.params = params;
  }

  preview(card: FSRSCard, now: Date = new Date()): Map<Rating, FSRSCard> {
    return new Map<Rating, FSRSCard>([
      [1, this.review(card, 1, now)],
      [2, this.review(card, 2, now)],
      [3, this.review(card, 3, now)],
      [4, this.review(card, 4, now)],
    ]);
  }

  review(card: FSRSCard, rating: Rating, now: Date = new Date()): FSRSCard {
    const quality = toQuality(rating);
    const previousEaseFactor = normalizeEaseFactor(card);
    const previousInterval = Math.max(1, Math.round(Number(card.scheduledDays) || 1));
    let reps = Math.max(0, Math.floor(Number(card.reps) || 0));
    let lapses = Math.max(0, Math.floor(Number(card.lapses) || 0));
    let easeFactor = previousEaseFactor;
    let intervalDays = previousInterval;

    if (quality < 3) {
      reps = 0;
      lapses += 1;
      intervalDays = 1;
    } else {
      if (reps <= 0) {
        intervalDays = 1;
      } else if (reps === 1) {
        intervalDays = 6;
      } else {
        intervalDays = Math.max(1, Math.round(previousInterval * easeFactor));
      }
      reps += 1;
      easeFactor = clamp(
        easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
        1.3,
        2.8,
      );
      if (rating === 4) {
        intervalDays = Math.max(intervalDays, Math.round(intervalDays * 1.15));
      }
      if (rating === 2) {
        intervalDays = Math.max(1, Math.round(intervalDays * 0.75));
      }
    }

    const due = now.getTime() + intervalDays * DAY_MS;
    const elapsedDays = Math.max(0, Math.floor((now.getTime() - (Number(card.lastReview) || now.getTime())) / DAY_MS));
    const difficulty = clamp(11 - easeFactor * 3.2, 1, 10);
    const stability = intervalDays * Math.max(0.6, this.params.requestRetention || 0.9);

    return {
      ...card,
      due,
      reps,
      lapses,
      lastReview: now.getTime(),
      elapsedDays,
      scheduledDays: intervalDays,
      stability,
      difficulty,
      state: reps > 0 ? CardState.Review : CardState.Learning,
      schedulerType: 'sm2',
      meta: {
        ...(card.meta || {}),
        sm2EaseFactor: easeFactor,
      },
      updatedAt: now.getTime(),
    };
  }

  getRetrievability(card: FSRSCard, now: Date = new Date()): number {
    const intervalDays = Math.max(1, Number(card.scheduledDays) || 1);
    const lastReview = Number(card.lastReview) > 0 ? Number(card.lastReview) : now.getTime() - intervalDays * DAY_MS;
    const elapsedDays = Math.max(0, (now.getTime() - lastReview) / DAY_MS);
    return clamp(Math.pow(0.5, elapsedDays / intervalDays), 0, 1);
  }
}
