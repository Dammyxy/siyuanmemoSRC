import type { FSRSCard } from '@/types/card';
import type { QueueCounterSnapshot } from '@/types/unified-data-source';
import {
  ReviewSessionProjectionApplier,
  type ProjectionPatchOutcome,
  type QueueReviewResultWithProjection,
  type ReviewSessionProjectionState,
} from '../ReviewSessionProjectionApplier';

export type ReviewSessionProjectionAdvanceOutcome = ProjectionPatchOutcome;

export interface ReviewSessionProjectionAdvanceInput {
  reviewedCard: FSRSCard;
  result: QueueReviewResultWithProjection;
  forceRemove?: boolean;
  state: ReviewSessionProjectionState;
}

export interface ReviewSessionProjectionAdvanceResult {
  outcome: ReviewSessionProjectionAdvanceOutcome;
  state: ReviewSessionProjectionState;
}

export interface ReviewSessionProjectionAdvancePolicyDependencies {
  shouldReadLocally: () => boolean;
  hydrateCardsBySnapshotIds: (rowIds: string[]) => Promise<FSRSCard[]>;
}

export class ReviewSessionProjectionAdvancePolicy {
  private readonly applier: ReviewSessionProjectionApplier;

  constructor(deps: ReviewSessionProjectionAdvancePolicyDependencies) {
    this.applier = new ReviewSessionProjectionApplier(deps);
  }

  async advance(input: ReviewSessionProjectionAdvanceInput): Promise<ReviewSessionProjectionAdvanceResult> {
    return this.applier.apply(input);
  }
}

export function createEmptyProjectionState(): ReviewSessionProjectionState {
  return {
    cacheValid: false,
    cachedCards: [],
    currentIndex: 0,
    forwardBuffer: [],
    lastCounterSnapshot: null as QueueCounterSnapshot | null,
  };
}
