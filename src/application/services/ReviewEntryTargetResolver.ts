import type { BackendNeuralRoamStartFromFocusRequest } from '../../../packages/contracts/src/backend-rpc';
import {
  QueueType,
  type ReviewTabTransferState,
} from '@/types/unified-data-source';

export type ReviewProjectionQueueType =
  | QueueType.RetrievalPractice
  | QueueType.IncrementalLearning;

export type ReviewManagedQueueType =
  | QueueType.FinalDrill
  | QueueType.FilterGroup
  | QueueType.Leech;

export type ReviewStaticSubsetQueueType =
  | QueueType.FilterGroup
  | QueueType.FinalDrill;

export interface ProjectionQueueEntryTarget {
  kind: 'projection-queue';
  queueType: ReviewProjectionQueueType;
  entrySurface: string;
  admission: {
    kind: 'required';
  };
}

export interface ManagedQueueEntryTarget {
  kind: 'managed-queue';
  queueType: ReviewManagedQueueType;
  entrySurface: string;
  admission: {
    kind: 'not-required';
  };
}

export interface StaticSubsetEntryTarget {
  kind: 'static-subset';
  queueType: ReviewStaticSubsetQueueType;
  entrySurface: string;
  scope: {
    blockIds: string[];
    cardIds: string[];
    preferredCardId: string | null;
  };
  admission: {
    kind: 'not-required';
  };
}

export interface NeuralRoamEntryTarget {
  kind: 'neural-roam';
  queueType: QueueType.NeuralRoam;
  entrySurface: string;
  launch: {
    startFromFocus: BackendNeuralRoamStartFromFocusRequest | null;
    semanticPinnedSessionId: string | null;
  };
  admission: {
    kind: 'not-required';
  };
}

export type ReviewEntryTarget =
  | ProjectionQueueEntryTarget
  | ManagedQueueEntryTarget
  | StaticSubsetEntryTarget
  | NeuralRoamEntryTarget;

export type ReviewEntryTargetInput =
  | {
    kind: 'projection-queue';
    queueType: ReviewProjectionQueueType;
    entrySurface: string;
  }
  | {
    kind: 'managed-queue';
    queueType: ReviewManagedQueueType;
    entrySurface: string;
  }
  | {
    kind: 'static-subset';
    queueType: ReviewStaticSubsetQueueType;
    entrySurface: string;
    blockIds: string[];
    cardIds?: string[] | null;
    preferredCardId?: string | null;
  }
  | {
    kind: 'neural-roam';
    entrySurface: string;
    startFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
    semanticPinnedSessionId?: string | null;
  };

export interface CompatibilityReviewEntryEvidence {
  queueType: QueueType | null | undefined;
  entrySurface?: string | null;
  transferState?: ReviewTabTransferState | null;
  neuralRoamStartFromFocus?: BackendNeuralRoamStartFromFocusRequest | null;
  initialSemanticPinnedSessionId?: string | null;
}

export interface ReviewEntryTargetError {
  kind: 'unavailable' | 'ambiguous';
  code:
    | 'REVIEW_ENTRY_TARGET_UNSUPPORTED'
    | 'REVIEW_ENTRY_TARGET_AMBIGUOUS'
    | 'REVIEW_ENTRY_TARGET_SURFACE_UNAVAILABLE'
    | 'REVIEW_ENTRY_TARGET_SCOPE_UNAVAILABLE';
  message: string;
}

export type ReviewEntryTargetResolution =
  | {
    status: 'resolved';
    target: ReviewEntryTarget;
  }
  | {
    status: 'unavailable' | 'ambiguous';
    error: ReviewEntryTargetError;
  };

