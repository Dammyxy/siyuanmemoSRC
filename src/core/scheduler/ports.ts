import type { FSRSCard } from '@/types/card';
import type { RescheduleLog } from '@/types/scheduler';

export interface CardUpdatePort {
  batchUpdateCardsWithoutEvents(cards: FSRSCard[]): Promise<void>;
}

export interface RescheduleStoragePort {
  getCardsByBlockId(blockId: string): FSRSCard[];
  getAllCards?: (() => FSRSCard[]) | (() => Promise<FSRSCard[]>);
  loadData?: (key: string) => Promise<unknown>;
  saveData?: (key: string, value: unknown) => Promise<void>;
  addRescheduleLog?: (log: RescheduleLog) => Promise<void>;
  batchUpdateCards?: (updates: Array<{ blockId: string; due: number }>) => Promise<void>;
}
