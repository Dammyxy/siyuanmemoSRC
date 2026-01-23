export type QueueId = 'retrieval-practice' | 'final-drill' | 'neural-wandering' | 'filter-group' | 'leech';

export interface QueueInterface<TItem> {
  addItem(item: TItem): Promise<void> | void;
  getNextItem(): Promise<TItem | null> | TItem | null;
  removeItem(item: TItem): Promise<boolean> | boolean;
  size(): Promise<number> | number;
  isEmpty(): Promise<boolean> | boolean;
}

export interface ReviewFeedback {
  rating?: 1 | 2 | 3 | 4;
  action: 'rate' | 'skip' | 'custom';
  customActionId?: string;
  durationMs?: number;
}

export interface QueueUIConfig {
  statsType: 'riff-counts' | 'queue-size' | 'infinite';
  showRatingButtons: boolean;
  allowSkip: boolean;
  customButtons?: {
    label: string;
    actionId: string;
    variant?: 'primary' | 'ghost';
  }[];
}

export interface QueueStats {
  size: number;
  label?: string;
  hue?: string;
}

export interface IQueueStrategy<TItem> extends QueueInterface<TItem> {
  next?: () => Promise<TItem | null>;
  onFeedback?: (item: TItem | null, feedback: ReviewFeedback) => Promise<void>;
  getUIConfig?: (currentItem: TItem | null) => QueueUIConfig;
  getStats?: () => Promise<QueueStats>;
  reschedule?: (item: TItem, options: RescheduleOptions) => Promise<void>;
  insert?: (item: TItem, options: InsertOptions) => Promise<void>;
  dismiss?: (item: TItem, type: DismissType) => Promise<void>;
}

export interface QueueItem {
  cardID: string;
  blockID: string;
  deckID: string;
  nextDues?: Record<1 | 2 | 3 | 4, string>;
  state?: number;
  lapses?: number;
  reps?: number;
  priority?: number;
  meta?: Record<string, unknown>;
}

export interface RescheduleOptions {
  type: 'specific-date' | 'interval-change' | 'reschedule-on-priority';
  value?: string | number;
}

export interface InsertOptions {
  position: 'top' | 'bottom' | 'random';
  priority?: number;
}

export type DismissType = 'session' | 'permanent';

export type QueueOp = 'add' | 'next' | 'remove' | 'size' | 'isEmpty' | 'setStrategy' | 'feedback' | 'uiConfig' | 'stats';

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

