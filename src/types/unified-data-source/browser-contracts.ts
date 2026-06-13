import type { QueueType } from './queue-core';

export type BrowserCardTypeFilter =
  | 'all'
  | 'topic-only'
  | 'item-only'
  | 'concept-only'
  | 'descriptor-only'
  | 'missing-block-only';

export interface DateRangeFilter {
  lte?: Date;
  gte?: Date;
}

export interface NumericRangeFilter {
  min?: number;
  max?: number;
}

export interface PriorityRangeFilter {
  min?: number;
  max?: number;
}

export interface CardFilter {
  cardType?: 'item' | 'topic' | 'concept' | 'descriptor' | 'incremental' | 'webpage' | Array<'item' | 'topic' | 'concept' | 'descriptor' | 'incremental' | 'webpage'>;
  dueDate?: DateRangeFilter;
  tags?: string[];
  priority?: PriorityRangeFilter;
  blockIds?: string[];
  scopeDocIds?: string[];
  repetitions?: NumericRangeFilter;
  lapses?: NumericRangeFilter;
  interval?: NumericRangeFilter;
  lastReview?: DateRangeFilter;
  difficulty?: NumericRangeFilter;
  stability?: NumericRangeFilter;
  retrievability?: NumericRangeFilter;
  cardStatus?: Array<'new' | 'learning' | 'review' | 'relearning'>;
  includeSuspended?: boolean;
  keyword?: string;
}

export interface FilterGroupQueueRollbackSnapshot {
  temporaryBlacklist: string[];
  customOrder: string[] | null;
  manualCards: string[];
}

export interface FilterGroupQueueSessionSnapshot {
  filter: CardFilter;
  rollbackSnapshot: FilterGroupQueueRollbackSnapshot;
  visibleCardIds?: string[];
}

export interface InitialReviewSessionState {
  initialTotal?: number;
  answeredCount?: number;
  correctCount?: number;
}

export type ReviewTabTransferState = {
  kind: 'filter-group-session';
  filterSession: FilterGroupQueueSessionSnapshot;
  session?: InitialReviewSessionState;
} | {
  kind: 'static-subset-session';
  queueType: QueueType.FilterGroup | QueueType.FinalDrill;
  blockIds: string[];
  cardIds?: string[];
  preferredCardId?: string;
  session?: InitialReviewSessionState;
};
