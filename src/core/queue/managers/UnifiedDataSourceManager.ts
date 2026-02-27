/**
 * Queue Domain Manager Port
 *
 * 领域队列只依赖该端口，不直接耦合 application 层实现。
 */
import type { FSRSCard } from '@/types/card';
import type { CardFilter, DataChangeEvent, IReviewQueue, QueueType } from '@/types/unified-data-source';

export interface QueueSchedulerPort {
  route(card: FSRSCard, rating: number): Promise<FSRSCard>;
}

export interface QueueRuntimePort {
  getSchedulerRouter?(): QueueSchedulerPort;
  getDayStartHour?(): number;
  getPriorityRandomness?(): number;
  getAutoSortEnabled?(): boolean;
  getAddToOutstandingEveryNth?(): number;
}

export interface QueueInitialLoadAware {
  setInitialLoad(loadPromise: Promise<void>): void;
}

export interface UnifiedDataSourceManager {
  getCard(cardId: string, options?: { silent?: boolean }): Promise<FSRSCard>;
  getCards(filter?: CardFilter): Promise<FSRSCard[]>;
  updateCard(card: FSRSCard): Promise<void>;
  onCardUpdatedFromScheduler?(card: FSRSCard): Promise<void> | void;
  notifyObservers(event: DataChangeEvent): void;
  getQueue(type: QueueType): IReviewQueue;
  getSchedulerRouter?(): QueueSchedulerPort;
  getDayStartHour?(): number;
  getPriorityRandomness?(): number;
  getAutoSortEnabled?(): boolean;
  getAddToOutstandingEveryNth?(): number;
}
