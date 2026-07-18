import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import {
  normalizeReviewTransactionUndoJournalEntry,
  type ReviewTransactionUndoJournalEntry,
} from './ReviewTransactionUndoJournal';

type ReviewTransactionUndoJournalSqlRuntime = Pick<RuntimeSqliteDatabaseService, 'run'>;

export function appendReviewTransactionUndoJournalEntryInCurrentTransaction(
  runtime: ReviewTransactionUndoJournalSqlRuntime,
  entry: ReviewTransactionUndoJournalEntry,
): void {
  const normalizedEntry = normalizeReviewTransactionUndoJournalEntry(entry);
  runtime.run(
    `INSERT OR REPLACE INTO review_transaction_undo_journal
      (undo_token, transaction_id, session_id, queue_type, operation, card_id,
       original_review_idempotency_key, status, recorded_at, undone_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      normalizedEntry.undoToken,
      normalizedEntry.transactionId,
      normalizedEntry.sessionId,
      String(normalizedEntry.queueType),
      normalizedEntry.operation,
      normalizedEntry.cardId || null,
      normalizedEntry.originalReviewIdempotencyKey,
      normalizedEntry.status,
      normalizedEntry.recordedAt,
      normalizedEntry.undoneAt,
      JSON.stringify(normalizedEntry),
    ],
  );
}