export class ReviewEntryTargetResolver {
  resolveExisting(target: ReviewEntryTarget): ReviewEntryTargetResolution {
    switch (target.kind) {
      case 'projection-queue':
        return this.resolve({
          kind: 'projection-queue',
          queueType: target.queueType,
          entrySurface: target.entrySurface,
        });
      case 'managed-queue':
        return this.resolve({
          kind: 'managed-queue',
          queueType: target.queueType,
          entrySurface: target.entrySurface,
        });
      case 'static-subset':
        return this.resolve({
          kind: 'static-subset',
          queueType: target.queueType,
          entrySurface: target.entrySurface,
          blockIds: target.scope.blockIds,
          cardIds: target.scope.cardIds,
          preferredCardId: target.scope.preferredCardId,
        });
      case 'neural-roam':
        return this.resolve({
          kind: 'neural-roam',
          entrySurface: target.entrySurface,
          startFromFocus: target.launch.startFromFocus,
          semanticPinnedSessionId: target.launch.semanticPinnedSessionId,
        });
      default: {
        const unreachable: never = target;
        return unavailable(
          'REVIEW_ENTRY_TARGET_UNSUPPORTED',
          `Unsupported resolved Review Entry Target: ${String(unreachable)}`,
        );
      }
    }
  }

  resolve(input: ReviewEntryTargetInput): ReviewEntryTargetResolution {
    const entrySurface = normalizeOptionalString(input.entrySurface);
    if (!entrySurface) {
      return unavailable(
        'REVIEW_ENTRY_TARGET_SURFACE_UNAVAILABLE',
        'Review Entry Target requires a non-empty entry surface',
      );
    }

    switch (input.kind) {
      case 'projection-queue':
        return {
          status: 'resolved',
          target: {
            kind: 'projection-queue',
            queueType: input.queueType,
            entrySurface,
            admission: { kind: 'required' },
          },
        };
      case 'managed-queue':
        return {
          status: 'resolved',
          target: {
            kind: 'managed-queue',
            queueType: input.queueType,
            entrySurface,
            admission: { kind: 'not-required' },
          },
        };
      case 'static-subset': {
        const blockIds = normalizeStringList(input.blockIds);
        const cardIds = normalizeStringList(input.cardIds);
        if (blockIds.length === 0 && cardIds.length === 0) {
          return unavailable(
            'REVIEW_ENTRY_TARGET_SCOPE_UNAVAILABLE',
            'Static subset Review Entry Target requires block or exact-card evidence',
          );
        }
        const preferredCardId = normalizeOptionalString(input.preferredCardId);
        if (preferredCardId && cardIds.length > 0 && !cardIds.includes(preferredCardId)) {
          return ambiguous(
            'REVIEW_ENTRY_TARGET_AMBIGUOUS',
            'Static subset preferred card is outside the exact-card evidence',
          );
        }
        return {
          status: 'resolved',
          target: {
            kind: 'static-subset',
            queueType: input.queueType,
            entrySurface,
            scope: {
              blockIds,
              cardIds,
              preferredCardId,
            },
            admission: { kind: 'not-required' },
          },
        };
      }
      case 'neural-roam':
        return {
          status: 'resolved',
          target: {
            kind: 'neural-roam',
            queueType: QueueType.NeuralRoam,
            entrySurface,
            launch: {
              startFromFocus: cloneNeuralRoamStart(input.startFromFocus),
              semanticPinnedSessionId: normalizeOptionalString(input.semanticPinnedSessionId),
            },
            admission: { kind: 'not-required' },
          },
        };
      default: {
        const unreachable: never = input;
        return unavailable(
          'REVIEW_ENTRY_TARGET_UNSUPPORTED',
          `Unsupported Review Entry Target evidence: ${String(unreachable)}`,
        );
      }
    }
  }

