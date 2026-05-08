/**
 * Queue Domain Manager Port
 *
 * 领域队列只依赖该端口，不直接耦合 application 层实现。
 */
import type { FSRSCard } from '@/types/card';
import type {
  BatchCardMutationResult,
  CardFilter,
  DataChangeEvent,
  IReviewQueue,
  QueueProjectionSnapshot,
  QueueType,
} from '@/types/unified-data-source';
import type { DrillLogV2 } from '@/types/review';
import type {
  ReviewCommitResult,
  SchedulingDecision,
  SrsV2SchedulingContext,
} from '@/core/scheduler/srs-v2';

export interface QueueSchedulerPort {
  answer(card: FSRSCard, rating: number, options?: SrsV2SchedulingContext): SchedulingDecision;
  commit(decision: SchedulingDecision): Promise<ReviewCommitResult>;
}

export interface QueueReviewCommand {
  cardId: string;
  rating: number;
  context: SrsV2SchedulingContext;
}

export interface QueueReviewCommitResult {
  card: FSRSCard;
  updatedCard: FSRSCard;
  committed: boolean;
  decision?: SchedulingDecision;
  commitResult?: ReviewCommitResult;
  queueImpact?: unknown | null;
}

export interface QueueRuntimePort {
  getSchedulerRouter?(): QueueSchedulerPort;
  commitReview?(command: QueueReviewCommand): Promise<QueueReviewCommitResult>;
  appendDrillLogV2?(log: DrillLogV2): Promise<void>;
  getDayStartHour?(): number;
  getNewCardsPerDay?(): number;
  getReviewsPerDay?(): number;
  getFilteredReviewDefault?(): 'preview-only' | 'reschedule';
  getPriorityRandomness?(): number;
  getAutoSortEnabled?(): boolean;
  getAddToOutstandingEveryNth?(): number;
  readQueueProjectionSnapshot?(
    queueType: QueueType,
    options?: { forceRefresh?: boolean },
  ): Promise<QueueProjectionSnapshot | null>;
  getQueueProjectionCardsBySnapshotIds?(
    queueType: QueueType,
    ids: string[],
    options?: { forceRefresh?: boolean },
  ): Promise<FSRSCard[]>;
}

export interface QueueInitialLoadAware {
  setInitialLoad(loadPromise: Promise<void>): void;
}

export interface UnifiedDataSourceManager {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
  getCards(filter?: CardFilter): Promise<FSRSCard[]>;
  updateCard(card: FSRSCard): Promise<void>;
  batchUpdateCards?(cards: FSRSCard[]): Promise<BatchCardMutationResult>;
  restoreCardSnapshotForFailedFeedback?(card: FSRSCard): Promise<void> | void;
  onCardUpdatedFromScheduler?(card: FSRSCard): Promise<void> | void;
  notifyObservers(event: DataChangeEvent): void;
  getQueue(type: QueueType): IReviewQueue;
  getSchedulerRouter?(): QueueSchedulerPort;
  commitReview?(command: QueueReviewCommand): Promise<QueueReviewCommitResult>;
  appendDrillLogV2?(log: DrillLogV2): Promise<void>;
  getDayStartHour?(): number;
  getNewCardsPerDay?(): number;
  getReviewsPerDay?(): number;
  getFilteredReviewDefault?(): 'preview-only' | 'reschedule';
  getPriorityRandomness?(): number;
  getAutoSortEnabled?(): boolean;
  getAddToOutstandingEveryNth?(): number;
  readQueueProjectionSnapshot?(
    queueType: QueueType,
    options?: { forceRefresh?: boolean },
  ): Promise<QueueProjectionSnapshot | null>;
  getQueueProjectionCardsBySnapshotIds?(
    queueType: QueueType,
    ids: string[],
    options?: { forceRefresh?: boolean },
  ): Promise<FSRSCard[]>;
}
