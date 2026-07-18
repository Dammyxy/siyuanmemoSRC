import { describe, expect, it } from 'vitest';
import {
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type MessagePackQueueSnapshotTruthRecord,
  type StorageMutationEnvelope,
} from '../../../packages/contracts/src/backend-rpc';
import {
  encodeCardAggregateChangesets,
  encodeCardAggregateTruthRecords,
  encodeQueueFamilyTruthRecords,
  reconstructCanonicalTruthState,
  replayCardAggregateTruthRecords,
  replayQueueFamilyTruthRecords,
} from '../CompactableCanonicalTruth';

function card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'card-1',
    blockId: 'block-1',
    xiuyuanID: 'xiuyuan-1',
    faceKey: { ruleId: 'item', faceIndex: 0 },
    due: 2_000,
    stability: 3.5,
    difficulty: 4.5,
    reps: 2,
    lapses: 1,
    state: 2,
    lastReview: 1_000,
    elapsedDays: 1,
    scheduledDays: 5,
    priority: 10,
    type: 'item',
    tags: ['topic'],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 100,
    updatedAt: 1_000,
    schedulerType: 'fsrs-v6',
    postponeCount: 0,
    rescheduleHistory: [],
    ...overrides,
  };
}

function mutationEnvelope(): StorageMutationEnvelope {
  return {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: 'mutation-7',
    family: 'card-schedule',
    deviceId: 'device-A',
    identityEpoch: 'epoch-A',
    journalSequence: 7,
    createdAt: 7_000,
    affectedAggregates: [{
      family: 'card-schedule',
      aggregateId: 'card-1',
      causalBaseRevision: 'revision-6',
    }],
    operations: [{
      table: 'cards',
      operation: 'update',
      primaryKey: { id: 'card-1' },
      row: {
        id: 'card-1',
        payload_json: JSON.stringify(card()),
      },
    }],
    requiredTruthOutputs: [
      {
        family: 'card-schedule',
        kind: 'changeset',
        aggregateIds: ['card-1'],
      },
      {
        family: 'queue',
        kind: 'changeset',
        aggregateIds: ['review'],
      },
    ],
  };
}

describe('CompactableCanonicalTruth Card Aggregate changesets', () => {
  it('encodes one aggregate after-state and replays it as Card plus Schedule current state', () => {
    const records = encodeCardAggregateChangesets(mutationEnvelope());

    expect(records).toEqual([
      expect.objectContaining({
        family: 'card-memory-facts',
        type: 'card-aggregate.changeset.v1',
        mutationId: 'mutation-7',
        aggregateId: 'card-1',
        causalBaseRevision: 'revision-6',
        revision: 'device-A:epoch-A:7:mutation-7:card-1',
        journalSequence: 7,
        card: expect.objectContaining({
          id: 'card-1',
          blockId: 'block-1',
          xiuyuanId: 'xiuyuan-1',
          type: 'item',
          priority: 10,
          tags: ['topic'],
        }),
        schedule: expect.objectContaining({
          schedulerType: 'fsrs-v6',
          due: 2_000,
          stability: 3.5,
          difficulty: 4.5,
          state: 2,
          scheduledDays: 5,
        }),
        tombstone: null,
      }),
    ]);

    const replay = replayCardAggregateTruthRecords(records);

    expect(replay.aggregates).toEqual([
      expect.objectContaining({
        aggregateId: 'card-1',
        revision: 'device-A:epoch-A:7:mutation-7:card-1',
        card: expect.objectContaining({ blockId: 'block-1', updatedAt: 1_000 }),
        schedule: expect.objectContaining({ due: 2_000, lastReview: 1_000 }),
        tombstone: null,
      }),
    ]);
    expect(replay.diagnostics).toEqual([]);
  });

  it('encodes deletion as durable tombstone and prevents an older changeset from reviving the aggregate', () => {
    const current = encodeCardAggregateChangesets(mutationEnvelope())[0];
    const deletion: StorageMutationEnvelope = {
      ...mutationEnvelope(),
      mutationId: 'mutation-8',
      family: 'card-crud',
      journalSequence: 8,
      createdAt: 8_000,
      affectedAggregates: [{
        family: 'card-crud',
        aggregateId: 'card-1',
        causalBaseRevision: current.revision,
      }],
      operations: [{
        table: 'cards',
        operation: 'delete',
        primaryKey: { id: 'card-1' },
        row: null,
      }],
      requiredTruthOutputs: [{
        family: 'card-crud',
        kind: 'tombstone',
        aggregateIds: ['card-1'],
      }],
    };

    const [tombstone] = encodeCardAggregateTruthRecords(deletion);
    const replay = replayCardAggregateTruthRecords([
      current,
      tombstone,
      {
        ...current,
        mutationId: 'stale-mutation',
        idempotencyKey: 'stale-mutation',
        journalSequence: 9,
        logicalTime: 9_000,
        recordedAt: 9_000,
        causalBaseRevision: 'revision-before-delete',
        revision: 'stale-revision',
      },
    ]);

    expect(tombstone).toMatchObject({
      type: 'card-aggregate.tombstone.v1',
      aggregateId: 'card-1',
      causalBaseRevision: current.revision,
      revision: 'device-A:epoch-A:8:mutation-8:card-1',
      card: null,
      schedule: null,
      tombstone: {
        deletedAt: 8_000,
        deletedByMutationId: 'mutation-8',
        deletedByDeviceId: 'device-A',
        identityEpoch: 'epoch-A',
      },
    });
    expect(replay.aggregates).toEqual([
      expect.objectContaining({
        aggregateId: 'card-1',
        revision: 'device-A:epoch-A:8:mutation-8:card-1',
        card: null,
        schedule: null,
        tombstone: expect.objectContaining({ deletedByMutationId: 'mutation-8' }),
      }),
    ]);
    expect(replay.diagnostics).toEqual([
      expect.objectContaining({
        reason: 'causal-revision-mismatch',
        aggregateId: 'card-1',
        expectedRevision: 'device-A:epoch-A:8:mutation-8:card-1',
        actualBaseRevision: 'revision-before-delete',
      }),
    ]);
  });
});

