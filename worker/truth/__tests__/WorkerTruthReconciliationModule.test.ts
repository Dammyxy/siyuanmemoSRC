import { describe, expect, it } from 'vitest';
import type {
  MessagePackCardAggregateTruthRecord,
  MessagePackQueueChangesetTruthRecord,
} from '../../../packages/contracts/src/backend-rpc';
import {
  reconcileWorkerTruthRecords,
  type WorkerTruthReconciliationSource,
} from '../WorkerTruthReconciliationModule';

function cardRecord(input: {
  mutationId: string;
  aggregateId: string;
  revision: string;
  causalBaseRevision: string | null;
  logicalTime: number;
  type?: 'card-aggregate.changeset.v1' | 'card-aggregate.tombstone.v1';
}): MessagePackCardAggregateTruthRecord {
  if (input.type === 'card-aggregate.tombstone.v1') {
    return {
      family: 'card-memory-facts',
      schemaVersion: 1,
      type: 'card-aggregate.tombstone.v1',
      idempotencyKey: `card:${input.mutationId}`,
      mutationId: input.mutationId,
      aggregateId: input.aggregateId,
      causalBaseRevision: input.causalBaseRevision,
      revision: input.revision,
      journalSequence: input.logicalTime,
      logicalTime: input.logicalTime,
      recordedAt: input.logicalTime,
      card: null,
      schedule: null,
      tombstone: {
        deletedAt: input.logicalTime,
        deletedByMutationId: input.mutationId,
        deletedByDeviceId: 'device-A',
        identityEpoch: 'epoch-A',
        reason: 'test-delete',
      },
    };
  }
  return {
    family: 'card-memory-facts',
    schemaVersion: 1,
    type: 'card-aggregate.changeset.v1',
    idempotencyKey: `card:${input.mutationId}`,
    mutationId: input.mutationId,
    aggregateId: input.aggregateId,
    causalBaseRevision: input.causalBaseRevision,
    revision: input.revision,
    journalSequence: input.logicalTime,
    logicalTime: input.logicalTime,
    recordedAt: input.logicalTime,
    card: {
      id: input.aggregateId,
      blockId: `block-${input.aggregateId}`,
      type: 'item',
      meta: {},
      tags: [],
      priority: 50,
      createdAt: 1,
      updatedAt: input.logicalTime,
    },
    schedule: {
      due: input.logicalTime,
      stability: 1,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 1,
      reps: 1,
      lapses: 0,
      state: 2,
      lastReview: input.logicalTime,
      schedulerType: 'fsrs-v6',
      skipped: false,
      skipUntil: null,
      skipNote: null,
      neuralRoamSeed: false,
      leechCount: 0,
      isLeech: false,
      riffCardId: null,
      schedulerMeta: null,
      postponeCount: 0,
      lastPostponeDate: null,
      rescheduleHistory: [],
    },
    tombstone: null,
  } as MessagePackCardAggregateTruthRecord;
}

function queueRecord(input: {
  mutationId: string;
  revision: string;
  causalBaseRevision: string | null;
  logicalTime: number;
  cardId: string;
}): MessagePackQueueChangesetTruthRecord {
  return {
    family: 'queue-facts',
    schemaVersion: 1,
    type: 'queue-family.changeset.v1',
    idempotencyKey: `queue:${input.mutationId}`,
    mutationId: input.mutationId,
    queueFamily: 'retrieval-practice',
    causalBaseRevision: input.causalBaseRevision,
    revision: input.revision,
    journalSequence: input.logicalTime,
    logicalTime: input.logicalTime,
    recordedAt: input.logicalTime,
    members: null,
    changes: [{
      operation: 'remove',
      cardId: input.cardId,
      member: null,
    }],
  };
}

function source(
  deviceId: string,
  identityEpoch: string,
  records: WorkerTruthReconciliationSource['records'],
): WorkerTruthReconciliationSource {
  return {
    sourceId: `${deviceId}:${identityEpoch}`,
    deviceId,
    identityEpoch,
    manifestPath: `truth/test/device-${deviceId}/manifest.v1.json`,
    generationId: 'test-v1',
    records,
  };
}

