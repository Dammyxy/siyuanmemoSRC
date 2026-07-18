import { describe, expect, it } from 'vitest';
import { CardState, CardType, type FSRSCard } from '@/types/card';
import { QueueType } from '@/types/unified-data-source';
import { createInMemorySqlitePersistenceBridge } from '../SqlitePersistenceBridge';
import { WorkerSqliteDatabaseService } from '../SqliteDatabaseService';
import type { ReviewTransactionUndoJournalEntry } from '../../review/ReviewTransactionUndoJournal';

const NOW = 1_779_300_000_000;

function createCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-undo-sql',
    xiuyuanID: 'xy-card-undo-sql',
    blockId: 'block-undo-sql',
    due: NOW - 10_000,
    stability: 4,
    difficulty: 5,
    reps: 3,
    lapses: 0,
    state: CardState.Review,
    lastReview: NOW - 86_400_000,
    elapsedDays: 1,
    scheduledDays: 1,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: NOW - 86_400_000,
    updatedAt: NOW - 10_000,
    meta: {},
    ...overrides,
  };
}

function createUndoEntry(beforeCard: FSRSCard, afterCard: FSRSCard): ReviewTransactionUndoJournalEntry {
  return {
    schemaVersion: 2,
    transactionId: 'txn-undo-sql',
    undoToken: 'worker-review-session-undo:sql:1',
    sessionId: 'session-undo-sql',
    queueType: QueueType.RetrievalPractice,
    operation: 'answer',
    cardId: beforeCard.id,
    replayedCardId: beforeCard.id,
    originalReviewIdempotencyKey: 'review-commit:undo-sql',
    beforeCard,
    afterCard,
    frontierBefore: {
      cardIds: [],
      currentCardId: beforeCard.id,
      currentBlockId: beforeCard.blockId,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: 7,
      projectionPolicyHash: 'retrieval-policy',
    },
    frontierAfter: {
      cardIds: [],
      currentCardId: null,
      currentBlockId: null,
      avoidOnceCardId: null,
      avoidOnceBlockId: null,
      projectionGeneration: 8,
      projectionPolicyHash: 'retrieval-policy',
    },
    queueImpact: null,
    projectionGeneration: 8,
    projectionPolicyHash: 'retrieval-policy',
    recordedAt: NOW,
    status: 'open',
    undoneAt: null,
  };
}

