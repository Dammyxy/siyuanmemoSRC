import type { FSRSCard } from '@/types/card';
import type { QueueType } from '@/types/unified-data-source';
import type {
  BackendReviewFeedbackQueueImpact,
  StorageDurabilityReceipt,
} from '../../packages/contracts/src/backend-rpc';

export type ReviewTransactionUndoOperation = 'answer' | 'skip';
export type ReviewTransactionUndoJournalStatus = 'open' | 'undone';

export interface ReviewTransactionUndoJournalFrontier {
  cardIds: string[];
  currentCardId: string | null;
  currentBlockId: string | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

export interface LegacyReviewTransactionUndoJournalFrontier {
  cards: FSRSCard[];
  current: FSRSCard | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}

interface ReviewTransactionUndoJournalEntryBase {
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
  queueImpact: BackendReviewFeedbackQueueImpact | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
  recordedAt: number;
  status: ReviewTransactionUndoJournalStatus;
  undoneAt: number | null;
  scheduleRestoreApplied?: boolean;
  durabilityReceipt?: StorageDurabilityReceipt | null;
}

export interface ReviewTransactionUndoJournalEntry extends ReviewTransactionUndoJournalEntryBase {
  schemaVersion: 2;
  frontierBefore: ReviewTransactionUndoJournalFrontier;
  frontierAfter: ReviewTransactionUndoJournalFrontier;
}

export interface LegacyReviewTransactionUndoJournalEntry extends ReviewTransactionUndoJournalEntryBase {
  schemaVersion: 1;
  frontierBefore: LegacyReviewTransactionUndoJournalFrontier;
  frontierAfter: LegacyReviewTransactionUndoJournalFrontier;
}

export type PersistedReviewTransactionUndoJournalEntry =
  | ReviewTransactionUndoJournalEntry
  | LegacyReviewTransactionUndoJournalEntry;

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
    const normalized = normalizeReviewTransactionUndoJournalEntry(entry);
    this.entries.set(normalized.undoToken, cloneEntry(normalized));
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

export function createReviewTransactionUndoJournalFrontier(input: {
  cards: Array<Pick<FSRSCard, 'id'>>;
  current: Pick<FSRSCard, 'id' | 'blockId'> | null;
  avoidOnceCardId: string | null;
  avoidOnceBlockId: string | null;
  projectionGeneration: number | null;
  projectionPolicyHash: string | null;
}): ReviewTransactionUndoJournalFrontier {
  return normalizeCompactFrontier({
    cardIds: input.cards.map((card) => card.id),
    currentCardId: input.current?.id ?? null,
    currentBlockId: input.current?.blockId ?? null,
    avoidOnceCardId: input.avoidOnceCardId,
    avoidOnceBlockId: input.avoidOnceBlockId,
    projectionGeneration: input.projectionGeneration,
    projectionPolicyHash: input.projectionPolicyHash,
  });
}

export function normalizeReviewTransactionUndoJournalEntry(
  value: unknown,
): ReviewTransactionUndoJournalEntry {
  const entry = requireRecord(value, 'entry');
  const schemaVersion = Number(entry.schemaVersion);
  if (schemaVersion === 2) {
    return cloneEntry({
      ...(entry as unknown as ReviewTransactionUndoJournalEntry),
      schemaVersion: 2,
      frontierBefore: normalizeCompactFrontier(entry.frontierBefore),
      frontierAfter: normalizeCompactFrontier(entry.frontierAfter),
    });
  }
  if (schemaVersion === 1) {
    const legacy = entry as unknown as LegacyReviewTransactionUndoJournalEntry;
    return cloneEntry({
      ...legacy,
      schemaVersion: 2,
      frontierBefore: normalizeLegacyFrontier(legacy.frontierBefore),
      frontierAfter: normalizeLegacyFrontier(legacy.frontierAfter),
    });
  }
  throw new Error(`WORKER_REVIEW_UNDO_JOURNAL_INVALID_SCHEMA: ${String(entry.schemaVersion)}`);
}

function normalizeLegacyFrontier(value: unknown): ReviewTransactionUndoJournalFrontier {
  const frontier = requireRecord(value, 'legacy frontier');
  if (!Array.isArray(frontier.cards)) {
    throw invalidFrontier('legacy cards must be an array');
  }
  const cards = frontier.cards.map((value, index) => {
    const card = requireRecord(value, `legacy card ${index}`);
    return { id: requireIdentity(card.id, `legacy card ${index}`) };
  });
  const currentRecord = frontier.current === null || frontier.current === undefined
    ? null
    : requireRecord(frontier.current, 'legacy current card');
  return createReviewTransactionUndoJournalFrontier({
    cards,
    current: currentRecord
      ? {
          id: requireIdentity(currentRecord.id, 'legacy current card'),
          blockId: requireIdentity(currentRecord.blockId, 'legacy current block'),
        }
      : null,
    avoidOnceCardId: nullableIdentity(frontier.avoidOnceCardId, 'legacy avoid-once card'),
    avoidOnceBlockId: nullableIdentity(frontier.avoidOnceBlockId, 'legacy avoid-once block'),
    projectionGeneration: nullableFiniteNumber(frontier.projectionGeneration, 'legacy projection generation'),
    projectionPolicyHash: nullableIdentity(frontier.projectionPolicyHash, 'legacy projection policy'),
  });
}

function normalizeCompactFrontier(value: unknown): ReviewTransactionUndoJournalFrontier {
  const frontier = requireRecord(value, 'compact frontier');
  if (!Array.isArray(frontier.cardIds)) {
    throw invalidFrontier('cardIds must be an array');
  }
  const cardIds = frontier.cardIds.map((cardId, index) => requireIdentity(cardId, `cardIds[${index}]`));
  if (new Set(cardIds).size !== cardIds.length) {
    throw invalidFrontier('cardIds must be unique');
  }
  const currentCardId = nullableIdentity(frontier.currentCardId, 'current card');
  const currentBlockId = nullableIdentity(frontier.currentBlockId, 'current block');
  if (Boolean(currentCardId) !== Boolean(currentBlockId)) {
    throw invalidFrontier('current card and block identities must both be present or null');
  }
  if (currentCardId && cardIds.includes(currentCardId)) {
    throw invalidFrontier('current card must not be duplicated in cardIds');
  }
  return {
    cardIds,
    currentCardId,
    currentBlockId,
    avoidOnceCardId: nullableIdentity(frontier.avoidOnceCardId, 'avoid-once card'),
    avoidOnceBlockId: nullableIdentity(frontier.avoidOnceBlockId, 'avoid-once block'),
    projectionGeneration: nullableFiniteNumber(frontier.projectionGeneration, 'projection generation'),
    projectionPolicyHash: nullableIdentity(frontier.projectionPolicyHash, 'projection policy'),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidFrontier(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireIdentity(value: unknown, label: string): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw invalidFrontier(`${label} identity is missing`);
  }
  return normalized;
}

function nullableIdentity(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return requireIdentity(value, label);
}

function nullableFiniteNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw invalidFrontier(`${label} must be finite or null`);
  }
  return normalized;
}

function invalidFrontier(reason: string): Error {
  return new Error(`WORKER_REVIEW_UNDO_JOURNAL_INVALID_FRONTIER: ${reason}`);
}

function cloneEntry(entry: ReviewTransactionUndoJournalEntry): ReviewTransactionUndoJournalEntry {
  return JSON.parse(JSON.stringify(entry)) as ReviewTransactionUndoJournalEntry;
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
