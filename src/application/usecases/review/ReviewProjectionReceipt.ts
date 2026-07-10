import type { QueueReviewProjectionAction } from '@/core/queue/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackQueueImpactEntry,
} from '../../../../packages/contracts/src/backend-rpc';

export interface ReviewProjectionReceipt {
  projectionAction: QueueReviewProjectionAction;
  projectionImpactEntry: BackendReviewFeedbackQueueImpactEntry | null;
}

export function mapReviewProjectionReceipt(
  queueType: string | null,
  queueImpact: BackendReviewFeedbackQueueImpact | null | undefined,
): ReviewProjectionReceipt {
  const empty = createProjectionAction('not-applicable', queueType, null);
  if (!queueType || !queueImpact) {
    return { projectionAction: empty, projectionImpactEntry: null };
  }

  const entry = queueImpact.affectedQueues.find((candidate) => (
    String(candidate.queueType || '') === queueType
  )) ?? null;
  if (!entry) {
    return { projectionAction: empty, projectionImpactEntry: null };
  }

  if (entry.reason === 'generation-mismatch') {
    return receipt('generation-mismatch', queueType, entry);
  }

  const outcome = normalizeString(entry.outcome);
  if (outcome === 'unavailable') {
    return receipt('unavailable', queueType, entry);
  }
  if (outcome === 'deferred') {
    return receipt(isDeferredQueueSafe(queueType) ? 'deferred' : 'refresh-required', queueType, entry);
  }
  if (outcome === 'refresh-required') {
    return receipt('refresh-required', queueType, entry);
  }
  if (outcome === 'patch-applied') {
    return receipt('patch-applied', queueType, entry);
  }
  if (entry.refreshRequired === true || entry.hotPatchable !== true) {
    return receipt('refresh-required', queueType, entry);
  }
  return receipt('patch-applied', queueType, entry);
}

function receipt(
  status: QueueReviewProjectionAction['status'],
  queueType: string,
  entry: BackendReviewFeedbackQueueImpactEntry,
): ReviewProjectionReceipt {
  return {
    projectionAction: createProjectionAction(status, queueType, entry),
    projectionImpactEntry: entry,
  };
}

function createProjectionAction(
  status: QueueReviewProjectionAction['status'],
  queueType: string | null,
  entry: BackendReviewFeedbackQueueImpactEntry | null,
): QueueReviewProjectionAction {
  return {
    status,
    queueType,
    generation: normalizeNumber(entry?.generation),
    policyHash: normalizeString(entry?.policyHash),
    reason: normalizeString(entry?.reason),
  };
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isDeferredQueueSafe(queueType: string): boolean {
  return queueType === QueueType.FilterGroup
    || queueType === QueueType.FinalDrill
    || queueType === QueueType.Leech;
}