describe('CompactableCanonicalTruth Queue-family changesets', () => {
  it('stores queue membership separately from Card Aggregate truth and replays queue current state', () => {
    const envelope = mutationEnvelope();
    const records = encodeQueueFamilyTruthRecords(envelope);

    expect(records).toEqual([
      expect.objectContaining({
        family: 'queue-facts',
        type: 'queue-family.changeset.v1',
        queueFamily: 'review',
        mutationId: 'mutation-7',
        revision: 'device-A:epoch-A:7:mutation-7:review',
        members: null,
        changes: [{
          operation: 'upsert',
          cardId: 'card-1',
          member: expect.objectContaining({
            cardId: 'card-1',
            due: 2_000,
            priority: 10,
            state: 2,
            schedulerType: 'fsrs-v6',
          }),
        }],
      }),
    ]);
    expect(records[0]).not.toHaveProperty('card');
    expect(records[0]).not.toHaveProperty('schedule');

    const replay = replayQueueFamilyTruthRecords(records);

    expect(replay.queues).toEqual([
      {
        queueFamily: 'review',
        revision: 'device-A:epoch-A:7:mutation-7:review',
        causalBaseRevision: null,
        journalSequence: 7,
        mutationId: 'mutation-7',
        members: [
          expect.objectContaining({
            cardId: 'card-1',
            due: 2_000,
            priority: 10,
          }),
        ],
      },
    ]);
    expect(replay.diagnostics).toEqual([]);
  });

  it('encodes opaque queue_state set and delete operations and rebuilds persisted queue values', () => {
    const envelope: StorageMutationEnvelope = {
      ...mutationEnvelope(),
      mutationId: 'queue-state-mutation-8',
      family: 'queue',
      journalSequence: 8,
      createdAt: 8_000,
      affectedAggregates: [{
        family: 'queue',
        aggregateId: 'finalDrillQueue',
        causalBaseRevision: null,
      }, {
        family: 'queue',
        aggregateId: 'retrievalPracticeQueue',
        causalBaseRevision: null,
      }],
      operations: [{
        table: 'queue_state',
        operation: 'delete',
        primaryKey: { key: 'finalDrillQueue' },
        row: null,
      }, {
        table: 'queue_state',
        operation: 'update',
        primaryKey: { key: 'retrievalPracticeQueue' },
        row: {
          key: 'retrievalPracticeQueue',
          value_json: JSON.stringify(['card-1', 'card-2']),
          updated_at: 8_000,
        },
      }],
      requiredTruthOutputs: [{
        family: 'queue',
        kind: 'changeset',
        aggregateIds: ['finalDrillQueue', 'retrievalPracticeQueue'],
      }],
    };

    const records = encodeQueueFamilyTruthRecords(envelope);

    expect(records).toEqual([
      expect.objectContaining({
        type: 'queue-state.changeset.v1',
        queueFamily: 'finalDrillQueue',
        stateChange: {
          operation: 'delete',
          key: 'finalDrillQueue',
          value: null,
        },
      }),
      expect.objectContaining({
        type: 'queue-state.changeset.v1',
        queueFamily: 'retrievalPracticeQueue',
        stateChange: {
          operation: 'set',
          key: 'retrievalPracticeQueue',
          value: ['card-1', 'card-2'],
        },
      }),
    ]);

    const replay = replayQueueFamilyTruthRecords(records);

    expect(replay.queueState).toEqual([
      expect.objectContaining({
        key: 'retrievalPracticeQueue',
        value: ['card-1', 'card-2'],
      }),
    ]);
    expect(replay.diagnostics).toEqual([]);
  });
});

