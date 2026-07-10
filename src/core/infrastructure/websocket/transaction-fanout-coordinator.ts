import {
  classifyTransactionBatch,
  type ClassifiedAutoCardCandidateOperation,
  type TransactionClassification,
} from './transaction-classifier';
import type { Transaction } from './transaction-types';

export type TransactionProvenanceSource = 'progressive-excerpt';

export type TransactionProvenanceReason =
  | 'progressive-excerpt-source-mark'
  | 'progressive-excerpt-artifact'
  | 'progressive-excerpt-topic-card';

export interface TransactionProvenanceSnapshotEntry {
  blockId?: string;
  expiresAt?: number;
  reason?: TransactionProvenanceReason | string;
  source?: TransactionProvenanceSource | string;
  suppressAutoCard?: boolean;
}

export interface TransactionProvenanceSnapshot {
  capturedAt?: number;
  entries?: TransactionProvenanceSnapshotEntry[];
}

export interface SuppressedAutoCardOperation extends ClassifiedAutoCardCandidateOperation {
  provenanceReason: string;
  provenanceSource: string;
}

export interface TransactionFanoutPlan {
  generatedAt: number;
  classification: TransactionClassification;
  autoCard: {
    hasMarkerEvidence: boolean;
    candidateOperations: ClassifiedAutoCardCandidateOperation[];
    suppressedOperations: SuppressedAutoCardOperation[];
    cancelBlockIds: string[];
    prefilteredNoOpCount: number;
    shouldDispatch: boolean;
    reasons: string[];
  };
  documentTree: {
    hasHint: boolean;
    touchedBlockIds: string[];
    shouldDispatch: boolean;
    reasons: string[];
  };
  kernelIngest: {
    shouldDispatch: boolean;
    reasons: string[];
  };
  reasons: string[];
}

export interface BuildTransactionFanoutPlanInput {
  transactions: Transaction[];
  provenance?: TransactionProvenanceSnapshot | TransactionProvenanceSnapshotEntry[] | null;
  now?: number;
}

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeTimestamp(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.floor(numberValue) : 0;
}

function provenanceEntries(
  provenance: TransactionProvenanceSnapshot | TransactionProvenanceSnapshotEntry[] | null | undefined,
): TransactionProvenanceSnapshotEntry[] {
  if (Array.isArray(provenance)) {
    return provenance;
  }
  if (!provenance || typeof provenance !== 'object') {
    return [];
  }
  return Array.isArray(provenance.entries) ? provenance.entries : [];
}

function buildActiveAutoCardSuppressionMap(
  provenance: TransactionProvenanceSnapshot | TransactionProvenanceSnapshotEntry[] | null | undefined,
  now: number,
): Map<string, { reason: string; source: string }> {
  const active = new Map<string, { reason: string; source: string }>();
  for (const entry of provenanceEntries(provenance)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const blockId = normalizeString(entry.blockId);
    const expiresAt = normalizeTimestamp(entry.expiresAt);
    if (!blockId || expiresAt <= now || entry.suppressAutoCard === false) {
      continue;
    }
    active.set(blockId, {
      reason: normalizeString(entry.reason) || 'provenance',
      source: normalizeString(entry.source) || 'unknown',
    });
  }
  return active;
}

function reasonsWhen(condition: boolean, reason: string): string[] {
  return condition ? [reason] : [];
}

export function buildTransactionFanoutPlan(input: BuildTransactionFanoutPlanInput): TransactionFanoutPlan {
  const now = normalizeTimestamp(input.now) || Date.now();
  const classification = classifyTransactionBatch(input.transactions);
  const suppressionByBlock = buildActiveAutoCardSuppressionMap(input.provenance, now);
  const candidateOperations: ClassifiedAutoCardCandidateOperation[] = [];
  const suppressedOperations: SuppressedAutoCardOperation[] = [];

  for (const operation of classification.autoCard.candidateOperations) {
    const provenance = suppressionByBlock.get(operation.blockId);
    if (!provenance) {
      candidateOperations.push(operation);
      continue;
    }
    suppressedOperations.push({
      ...operation,
      provenanceReason: provenance.reason,
      provenanceSource: provenance.source,
    });
  }

  const autoCardShouldDispatch = candidateOperations.length > 0
    || classification.autoCard.cancelBlockIds.length > 0;
  const documentTreeShouldDispatch = classification.documentTree.hasHint;
  const kernelIngestShouldDispatch = autoCardShouldDispatch
    || documentTreeShouldDispatch;

  const autoCardReasons = [
    ...reasonsWhen(candidateOperations.length > 0, 'auto-card-candidates'),
    ...reasonsWhen(classification.autoCard.cancelBlockIds.length > 0, 'auto-card-cancel'),
    ...reasonsWhen(suppressedOperations.length > 0, 'auto-card-provenance-suppressed'),
  ];
  const documentTreeReasons = reasonsWhen(documentTreeShouldDispatch, 'document-tree-hint');
  const kernelIngestReasons = [
    ...reasonsWhen(autoCardShouldDispatch, 'auto-card'),
    ...reasonsWhen(documentTreeShouldDispatch, 'document-tree'),
  ];

  return {
    generatedAt: now,
    classification,
    autoCard: {
      hasMarkerEvidence: classification.autoCard.hasMarkerEvidence,
      candidateOperations,
      suppressedOperations,
      cancelBlockIds: classification.autoCard.cancelBlockIds,
      prefilteredNoOpCount: classification.autoCard.prefilteredNoOpCount,
      shouldDispatch: autoCardShouldDispatch,
      reasons: autoCardReasons,
    },
    documentTree: {
      hasHint: classification.documentTree.hasHint,
      touchedBlockIds: classification.documentTree.touchedBlockIds,
      shouldDispatch: documentTreeShouldDispatch,
      reasons: documentTreeReasons,
    },
    kernelIngest: {
      shouldDispatch: kernelIngestShouldDispatch,
      reasons: kernelIngestReasons,
    },
    reasons: [...autoCardReasons, ...documentTreeReasons],
  };
}

export function shouldDispatchAutoCardFromFanoutPlan(plan: TransactionFanoutPlan): boolean {
  return plan.autoCard.shouldDispatch;
}

export function shouldDispatchDocTreeFromFanoutPlan(plan: TransactionFanoutPlan): boolean {
  return plan.documentTree.shouldDispatch;
}

export function shouldDispatchKernelTransactionIngestFromFanoutPlan(plan: TransactionFanoutPlan): boolean {
  return plan.kernelIngest.shouldDispatch;
}
