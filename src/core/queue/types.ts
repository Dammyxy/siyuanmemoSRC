import type { IQueueCommand } from './abstraction/Command';
import type { QueueCardRef } from './abstraction/QueueCardRef.ts';

export type QueueId = 'extraction' | 'final-drill' | 'neural-roam' | 'filter-group';

export interface QueueInterface<TItem> {
  addItem(item: TItem): Promise<void> | void;
  getNextItem(): Promise<TItem | null> | TItem | null;
  removeItem(item: TItem): Promise<boolean> | boolean;
  size(): Promise<number> | number;
  isEmpty(): Promise<boolean> | boolean;
}

export interface QueueItem {
  cardID: QueueCardRef['cardID'];
  blockID: QueueCardRef['blockID'];
  deckID: QueueCardRef['deckID'];
  priority: QueueCardRef['priority'];
  nextDues?: Record<1 | 2 | 3 | 4, string>;
  state?: number;
  lapses?: number;
  reps?: number;
  lastReview?: number;
  meta?: Record<string, unknown>;
}

export type QueueOp = 'add' | 'next' | 'remove' | 'size' | 'isEmpty' | 'setStrategy';

export interface QueueEvent {
  op: QueueOp;
  queueId: QueueId;
  durationMs: number;
  sizeBefore?: number;
  sizeAfter?: number;
  ok: boolean;
  error?: unknown;
  payload?: unknown;
}

export interface QueueState {
  queueId: QueueId;
  size: number;
  empty: boolean;
}

export type QueueStats = {
  size: number;
  label?: string;
  extra?: string;
};

export type QueueUIConfig = {
  statsType: 'infinite' | 'queue-size' | 'riff-counts';
  showRatingButtons: boolean;
  allowSkip: boolean;
  hiddenContentTypes?: string[];
  customButtons?: Array<{
    actionId: string;
    label: string;
    icon?: string;
    danger?: boolean;
    variant?: 'ghost' | 'info';
  }>;
  menuCommands?: IQueueCommand<unknown>[];
};
