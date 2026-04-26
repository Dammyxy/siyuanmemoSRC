import type { FSRSCard } from './card';
import type { InitialReviewSessionState, QueueCounterSnapshot } from './unified-data-source';

export interface ReviewQueueSessionSnapshot {
  version: 1;
  queueType: string;
  cacheValid: boolean;
  currentIndex: number;
  cachedCards: FSRSCard[];
  currentItem: FSRSCard | null;
  forwardBuffer: FSRSCard[];
  pendingRotateCardId: string | null;
  avoidOnceCardId?: string | null;
  avoidOnceBlockId?: string | null;
  /** @deprecated Kept for old review-tab snapshots; use avoidOnceCardId. */
  deferOnceCardId?: string | null;
  sessionExcludedCardIds?: string[];
  lastCounterSnapshot: QueueCounterSnapshot | null;
}

export interface ReviewTabRuntimeState {
  version: 1;
  showAnswer: boolean;
  sharedReviewSessionId?: string;
  currentCardId?: string;
  currentBlockId?: string;
  session?: InitialReviewSessionState;
  queueSnapshot?: ReviewQueueSessionSnapshot | null;
}
