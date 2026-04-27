import type { FSRSCard, Rating } from '@/types/card';
import type { SchedulerType } from '../schedulerPolicy';
import type {
  ReviewAttempt,
  ReviewCommitResult,
  SchedulingChoice,
  SchedulingChoices,
  SchedulingDecision,
  SrsV2AlgorithmFamily,
  SrsV2CommitPolicy,
  SrsV2QueueMode,
  SrsV2SchedulingContext,
} from './types';
import { buildMemoryAnchoredCard, resolveReviewDate } from './time';

export interface SrsV2SchedulerAdapter {
  preview(card: FSRSCard, now?: Date): Map<Rating, FSRSCard>;
  review(card: FSRSCard, rating: Rating, now?: Date): FSRSCard;
}

export interface SrsV2KernelDependencies {
  resolveSchedulerType(card: FSRSCard): SchedulerType;
  getScheduler(type: SchedulerType): SrsV2SchedulerAdapter | undefined;
  normalizeCard(card: FSRSCard, schedulerType: SchedulerType, options?: { now?: number | Date }): FSRSCard;
}

interface PreparedSchedulingInput {
  reviewDate: Date;
  reviewedAt: number;
  schedulerType: SchedulerType;
  algorithm: SrsV2AlgorithmFamily;
  queueMode: SrsV2QueueMode;
  commitPolicy: SrsV2CommitPolicy;
  scheduler: SrsV2SchedulerAdapter;
  current: FSRSCard;
}

export class SrsV2Kernel {
  constructor(private readonly deps: SrsV2KernelDependencies) {}

  preview(card: FSRSCard, context: SrsV2SchedulingContext = {}): SchedulingChoices {
    const input = this.prepare(card, context);
    return this.createChoices(card.id, input);
  }

  answer(card: FSRSCard, rating: Rating, context: SrsV2SchedulingContext = {}): SchedulingDecision {
    const input = this.prepare(card, context);
    const choices = this.createChoices(card.id, input);
    const reviewedCard = input.scheduler.review(input.current, rating, input.reviewDate);

    if (!reviewedCard) {
      throw new Error(`Scheduler ${input.schedulerType} returned undefined for card ${card.id}`);
    }

    const after = this.normalizeScheduledCard(reviewedCard, input.schedulerType, input.reviewedAt);
    const selected = this.createChoice({
      rating,
      card: after,
      schedulerType: input.schedulerType,
      algorithm: input.algorithm,
      generatedAt: input.reviewedAt,
    });

    return {
      attempt: this.createAttempt(card, rating, context, input),
      before: { ...card },
      current: input.current,
      after,
      selected,
      choices: choices.choices,
      schedulerType: input.schedulerType,
      algorithm: input.algorithm,
      queueMode: input.queueMode,
      commitPolicy: input.commitPolicy,
    };
  }

  commit(decision: SchedulingDecision): ReviewCommitResult {
    if (decision.commitPolicy === 'preview-only' || decision.commitPolicy === 'drill-only') {
      return {
        decision,
        updatedCard: null,
        committed: false,
        suppressedReason: decision.commitPolicy,
      };
    }

    return {
      decision,
      updatedCard: decision.after,
      committed: true,
    };
  }

  private prepare(card: FSRSCard, context: SrsV2SchedulingContext): PreparedSchedulingInput {
    const reviewDate = resolveReviewDate(context);
    const reviewedAt = reviewDate.getTime();
    const schedulerType = this.deps.resolveSchedulerType(card);
    const scheduler = this.deps.getScheduler(schedulerType);

    if (!scheduler) {
      throw new Error(`Scheduler not found: ${schedulerType}`);
    }

    const algorithm = resolveAlgorithmFamily(schedulerType);
    const queueMode = resolveQueueMode(context, schedulerType);
    const commitPolicy = resolveCommitPolicy(context, queueMode);
    const memoryAnchoredCard = buildMemoryAnchoredCard(card, reviewDate, context);
    const current = this.deps.normalizeCard(memoryAnchoredCard, schedulerType, { now: reviewedAt });

    return {
      reviewDate,
      reviewedAt,
      schedulerType,
      algorithm,
      queueMode,
      commitPolicy,
      scheduler,
      current,
    };
  }