describe('Review Transaction Undo Journal SQLite integration', () => {
  it('restores schedule, records reversal evidence, invalidates projections, and excludes undone answers from active audit counts', async () => {
    const db = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await db.load({
      truthDeviceId: 'device-undo-test',
      identityEpoch: 'epoch-undo-test',
    });

    const beforeCard = createCard();
    const afterCard = createCard({
      due: NOW + 86_400_000,
      reps: beforeCard.reps + 1,
      lastReview: NOW,
      updatedAt: NOW,
    });
    db.run(
      `INSERT OR REPLACE INTO cards
        (id, block_id, xiuyuan_id, type, state, due, priority, updated_at,
         lapses, reps, last_review, created_at, scheduled_days, stability, difficulty,
         source_exists, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        afterCard.id,
        afterCard.blockId,
        afterCard.xiuyuanID,
        String(afterCard.type),
        afterCard.state,
        afterCard.due,
        afterCard.priority,
        afterCard.updatedAt,
        afterCard.lapses,
        afterCard.reps,
        afterCard.lastReview,
        afterCard.createdAt,
        afterCard.scheduledDays,
        afterCard.stability,
        afterCard.difficulty,
        1,
        JSON.stringify(afterCard),
      ],
    );
    db.run(
      `INSERT OR REPLACE INTO review_events
        (id, card_id, attempt_id, rating, reviewed_at, commit_idempotency_key, year, month, event_type, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'review-event:undo-sql',
        afterCard.id,
        'attempt-undo-sql',
        4,
        NOW,
        'review-commit:undo-sql',
        new Date(NOW).getFullYear(),
        new Date(NOW).getMonth() + 1,
        'review-v2',
        JSON.stringify({
          cardId: afterCard.id,
          blockId: afterCard.blockId,
          rating: 4,
          reviewedAt: NOW,
          queueType: QueueType.RetrievalPractice,
          after: afterCard,
        }),
      ],
    );

    const journal = db.createReviewTransactionUndoJournal();
    await journal.append(createUndoEntry(beforeCard, afterCard));
    const consumed = await journal.consume({
      sessionId: 'session-undo-sql',
      undoToken: 'worker-review-session-undo:sql:1',
    });

    expect(consumed).toMatchObject({
      status: 'undone',
      scheduleRestoreApplied: true,
      originalReviewIdempotencyKey: 'review-commit:undo-sql',
      durabilityReceipt: {
        mutationId: 'review-session-undo:worker-review-session-undo:sql:1',
        family: 'review',
        stage: 'journaled',
        journalSequence: expect.any(Number),
      },
    });
    expect(db.getOne<{ reps: number; last_review: number; due: number }>(
      'SELECT reps, last_review, due FROM cards WHERE id = ?',
      [beforeCard.id],
    )).toEqual(expect.objectContaining({
      reps: beforeCard.reps,
      last_review: beforeCard.lastReview,
      due: beforeCard.due,
    }));
    expect(db.getOne<{ event_type: string; payload_json: string }>(
      `SELECT event_type, payload_json
         FROM review_events
        WHERE event_type = 'review-undo-v1'
        LIMIT 1`,
    )).toMatchObject({
      event_type: 'review-undo-v1',
      payload_json: expect.stringContaining('review-commit:undo-sql'),
    });
    expect(db.getAll<{ queue_type: string; reason: string; affected_card_ids_json: string }>(
      `SELECT queue_type, reason, affected_card_ids_json
         FROM queue_projection_invalidations
        WHERE reason = 'review-undo'
        ORDER BY queue_type ASC`,
    )).toEqual(expect.arrayContaining([
      expect.objectContaining({
        queue_type: QueueType.RetrievalPractice,
        reason: 'review-undo',
        affected_card_ids_json: JSON.stringify([beforeCard.id]),
      }),
      expect.objectContaining({
        queue_type: QueueType.IncrementalLearning,
        reason: 'review-undo',
        affected_card_ids_json: JSON.stringify([beforeCard.id]),
      }),
    ]));

    await expect(db.auditReviewSyncDivergence({ cardIds: [beforeCard.id], limit: 10 })).resolves.toMatchObject({
      ok: true,
      scannedCards: 0,
      divergentCards: 0,
      reasons: {
        'review-history-newer-than-card-state': 0,
        'review-event-count-exceeds-card-reps': 0,
      },
      undo: {
        answerUndoPairs: 1,
        openUndoPlans: 0,
        staleUndoPlans: 0,
        undonePlans: 1,
      },
      records: [],
    });
    await expect(journal.consume({
      sessionId: 'session-undo-sql',
      undoToken: 'worker-review-session-undo:sql:1',
    })).resolves.toMatchObject({
      status: 'undone',
      scheduleRestoreApplied: true,
    });
    expect(db.getAll<{ event_type: string }>(
      `SELECT event_type
         FROM review_events
        WHERE event_type = 'review-undo-v1'`,
    )).toHaveLength(1);

    db.dispose();
  });

  it('rejects malformed persisted schema-v1 frontier evidence before consuming the journal row', async () => {
    const db = new WorkerSqliteDatabaseService(createInMemorySqlitePersistenceBridge());
    await db.load({
      truthDeviceId: 'device-undo-legacy-test',
      identityEpoch: 'epoch-undo-legacy-test',
    });
    const beforeCard = createCard({ id: 'card-legacy-invalid' });
    const legacyPayload = {
      ...createUndoEntry(beforeCard, { ...beforeCard, reps: beforeCard.reps + 1 }),
      schemaVersion: 1,
      undoToken: 'undo-legacy-invalid',
      transactionId: 'transaction-legacy-invalid',
      sessionId: 'session-legacy-invalid',
      frontierBefore: {
        cards: [{ ...beforeCard, id: '' }],
        current: beforeCard,
        avoidOnceCardId: null,
        avoidOnceBlockId: null,
        projectionGeneration: 7,
        projectionPolicyHash: 'retrieval-policy',
      },
      frontierAfter: {
        cards: [],
        current: null,
        avoidOnceCardId: null,
        avoidOnceBlockId: null,
        projectionGeneration: 7,
        projectionPolicyHash: 'retrieval-policy',
      },
    };
    db.run(
      `INSERT OR REPLACE INTO review_transaction_undo_journal
        (undo_token, transaction_id, session_id, queue_type, operation, card_id,
         original_review_idempotency_key, status, recorded_at, undone_at, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        legacyPayload.undoToken,
        legacyPayload.transactionId,
        legacyPayload.sessionId,
        legacyPayload.queueType,
        legacyPayload.operation,
        legacyPayload.cardId,
        legacyPayload.originalReviewIdempotencyKey,
        legacyPayload.status,
        legacyPayload.recordedAt,
        legacyPayload.undoneAt,
        JSON.stringify(legacyPayload),
      ],
    );

    const journal = db.createReviewTransactionUndoJournal();
    await expect(journal.consume({
      sessionId: legacyPayload.sessionId,
      undoToken: legacyPayload.undoToken,
    })).rejects.toThrow('WORKER_REVIEW_UNDO_JOURNAL_INVALID_FRONTIER');
    expect(db.getOne<{ status: string; undone_at: number | null }>(
      `SELECT status, undone_at
         FROM review_transaction_undo_journal
        WHERE undo_token = ?`,
      [legacyPayload.undoToken],
    )).toEqual({ status: 'open', undone_at: null });
    expect(db.getOne<{ count: number }>(
      `SELECT COUNT(*) AS count
         FROM review_events
        WHERE event_type = 'review-undo-v1'`,
    )?.count).toBe(0);

    db.dispose();
  });
});
