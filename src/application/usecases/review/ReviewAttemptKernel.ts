import type {
  QueueReviewCommand,
  QueueReviewCommitResult,
} from '@/core/queue/managers/UnifiedDataSourceManager';
import { QueueType } from '@/types/unified-data-source';
import type {
  BackendReviewFeedbackQueueImpact,
  BackendReviewFeedbackQueueImpactEntry,
} from '../../../../packages/contracts/src/backend-rpc';

export type ReviewAttemptProjectionActionStatus =
  | 'patch-applied'
  | 'refresh-required'
  | 'deferred'
  | 'generation-mismatch'
  | 'not-applicable'
  | 'unavailable';

export interface ReviewAttemptProjectionAction {
  status: ReviewAttemptProjectionActionStatus;
  queueType: string | null;
  generation: number | null;
  policyHash: string | null;
  reason: string | null;
}

export interface ReviewAttemptDiagnostics {
  cardId: string;
  queueType: string | null;
  queueMode: string | null;
  commitPolicy: string | null;
  sessionId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export interface ReviewAttemptOutcome extends QueueReviewCommitResult {
  projectionAction: ReviewAttemptProjectionAction;
  projectionImpactEntry: BackendReviewFeedbackQueueImpactEntry | null;
  diagnostics: ReviewAttemptDiagnostics;
}

export interface ReviewAttemptCommitter {
  execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult>;
}

export interface ReviewAttemptKernelDependencies {
  reviewCommitter: ReviewAttemptCommitter;
}

export class ReviewAttemptKernel {
  constructor(private readonly deps: ReviewAttemptKernelDependencies) {}

  async execute(command: QueueReviewCommand): Promise<ReviewAttemptOutcome> {
    const result = await this.deps.reviewCommitter.execute(command);
    const queueType = normalizeQueueType(command.context?.queueType);
    const projection = normalizeReviewAttemptProjectionAction(queueType, result.queueImpact);

    return {
      ...result,
      projectionAction: projection.action,
      projectionImpactEntry: projection.entry,
      diagnostics: createDiagnostics(command),
    };
  }
}

export function normalizeReviewAttemptProjectionAction(
  queueType: string | null,
  queueImpact: unknown,
): {
  action: ReviewAttemptProjectionAction;
  entry: BackendReviewFeedbackQueueImpactEntry | null;
} {
  const empty = createProjectionAction('not-applicable', queueType, null);
  if (!queueType || !isQueueImpact(queueImpact)) {
    return { action: empty, entry: null };
  }

  const entry = queueImpact.affectedQueues.find((candidate) => (
    String(candidate.queueType || '') === queueType
  )) ?? null;
  if (!entry) {
    return { action: empty, entry: null };
  }

  if (entry.reason === 'generation-mismatch') {
    return {
      action: createProjectionAction('generation-mismatch', queueType, entry),
      entry,
    };
  }

  const explicitOutcome = normalizeString((entry as { outcome?: unknown }).outcome);
  if (explicitOutcome === 'unavailable') {
    return {
      action: createProjectionAction('unavailable', queueType, entry),
      entry,
    };
  }
  if (explicitOutcome === 'deferred') {
    return {
      action: createProjectionAction(
        isDeferredReviewAttemptQueueSafe(queueType) ? 'deferred' : 'refresh-required',
        queueType,
        entry,
      ),
      entry,
    };
  }
  if (explicitOutcome === 'refresh-required') {
    return {
      action: createProjectionAction('refresh-required', queueType, entry),
      entry,
    };
  }
  if (explicitOutcome === 'patch-applied') {
    return {
      action: createProjectionAction('patch-applied', queueType, entry),
      entry,
    };
  }

  if (entry.refreshRequired === true || entry.hotPatchable !== true) {
    return {
      action: createProjectionAction('refresh-required', queueType, entry),
      entry,
    };
  }

  return {
    action: createProjectionAction('patch-applied', queueType, entry),
    entry,
  };
}

function createDiagnostics(command: QueueReviewCommand): ReviewAttemptDiagnostics {
  return {
    cardId: command.cardId,
    queueType: normalizeQueueType(command.context?.queueType),
    queueMode: normalizeString(command.context?.queueMode),
    commitPolicy: normalizeString(command.context?.commitPolicy),
    sessionId: normalizeString(command.context?.sessionId),
    projectionGeneration: normalizeNumber(command.context?.projectionGeneration),
    projectionPolicyHash: normalizeString(command.context?.projectionPolicyHash),
  };
}

function createProjectionAction(
  status: ReviewAttemptProjectionActionStatus,
  queueType: string | null,
  entry: BackendReviewFeedbackQueueImpactEntry | null,
): ReviewAttemptProjectionAction {
  return {
    status,
    queueType,
    generation: normalizeNumber(entry?.generation),
    policyHash: normalizeString(entry?.policyHash),
    reason: normalizeString(entry?.reason),
  };
}

function normalizeQueueType(value: unknown): string | null {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }
  return Object.values(QueueType).includes(normalized as QueueType)
    ? normalized
    : normalized;
}

function normalizeString(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function isDeferredReviewAttemptQueueSafe(queueType: string | null): boolean {
  return queueType === QueueType.FilterGroup
    || queueType === QueueType.FinalDrill
    || queueType === QueueType.Leech;
}

function isQueueImpact(value: unknown): value is BackendReviewFeedbackQueueImpact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Partial<BackendReviewFeedbackQueueImpact>;
  return Array.isArray(candidate.affectedQueues);
}
