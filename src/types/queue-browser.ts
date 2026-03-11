import type { CardType } from './card';

export interface QueueSnapshotRow {
  id: string;
  fsrsCardId: string;
  blockId: string;
  deckId: string;
  rootId: string;
  content: string;
  fullContent: string;
  state: number;
  due: number;
  stability: number;
  difficulty: number;
  retrievability: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: number | null;
  interval: number;
  firstReview: number | null;
  priority: number;
  suspended: boolean;
  cardType?: CardType;
  aFactor?: number;
  queueIndex?: number;
  tags: string[];
  blockType?: string | null;
}

export interface QueueSnapshotResult {
  rows: QueueSnapshotRow[];
  total: number;
}
