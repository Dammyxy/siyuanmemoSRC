import type {
  BackendDomainSyncSanityStatus,
  BackendDomainSyncStatusResult,
} from '../../../packages/contracts/src/backend-rpc';

export type ReviewDomainSyncSafetyDecisionKind =
  | 'allow'
  | 'block-repairable'
  | 'block-needs-direction'
  | 'block-divergent'
  | 'block-source-error'
  | 'unavailable';

export interface ReviewDomainSyncSafetyDecision {
  kind: ReviewDomainSyncSafetyDecisionKind;
  canOpenReview: boolean;
  message: string;
  sanityStatus?: BackendDomainSyncSanityStatus;
  repairableDivergenceCount: number;
  skippedSourceCount: number;
  pendingImportCount: number;
  divergentCardCount: number;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  const text = String(error ?? '').trim();
  return text || 'Domain sync diagnostics unavailable';
}

function buildBlockedMessage(
  kind: Exclude<ReviewDomainSyncSafetyDecisionKind, 'allow' | 'unavailable'>,
  status: BackendDomainSyncStatusResult,
): string {
  const counts = `repairable=${status.sanity.repairableDivergenceCount}, divergent=${status.sanity.divergentCardCount}, skipped=${status.sanity.skippedSourceCount}`;
  switch (kind) {
    case 'block-repairable':
      return `Domain sync status is repairable (${counts}). Resolve sync repair before Review.`;
    case 'block-needs-direction':
      return `Domain sync status needs-direction (${counts}). Choose sync conflict direction before Review.`;
    case 'block-divergent':
      return `Domain sync status is divergent (${counts}). Resolve divergence before Review.`;
    case 'block-source-error':
      return `Domain sync status is source-error (${counts}). Resolve skipped sync sources before Review.`;
  }
}

export function buildReviewDomainSyncSafetyDecision(
  status: BackendDomainSyncStatusResult | null | undefined,
  error?: unknown,
): ReviewDomainSyncSafetyDecision {
  if (!status) {
    return {
      kind: 'unavailable',
      canOpenReview: false,
      message: `Domain sync diagnostics unavailable: ${toErrorMessage(error)}`,
      repairableDivergenceCount: 0,
      skippedSourceCount: 0,
      pendingImportCount: 0,
      divergentCardCount: 0,
    };
  }

  const repairableDivergenceCount = status.sanity.repairableDivergenceCount;
  const skippedSourceCount = status.sanity.skippedSourceCount;
  const pendingImportCount = status.sanity.pendingImportCount;
  const divergentCardCount = status.sanity.divergentCardCount;

  let kind: ReviewDomainSyncSafetyDecisionKind = 'allow';
  switch (status.sanity.status) {
    case 'clean':
      kind = 'allow';
      break;
    case 'merged':
      if (skippedSourceCount > 0 || pendingImportCount > 0) {
        kind = 'block-source-error';
      } else if (repairableDivergenceCount > 0) {
        kind = 'block-repairable';
      } else if (divergentCardCount > 0) {
        kind = 'block-divergent';
      } else {
        kind = 'allow';
      }
      break;
    case 'repairable':
      kind = 'block-repairable';
      break;
    case 'needs-direction':
      kind = 'block-needs-direction';
      break;
    case 'divergent':
      kind = 'block-divergent';
      break;
    case 'source-error':
      kind = 'block-source-error';
      break;
  }

  return {
    kind,
    canOpenReview: kind === 'allow',
    message: kind === 'allow'
      ? 'Domain sync state is safe for Review.'
      : buildBlockedMessage(kind, status),
    sanityStatus: status.sanity.status,
    repairableDivergenceCount,
    skippedSourceCount,
    pendingImportCount,
    divergentCardCount,
  };
}
