import type { SqliteDatabaseService as RuntimeSqliteDatabaseService } from '@/infrastructure/persistence/sqlite';
import type { ReviewTransactionUndoJournalEntry } from './ReviewTransactionUndoJournal';

type ReviewTransactionUndoJournalSqlRuntime = Pick<RuntimeSqliteDatabaseService, 'run'>;

export function appendReviewTransactionUndoJournalEntryInCurrentTransaction(
  runtime: ReviewTransactionUndoJournalSqlRuntime,
  entry: ReviewTransactionUndoJournalEntry,
): void {
  runtime.run(
    `INSERT OR REPLACE INTO review_transaction_undo_journal
      (undo_token, transaction_id, session_id, queue_type, operation, card_id,
       original_review_idempotency_key, status, recorded_at, undone_at, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.undoToken,
      entry.transactionId,
      entry.sessionId,
      String(entry.queueType),
      entry.operation,
      entry.cardId || null,
      entry.originalReviewIdempotencyKey,
      entry.status,
      entry.recordedAt,
      entry.undoneAt,
      JSON.stringify(entry),
    ],
  );
}
