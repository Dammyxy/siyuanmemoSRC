import type { QueueFeedback } from '@/core/queue/abstraction/Strategy';
import type { CardType, FSRSCard } from '@/types/card';
import type {
  IReviewQueue,
  QueueCounterSnapshot,
  QueueType,
} from '@/types/unified-data-source';

export type ReviewSessionId = string;
export type ReviewSessionCardId = string;
export type ReviewSessionUndoToken = string;

export type ReviewSessionQueueStatus =
  | 'advanced'
  | 'waiting'
  | 'exhausted'
  | 'conflict'
  | 'unavailable';

export type ReviewSessionRebuildTrigger =
  | 'session-start'
  | 'exhausted-continue'
  | 'day-rollover'
  | 'user-refresh'
  | 'scope-switch'
  | 'generation-conflict'
  | 'major-structural-change'
  | 'unsafe-reconcile';

export type ReviewSessionQueueEntryKind = 'main' | 'learning';

export interface ReviewSessionQueueEntry {
  kind: ReviewSessionQueueEntryKind;
  cardId: string;
  blockId: string;
  sourceId: string;
  queueType: QueueType;
  cardType: CardType;
  dueAt: number;
  order: number;
  fingerprint: string;
  profileMetadata: Record<string, unknown>;
}

export interface ReviewSessionAnswerCommand {
  sessionId?: ReviewSessionId;
  card: FSRSCard;
  feedback: QueueFeedback;
}

export interface ReviewSessionMutationOwner {
  ensureAvailable(input: ReviewSessionAnswerCommand): Promise<void>;
}

export interface ReviewSessionCommandAuthority {
  answerAndAdvance(
    input: ReviewSessionAnswerCommand,
    localExecute: () => Promise<ReviewSessionQueueResult>,
  ): Promise<ReviewSessionQueueResult>;
  assertLocalSessionMutation?(operation: 'undo' | 'rebuild' | 'restore'): void;
}

export interface ReviewSessionQueueResult {
  status: ReviewSessionQueueStatus;
  nextCard: FSRSCard | null;
  waitingUntil?: number | null;
  counterSnapshot: QueueCounterSnapshot;
  undoToken: ReviewSessionUndoToken | null;
  reason?: string;
  commitStatus?: 'pending' | 'applied' | 'failed';
  commitIdempotencyKey?: string;
  commit?: Promise<QueueReviewResult | void>;
}

export interface ReviewSessionIdempotencyRecord {
  fingerprint: string;
  result: ReviewSessionQueueResult;
}

export interface ReviewSessionUndoResult {
  restoredCurrentCard: FSRSCard | null;
  counterSnapshot: QueueCounterSnapshot | null;
  undoToken: ReviewSessionUndoToken;
}

export type ReviewSessionNextEntryRepairStatus =
  | 'ready'
  | 'remove'
  | 'conflict'
  | 'unavailable';

export interface ReviewSessionNextEntryRepairResult {
  status: ReviewSessionNextEntryRepairStatus;
  card?: FSRSCard | null;
  reason?: string;
}

export interface SrsV2QueueProfile {
  readonly queueType: QueueType;
  readonly eligibleCardTypes: ReadonlySet<CardType>;
  buildInitialCards(queue: IReviewQueue): Promise<FSRSCard[]>;
  isEligible(card: FSRSCard): boolean;
  hydrateEntry(queue: IReviewQueue, entry: ReviewSessionQueueEntry): Promise<ReviewSessionNextEntryRepairResult>;
  fingerprint(card: FSRSCard): string;
  shouldRemainInLearning(card: FSRSCard): boolean;
}

export interface ReviewSessionQueueRuntime {
  next(): Promise<FSRSCard | null>;
  answerAndAdvance(input: ReviewSessionAnswerCommand): Promise<ReviewSessionQueueResult>;
  rebuild(trigger: ReviewSessionRebuildTrigger): Promise<void>;
  getCounterSnapshot(): QueueCounterSnapshot | null;
  ensureCounterSnapshot?(): Promise<QueueCounterSnapshot | null>;
  getSessionCards(): FSRSCard[];
  appendCardsToTail?(cards: FSRSCard[]): number;
  replaceCurrentCard?(card: FSRSCard): boolean;
  canUndoLast?(): boolean;
  undoLast(token?: string | null): ReviewSessionUndoResult | null | Promise<ReviewSessionUndoResult | null>;
}
