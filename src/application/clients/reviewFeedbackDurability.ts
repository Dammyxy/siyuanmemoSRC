import type { BackendReviewFeedbackResult } from '../../../packages/contracts/src/backend-rpc';

type ReviewFeedbackDurabilityInput = Pick<
  BackendReviewFeedbackResult,
  'committed' | 'queueImpact' | 'storage'
>;

export function assertCommittedReviewFeedbackDurability(
  result: ReviewFeedbackDurabilityInput,
  options: { source: string; requireQueueImpact?: boolean },
): void {
  if (result.committed !== true) {
    return;
  }

  const storage = result.storage;
  if (!isRecord(storage)) {
    throwDurabilityUnavailable(options.source, 'missing durable storage status');
  }

  const localIntent = storage.localIntent;
  if (!isRecord(localIntent)
    || localIntent.status !== 'recorded'
    || localIntent.durable !== true
    || localIntent.journalStatus !== 'projection-applied') {
    throwDurabilityUnavailable(options.source, 'local journal is not projection-applied');
  }

  if (!isRecord(storage.truthFlush)) {
    throwDurabilityUnavailable(options.source, 'missing Review truth v2 status');
  }

  if (!isRecord(storage.sqlProjection)) {
    throwDurabilityUnavailable(options.source, 'missing SQL projection impact');
  }

  const sqlCheckpoint = storage.sqlCheckpoint;
  if (!isRecord(sqlCheckpoint)
    || sqlCheckpoint.status === 'failed'
    || sqlCheckpoint.status === 'unknown') {
    throwDurabilityUnavailable(options.source, 'SQL delta/checkpoint durability failed');
  }

  if (options.requireQueueImpact === true && !isRecord(result.queueImpact)) {
    throwDurabilityUnavailable(options.source, 'missing queue impact result');
  }
}

function throwDurabilityUnavailable(source: string, reason: string): never {
  throw new Error(`BACKEND_UNAVAILABLE: review.feedback committed result failed durability gate (${source}: ${reason})`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
