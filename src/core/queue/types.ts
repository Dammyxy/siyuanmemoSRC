import type { IQueueCommand } from './abstraction/Command';
import type { QueueCardRef } from './abstraction/QueueCardRef.ts';

export type QueueId = 'retrieval' | 'final-drill' | 'neural-roam' | 'filter-group';

export interface QueueInterface<TItem> {
  addItem(item: TItem): Promise<void> | void;
  getNextItem(): Promise<TItem | null> | TItem | null;
  removeItem(item: TItem): Promise<boolean> | boolean;
  size(): Promise<number> | number;
  isEmpty(): Promise<boolean> | boolean;
  reorder?(orderedItems: TItem[]): Promise<boolean> | boolean;
}

/**
 * 队列项接口
 * 
 * 轻量级数据结构，包含队列操作和 FSRS 调度所需的核心字段
 */
export interface QueueItem {
  // === 标识字段 ===
  cardID: QueueCardRef['cardID'];
  blockID: QueueCardRef['blockID'];
  deckID: QueueCardRef['deckID'];
  priority: QueueCardRef['priority'];
  
  // === Riff 原生字段 ===
  nextDues?: Record<1 | 2 | 3 | 4, string>;
  
  // === FSRS 调度字段 ===
  state?: number;           // CardState: 0=New, 1=Learning, 2=Review, 3=Relearning
  stability?: number;       // 稳定性 (S)
  difficulty?: number;      // 难度 (D) 1-10
  reps?: number;            // 复习次数
  lapses?: number;          // 遗忘次数
  lastReview?: number;      // 上次复习时间戳 (ms)
  elapsedDays?: number;     // 距上次复习经过的天数
  scheduledDays?: number;   // 预定的间隔天数
  
  // === 扩展字段 ===
  updatedAt?: number;       // 更新时间戳
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