describe('WorkerTruthReconciliationModule', () => {
  it('deduplicates equivalent mutation IDs and merges independent aggregates', () => {
    const duplicate = cardRecord({
      mutationId: 'mutation-1',
      aggregateId: 'card-1',
      revision: 'revision-1',
      causalBaseRevision: null,
      logicalTime: 1,
    });
    const result = reconcileWorkerTruthRecords([
      source('device-A', 'epoch-A', [duplicate]),
      source('device-B', 'epoch-B', [
        structuredClone(duplicate),
        cardRecord({
          mutationId: 'mutation-2',
          aggregateId: 'card-2',
          revision: 'revision-2',
          causalBaseRevision: null,
          logicalTime: 2,
        }),
      ]),
    ]);

    expect(result.duplicateMutationIds).toEqual(['mutation-1']);
    expect(result.acceptedMutationIds).toEqual(['mutation-1', 'mutation-2']);
    expect(result.conflicts).toEqual([]);
    expect(result.blockedAggregateIds).toEqual([]);
  });

  it('unions distinct append-only Review facts', () => {
    const result = reconcileWorkerTruthRecords([
      source('device-A', 'epoch-A', [{
        family: 'review-events',
        schemaVersion: 1,
        type: 'storage.review.append.v1',
        idempotencyKey: 'review:1',
        mutationId: 'review-mutation-1',
        deviceId: 'device-A',
        identityEpoch: 'epoch-A',
        logicalTime: 1,
        recordedAt: 1,
      }]),
      source('device-B', 'epoch-B', [{
        family: 'review-events',
        schemaVersion: 1,
        type: 'storage.review.append.v1',
        idempotencyKey: 'review:2',
        mutationId: 'review-mutation-2',
        deviceId: 'device-B',
        identityEpoch: 'epoch-B',
        logicalTime: 2,
        recordedAt: 2,
      }]),
    ]);

    expect(result.reviewFacts.map((record) => record.mutationId)).toEqual([
      'review-mutation-1',
      'review-mutation-2',
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it('preserves concurrent same-card mutations and blocks the aggregate', () => {
    const result = reconcileWorkerTruthRecords([
      source('device-A', 'epoch-A', [cardRecord({
        mutationId: 'mutation-A',
        aggregateId: 'card-1',
        revision: 'revision-A',
        causalBaseRevision: 'revision-base',
        logicalTime: 2,
      })]),
      source('device-B', 'epoch-B', [cardRecord({
        mutationId: 'mutation-B',
        aggregateId: 'card-1',
        revision: 'revision-B',
        causalBaseRevision: 'revision-base',
        logicalTime: 3,
      })]),
    ]);

    expect(result.conflicts).toEqual([
      expect.objectContaining({
        aggregateType: 'card',
        aggregateId: 'card-1',
        reason: 'non-commutative-concurrent-mutations',
        mutationIds: ['mutation-A', 'mutation-B'],
      }),
    ]);
    expect(result.blockedAggregateIds).toEqual(['card:card-1']);
    expect(result.acceptedMutationIds).toEqual(['mutation-A', 'mutation-B']);
  });

  it('retains a causally newer tombstone as effective card state', () => {
    const update = cardRecord({
      mutationId: 'mutation-update',
      aggregateId: 'card-1',
      revision: 'revision-update',
      causalBaseRevision: null,
      logicalTime: 1,
    });
    const tombstone = cardRecord({
      mutationId: 'mutation-delete',
      aggregateId: 'card-1',
      revision: 'revision-delete',
      causalBaseRevision: 'revision-update',
      logicalTime: 2,
      type: 'card-aggregate.tombstone.v1',
    });
    const result = reconcileWorkerTruthRecords([
      source('device-A', 'epoch-A', [update, tombstone]),
      source('device-B', 'epoch-B', [structuredClone(update)]),
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.effectiveCardRecords).toEqual([
      expect.objectContaining({
        mutationId: 'mutation-delete',
        type: 'card-aggregate.tombstone.v1',
      }),
    ]);
  });

  it('deterministically merges proven commutative Queue changes', () => {
    const result = reconcileWorkerTruthRecords([
      source('device-A', 'epoch-A', [queueRecord({
        mutationId: 'queue-mutation-A',
        revision: 'queue-revision-A',
        causalBaseRevision: 'queue-base',
        logicalTime: 2,
        cardId: 'card-A',
      })]),
      source('device-B', 'epoch-B', [queueRecord({
        mutationId: 'queue-mutation-B',
        revision: 'queue-revision-B',
        causalBaseRevision: 'queue-base',
        logicalTime: 3,
        cardId: 'card-B',
      })]),
    ]);

    expect(result.conflicts).toEqual([]);
    expect(result.mergeDecisions).toEqual([
      expect.objectContaining({
        aggregateType: 'queue',
        aggregateId: 'retrieval-practice',
        policy: 'commutative-distinct-queue-members',
        mutationIds: ['queue-mutation-A', 'queue-mutation-B'],
      }),
    ]);
    expect(result.effectiveQueueRecords.map((record) => record.mutationId)).toEqual([
      'queue-mutation-A',
      'queue-mutation-B',
    ]);
  });
});
