import type { QueueItem } from '@/core/queue/types';
import type { SchedulingWriteSource } from '@/core/scheduler/schedulingStateCleanliness';
import type { FSRSCard } from '@/types/card';
import type { QueueSnapshotRow } from '@/types/queue-browser';
import type { FilterGroupQueueSessionSnapshot } from './browser-contracts';
import type { QueueProjectionReadMode } from './queue-projection';

export enum QueueType {
  RetrievalPractice = 'retrieval-practice',
  FinalDrill = 'final-drill',
  IncrementalLearning = 'incremental-learning',
  FilterGroup = 'filter-group',
  NeuralRoam = 'neural-roam',
  Leech = 'leech',
}

export type DataChangeEventType =
  | 'card-created'
  | 'card-updated'
  | 'card-deleted'
  | 'queue-changed'
  | 'mode-switched';

export interface DataChangeEvent {
  type: DataChangeEventType;
  cardIds?: string[];
  blockIds?: string[];
  queueType?: QueueType;
  requiresFullRefresh?: boolean;
  timestamp: number;
}

export interface CardMutationOptions {
  preferIncomingScheduling?: boolean;
  schedulingWriteSource?: SchedulingWriteSource;
  suppressAutosave?: boolean;
  suppressDueIndexSort?: boolean;
}

export type QueueCounterBuckets = {
  all: number;
  item: number;
  descriptor: number;
  topic: number;
  concept: number;
};

export interface QueueCounterSnapshot {
  version: number;
  remaining: number;
  due: number;
  total: number | null;
  currentLearningDue?: number;
  todayReviewDue?: number;
  allowedNew?: number;
  learnAheadAvailable?: number;
  scheduledTotal?: number;
  buckets: QueueCounterBuckets;
  source: 'hot' | 'reconciled';
}

export interface QueueReviewResult {
  updatedCard: FSRSCard | null;
  removedFromQueue: boolean;
  remainsInQueue: boolean;
  queueChanged: boolean;
  requiresCurrentViewReorder: boolean;
  counterSnapshot: QueueCounterSnapshot | null;
  version: number;
  queueImpact?: unknown | null;
  projectionAction?: QueueReviewProjectionAction | null;
  projectionImpactEntry?: unknown | null;
}

export interface QueueReviewProjectionAction {
  status: 'patch-applied' | 'refresh-required' | 'deferred' | 'generation-mismatch' | 'not-applicable' | 'unavailable' | string;
  queueType: string | null;
  generation: number | null;
  policyHash: string | null;
  reason: string | null;
}

export type BatchCardMutationResult = {
  attemptedCount: number;
  updatedCount: number;
  updatedCardIds: string[];
  failedCardIds: string[];
};

export type BatchCardDeleteResult = {
  attemptedCount: number;
  deletedCount: number;
  deletedCardIds: string[];
  failedCardIds: string[];
};

export type QueueBulkAddInput = FSRSCard | QueueItem | string;

export type QueueBulkFailure = {
  id: string;
  message?: string;
};

export type QueueBulkMutationResult = {
  attemptedCount: number;
  changedCount: number;
  failedIds: string[];
  failedItems?: QueueBulkFailure[];
};

export type QueueReviewSchedulingReason = 'manual-early-review';

export interface QueueReviewSchedulingContext {
  reviewTime?: number;
  memoryStateAsOf?: number;
  queueType?: QueueType;
  queueMode?: 'formal' | 'filtered-preview' | 'filtered-rescheduling' | 'drill' | 'rotation';
  commitPolicy?: 'write-schedule' | 'preview-only' | 'drill-only';
  source?: 'queue' | 'browser' | 'manual' | 'arena' | 'test' | string;
  sessionId?: string;
  elapsedMs?: number;
  commitIdempotencyKey?: string;
  projectionGeneration?: number;
  projectionPolicyHash?: string;
  isDrill?: boolean;
  isFiltered?: boolean;
  customStudy?: boolean;
  reason?: QueueReviewSchedulingReason;
}

export interface ReviewQueueProgressSnapshot {
  queueType: string | null;
  queueLabel: string;
  completed: number;
  remaining: number;
  total: number | null;
}

export interface IDataSourceObserver {
  onDataChanged(event: DataChangeEvent): void;
}

