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
  lastCounterSnapshot: QueueCounterSnapshot | null;
}

export interface ReviewTabRuntimeState {
  version: 1;
  showAnswer: boolean;
  currentCardId?: string;
  currentBlockId?: string;
  session?: InitialReviewSessionState;
  queueSnapshot?: ReviewQueueSessionSnapshot | null;
}
