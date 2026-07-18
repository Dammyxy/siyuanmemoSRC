import { describe, expect, it } from 'vitest';
import type { SqliteDeltaChange, SqliteDeltaEntry } from '../SqliteDeltaCheckpoint';
import { planSqliteLegacyDeltaAdoption } from '../SqliteLegacyDeltaAdoption';

function entry(label: string, changes: SqliteDeltaChange[], id = label): SqliteDeltaEntry {
  return {
    id,
    version: 1,
    label,
    createdAt: 1_700_000_000_000,
    schemaFingerprints: {},
    tables: Array.from(new Set(changes.map((change) => change.table))),
    changes,
    mutationEnvelope: null,
    durabilityReceipt: null,
    byteEstimate: 1,
  };
}

function change(
  table: string,
  row: Record<string, string | number | null> | null,
  operation: SqliteDeltaChange['operation'] = 'insert',
): SqliteDeltaChange {
  const identity = row?.id ?? row?.card_id ?? row?.key ?? row?.undo_token ?? row?.operation_id ?? 'id-1';
  return {
    table,
    operation,
    primaryKey: table === 'queue_state'
      ? { key: identity }
      : table === 'review_transaction_undo_journal'
        ? { undo_token: identity }
        : { id: identity },
    row,
  };
}

function plan(entries: SqliteDeltaEntry[]) {
  return planSqliteLegacyDeltaAdoption({
    entries,
    deviceId: 'device-legacy-adoption',
    identityEpoch: 'epoch-legacy-adoption',
    startingJournalSequence: 11,
  });
}

function planForIdentity(
  entries: SqliteDeltaEntry[],
  identityEpoch: string,
  rebindableLegacyMutationIds: string[] = [],
  coveredJournalSequence = 0,
) {
  return planSqliteLegacyDeltaAdoption({
    entries,
    deviceId: 'device-legacy-adoption',
    identityEpoch,
    startingJournalSequence: 11,
    coveredJournalSequence,
    rebindableLegacyMutationIds,
  });
}