export interface IReviewQueue {
  name: string;
  type: QueueType;
  getType(): QueueType;
  getCards(): Promise<FSRSCard[]>;
  getSnapshotRows(forceRefresh?: boolean): Promise<QueueSnapshotRow[]>;
  getProjectionReadMode?(): QueueProjectionReadMode;
  getCardsBySnapshotIds(ids: string[], forceRefresh?: boolean): Promise<FSRSCard[]>;
  getAllCards(): Promise<FSRSCard[]>;
  getNextCard(): Promise<FSRSCard | null>;
  addCard(card: FSRSCard | QueueItem | string, source?: QueueAddSource): Promise<void>;
  addCards?(cards: QueueBulkAddInput[], source?: QueueAddSource): Promise<QueueBulkMutationResult>;
  removeCard(cardIdOrBlockId: string): Promise<void>;
  removeCards?(cardIdsOrBlockIds: string[]): Promise<QueueBulkMutationResult>;
  updateCard(card: FSRSCard, options?: CardMutationOptions): Promise<void>;
  handleReview(cardId: string, rating: number, options?: { commitIdempotencyKey?: string }): Promise<QueueReviewResult>;
  getReviewSchedulingContext?(card: FSRSCard): QueueReviewSchedulingContext | null;
  skip(cardId: string): Promise<void>;
  getStats(): Promise<QueueStats>;
  getCounterSnapshot(forceRefresh?: boolean): Promise<QueueCounterSnapshot>;
  getLearnAheadCards?(): Promise<FSRSCard[]>;
  getRemainingSize(): Promise<number>;
  serializeSessionSnapshot?(): FilterGroupQueueSessionSnapshot;
  restoreSessionSnapshot?(snapshot: FilterGroupQueueSessionSnapshot): void;
  insertAt?(cardId: string, position: number): Promise<void>;
  cleanup?(): void;
  getConceptBlocks?(): string[];
  getUIConfig(): QueueUIConfig;
  isDynamic(): boolean;
  refresh(): Promise<void>;
  clear(): Promise<void>;
  getSize(): Promise<number>;
  isEmpty(): Promise<boolean>;
  sort(compareFn?: (a: FSRSCard, b: FSRSCard) => number): Promise<void>;
  filter(predicate: (card: FSRSCard) => boolean): Promise<FSRSCard[]>;
  subscribe(observer: QueueObserver): void;
  unsubscribe(observer: QueueObserver): void;
  notifyObservers(): void;
  reorder(orderedCards: FSRSCard[]): Promise<boolean>;
  clearCustomOrder(): void;
  createRollbackSnapshot?(): Promise<unknown>;
  restoreRollbackSnapshot?(snapshot: unknown): Promise<void>;
}

export type QueueAddSource = 'manual' | 'auto-failed' | 'manual-add-all';

export interface QueueObserver {
  onQueueUpdate(queue: IReviewQueue): void;
}

export interface FinalDrillEntry {
  cardId: string;
  source: 'manual' | 'auto-failed';
  timestamp: number;
}

export interface QueueStats {
  total: number;
  due: number;
  new: number;
  learning: number;
  reviewed: number;
}

export interface QueueUIConfig {
  displayName: string;
  buttons: ReviewButtonConfig[];
  showSkipButton: boolean;
  showProgressBar: boolean;
  customClass?: string;
}

export type ReviewButtonType = 'rating' | 'action';

export interface ReviewButtonConfig {
  type: ReviewButtonType;
  label: string;
  value?: number;
  action?: 'insert' | 'next' | 'lock-focus';
}

export interface PersistedQueueData {
  finalDrill: {
    entries: FinalDrillEntry[];
    lastCleanup: number;
  };
  neuralRoam: {
    cardIds: string[];
  };
  manualAdditions: {
    [queueType: string]: string[];
  };
}

export interface SyncMetadata {
  lastSyncTime: number;
  syncVersion: number;
  pendingChanges: CardChange[];
}

export interface CardChange {
  cardId: string;
  changeType: 'create' | 'update' | 'delete';
  timestamp: number;
  data?: Partial<FSRSCard>;
}

export function isDynamicQueueType(queueType: QueueType): boolean {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup;
}

export function isStaticQueueType(queueType: QueueType): boolean {
  return queueType === QueueType.FinalDrill
    || queueType === QueueType.NeuralRoam;
}

export function isFormalReviewQueue(queueType: QueueType): boolean {
  return queueType === QueueType.RetrievalPractice
    || queueType === QueueType.IncrementalLearning
    || queueType === QueueType.FilterGroup
    || queueType === QueueType.NeuralRoam;
}

export function getAdvancedModeQueueTypes(): QueueType[] {
  return [
    QueueType.RetrievalPractice,
    QueueType.FinalDrill,
    QueueType.IncrementalLearning,
    QueueType.FilterGroup,
    QueueType.NeuralRoam,
  ];
}
