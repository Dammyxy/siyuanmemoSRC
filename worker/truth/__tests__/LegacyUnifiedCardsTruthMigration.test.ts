import { encode } from '@msgpack/msgpack';
import { describe, expect, it, vi } from 'vitest';
import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
} from '../../../packages/contracts/src/backend-rpc';
import { CardState, CardType, Rating } from '@/types/card';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';
import {
  migrateLegacyUnifiedCardsToCardMemoryTruth,
  type LegacyUnifiedCardsTruthMigrationFileStore,
} from '../LegacyUnifiedCardsTruthMigration';
import {
  LEGACY_SPLIT_CARDS_SOURCE_PATH,
  LEGACY_SPLIT_XIUYUAN_SOURCE_PATH,
  LEGACY_UNIFIED_CARDS_SOURCE_PATH,
} from '../LegacyUnifiedCardsSource';
import type { LegacyUnifiedCardsMigrationReceipt } from '../LegacyUnifiedCardsMigrationReceipt';

class MemoryMigrationFileStore implements MessagePackTruthSegmentFileStore, LegacyUnifiedCardsTruthMigrationFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();
  readonly operations: Array<{ type: 'read-binary' | 'write-binary' | 'read-json' | 'write-json'; path: string }> = [];

  async readJSON<T>(fileName: string): Promise<T | null> {
    this.operations.push({ type: 'read-json', path: fileName });
    return (this.jsonFiles.get(fileName) as T | undefined) ?? null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.operations.push({ type: 'write-json', path: fileName });
    this.jsonFiles.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    this.operations.push({ type: 'read-binary', path: fileName });
    const bytes = this.binaryFiles.get(fileName);
    return bytes ? new Uint8Array(bytes) : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.operations.push({ type: 'write-binary', path: fileName });
    this.binaryFiles.set(fileName, new Uint8Array(bytes));
  }

  async listFiles(prefix: string): Promise<string[]> {
    return [
      ...Array.from(this.jsonFiles.keys()),
      ...Array.from(this.binaryFiles.keys()),
    ].filter((path) => path.startsWith(prefix));
  }
}

function createCardMemoryTruthStore(fileStore: MemoryMigrationFileStore) {
  return createMessagePackTruthSegmentStore({
    fileStore,
    family: 'card-memory-facts',
    deviceId: 'device-A',
    generationId: 'card-memory-facts-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    maxSegmentBytes: 4096,
  });
}

function createReviewEventTruthStore(fileStore: MemoryMigrationFileStore) {
  return createMessagePackTruthSegmentStore({
    fileStore,
    family: 'review-events',
    deviceId: 'device-A',
    generationId: 'review-events-v1',
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    maxSegmentBytes: 4096,
  });
}