  resolveCompatibility(input: CompatibilityReviewEntryEvidence): ReviewEntryTargetResolution {
    const entrySurface = normalizeOptionalString(input.entrySurface) ?? 'compatibility:review-entry';
    const staticSubset = input.transferState?.kind === 'static-subset-session'
      ? input.transferState
      : null;
    const hasNeuralEvidence = input.queueType === QueueType.NeuralRoam
      || Boolean(input.neuralRoamStartFromFocus)
      || Boolean(normalizeOptionalString(input.initialSemanticPinnedSessionId));

    if (staticSubset && hasNeuralEvidence) {
      return ambiguous(
        'REVIEW_ENTRY_TARGET_AMBIGUOUS',
        'Compatibility Review entry contains both static-subset and NeuralRoam evidence',
      );
    }

    if (staticSubset) {
      if (input.queueType && input.queueType !== staticSubset.queueType) {
        return ambiguous(
          'REVIEW_ENTRY_TARGET_AMBIGUOUS',
          'Compatibility Review entry queue conflicts with static-subset transfer evidence',
        );
      }
      return this.resolve({
        kind: 'static-subset',
        queueType: staticSubset.queueType,
        entrySurface,
        blockIds: staticSubset.blockIds,
        cardIds: staticSubset.cardIds,
        preferredCardId: staticSubset.preferredCardId,
      });
    }

    if (hasNeuralEvidence) {
      if (input.queueType && input.queueType !== QueueType.NeuralRoam) {
        return ambiguous(
          'REVIEW_ENTRY_TARGET_AMBIGUOUS',
          'Compatibility Review entry queue conflicts with NeuralRoam launch evidence',
        );
      }
      return this.resolve({
        kind: 'neural-roam',
        entrySurface,
        startFromFocus: input.neuralRoamStartFromFocus,
        semanticPinnedSessionId: input.initialSemanticPinnedSessionId,
      });
    }

    if (isReviewProjectionQueueType(input.queueType)) {
      return this.resolve({
        kind: 'projection-queue',
        queueType: input.queueType,
        entrySurface,
      });
    }

    if (isReviewManagedQueueType(input.queueType)) {
      return this.resolve({
        kind: 'managed-queue',
        queueType: input.queueType,
        entrySurface,
      });
    }

    return unavailable(
      'REVIEW_ENTRY_TARGET_UNSUPPORTED',
      `Compatibility Review entry has unsupported queue evidence: ${String(input.queueType ?? null)}`,
    );
  }
}

export function isReviewProjectionQueueType(
  queueType: QueueType | null | undefined,
): queueType is ReviewProjectionQueueType {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning;
}

export function isReviewManagedQueueType(
  queueType: QueueType | null | undefined,
): queueType is ReviewManagedQueueType {
  return queueType === QueueType.FinalDrill
    || queueType === QueueType.FilterGroup
    || queueType === QueueType.Leech;
}

export function requireResolvedReviewEntryTarget(
  resolution: ReviewEntryTargetResolution,
): ReviewEntryTarget {
  if (resolution.status === 'resolved') {
    return resolution.target;
  }
  throw new Error(`${resolution.error.code}: ${resolution.error.message}`);
}

export function buildReviewEntryTargetIdentity(target: ReviewEntryTarget): string {
  return `${target.kind}:${target.queueType}:${target.entrySurface}`;
}

function cloneNeuralRoamStart(
  value: BackendNeuralRoamStartFromFocusRequest | null | undefined,
): BackendNeuralRoamStartFromFocusRequest | null {
  if (!value) {
    return null;
  }
  return {
    ...value,
    blockId: normalizeOptionalString(value.blockId) ?? '',
    seedBlockId: normalizeOptionalString(value.seedBlockId),
    sourceReviewCardId: normalizeOptionalString(value.sourceReviewCardId),
    conceptBlockId: normalizeOptionalString(value.conceptBlockId),
    previousEngineMode: value.previousEngineMode ?? null,
    entrySessionKind: value.entrySessionKind ?? null,
  };
}

function normalizeStringList(values: readonly unknown[] | null | undefined): string[] {
  return Array.from(new Set((values ?? []).map(normalizeOptionalString).filter((value): value is string => Boolean(value))));
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function unavailable(
  code: Extract<ReviewEntryTargetError['code'], 'REVIEW_ENTRY_TARGET_UNSUPPORTED' | 'REVIEW_ENTRY_TARGET_SURFACE_UNAVAILABLE' | 'REVIEW_ENTRY_TARGET_SCOPE_UNAVAILABLE'>,
  message: string,
): ReviewEntryTargetResolution {
  return {
    status: 'unavailable',
    error: {
      kind: 'unavailable',
      code,
      message,
    },
  };
}

function ambiguous(
  code: Extract<ReviewEntryTargetError['code'], 'REVIEW_ENTRY_TARGET_AMBIGUOUS'>,
  message: string,
): ReviewEntryTargetResolution {
  return {
    status: 'ambiguous',
    error: {
      kind: 'ambiguous',
      code,
      message,
    },
  };
}
