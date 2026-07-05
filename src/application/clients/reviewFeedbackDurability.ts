import type { BackendReviewFeedbackResult } from '../../../packages/contracts/src/backend-rpc';

type ReviewFeedbackDurabilityInput = Pick<
  BackendReviewFeedbackResult,
  'committed' | 'duplicate' | 'queueImpact' | 'storage'
>;

export type ReviewFeedbackOutcomeClassification =
  | 'committed'
  | 'duplicate-committed'
  | 'retryable-pending'
  | 'unavailable'
  | 'conflict'
  | 'repair-required';

export interface ReviewFeedbackOutcomeState {
  outcome: ReviewFeedbackOutcomeClassification;
  committed: boolean;
  retryable: boolean;
  reason: string | null;
}

export function classifyReviewFeedbackOutcome(
  result: ReviewFeedbackDurabilityInput,
  options: { requireQueueImpact?: boolean } = {},
): ReviewFeedbackOutcomeState {
  if (result.committed !== true) {
    return {
      outcome: 'retryable-pending',
      committed: false,
      retryable: true,
      reason: 'backend did not report committed rating',
    };
  }

  const storage = result.storage;
  if (!isRecord(storage)) {
    return unavailableOutcome('missing durable storage status');
  }

  const localIntent = storage.localIntent;
  if (!isRecord(localIntent)
    || localIntent.status !== 'recorded'
    || localIntent.durable !== true) {
    return unavailableOutcome('minimum durable local intent is not recorded');
  }

  if (!isRecord(storage.truthFlush)) {
    return unavailableOutcome('missing Review truth v2 status');
  }

  if (!isRecord(storage.sqlProjection)) {
    return unavailableOutcome('missing SQL projection impact');
  }

  const sqlCheckpoint = storage.sqlCheckpoint;
  if (!isRecord(sqlCheckpoint)) {
    return unavailableOutcome('SQL delta/checkpoint durability failed');
  }
  if (sqlCheckpoint.status === 'failed') {
    const error = typeof sqlCheckpoint.error === 'string' ? sqlCheckpoint.error : '';
    return {
      outcome: error.includes('REPAIR_REQUIRED') ? 'repair-required' : 'unavailable',
      committed: false,
      retryable: false,
      reason: 'SQL delta/checkpoint durability failed',
    };
  }
  if (sqlCheckpoint.status === 'unknown') {
    return unavailableOutcome('SQL delta/checkpoint durability failed');
  }

  if (options.requireQueueImpact === true && !isRecord(result.queueImpact)) {
    return unavailableOutcome('missing queue impact result');
  }

  return {
    outcome: result.duplicate === true ? 'duplicate-committed' : 'committed',
    committed: true,
    retryable: false,
    reason: null,
  };
}

export function assertCommittedReviewFeedbackDurability(
  result: ReviewFeedbackDurabilityInput,
  options: { source: string; requireQueueImpact?: boolean },
): void {
  const outcome = classifyReviewFeedbackOutcome(result, options);
  if (result.committed === true && outcome.committed !== true) {
    throwDurabilityUnavailable(options.source, outcome.reason ?? outcome.outcome);
  }
}

function unavailableOutcome(reason: string): ReviewFeedbackOutcomeState {
  return {
    outcome: 'unavailable',
    committed: false,
    retryable: true,
    reason,
  };
}

function throwDurabilityUnavailable(source: string, reason: string): never {
  throw new Error(`BACKEND_UNAVAILABLE: review.feedback committed result failed durability gate (${source}: ${reason})`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
