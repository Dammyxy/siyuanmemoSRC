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
  unrepairableDivergenceCount: number;
  divergentLedgerCount: number;
  skippedSourceCount: number;
  pendingImportCount: number;
  divergentCardCount: number;
}

export interface ReviewDomainSyncSafetyDecisionOptions {
  currentCardId?: string | null;
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

function toNonNegativeCount(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

function hasBlockingRepairableDivergence(
  status: BackendDomainSyncStatusResult,
  currentCardId?: string | null,
): boolean {
  const repairableDivergenceCount = toNonNegativeCount(status.sanity.repairableDivergenceCount);
  if (repairableDivergenceCount <= 0) {
    return false;
  }

  const reasonCounts = status.sanity.reasonCounts ?? {};
  const historyNewerCount = toNonNegativeCount(reasonCounts['review-history-newer-than-card-state']);
  const countDriftCount = toNonNegativeCount(reasonCounts['review-event-count-exceeds-card-reps']);
  const hasKnownRepairableReasons = historyNewerCount + countDriftCount > 0;

  if (!hasKnownRepairableReasons) {
    return true;
  }

  if (!currentCardId) {
    return historyNewerCount > 0;
  }

  const affectedCardIds = Array.isArray(status.sanity.affectedCardIds)
    ? status.sanity.affectedCardIds.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (status.sanity.truncated === true) {
    return historyNewerCount > 0;
  }
  if (!affectedCardIds.includes(currentCardId)) {
    return false;
  }

  return historyNewerCount > 0;
}

export function buildReviewDomainSyncSafetyDecision(
  status: BackendDomainSyncStatusResult | null | undefined,
  error?: unknown,
  options: ReviewDomainSyncSafetyDecisionOptions = {},
): ReviewDomainSyncSafetyDecision {
  if (!status) {
    return {
      kind: 'unavailable',
      canOpenReview: false,
      message: `Domain sync diagnostics unavailable: ${toErrorMessage(error)}`,
      repairableDivergenceCount: 0,
      unrepairableDivergenceCount: 0,
      divergentLedgerCount: 0,
      skippedSourceCount: 0,
      pendingImportCount: 0,
      divergentCardCount: 0,
    };
  }

  const repairableDivergenceCount = status.sanity.repairableDivergenceCount;
  const unrepairableDivergenceCount = status.sanity.unrepairableDivergenceCount ?? 0;
  const divergentLedgerCount = status.sanity.divergentLedgerCount ?? 0;
  const skippedSourceCount = status.sanity.skippedSourceCount;
  const pendingImportCount = status.sanity.pendingImportCount;
  const divergentCardCount = status.sanity.divergentCardCount;
  const blockingRepairableDivergence = hasBlockingRepairableDivergence(status, options.currentCardId);

  let kind: ReviewDomainSyncSafetyDecisionKind = 'allow';
  switch (status.sanity.status) {
    case 'clean':
      kind = 'allow';
      break;
    case 'merged':
      if (skippedSourceCount > 0 || pendingImportCount > 0) {
        kind = 'block-source-error';
      } else if (blockingRepairableDivergence) {
        kind = 'block-repairable';
      } else if (divergentLedgerCount > 0) {
        kind = 'block-divergent';
      } else {
        kind = 'allow';
      }
      break;
    case 'repairable':
      kind = blockingRepairableDivergence ? 'block-repairable' : 'allow';
      break;
    case 'needs-direction':
      kind = 'block-needs-direction';
      break;
    case 'divergent':
      if (blockingRepairableDivergence) {
        kind = 'block-repairable';
      } else if (divergentLedgerCount > 0) {
        kind = 'block-divergent';
      } else {
        kind = 'allow';
      }
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
    unrepairableDivergenceCount,
    divergentLedgerCount,
    skippedSourceCount,
    pendingImportCount,
    divergentCardCount,
  };
}