  private createChoices(cardId: string, input: PreparedSchedulingInput): SchedulingChoices {
    const rawChoices = input.scheduler.preview(input.current, input.reviewDate);
    const choices = new Map<Rating, SchedulingChoice>();

    for (const [rating, choiceCard] of rawChoices.entries()) {
      choices.set(rating, this.createChoice({
        rating,
        card: this.normalizeScheduledCard(choiceCard, input.schedulerType, input.reviewedAt),
        schedulerType: input.schedulerType,
        algorithm: input.algorithm,
        generatedAt: input.reviewedAt,
      }));
    }

    return {
      cardId,
      current: input.current,
      choices,
      schedulerType: input.schedulerType,
      algorithm: input.algorithm,
      queueMode: input.queueMode,
      commitPolicy: input.commitPolicy,
      generatedAt: input.reviewedAt,
    };
  }

  private normalizeScheduledCard(card: FSRSCard, schedulerType: SchedulerType, now: number): FSRSCard {
    return this.deps.normalizeCard({
      ...card,
      schedulerType,
    }, schedulerType, { now });
  }

  private createChoice(input: {
    rating: Rating;
    card: FSRSCard;
    schedulerType: SchedulerType;
    algorithm: SrsV2AlgorithmFamily;
    generatedAt: number;
  }): SchedulingChoice {
    return {
      rating: input.rating,
      card: input.card,
      due: toFiniteNumber(input.card.due, input.generatedAt),
      scheduledDays: Math.max(0, toFiniteNumber(input.card.scheduledDays, 0)),
      state: input.card.state,
      schedulerType: input.schedulerType,
      algorithm: input.algorithm,
      generatedAt: input.generatedAt,
      intervalMs: Math.max(0, toFiniteNumber(input.card.due, input.generatedAt) - input.generatedAt),
      stability: Math.max(0, toFiniteNumber(input.card.stability, 0)),
      difficulty: toFiniteNumber(input.card.difficulty, 0),
    };
  }

  private createAttempt(
    card: FSRSCard,
    rating: Rating,
    context: SrsV2SchedulingContext,
    input: PreparedSchedulingInput,
  ): ReviewAttempt {
    const isFiltered = context.isFiltered === true
      || context.customStudy === true
      || input.queueMode === 'filtered-preview'
      || input.queueMode === 'filtered-rescheduling';

    return {
      id: createAttemptId(card.id, rating, input.reviewedAt, context.queueType, context.sessionId),
      cardId: card.id,
      rating,
      reviewedAt: input.reviewedAt,
      schedulerType: input.schedulerType,
      algorithm: input.algorithm,
      queueType: context.queueType,
      queueMode: input.queueMode,
      commitPolicy: input.commitPolicy,
      source: context.source,
      sessionId: context.sessionId,
      elapsedMs: context.elapsedMs,
      isDrill: context.isDrill === true || input.queueMode === 'drill',
      isFiltered,
      customStudy: context.customStudy === true,
    };
  }
}

export function resolveAlgorithmFamily(schedulerType: SchedulerType): SrsV2AlgorithmFamily {
  if (schedulerType === 'fsrs-v6') {
    return 'memory-fsrs';
  }

  if (schedulerType === 'a-factor-v2') {
    return 'rotation';
  }

  return 'legacy-advisory';
}

function resolveQueueMode(context: SrsV2SchedulingContext, schedulerType: SchedulerType): SrsV2QueueMode {
  if (context.queueMode) {
    return context.queueMode;
  }

  if (context.isDrill) {
    return 'drill';
  }

  if (context.isFiltered || context.customStudy) {
    return context.commitPolicy === 'write-schedule' ? 'filtered-rescheduling' : 'filtered-preview';
  }

  return schedulerType === 'a-factor-v2' ? 'rotation' : 'formal';
}

function resolveCommitPolicy(context: SrsV2SchedulingContext, queueMode: SrsV2QueueMode): SrsV2CommitPolicy {
  if (context.commitPolicy) {
    return context.commitPolicy;
  }

  if (queueMode === 'drill') {
    return 'drill-only';
  }

  if (queueMode === 'filtered-preview') {
    return 'preview-only';
  }

  return 'write-schedule';
}

function createAttemptId(
  cardId: string,
  rating: Rating,
  reviewedAt: number,
  queueType?: string,
  sessionId?: string,
): string {
  return [
    'srs-v2',
    sanitizeIdSegment(cardId),
    reviewedAt,
    rating,
    sanitizeIdSegment(queueType ?? 'unknown-queue'),
    sanitizeIdSegment(sessionId ?? 'default-session'),
  ].join(':');
}

function sanitizeIdSegment(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return sanitized.length > 0 ? sanitized : 'empty';
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