describe('CompactableCanonicalTruth full reconstruction', () => {
  it('replays legacy storage.review operation evidence into Review event rows', () => {
    const result = reconstructCanonicalTruthState({
      truthRecords: [{
        family: 'review-events',
        schemaVersion: 1,
        type: 'storage.review.event.v1',
        idempotencyKey: 'legacy-review-operation',
        mutationId: 'legacy-mutation',
        operations: [{
          table: 'review_events',
          operation: 'insert',
          primaryKey: { id: 'legacy-review-event' },
          row: {
            id: 'legacy-review-event',
            card_id: 'card-legacy',
            rating: 3,
            reviewed_at: 12_000,
          },
        }],
      }],
      uncoveredMutations: [],
    });

    expect(result.reviewEvents).toEqual([
      expect.objectContaining({
        id: 'legacy-review-event',
        card_id: 'card-legacy',
        rating: 3,
      }),
    ]);
    expect(result.undoEntries).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('rebuilds Card, Schedule, Queue, Review, Undo, and tombstones from canonical truth plus uncovered delta', () => {
    const cardSnapshot = snapshotRecord('card-1', 'card-revision-10', 10, card({ due: 10_000 }));
    const deletedSnapshot = {
      ...snapshotRecord('card-2', 'card-revision-9', 9, card({
        id: 'card-2',
        blockId: 'block-2',
        xiuyuanID: 'xiuyuan-2',
      })),
      type: 'card-aggregate.tombstone.v1' as const,
      card: null,
      schedule: null,
      tombstone: {
        deletedAt: 9_000,
        deletedByMutationId: 'delete-card-2',
        deletedByDeviceId: 'device-A',
        identityEpoch: 'epoch-A',
        reason: 'user-delete',
      },
    };
    const queueSnapshot: MessagePackQueueSnapshotTruthRecord = {
      family: 'queue-facts',
      schemaVersion: 1,
      type: 'queue-family.snapshot.v1',
      idempotencyKey: 'queue-snapshot:review:10',
      mutationId: 'queue-snapshot-10',
      queueFamily: 'review',
      causalBaseRevision: null,
      revision: 'queue-revision-10',
      journalSequence: 10,
      logicalTime: 10,
      recordedAt: 10,
      members: [{
        cardId: 'card-1',
        due: 10_000,
        priority: 10,
        state: 2,
        schedulerType: 'fsrs-v6',
        membershipReason: 'due',
        sortKey: '00010',
      }],
      changes: null,
    };
    const canonicalReview = {
      family: 'review-events',
      schemaVersion: 1,
      type: 'review.feedback.v1',
      idempotencyKey: 'review:canonical',
      eventId: 'review-canonical',
      logicalTime: 10,
      recordedAt: 10,
      source: { cardId: 'card-1' },
      review: { action: 'rating', rating: 3, reviewedAt: 10 },
      memory: {},
    };
    const canonicalUndo = {
      family: 'review-events',
      schemaVersion: 1,
      type: 'storage.review.event.v1',
      idempotencyKey: 'undo:canonical',
      mutationId: 'undo-canonical',
      operations: [{
        table: 'review_transaction_undo_journal',
        operation: 'insert',
        primaryKey: { undo_token: 'undo-canonical' },
        row: {
          undo_token: 'undo-canonical',
          card_id: 'card-1',
          status: 'open',
        },
      }],
    };
    const uncovered = mutationEnvelope();
    uncovered.mutationId = 'mutation-11';
    uncovered.journalSequence = 11;
    uncovered.createdAt = 11_000;
    uncovered.affectedAggregates = [
      {
        family: 'card-schedule',
        aggregateId: 'card-1',
        causalBaseRevision: 'card-revision-10',
      },
      {
        family: 'queue',
        aggregateId: 'review',
        causalBaseRevision: 'queue-revision-10',
      },
    ];
    uncovered.operations = [
      {
        table: 'cards',
        operation: 'update',
        primaryKey: { id: 'card-1' },
        row: {
          id: 'card-1',
          payload_json: JSON.stringify(card({
            due: 11_000,
            reps: 3,
            updatedAt: 11_000,
          })),
        },
      },
      {
        table: 'review_events',
        operation: 'insert',
        primaryKey: { id: 'review-uncovered' },
        row: {
          id: 'review-uncovered',
          card_id: 'card-1',
          rating: 4,
          reviewed_at: 11_000,
        },
      },
      {
        table: 'review_transaction_undo_journal',
        operation: 'insert',
        primaryKey: { undo_token: 'undo-uncovered' },
        row: {
          undo_token: 'undo-uncovered',
          card_id: 'card-1',
          status: 'open',
        },
      },
    ];

    const result = reconstructCanonicalTruthState({
      truthRecords: [
        cardSnapshot,
        deletedSnapshot,
        queueSnapshot,
        canonicalReview,
        canonicalUndo,
      ],
      uncoveredMutations: [uncovered],
    });

    expect(result.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({
        aggregateId: 'card-1',
        revision: 'device-A:epoch-A:11:mutation-11:card-1',
        card: expect.objectContaining({ id: 'card-1', updatedAt: 11_000 }),
        schedule: expect.objectContaining({ due: 11_000, reps: 3 }),
        tombstone: null,
      }),
      expect.objectContaining({
        aggregateId: 'card-2',
        card: null,
        schedule: null,
        tombstone: expect.objectContaining({ deletedByMutationId: 'delete-card-2' }),
      }),
    ]));
    expect(result.queues).toEqual([
      expect.objectContaining({
        queueFamily: 'review',
        revision: 'device-A:epoch-A:11:mutation-11:review',
        members: [
          expect.objectContaining({ cardId: 'card-1', due: 11_000, priority: 10 }),
        ],
      }),
    ]);
    expect(result.reviewEvents.map((event) => event.id ?? event.eventId)).toEqual([
      'review-canonical',
      'review-uncovered',
    ]);
    expect(result.undoEntries.map((entry) => entry.undo_token)).toEqual([
      'undo-canonical',
      'undo-uncovered',
    ]);
    expect(result.tombstones).toEqual([
      expect.objectContaining({ aggregateId: 'card-2' }),
    ]);
    expect(result.appliedUncoveredMutationIds).toEqual(['mutation-11']);
    expect(result.diagnostics).toEqual([]);
  });
});

function snapshotRecord(
  aggregateId: string,
  revision: string,
  journalSequence: number,
  value: Record<string, unknown>,
) {
  const envelope = mutationEnvelope();
  envelope.mutationId = `snapshot:${aggregateId}`;
  envelope.journalSequence = journalSequence;
  envelope.createdAt = journalSequence;
  envelope.affectedAggregates = [{
    family: 'card-schedule',
    aggregateId,
    causalBaseRevision: null,
  }];
  envelope.operations = [{
    table: 'cards',
    operation: 'update',
    primaryKey: { id: aggregateId },
    row: {
      id: aggregateId,
      payload_json: JSON.stringify(value),
    },
  }];
  envelope.requiredTruthOutputs = [{
    family: 'card-schedule',
    kind: 'changeset',
    aggregateIds: [aggregateId],
  }];
  const changeset = encodeCardAggregateChangesets(envelope)[0];
  return {
    ...changeset,
    type: 'card-aggregate.snapshot.v1' as const,
    revision,
    idempotencyKey: `snapshot:${aggregateId}:${revision}`,
  };
}
