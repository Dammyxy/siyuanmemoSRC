import type { QueueStats, QueueUIConfig } from '../types';
import type {
  QueueCounterSnapshot,
  QueueFeedbackImpactEvidence,
  QueueType,
} from '@/types/unified-data-source';

export type QueueItemUnavailableDetails = {
  cardId?: string;
  blockId?: string;
  queueType?: string;
};

export class QueueItemUnavailableError extends Error {
  readonly cardId?: string;
  readonly blockId?: string;
  readonly queueType?: string;
  readonly originalError?: unknown;

  constructor(message: string, details: QueueItemUnavailableDetails = {}, originalError?: unknown) {
    super(message);
    this.name = 'QueueItemUnavailableError';
    Object.setPrototypeOf(this, QueueItemUnavailableError.prototype);
    this.cardId = details.cardId;
    this.blockId = details.blockId;
    this.queueType = details.queueType;
    this.originalError = originalError;
  }
}

export function isQueueItemUnavailableError(error: unknown): error is QueueItemUnavailableError {
  return error instanceof QueueItemUnavailableError
    || (
      typeof error === 'object'
      && error !== null
      && (error as { name?: unknown }).name === 'QueueItemUnavailableError'
    );
}

/**
 * Feedback from user interaction with a queue item
 *
 * Represents the user's response to a review card, including:
 * - The action taken (rate, skip, or custom)
 * - The rating if applicable (1-4 scale)
 * - Custom action identifier for extensibility
 * - Duration of the review session
 */
export type QueueFeedback = {
  /** The type of action performed */
  action: 'rate' | 'skip' | 'custom';
  /** Rating on a 1-4 scale (1: Again, 2: Hard, 3: Good, 4: Easy) */
  rating?: 1 | 2 | 3 | 4;
  /** Identifier for custom actions */
  customActionId?: string;
  /** Time spent reviewing this item in milliseconds */
  durationMs?: number;
  /** Stable command identity for retrying the same user feedback attempt */
  commitIdempotencyKey?: string;
};

export type QueueFeedbackAdvanceResult<TItem extends import('../types').QueueItem = import('../types').QueueItem> = {
  status: 'advanced';
  nextItem: TItem | null;
  counterSnapshot?: QueueCounterSnapshot | null;
  affectedQueueTypes?: QueueType[];
  activeQueueCount?: number;
  countDelta?: number | null;
  queueImpact?: QueueFeedbackImpactEvidence | null;
  commitStatus?: 'pending' | 'applied' | 'failed';
  commitIdempotencyKey?: string;
  commit?: Promise<unknown>;
};

export type QueueFeedbackResult<TItem extends import('../types').QueueItem = import('../types').QueueItem> =
  QueueFeedbackAdvanceResult<TItem>;

/**
 * Queue Strategy Interface - Defines the behavior of a review queue
 *
 * A queue strategy encapsulates the logic for:
 * - Providing items to review (`next()`)
 * - Processing user feedback (`onFeedback()`)
 * - Configuring the UI (`getUIConfig()`)
 * - Reporting statistics (`getStats()`)
 *
 * **Design Pattern**: Strategy pattern allows different queue behaviors
 * (e.g., retrieval practice, incremental learning) to be swapped at runtime.
 *
 * **Type Constraint**: TItem must extend QueueItem to ensure all items have
 * the required blockID field for proper identification and tracking. This
 * satisfies Requirement 6.2: "WHEN defining IQueue interface, THE System SHALL
 * constrain TItem to extend QueueItem"
 *
 * @template TItem - The item type managed by this queue (must extend QueueItem)
 */
export interface IQueueStrategy<TItem extends import('../types').QueueItem = import('../types').QueueItem> {
  /**
   * Get UI configuration for the current item
   */
  getUIConfig(currentItem: TItem | null): QueueUIConfig;

  /**
   * Get the next item to review
   */
  next(): Promise<TItem | null>;

  /**
   * Process user feedback for the current item
   */
  onFeedback(currentItem: TItem | null, feedback: QueueFeedback): Promise<QueueFeedbackResult<TItem> | void>;

  /**
   * Hydrate an externally restored or refreshed current item for display (optional)
   */
  hydrateCurrentItem?(item: TItem | null): Promise<TItem | null>;

  /**
   * Go back to the previous reviewed item (optional)
   */
  goBack?(currentItem: TItem | null): Promise<TItem | null>;

  /**
   * Whether the queue has a previous item to go back to (optional)
   */
  canGoBack?(): boolean;

  /**
   * Get queue statistics (optional)
   */
  getStats?(): Promise<QueueStats>;

  /**
   * Get a lightweight live counter snapshot for the current queue (optional)
   */
  getCounterSnapshot?(): Promise<QueueCounterSnapshot | null>;

  /**
   * Explicitly start a bounded learn-ahead session after the normal queue is empty.
   */
  learnAhead?(): Promise<boolean>;

  /**
   * Reorder items in the queue (optional)
   */
  reorder?(orderedItems: TItem[]): Promise<boolean>;
}
