import type { FSRSCard, Rating } from '@/types/card';
import type { SchedulerType } from '../schedulerPolicy';
import type { SchedulerTimingOptions } from '../types';

export type SrsV2QueueType =
  | 'retrieval-practice'
  | 'incremental-learning'
  | 'filter-group'
  | 'final-drill'
  | 'neural-roam'
  | 'leech'
  | string;

export type SrsV2QueueMode =
  | 'formal'
  | 'filtered-preview'
  | 'filtered-rescheduling'
  | 'drill'
  | 'rotation';

export type SrsV2CommitPolicy = 'write-schedule' | 'preview-only' | 'drill-only';

export type SrsV2AlgorithmFamily = 'memory-fsrs' | 'rotation' | 'legacy-advisory';

export interface SrsV2SchedulingContext extends SchedulerTimingOptions {
  queueType?: SrsV2QueueType;
  queueMode?: SrsV2QueueMode;
  commitPolicy?: SrsV2CommitPolicy;
  source?: 'queue' | 'browser' | 'manual' | 'arena' | 'test' | string;
  sessionId?: string;
  elapsedMs?: number;
  reviewTime?: Date | number;
  isDrill?: boolean;
  isFiltered?: boolean;
  customStudy?: boolean;
}

export interface SchedulingChoice {
  rating: Rating;
  card: FSRSCard;
  due: number;
  scheduledDays: number;
  state: FSRSCard['state'];
  schedulerType: SchedulerType;
  algorithm: SrsV2AlgorithmFamily;
  generatedAt: number;
  intervalMs: number;
  stability: number;
  difficulty: number;
}

export interface SchedulingChoices {
  cardId: string;
  current: FSRSCard;
  choices: Map<Rating, SchedulingChoice>;
  schedulerType: SchedulerType;
  algorithm: SrsV2AlgorithmFamily;
  queueMode: SrsV2QueueMode;
  commitPolicy: SrsV2CommitPolicy;
  generatedAt: number;
}

export interface ReviewAttempt {
  id: string;
  cardId: string;
  rating: Rating;
  reviewedAt: number;
  schedulerType: SchedulerType;
  algorithm: SrsV2AlgorithmFamily;
  queueType?: SrsV2QueueType;
  queueMode: SrsV2QueueMode;
  commitPolicy: SrsV2CommitPolicy;
  source?: string;
  sessionId?: string;
  elapsedMs?: number;
  isDrill: boolean;
  isFiltered: boolean;
  customStudy: boolean;
}

export interface SchedulingDecision {
  attempt: ReviewAttempt;
  before: FSRSCard;
  current: FSRSCard;
  after: FSRSCard;
  selected: SchedulingChoice;
  choices: Map<Rating, SchedulingChoice>;
  schedulerType: SchedulerType;
  algorithm: SrsV2AlgorithmFamily;
  queueMode: SrsV2QueueMode;
  commitPolicy: SrsV2CommitPolicy;
}

export interface ReviewCommitResult {
  decision: SchedulingDecision;
  updatedCard: FSRSCard | null;
  committed: boolean;
  suppressedReason?: 'preview-only' | 'drill-only';
}

export interface ArenaContestantPrediction {
  contestantId: string;
  algorithm: SrsV2AlgorithmFamily | string;
  schedulerType?: string;
  choices: Map<Rating, SchedulingChoice>;
  confidence: number;
  explanation?: string;
  attribution?: Record<string, unknown>;
}

export interface ArenaCompositeSuggestion {
  cardId: string;
  generatedAt: number;
  selectedRating?: Rating;
  recommendedChoice?: SchedulingChoice;
  contestantWeights: Record<string, number>;
  explanation?: string;
  writeEnabled: boolean;
}

export interface ArenaContestantContract {
  id: string;
  predict(card: FSRSCard, context: SrsV2SchedulingContext): ArenaContestantPrediction;
}
