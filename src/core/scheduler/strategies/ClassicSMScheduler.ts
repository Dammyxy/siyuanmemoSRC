import type { FSRSCard, FSRSParameters, Rating } from '@/types';
import { CardState } from '@/types/card';
import type { SchedulerEngineAdapter } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ClassicSMVariant = 'sm5' | 'sm8' | 'sm18' | 'sm20';

interface ClassicSMConfig {
  initialGood: number;
  hardFactor: number;
  goodFactor: number;
  easyFactor: number;
  lapseFactor: number;
  difficultyDrift: number;
  retentionShape: number;
}

const CONFIGS: Record<ClassicSMVariant, ClassicSMConfig> = {
  sm5: {
    initialGood: 2,
    hardFactor: 0.82,
    goodFactor: 1.95,
    easyFactor: 2.35,
    lapseFactor: 0.35,
    difficultyDrift: 0.18,
    retentionShape: 1.0,
  },
  sm8: {
    initialGood: 3,
    hardFactor: 0.86,
    goodFactor: 2.15,
    easyFactor: 2.75,
    lapseFactor: 0.42,
    difficultyDrift: 0.14,
    retentionShape: 0.94,
  },
  sm18: {
    initialGood: 4,
    hardFactor: 0.9,
    goodFactor: 2.35,
    easyFactor: 3.1,
    lapseFactor: 0.48,
    difficultyDrift: 0.1,
    retentionShape: 0.86,
  },
  sm20: {
    initialGood: 5,
    hardFactor: 0.92,
    goodFactor: 2.55,
    easyFactor: 3.45,
    lapseFactor: 0.55,
    difficultyDrift: 0.08,
    retentionShape: 0.8,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function safeDays(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class ClassicSMScheduler implements SchedulerEngineAdapter {
  private requestRetention: number;

  constructor(
    private readonly variant: ClassicSMVariant,
    params: FSRSParameters,
  ) {
    this.requestRetention = clamp(Number(params.requestRetention) || 0.9, 0.6, 0.98);
  }

  updateParams(params: FSRSParameters): void {
    this.requestRetention = clamp(Number(params.requestRetention) || 0.9, 0.6, 0.98);
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
    const config = CONFIGS[this.variant];
    const previousInterval = safeDays(card.scheduledDays, config.initialGood);
    const previousStability = safeDays(card.stability, previousInterval);
    const previousDifficulty = clamp(Number(card.difficulty) || 5, 1, 10);
    const elapsedDays = Math.max(0, Math.floor((now.getTime() - (Number(card.lastReview) || now.getTime())) / DAY_MS));
    const reps = Math.max(0, Math.floor(Number(card.reps) || 0));
    const lapses = Math.max(0, Math.floor(Number(card.lapses) || 0));

    let nextInterval = previousInterval;
    let nextStability = previousStability;
    let nextDifficulty = previousDifficulty;
    let nextLapses = lapses;

    if (rating === 1) {
      nextLapses += 1;
      nextDifficulty = clamp(previousDifficulty + 0.9, 1, 10);
      nextStability = Math.max(0.5, previousStability * config.lapseFactor);
      nextInterval = 1;
    } else {
      const ratingFactor = rating === 2 ? config.hardFactor : rating === 3 ? config.goodFactor : config.easyFactor;
      const difficultyPenalty = clamp(1.18 - previousDifficulty / 18, 0.58, 1.12);
      const retentionBoost = Math.pow(this.requestRetention / 0.9, -1.2);
      const earlyBoost = reps === 0 ? config.initialGood : previousInterval;
      nextStability = Math.max(0.5, previousStability * ratingFactor * difficultyPenalty * retentionBoost);
      nextInterval = Math.max(1, Math.round((reps === 0 ? earlyBoost : nextStability) * (rating === 2 ? 0.72 : 1)));
      nextDifficulty = clamp(previousDifficulty + (3 - rating) * config.difficultyDrift, 1, 10);
    }

    return {
      ...card,
      due: now.getTime() + nextInterval * DAY_MS,
      reps: rating === 1 ? reps : reps + 1,
      lapses: nextLapses,
      lastReview: now.getTime(),
      elapsedDays,
      scheduledDays: nextInterval,
      stability: nextStability,
      difficulty: nextDifficulty,
      state: rating === 1 ? CardState.Learning : CardState.Review,
      schedulerType: this.variant as FSRSCard['schedulerType'],
      updatedAt: now.getTime(),
      schedulerMeta: {
        ...(card.schedulerMeta || {}),
        [this.variant]: {
          version: 'classic-sm-family-v1',
          requestRetention: this.requestRetention,
          retentionShape: config.retentionShape,
        },
      },
    };
  }

  getRetrievability(card: FSRSCard, now: Date = new Date()): number {
    const config = CONFIGS[this.variant];
    const intervalDays = safeDays(card.scheduledDays, config.initialGood);
    const stabilityDays = safeDays(card.stability, intervalDays);
    const lastReview = Number(card.lastReview) > 0
      ? Number(card.lastReview)
      : now.getTime() - intervalDays * DAY_MS;
    const elapsedDays = Math.max(0, (now.getTime() - lastReview) / DAY_MS);
    const normalized = elapsedDays / Math.max(0.5, stabilityDays);
    return clamp(Math.exp(-Math.pow(normalized, config.retentionShape)), 0, 1);
  }
}
