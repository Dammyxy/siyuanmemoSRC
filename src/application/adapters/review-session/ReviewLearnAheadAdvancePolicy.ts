import type { FSRSCard } from '@/types/card';

export interface ReviewLearnAheadStartDependencies {
  getNormalRemaining: () => Promise<number>;
  getLearnAheadCards: () => Promise<FSRSCard[]>;
}

export interface ReviewLearnAheadStartResult {
  started: boolean;
  cards: FSRSCard[];
}

export interface ReviewLearnAheadFeedbackState {
  currentIndex: number;
  cachedCardsLength: number;
}

export class ReviewLearnAheadAdvancePolicy {
  async startAfterNormalExhaustion(deps: ReviewLearnAheadStartDependencies): Promise<ReviewLearnAheadStartResult> {
    const normalRemaining = await deps.getNormalRemaining();
    if (normalRemaining > 0) {
      return { started: false, cards: [] };
    }

    const cards = await deps.getLearnAheadCards();
    if (cards.length === 0) {
      return { started: false, cards: [] };
    }

    return { started: true, cards };
  }

  shouldExitAfterFeedback(state: ReviewLearnAheadFeedbackState): boolean {
    return state.currentIndex >= state.cachedCardsLength;
  }

  shouldSupersedeWithNormalQueue(normalRemaining: number): boolean {
    return normalRemaining > 0;
  }
}
