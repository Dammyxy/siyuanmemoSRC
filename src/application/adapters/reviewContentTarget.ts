import type { SchedulerStateSnapshot } from '@/core/scheduler/schedulerStateSnapshot';
import type {
  ProgressiveContentPayloadIdentity,
  ProgressiveDisclosureState,
  ProgressiveSourceAvailability,
  ProgressiveSourceLineage,
} from '@/core/progressive/progressiveSourceModel';
import type { FSRSCard } from '@/types/card';
import type { ReviewRenderableRenderPolicy } from './reviewRenderableRenderPolicy';

export type ReviewContentTargetKind =
  | 'standard-card'
  | 'topic-derived-item'
  | 'progressive-excerpt'
  | 'source-location';

export type ReviewContentTargetAction =
  | 'answer'
  | 'edit'
  | 'open-source'
  | 'advance'
  | 'defer'
  | 'convert'
  | 'skip'
  | 'back';

export interface ReviewContentTargetIdentity {
  itemId: string;
  cardId: string;
  blockId: string;
  deckId: string;
  contentBlockId: string;
  answerBlockId: string;
  sourceLocationId?: string;
}

export type ReviewContentAuthority =
  | {
    kind: 'siyuan-block';
    sourceId: string;
  }
  | {
    kind: 'xiuyuan-aggregate';
    sourceId: string;
  };

export type ReviewContentClassification =
  | {
    kind: 'scheduled-card';
    formalSchedulerMutation: true;
    schedulerSnapshot: SchedulerStateSnapshot;
  }
  | {
    kind: 'progressive-processing';
    formalSchedulerMutation: false;
    disclosureState: ProgressiveDisclosureState;
  }
  | {
    kind: 'source-processing';
    formalSchedulerMutation: false;
    disclosureState: ProgressiveDisclosureState;
  };

export interface ReviewContentVersionEvidence {
  cardUpdatedAt: string;
  sourcePayloadHash?: string;
  expectedSourceHash?: string;
  currentSourceHash?: string;
  sourceStatus?: ProgressiveSourceAvailability['status'];
}

export interface ReviewContentRenderIntent {
  contentBlockId: string;
  answerBlockId: string;
  cardType: FSRSCard['type'];
  policy: ReviewRenderableRenderPolicy;
}

interface ReviewContentTargetBase {
  readonly version: 1;
  readonly kind: ReviewContentTargetKind;
  readonly identity: ReviewContentTargetIdentity;
  readonly contentAuthority: ReviewContentAuthority;
  readonly classification: ReviewContentClassification;
  readonly renderIntent: ReviewContentRenderIntent;
  readonly supportedActions: readonly ReviewContentTargetAction[];
  readonly sourceLineage: ProgressiveSourceLineage | null;
  readonly sourcePayloadIdentity: ProgressiveContentPayloadIdentity | null;
  readonly versionEvidence: ReviewContentVersionEvidence;
  readonly diagnostics: readonly string[];
}

export interface StandardCardReviewContentTarget extends ReviewContentTargetBase {
  readonly kind: 'standard-card';
  readonly classification: Extract<ReviewContentClassification, { kind: 'scheduled-card' }>;
  readonly sourceLineage: null;
  readonly sourcePayloadIdentity: null;
}

export interface TopicDerivedReviewContentTarget extends ReviewContentTargetBase {
  readonly kind: 'topic-derived-item';
  readonly classification: Extract<ReviewContentClassification, { kind: 'progressive-processing' }>;
}

export interface ProgressiveExcerptReviewContentTarget extends ReviewContentTargetBase {
  readonly kind: 'progressive-excerpt';
  readonly classification: Extract<ReviewContentClassification, { kind: 'progressive-processing' }>;
  readonly sourceLineage: ProgressiveSourceLineage;
}

export interface SourceLocationReviewContentTarget extends ReviewContentTargetBase {
  readonly kind: 'source-location';
  readonly classification: Extract<ReviewContentClassification, { kind: 'source-processing' }>;
  readonly sourceLineage: ProgressiveSourceLineage;
}

export type ReviewContentTarget =
  | StandardCardReviewContentTarget
  | TopicDerivedReviewContentTarget
  | ProgressiveExcerptReviewContentTarget
  | SourceLocationReviewContentTarget;

export type ReviewContentTargetUnavailableCode =
  | 'empty-target'
  | 'insufficient-evidence'
  | 'conflicting-evidence'
  | 'source-missing'
  | 'source-detached'
  | 'unsupported-renderer';

export interface ReviewContentTargetUnavailable {
  readonly code: ReviewContentTargetUnavailableCode;
  readonly targetKind: ReviewContentTargetKind | null;
  readonly identity: ReviewContentTargetIdentity | null;
  readonly diagnostics: readonly string[];
}

export type ReviewContentTargetResolution =
  | {
    readonly status: 'ready';
    readonly target: ReviewContentTarget;
  }
  | {
    readonly status: 'unavailable';
    readonly error: ReviewContentTargetUnavailable;
  };

export function unavailableReviewContentTarget(
  code: ReviewContentTargetUnavailableCode,
  diagnostics: readonly string[],
  targetKind: ReviewContentTargetKind | null = null,
  identity: ReviewContentTargetIdentity | null = null,
): ReviewContentTargetResolution {
  return {
    status: 'unavailable',
    error: {
      code,
      targetKind,
      identity,
      diagnostics: [...diagnostics],
    },
  };
}
