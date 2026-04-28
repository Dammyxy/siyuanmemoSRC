import { CardState, type CardType, type FSRSCard } from './card';
import type { PriorityRangeFilter } from './unified-data-source';

export interface StructuredDueDateQuery {
  lte?: number;
  gte?: number;
}

export interface StructuredCardQuery {
  blockIds?: string[];
  cardTypes?: CardType[];
  states?: number[];
  dueDate?: StructuredDueDateQuery;
  suspended?: boolean;
  includeSuspended?: boolean;
  sourceStatus?: 'active' | 'missing' | 'all';
  tags?: string[];
  priority?: PriorityRangeFilter;
  customFilter?: (card: FSRSCard) => boolean;
}

export const ALL_CARD_QUERY_STATES: number[] = [
  CardState.New,
  CardState.Learning,
  CardState.Review,
  CardState.Relearning,
  CardState.Suspended,
];
