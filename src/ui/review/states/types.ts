import type { ComputedRef, Ref } from 'vue';
import type { FsrsReviewMode } from '@/core/events';

export interface ReviewSessionSnapshot {
  mode: FsrsReviewMode;
  action: 'rate' | 'skip';
  timestamp: number;
  cards: any[];
  currentIndex: number;
  unreviewedNewCardCount: number;
  unreviewedOldCardCount: number;
  drillAnsweredCount: number;
  drillCorrectCount: number;
  drillDurationMs: number;
  breadcrumbContextId: string;
  isBreadcrumbLocked: boolean;
  lockedBreadcrumbForId: string;
  lockedBreadcrumbs: any[];
  breadcrumbs: any[];
  pinnedBreadcrumbId: string;
  standardRated?: {
    filterType: 'all' | 'doc' | 'notebook';
    filterId: string;
    deckID: string;
    blockID: string;
  };
}

export interface ReviewSessionStateContext {
  totalCards: ComputedRef<number>;
  hideAnswer: Ref<boolean>;
  isTopicMode: ComputedRef<boolean>;
  practiceModeLabel: ComputedRef<string>;
  history: Ref<ReviewSessionSnapshot[]>;
  rateStandard: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  skipStandard: () => Promise<void>;
  rateDrill: (rating: 1 | 2 | 3 | 4) => Promise<void>;
  skipDrill: () => Promise<void>;
  undoStandard: () => Promise<void>;
  undoDrill: () => Promise<void>;
}

export interface ReviewSessionState {
  getTopBarTitle(): string;
  getTopAreaComponent(): any;
  getOverlayComponent(): any;
  shouldShowAnswerBtn(): boolean;
  shouldShowRatingBtns(): boolean;
  onRating(rating: 1 | 2 | 3 | 4): Promise<void>;
  onSkip(): Promise<void>;
  undo(): Promise<void>;
}

