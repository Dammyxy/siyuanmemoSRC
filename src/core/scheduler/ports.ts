import type { FSRSCard } from '@/types/card';
import type { ReviewLogV2 } from '@/types/review';
import type { RescheduleLog } from '@/types/scheduler';
import type { SchedulingWriteSource } from './schedulingStateCleanliness';

export interface CardUpdatePort {
  batchUpdateCardsWithoutEvents(
    cards: FSRSCard[],
    options?: { schedulingWriteSource?: SchedulingWriteSource },
  ): Promise<void>;
  addReviewLogV2?(log: ReviewLogV2): Promise<void>;
}

export interface ErrorNotificationPort {
  notifyError(message: string): Promise<void>;
}

export interface RescheduleStoragePort {
  getCardsByBlockId(blockId: string): FSRSCard[];
  getAllCards?: (() => FSRSCard[]) | (() => Promise<FSRSCard[]>);
  loadData?: (key: string) => Promise<unknown>;
  saveData?: (key: string, value: unknown) => Promise<void>;
  addRescheduleLog?: (log: RescheduleLog) => Promise<void>;
  batchUpdateCards?: (updates: Array<{ blockId: string; due: number }>) => Promise<void>;
}