describe('planSqliteLegacyDeltaAdoption', () => {
  it('maps Review feedback to review, card schedule, queue, and metadata truth outputs', () => {
    const candidate = entry('review.feedback', [
      change('cards', { id: 'card-1', due: 10, state: 2, priority: 50 }),
      change('review_events', { id: 'review-1', card_id: 'card-1', rating: 3 }),
      change('review_transaction_undo_journal', {
        undo_token: 'undo-1',
        card_id: 'card-1',
        queue_type: 'retrieval-practice',
      }),
      change('queue_state', {
        key: 'retrievalPracticeQueue',
        value_json: '{"cardIds":["card-1"]}',
      }),
      change('store_metadata', { key: 'review-meta-1' }),
    ]);

    const result = plan([candidate]);

    expect(result).toMatchObject({
      status: 'ready',
      adoptedEntryCount: 1,
      firstJournalSequence: 11,
      lastJournalSequence: 11,
      nextJournalSequence: 12,
    });
    expect(result.entries[0].mutationEnvelope).toMatchObject({
      family: 'review',
      journalSequence: 11,
      requiredTruthOutputs: expect.arrayContaining([
        { family: 'card-schedule', kind: 'changeset', aggregateIds: ['card-1'] },
        { family: 'review', kind: 'event', aggregateIds: ['card-1'] },
        { family: 'review', kind: 'metadata', aggregateIds: ['review-meta-1', 'undo-1'] },
        { family: 'queue', kind: 'changeset', aggregateIds: ['retrieval-practice'] },
      ]),
    });
    expect(result.entries[0].durabilityReceipt).toMatchObject({
      stage: 'journaled',
      journalSequence: 11,
      diagnosticCode: 'LEGACY_DELTA_ADOPTED',
    });
  });

  it('classifies undo, metadata, card repair, queue state, review patch, and tombstone evidence', () => {
    const candidates = [
      entry('review.session.undo-journal.append', [change('review_transaction_undo_journal', {
        undo_token: 'undo-1',
        queue_type: 'incremental-learning',
      })]),
      entry('domain-sync.backfill-existing', [change('domain_sync_operations', {
        operation_id: 'operation-1',
      })]),
      entry('sqlite.algorithm-card-state-production-repair', [
        change('algorithm_card_state', { algorithm_id: 'fsrs-v6', card_id: 'card-1' }, 'delete'),
        change('cards', { id: 'card-1', due: 20, state: 1 }, 'insert'),
      ]),
      entry('queue.state.batchMutate', [change('queue_state', {
        key: 'retrievalPracticeQueue',
        value_json: '{"cardIds":["card-1"]}',
      })]),
      entry('review.truth.backfill.patch-refs', [change('review_events', {
        id: 'review-2',
        card_id: 'card-2',
      }, 'update')]),
      entry('card.crud.delete', [change('cards', null, 'delete')], 'card-delete'),
    ];
    candidates[5].changes[0].primaryKey = { id: 'card-deleted' };

    const result = plan(candidates);

    expect(result.status).toBe('ready');
    expect(result.entries.map((candidate) => candidate.mutationEnvelope?.requiredTruthOutputs)).toEqual([
      [{ family: 'review', kind: 'metadata', aggregateIds: ['undo-1'] }],
      [{ family: 'review', kind: 'metadata', aggregateIds: ['operation-1'] }],
      [{ family: 'card-crud', kind: 'changeset', aggregateIds: ['card-1'] }],
      [{ family: 'queue', kind: 'changeset', aggregateIds: ['retrievalPracticeQueue'] }],
      [{ family: 'review', kind: 'event', aggregateIds: ['card-2'] }],
      [{ family: 'card-crud', kind: 'tombstone', aggregateIds: ['card-deleted'] }],
    ]);
  });

  it('is deterministic and fails closed without returning partially adopted entries', () => {
    const supported = entry('source-existence.sweep', [change('cards', {
      id: 'card-1',
      source_exists: 1,
    }, 'update')], 'supported');
    const unsupported = entry('unknown.legacy.write', [change('unknown_table', {
      id: 'unknown-1',
    })], 'unsupported');

    const first = plan([supported]);
    const second = plan([supported]);
    const blocked = plan([supported, unsupported]);

    expect(first.entries[0].mutationEnvelope?.mutationId).toBe(
      second.entries[0].mutationEnvelope?.mutationId,
    );
    expect(blocked).toMatchObject({
      status: 'blocked',
      adoptedEntryCount: 0,
      firstJournalSequence: null,
      lastJournalSequence: null,
      nextJournalSequence: 11,
      unsupportedEntries: [{
        entryId: 'unsupported',
        reason: 'unsupported-tables:unknown_table',
      }],
    });
    expect(blocked.entries.every((candidate) => candidate.mutationEnvelope === null)).toBe(true);
  });

  it('rebinds only an authorized deterministic provisional adoption without changing its journal identity', () => {
    const candidate = entry('queue.state.batchMutate', [change('queue_state', {
      key: 'retrievalPracticeQueue',
      value_json: '{"cardIds":["card-1"]}',
    })]);
    const provisional = planForIdentity([candidate], 'epoch-old');
    const mutationId = provisional.entries[0].mutationEnvelope!.mutationId;

    const blocked = planForIdentity(provisional.entries, 'epoch-current');
    expect(blocked).toMatchObject({
      status: 'blocked',
      adoptedEntryCount: 0,
      unsupportedEntries: [{
        entryId: candidate.id,
        reason: 'journal-identity-mismatch',
      }],
    });

    const rebound = planForIdentity(provisional.entries, 'epoch-current', [mutationId]);
    expect(rebound).toMatchObject({
      status: 'ready',
      adoptedEntryCount: 1,
      firstJournalSequence: 11,
      lastJournalSequence: 11,
      nextJournalSequence: 12,
    });
    expect(rebound.entries[0].mutationEnvelope).toMatchObject({
      mutationId,
      deviceId: 'device-legacy-adoption',
      identityEpoch: 'epoch-current',
      journalSequence: 11,
    });
  });

  it('does not block adoption on already covered foreign-epoch journal entries', () => {
    const candidate = entry('review.feedback', [
      change('cards', { id: 'card-1', due: 10, state: 2, priority: 50 }),
      change('review_events', { id: 'review-1', card_id: 'card-1', rating: 3 }),
      change('review_transaction_undo_journal', {
        undo_token: 'undo-1',
        card_id: 'card-1',
        queue_type: 'retrieval-practice',
      }),
    ]);
    const oldEpoch = planForIdentity([candidate], 'epoch-old');

    const recovered = planForIdentity(oldEpoch.entries, 'epoch-current', [], 11);

    expect(recovered).toMatchObject({
      status: 'not-needed',
      adoptedEntryCount: 0,
      unsupportedEntries: [],
      nextJournalSequence: 12,
    });
  });
});
