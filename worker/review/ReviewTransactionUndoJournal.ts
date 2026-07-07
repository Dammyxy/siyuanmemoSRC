import type { FSRSCard } from '@/types/card';
import type { QueueType } from '@/types/unified-data-source';
import type { BackendReviewFeedbackQueueImpact } from '../../packages/contracts/src/backend-rpc';

export type ReviewTransactionUndoOperation = 'answer' | 'skip';
export type ReviewTransactionUndoJournalStatus = 'open' | 'undone';

export interface ReviewTransactionUndoJournalFrontier {
  cards: FSRSCard[];
  current: FSRSCard | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export interface ReviewTransactionUndoJournalEntry {
  schemaVersion: 1;
  transactionId: string;
  undoToken: string;
  sessionId: string;
  queueType: QueueType | string;
  operation: ReviewTransactionUndoOperation;
  cardId: string;
  replayedCardId: string | null;
  originalReviewIdempotencyKey: string | null;
  beforeCard: FSRSCard | null;
  afterCard: FSRSCard | null;
  frontierBefore: ReviewTransactionUndoJournalFrontier;
  frontierAfter: ReviewTransactionUndoJournalFrontier;
  queueImpact: BackendReviewFeedbackQueueImpact | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
  recordedAt: number;
  status: ReviewTransactionUndoJournalStatus;
  undoneAt: number | null;
  scheduleRestoreApplied?: boolean;
}

export interface ReviewTransactionUndoJournalConsumeRequest {
  sessionId: string;
  undoToken?: string | null;
}

export interface ReviewTransactionUndoJournal {
  append(entry: ReviewTransactionUndoJournalEntry): void | Promise<void>;
  consume(request: ReviewTransactionUndoJournalConsumeRequest): ReviewTransactionUndoJournalEntry | null | Promise<ReviewTransactionUndoJournalEntry | null>;
}

export class InMemoryReviewTransactionUndoJournal implements ReviewTransactionUndoJournal {
  private readonly entries = new Map<string, ReviewTransactionUndoJournalEntry>();

  async append(entry: ReviewTransactionUndoJournalEntry): Promise<void> {
    this.entries.set(entry.undoToken, cloneEntry(entry));
  }

  async consume(request: ReviewTransactionUndoJournalConsumeRequest): Promise<ReviewTransactionUndoJournalEntry | null> {
    const sessionId = normalizeString(request.sessionId);
    if (!sessionId) {
      return null;
    }
    const token = normalizeString(request.undoToken);
    const sessionEntries = Array.from(this.entries.values())
      .filter((entry) => entry.sessionId === sessionId)
      .sort((left, right) => left.recordedAt - right.recordedAt);
    const selected = token
      ? sessionEntries.find((entry) => entry.undoToken === token) ?? null
      : [...sessionEntries].reverse().find((entry) => entry.status === 'open') ?? null;
    if (!selected) {
      return null;
    }
    if (selected.status === 'open') {
      const latestOpen = [...sessionEntries].reverse().find((entry) => entry.status === 'open') ?? null;
      if (latestOpen && latestOpen.undoToken !== selected.undoToken) {
        throw new Error(`WORKER_REVIEW_SESSION_STALE_UNDO_TOKEN: ${selected.undoToken}`);
      }
      selected.status = 'undone';
      selected.undoneAt = Date.now();
      this.entries.set(selected.undoToken, cloneEntry(selected));
      return cloneEntry({
        ...selected,
        status: 'undone',
        scheduleRestoreApplied: false,
      });
    }
    return cloneEntry({
      ...selected,
      status: 'undone',
      scheduleRestoreApplied: true,
    });
  }
}

function cloneEntry(entry: ReviewTransactionUndoJournalEntry): ReviewTransactionUndoJournalEntry {
  return JSON.parse(JSON.stringify(entry)) as ReviewTransactionUndoJournalEntry;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