describe('LegacyUnifiedCardsTruthMigration', () => {
  it('migrates no-truth unified-cards snapshot to card-memory-facts truth and completed receipt', async () => {
    const fileStore = new MemoryMigrationFileStore();
    const card = {
      id: 'card-active-a',
      xiuyuanID: 'xy-active-a',
      blockId: 'block-active-a',
      due: 1_700_086_400_000,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      state: CardState.New,
      lastReview: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      priority: 42,
      type: CardType.Item,
      tags: ['legacy', 'snapshot'],
      leechCount: 0,
      isLeech: false,
      skipped: false,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_010_000,
      schedulerType: 'fsrs-v6',
      meta: {
        faceKey: { ruleId: 'basic-front', faceIndex: 0 },
        sourceHash: 'legacy-source-hash-a',
      },
    };
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      xiuyuans: {},
      cards: {
        [card.id]: card,
      },
      cardDTOs: {},
      deletedCardDTOs: {
        'card-deleted-a': {
          deletedAt: 1_700_000_020_000,
          deletedBy: 'device-old',
        },
      },
      deletedXiuyuans: {},
      riffBlacklist: [],
      riffSyncState: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_000_030_000,
    });

    expect(result).toMatchObject({
      status: 'migrated',
      counts: {
        activeCards: 1,
        tombstones: 1,
        sourceBindings: 1,
        reviewEvents: 0,
      },
      recordsWritten: 3,
    });
    expect(fileStore.operations.find((operation) => operation.type === 'read-binary')).toEqual({
      type: 'read-binary',
      path: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
    });
    const replay = await truthStore.replayRecords();
    expect(replay.records.map((record) => record.type).sort()).toEqual([
      'card-memory.snapshot-imported',
      'card-memory.tombstone-imported',
      'source-binding.snapshot-imported',
    ]);
    expect(replay.records.map((record) => record.type)).not.toContain('card-memory.created.v1');
    const snapshotRecord = replay.records.find((record) => record.type === 'card-memory.snapshot-imported');
    const bindingRecord = replay.records.find((record) => record.type === 'source-binding.snapshot-imported');
    const tombstoneRecord = replay.records.find((record) => record.type === 'card-memory.tombstone-imported');
    expect(snapshotRecord).toMatchObject({
      family: 'card-memory-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      source: {
        cardId: 'card-active-a',
        blockId: 'block-active-a',
        xiuyuanId: 'xy-active-a',
      },
      memory: {
        schedulerOwner: 'fsrs-v6',
        lineage: {
          type: CardType.Item,
          state: CardState.New,
          due: 1_700_086_400_000,
          priority: 42,
          tags: ['legacy', 'snapshot'],
        },
      },
    });
    expect(bindingRecord).toMatchObject({
      type: 'source-binding.snapshot-imported',
      source: {
        cardId: 'card-active-a',
        sourceBlockId: 'block-active-a',
        xiuyuanId: 'xy-active-a',
        sourceHash: 'legacy-source-hash-a',
      },
    });
    expect(tombstoneRecord).toMatchObject({
      type: 'card-memory.tombstone-imported',
      source: {
        cardId: 'card-deleted-a',
      },
      memory: {
        lineage: {
          deletedAt: 1_700_000_020_000,
          deletedBy: 'device-old',
        },
      },
    });
    for (const record of replay.records) {
      expect(record.idempotencyKey).toEqual(expect.stringContaining(result.source.sha256));
    }

    const receipt = fileStore.jsonFiles.get(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH) as LegacyUnifiedCardsMigrationReceipt;
    expect(receipt).toMatchObject({
      status: 'completed',
      source: {
        file: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
        sha256: result.source.sha256,
        byteLength: result.source.byteLength,
      },
      counts: result.counts,
      families: [{
        family: 'card-memory-facts',
        generationId: 'card-memory-facts-v1',
        recordCount: 3,
        segmentRefs: [expect.stringMatching(/^truth\/card-memory-facts\/card-memory-facts-v1\/device-device-A\/seg-/)],
      }],
    });
  });

  it('preserves unreviewed empty memory and repairs reviewed empty memory with diagnostics', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {
        'card-new-empty': {
          id: 'card-new-empty',
          xiuyuanID: 'xy-new-empty',
          blockId: 'block-new-empty',
          due: 1_700_086_400_000,
          reps: 0,
          lapses: 0,
          state: CardState.New,
          lastReview: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
        'card-review-empty': {
          id: 'card-review-empty',
          xiuyuanID: 'xy-review-empty',
          blockId: 'block-review-empty',
          due: 1_700_172_800_000,
          stability: 0,
          difficulty: 0,
          reps: 3,
          lapses: 1,
          state: CardState.Review,
          lastReview: 1_700_000_000_000,
          elapsedDays: 2,
          scheduledDays: 2,
          type: CardType.Item,
          schedulerType: 'fsrs-v6',
        },
      },
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    });

    const replay = await truthStore.replayRecords();
    const snapshots = replay.records.filter((record) => record.type === 'card-memory.snapshot-imported');
    const newSnapshot = snapshots.find((record) => record.source.cardId === 'card-new-empty');
    const reviewedSnapshot = snapshots.find((record) => record.source.cardId === 'card-review-empty');
    expect(newSnapshot).toMatchObject({
      memory: {
        lineage: {
          state: CardState.New,
          stability: 0,
          difficulty: 0,
        },
      },
    });
    expect(reviewedSnapshot).toMatchObject({
      memory: {
        lineage: {
          state: CardState.Review,
          stability: 1.2931,
          difficulty: 5.11217071,
        },
      },
    });
    expect(result.receipt.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'repaired-scheduling-memory',
        severity: 'warning',
        details: expect.objectContaining({
          cardId: 'card-review-empty',
          state: CardState.Review,
          originalStability: 0,
          originalDifficulty: 0,
          repairedStability: 1.2931,
          repairedDifficulty: 5.11217071,
          reason: 'reviewed-empty-memory',
        }),
      }),
    ]);
  });

  it('reports split legacy source diagnostics only when unified-cards is absent', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_SPLIT_CARDS_SOURCE_PATH, new Uint8Array([1, 2, 3]));
    fileStore.binaryFiles.set(LEGACY_SPLIT_XIUYUAN_SOURCE_PATH, new Uint8Array([4, 5]));
    const truthStore = createCardMemoryTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    });

    expect(result.status).toBe('source-absent');
    if (result.status !== 'source-absent') {
      throw new Error(`expected source-absent, got ${result.status}`);
    }
    expect(fileStore.operations).toEqual([
      { type: 'read-binary', path: LEGACY_UNIFIED_CARDS_SOURCE_PATH },
      { type: 'read-binary', path: LEGACY_SPLIT_CARDS_SOURCE_PATH },
      { type: 'read-binary', path: LEGACY_SPLIT_XIUYUAN_SOURCE_PATH },
    ]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'legacy-split-source-fallback',
        severity: 'info',
        details: expect.objectContaining({
          sourceFile: LEGACY_SPLIT_CARDS_SOURCE_PATH,
          byteLength: 3,
          reason: 'unified-source-absent',
        }),
      }),
      expect.objectContaining({
        kind: 'legacy-split-source-fallback',
        severity: 'info',
        details: expect.objectContaining({
          sourceFile: LEGACY_SPLIT_XIUYUAN_SOURCE_PATH,
          byteLength: 2,
          reason: 'unified-source-absent',
        }),
      }),
    ]);
    expect(fileStore.operations.some((operation) => operation.type === 'write-binary' || operation.type === 'write-json')).toBe(false);
  });

  it('fails closed without a completed receipt when card-memory truth commit fails', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {
        'card-active-a': {
          id: 'card-active-a',
          blockId: 'block-active-a',
          state: CardState.New,
          reps: 0,
          stability: 0,
          difficulty: 0,
          schedulerType: 'fsrs-v6',
        },
      },
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    const truthStore = createCardMemoryTruthStore(fileStore);
    truthStore.appendRecords = vi.fn(async () => {
      throw new Error('segment manifest commit failed');
    });

    await expect(migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore,
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_700_259_200_000,
    })).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_FAILED',
    });
    expect(fileStore.jsonFiles.has(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)).toBe(false);
    expect(fileStore.operations.some((operation) => operation.type === 'write-json')).toBe(false);
  });

  it('imports formal legacy reviewLogs and reviewLogsV2 into review-events truth with stable idempotency identities', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    fileStore.jsonFiles.set('review-logs/2024-03.json', {
      reviewLogs: [{
        id: 'legacy-review-1',
        cardId: 'card-legacy-review',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 7,
        elapsedDays: 6,
        review: Date.UTC(2024, 2, 15, 8),
        stability: 4.5,
        difficulty: 5.5,
      }],
      reviewLogsV2: [
        {
          schemaVersion: 2,
          id: 'legacy-v2-commit',
          attemptId: 'attempt-commit',
          cardId: 'card-v2-commit',
          rating: Rating.Easy,
          reviewedAt: Date.UTC(2024, 2, 16, 9),
          commitIdempotencyKey: 'commit-key-from-legacy',
          queueType: 'retrieval-practice',
          queueMode: 'formal',
          algorithm: 'fsrs-v6',
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          before: { id: 'card-v2-commit' },
          after: { id: 'card-v2-commit' },
          isDrill: false,
          isFiltered: false,
          customStudy: false,
        },
        {
          schemaVersion: 2,
          id: 'legacy-v2-attempt',
          attemptId: 'attempt-only',
          cardId: 'card-v2-attempt',
          rating: Rating.Hard,
          reviewedAt: Date.UTC(2024, 2, 17, 10),
          queueType: 'manual',
          queueMode: 'formal',
          algorithm: 'fsrs-v6',
          schedulerType: 'fsrs-v6',
          commitPolicy: 'write-schedule',
          before: { id: 'card-v2-attempt' },
          after: { id: 'card-v2-attempt' },
          isDrill: false,
          isFiltered: false,
          customStudy: false,
        },
      ],
      drillLogsV2: [],
      rescheduleLogs: [],
    });
    const cardTruthStore = createCardMemoryTruthStore(fileStore);
    const reviewTruthStore = createReviewEventTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore: cardTruthStore,
      reviewLogFileStore: fileStore,
      reviewTruthStore,
      reviewGenerationId: 'review-events-v1',
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_711_000_000_000,
    });

    const replay = await reviewTruthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records.map((record) => record.idempotencyKey)).toEqual([
      `legacy-review-log:2024-03:card-legacy-review:${Date.UTC(2024, 2, 15, 8)}:${Rating.Good}:0`,
      'commit-key-from-legacy',
      'attempt-only',
    ]);
    expect(replay.records).toMatchObject([
      {
        family: 'review-events',
        type: 'review.feedback.v1',
        source: {
          cardId: 'card-legacy-review',
        },
        review: {
          action: 'rating',
          rating: Rating.Good,
          reviewedAt: Date.UTC(2024, 2, 15, 8),
        },
        legacyLineage: {
          sourceFile: 'review-logs/2024-03.json',
          sourceCollection: 'reviewLogs',
          yearMonth: '2024-03',
        },
      },
      {
        source: {
          cardId: 'card-v2-commit',
        },
        review: {
          rating: Rating.Easy,
          scheduler: 'fsrs-v6',
        },
        queue: {
          queueType: 'retrieval-practice',
          queueMode: 'formal',
          commitPolicy: 'write-schedule',
        },
      },
      {
        source: {
          cardId: 'card-v2-attempt',
        },
        review: {
          rating: Rating.Hard,
        },
      },
    ]);
    expect(result.counts.reviewEvents).toBe(3);
    expect(result.receipt.families).toEqual([
      expect.objectContaining({
        family: 'card-memory-facts',
        recordCount: 0,
      }),
      expect.objectContaining({
        family: 'review-events',
        generationId: 'review-events-v1',
        recordCount: 3,
        segmentRefs: [expect.stringMatching(/^truth\/review-events\/review-events-v1\/device-device-A\/seg-/)],
      }),
    ]);
    expect(result.receipt.diagnostics).toEqual([]);
  });

  it('skips drillLogsV2 and rescheduleLogs with skipped-count diagnostics', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    fileStore.jsonFiles.set('review-logs/2024-04.json', {
      reviewLogsV2: [{
        schemaVersion: 2,
        id: 'formal-1',
        attemptId: 'formal-attempt-1',
        cardId: 'card-formal',
        rating: Rating.Good,
        reviewedAt: Date.UTC(2024, 3, 2, 8),
        queueMode: 'formal',
        algorithm: 'fsrs-v6',
        schedulerType: 'fsrs-v6',
        commitPolicy: 'write-schedule',
        before: { id: 'card-formal' },
        after: { id: 'card-formal' },
        isDrill: false,
        isFiltered: false,
        customStudy: false,
      }],
      drillLogsV2: [
        {
          schemaVersion: 2,
          id: 'drill-1',
          cardId: 'card-drill-1',
          rating: Rating.Again,
          reviewedAt: Date.UTC(2024, 3, 2, 9),
          queueType: 'final-drill',
          action: 'moved-to-back',
          isDrill: true,
        },
        {
          schemaVersion: 2,
          id: 'drill-2',
          cardId: 'card-drill-2',
          rating: Rating.Easy,
          reviewedAt: Date.UTC(2024, 3, 2, 10),
          queueType: 'final-drill',
          action: 'removed',
          isDrill: true,
        },
      ],
      rescheduleLogs: [{
        ts: Date.UTC(2024, 3, 2, 11),
        action: 'postpone',
        source: 'browser',
        targets: ['card-reschedule'],
        result: { updated: 1, skipped: 0 },
        sample: [{ cardId: 'card-reschedule', newDue: '2024-04-05' }],
      }],
    });
    const cardTruthStore = createCardMemoryTruthStore(fileStore);
    const reviewTruthStore = createReviewEventTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore: cardTruthStore,
      reviewLogFileStore: fileStore,
      reviewTruthStore,
      reviewGenerationId: 'review-events-v1',
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_711_000_000_000,
    });

    const replay = await reviewTruthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records).toHaveLength(1);
    expect(replay.records[0]).toMatchObject({
      source: { cardId: 'card-formal' },
      idempotencyKey: 'formal-attempt-1',
    });
    expect(result.counts.reviewEvents).toBe(1);
    expect(result.receipt.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'skipped-non-formal-review-log',
        severity: 'info',
        details: expect.objectContaining({
          sourceFile: 'review-logs/2024-04.json',
          yearMonth: '2024-04',
          drillLogsV2: 2,
          rescheduleLogs: 1,
          skippedCount: 3,
        }),
      }),
    ]);
  });

  it('quarantines malformed formal review logs without writing review-event truth', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    fileStore.jsonFiles.set('review-logs/2024-05.json', {
      reviewLogs: [
        {
          id: 'valid-review',
          cardId: 'card-valid',
          rating: Rating.Good,
          state: CardState.Review,
          scheduledDays: 7,
          elapsedDays: 7,
          review: Date.UTC(2024, 4, 3, 8),
          stability: 4.5,
          difficulty: 5.5,
        },
        {
          id: 'missing-card-id',
          rating: Rating.Good,
          state: CardState.Review,
          review: Date.UTC(2024, 4, 3, 9),
        },
      ],
      reviewLogsV2: [{
        schemaVersion: 2,
        id: 'missing-reviewed-at',
        attemptId: 'attempt-missing-reviewed-at',
        cardId: 'card-missing-reviewed-at',
        rating: Rating.Good,
        queueMode: 'formal',
        algorithm: 'fsrs-v6',
        schedulerType: 'fsrs-v6',
        commitPolicy: 'write-schedule',
        before: { id: 'card-missing-reviewed-at' },
        after: { id: 'card-missing-reviewed-at' },
        isDrill: false,
        isFiltered: false,
        customStudy: false,
      }],
      drillLogsV2: [],
      rescheduleLogs: [],
    });
    const cardTruthStore = createCardMemoryTruthStore(fileStore);
    const reviewTruthStore = createReviewEventTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore: cardTruthStore,
      reviewLogFileStore: fileStore,
      reviewTruthStore,
      reviewGenerationId: 'review-events-v1',
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_711_000_000_000,
    });

    const replay = await reviewTruthStore.replayRecords({ dedupeByIdempotencyKey: true });
    expect(replay.records).toHaveLength(1);
    expect(replay.records[0]).toMatchObject({
      source: { cardId: 'card-valid' },
      legacyLineage: {
        sourceFile: 'review-logs/2024-05.json',
        sourceCollection: 'reviewLogs',
      },
    });
    expect(result.receipt.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'quarantined-review-log',
        severity: 'warning',
        details: expect.objectContaining({
          sourceFile: 'review-logs/2024-05.json',
          sourceCollection: 'reviewLogs',
          legacyId: 'missing-card-id',
          reason: 'missing-card-id',
        }),
      }),
      expect.objectContaining({
        kind: 'quarantined-review-log',
        severity: 'warning',
        details: expect.objectContaining({
          sourceFile: 'review-logs/2024-05.json',
          sourceCollection: 'reviewLogsV2',
          legacyId: 'missing-reviewed-at',
          reason: 'missing-reviewed-at',
        }),
      }),
    ]);
  });

  it('writes review-event counts quarantine skipped counts segment refs and diagnostics to completed receipt', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    fileStore.jsonFiles.set('review-logs/2024-06.json', {
      reviewLogs: [
        {
          id: 'valid-review-a',
          cardId: 'card-valid-a',
          rating: Rating.Good,
          state: CardState.Review,
          scheduledDays: 7,
          elapsedDays: 7,
          review: Date.UTC(2024, 5, 4, 8),
          stability: 4.5,
          difficulty: 5.5,
        },
        {
          id: 'missing-card-id',
          rating: Rating.Good,
          state: CardState.Review,
          review: Date.UTC(2024, 5, 4, 9),
        },
      ],
      reviewLogsV2: [{
        schemaVersion: 2,
        id: 'valid-review-b',
        attemptId: 'valid-attempt-b',
        cardId: 'card-valid-b',
        rating: Rating.Easy,
        reviewedAt: Date.UTC(2024, 5, 4, 10),
        queueMode: 'formal',
        algorithm: 'fsrs-v6',
        schedulerType: 'fsrs-v6',
        commitPolicy: 'write-schedule',
        before: { id: 'card-valid-b' },
        after: { id: 'card-valid-b' },
        isDrill: false,
        isFiltered: false,
        customStudy: false,
      }],
      drillLogsV2: [{
        schemaVersion: 2,
        id: 'drill-1',
        cardId: 'card-drill',
        rating: Rating.Again,
        reviewedAt: Date.UTC(2024, 5, 4, 11),
        queueType: 'final-drill',
        action: 'retained',
        isDrill: true,
      }],
      rescheduleLogs: [{
        ts: Date.UTC(2024, 5, 4, 12),
        action: 'advance',
        source: 'browser',
        targets: ['card-reschedule'],
        result: { updated: 1, skipped: 0 },
        sample: [{ cardId: 'card-reschedule', newDue: '2024-06-05' }],
      }],
    });
    const cardTruthStore = createCardMemoryTruthStore(fileStore);
    const reviewTruthStore = createReviewEventTruthStore(fileStore);

    const result = await migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore: cardTruthStore,
      reviewLogFileStore: fileStore,
      reviewTruthStore,
      reviewGenerationId: 'review-events-v1',
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_711_000_000_000,
    });

    expect(result.receipt.counts).toMatchObject({
      reviewEvents: 2,
      quarantinedReviewLogs: 1,
      skippedDrillLogsV2: 1,
      skippedRescheduleLogs: 1,
    });
    expect(result.receipt.families).toEqual([
      expect.objectContaining({
        family: 'card-memory-facts',
      }),
      expect.objectContaining({
        family: 'review-events',
        generationId: 'review-events-v1',
        recordCount: 2,
        segmentRefs: [expect.stringMatching(/^truth\/review-events\/review-events-v1\/device-device-A\/seg-/)],
      }),
    ]);
    expect(result.receipt.diagnostics).toEqual([
      expect.objectContaining({ kind: 'skipped-non-formal-review-log' }),
      expect.objectContaining({ kind: 'quarantined-review-log' }),
    ]);
  });

  it('fails closed without a completed receipt when review-events truth commit fails', async () => {
    const fileStore = new MemoryMigrationFileStore();
    fileStore.binaryFiles.set(LEGACY_UNIFIED_CARDS_SOURCE_PATH, encode({
      version: 2,
      cards: {},
      cardDTOs: {},
      deletedCardDTOs: {},
    }));
    fileStore.jsonFiles.set('review-logs/2024-07.json', {
      reviewLogs: [{
        id: 'review-fail',
        cardId: 'card-review-fail',
        rating: Rating.Good,
        state: CardState.Review,
        scheduledDays: 7,
        elapsedDays: 7,
        review: Date.UTC(2024, 6, 5, 8),
        stability: 4.5,
        difficulty: 5.5,
      }],
      drillLogsV2: [],
      rescheduleLogs: [],
    });
    const cardTruthStore = createCardMemoryTruthStore(fileStore);
    const reviewTruthStore = createReviewEventTruthStore(fileStore);
    reviewTruthStore.appendRecords = vi.fn(async () => {
      throw new Error('review segment manifest commit failed');
    });

    await expect(migrateLegacyUnifiedCardsToCardMemoryTruth({
      sourceFileStore: fileStore,
      receiptFileStore: fileStore,
      truthStore: cardTruthStore,
      reviewLogFileStore: fileStore,
      reviewTruthStore,
      reviewGenerationId: 'review-events-v1',
      truthExists: false,
      localDeviceId: 'device-A',
      generationId: 'card-memory-facts-v1',
      truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      now: () => 1_711_000_000_000,
    })).rejects.toMatchObject({
      code: 'LEGACY_MIGRATION_FAILED',
    });
    expect(fileStore.jsonFiles.has(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH)).toBe(false);
  });
});
