import type { QueueStats, QueueUIConfig } from '../types';

export type QueueFeedback = {
  action: 'rate' | 'skip' | 'custom';
  rating?: 1 | 2 | 3 | 4;
  customActionId?: string;
  durationMs?: number;
};

export interface IQueueStrategy<TItem = any> {
  getUIConfig(currentItem: TItem | null): QueueUIConfig;
  next(): Promise<TItem | null>;
  onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<void>;
  getStats?(): Promise<QueueStats>;
}

