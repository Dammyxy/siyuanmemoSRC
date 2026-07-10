import type {
  QueueReviewCommand,
  QueueReviewCommitResult,
} from '@/core/queue/managers/UnifiedDataSourceManager';
import type { BackendReviewFeedbackQueueImpactEntry } from '../../../../packages/contracts/src/backend-rpc';
import type { ReviewProjectionReceipt } from './ReviewProjectionReceipt';

export interface ReviewAttemptDiagnostics {
  cardId: string;
  queueType: string | null;
  queueMode: string | null;
  commitPolicy: string | null;
  sessionId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export interface ReviewAttemptOutcome extends QueueReviewCommitResult, ReviewProjectionReceipt {
  diagnostics: ReviewAttemptDiagnostics;
}

export interface ReviewAttemptCommitter {
  execute(command: QueueReviewCommand): Promise<QueueReviewCommitResult & ReviewProjectionReceipt>;
}

export interface ReviewAttemptKernelDependencies {
  reviewCommitter: ReviewAttemptCommitter;
}

export class ReviewAttemptKernel {
  constructor(private readonly deps: ReviewAttemptKernelDependencies) {}

  async execute(command: QueueReviewCommand): Promise<ReviewAttemptOutcome> {
    const result = await this.deps.reviewCommitter.execute(command);

    return {
      ...result,
      diagnostics: createDiagnostics(command),
    };
  }
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

function normalizeQueueType(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized;
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
