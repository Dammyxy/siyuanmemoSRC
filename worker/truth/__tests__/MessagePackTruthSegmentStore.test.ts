import { describe, expect, it } from 'vitest';
import {
  buildMessagePackTruthLocalSegmentIndex,
  createMessagePackTruthSegmentStore,
  MessagePackTruthValidationError,
  replayMessagePackTruthRemoteSegments,
  type MessagePackTruthSegmentFileStore,
} from '../MessagePackTruthSegmentStore';

class MemoryTruthSegmentFileStore implements MessagePackTruthSegmentFileStore {
  readonly jsonFiles = new Map<string, unknown>();
  readonly binaryFiles = new Map<string, Uint8Array>();
  readonly operations: Array<{ type: 'read-json' | 'write-json' | 'read-binary' | 'write-binary'; path: string }> = [];

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

function createStore(fileStore = new MemoryTruthSegmentFileStore(), maxSegmentBytes = 640) {
  return createMessagePackTruthSegmentStore({
    fileStore,
    family: 'review-events',
    deviceId: 'device-A',
    generationId: 'projection-gen-1',
    schemaVersion: 1,
    maxSegmentBytes,
  });
}

function record(id: string, logicalTime: number, payloadSize = 72) {
  return {
    id,
    logicalTime,
    idempotencyKey: `review:${id}`,
    payload: {
      cardId: `card-${id}`,
      body: 'x'.repeat(payloadSize),
    },
  };
}

describe('MessagePackTruthSegmentStore', () => {
  it('writes bounded device-owned immutable segments and manifest metadata', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createStore(fileStore);

    const result = await store.appendRecords([
      record('a', 10),
      record('b', 20),
      record('c', 30),
      record('d', 40),
      record('e', 50),
    ]);

    expect(result.segments.length).toBeGreaterThan(1);
    expect(result.manifest.path).toBe('truth/review-events/projection-gen-1/device-device-A/manifest.v1.json');
    expect(result.manifest.segments).toHaveLength(result.segments.length);
    expect(fileStore.jsonFiles.has('truth/review-events/projection-gen-1/device-device-A/manifest.v1.json')).toBe(true);
    expect(Array.from(fileStore.jsonFiles.keys()).some((path) => path.includes('global'))).toBe(false);
    for (const entry of result.manifest.segments) {
      expect(entry).toMatchObject({
        family: 'review-events',
        deviceId: 'device-A',
        generationId: 'projection-gen-1',
        schemaVersion: 1,
        checksum: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        recordCount: expect.any(Number),
        byteSize: expect.any(Number),
      });
      expect(entry.path).toMatch(/^truth\/review-events\/projection-gen-1\/device-device-A\/seg-\d{6}-[a-z0-9-]+\.msgpack$/);
      expect(entry.byteSize).toBeLessThanOrEqual(640);
      expect(fileStore.binaryFiles.has(entry.path)).toBe(true);
      expect(fileStore.jsonFiles.get(`${entry.path}.checksum.json`)).toMatchObject({
        path: entry.path,
        checksum: entry.checksum,
      });
    }
  });

  it('commits segment, checksum sidecar, then manifest and reports orphan segments without applying them', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createStore(fileStore, 1024);

    const append = await store.appendRecords([record('a', 10)]);
    const segmentPath = append.segments[0].path;
    const checksumPath = `${segmentPath}.checksum.json`;
    const writeOperations = fileStore.operations.filter((operation) => operation.type.startsWith('write'));

    expect(writeOperations.map((operation) => [operation.type, operation.path])).toEqual([
      ['write-binary', segmentPath],
      ['write-json', checksumPath],
      ['write-json', 'truth/review-events/projection-gen-1/device-device-A/manifest.v1.json'],
    ]);
    expect(fileStore.jsonFiles.get(checksumPath)).toMatchObject({
      path: segmentPath,
      checksum: append.segments[0].checksum,
    });

    fileStore.binaryFiles.set(
      'truth/review-events/projection-gen-1/device-device-A/seg-999999-orphan.msgpack',
      new Uint8Array(fileStore.binaryFiles.get(segmentPath)!),
    );

    const replay = await store.replayRecords();

    expect(replay.records.map((entry) => entry.id)).toEqual(['a']);
    expect(replay.diagnostics).toEqual([
      expect.objectContaining({
        reason: 'orphan-segment',
        path: 'truth/review-events/projection-gen-1/device-device-A/seg-999999-orphan.msgpack',
      }),
    ]);
  });

  it('writes schema upgrades to a new generation manifest without mutating the previous generation', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const generationV1 = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'review-events-v1',
      schemaVersion: 1,
      maxSegmentBytes: 1024,
    });
    const generationV2 = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'review-events-v2',
      schemaVersion: 2,
      maxSegmentBytes: 1024,
    });

    const appendV1 = await generationV1.appendRecords([record('v1', 10)]);
    const appendV2 = await generationV2.appendRecords([record('v2', 20)]);

    expect(appendV1.manifest.path).toBe('truth/review-events/review-events-v1/device-device-A/manifest.v1.json');
    expect(appendV2.manifest.path).toBe('truth/review-events/review-events-v2/device-device-A/manifest.v1.json');
    expect(appendV1.manifest.segments).toHaveLength(1);
    expect(appendV2.manifest.segments).toHaveLength(1);
    expect(fileStore.jsonFiles.get(appendV1.manifest.path)).toMatchObject({
      generationId: 'review-events-v1',
      segments: [expect.objectContaining({ generationId: 'review-events-v1' })],
    });
    expect(fileStore.jsonFiles.get(appendV2.manifest.path)).toMatchObject({
      generationId: 'review-events-v2',
      segments: [expect.objectContaining({ generationId: 'review-events-v2' })],
    });

    await expect(generationV1.replayRecords()).resolves.toMatchObject({
      records: [expect.objectContaining({ id: 'v1' })],
    });
    await expect(generationV2.replayRecords()).resolves.toMatchObject({
      records: [expect.objectContaining({ id: 'v2' })],
    });
  });

  it('uses first-family storage policy defaults when caller omits segment and compaction budgets', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
    });

    const result = await store.appendRecords([
      record('large-a', 10, 600 * 1024),
      record('large-b', 20, 600 * 1024),
    ]);
    const plan = await store.planCompaction({});

    expect(result.segments).toHaveLength(2);
    expect(result.segments.every((segment) => segment.byteSize <= 1024 * 1024)).toBe(true);
    expect(plan).toMatchObject({
      eligible: false,
      reason: 'within-budget',
    });
  });

  it('rejects appending to another device-owned segment path', async () => {
    const store = createStore();

    await expect(store.appendRecords([record('a', 10)], { targetDeviceId: 'device-B' }))
      .rejects
      .toThrow(/device-owned segment violation/);
  });

  it('replays records in segment order and dedupes idempotency keys', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createStore(fileStore, 1024);
    await store.appendRecords([
      { ...record('second', 20), idempotencyKey: 'same-key' },
      record('first', 10),
    ]);
    await store.appendRecords([
      { ...record('duplicate', 30), idempotencyKey: 'same-key' },
      record('third', 40),
    ]);

    const replay = await store.replayRecords({ dedupeByIdempotencyKey: true });

    expect(replay.records.map((entry) => entry.id)).toEqual(['first', 'second', 'third']);
    expect(replay.skippedDuplicateCount).toBe(1);
    expect(replay.manifest.segments.map((segment) => segment.sequence)).toEqual([1, 2]);
  });

  it('reports checksum, schema, and device validation failures explicitly', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createStore(fileStore, 1024);
    const append = await store.appendRecords([record('a', 10)]);
    const segmentPath = append.segments[0].path;
    const originalSegment = fileStore.binaryFiles.get(segmentPath)!;
    const tamperedSegment = new Uint8Array(originalSegment);
    tamperedSegment[tamperedSegment.length - 1] = tamperedSegment[tamperedSegment.length - 1] ^ 1;
    fileStore.binaryFiles.set(segmentPath, tamperedSegment);

    await expect(store.replayRecords()).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ reason: 'checksum-mismatch' })],
    });

    fileStore.binaryFiles.set(segmentPath, originalSegment);
    const schemaReader = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 2,
      maxSegmentBytes: 1024,
    });
    await expect(schemaReader.replayRecords()).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ reason: 'schema-version-mismatch' })],
    });

    const manifestPath = append.manifest.path;
    const manifest = structuredClone(fileStore.jsonFiles.get(manifestPath)) as Record<string, unknown>;
    manifest.deviceId = 'device-B';
    fileStore.jsonFiles.set(manifestPath, manifest);
    await expect(store.replayRecords()).rejects.toMatchObject({
      diagnostics: [expect.objectContaining({ reason: 'manifest-device-mismatch' })],
    });
  });

  it('plans compaction from closed immutable segments without writing a global manifest', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const store = createStore(fileStore, 1024);
    await store.appendRecords([record('a', 10)]);
    await store.appendRecords([record('b', 20)]);
    await store.appendRecords([record('c', 30)]);

    const plan = await store.planCompaction({ maxClosedSegments: 2 });

    expect(plan.eligible).toBe(true);
    expect(plan.reason).toBe('closed-segment-count-exceeded');
    expect(plan.candidateSegments.map((segment) => segment.sequence)).toEqual([1, 2]);
    expect(Array.from(fileStore.jsonFiles.keys()).some((path) => path.includes('global'))).toBe(false);
  });

  it('builds a local global index from per-device manifests without a shared write target', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const deviceA = createStore(fileStore, 1024);
    const deviceB = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-B',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 1024,
    });
    const appendA = await deviceA.appendRecords([record('a', 20)]);
    const appendB = await deviceB.appendRecords([record('b', 10)]);

    const index = buildMessagePackTruthLocalSegmentIndex([appendA.manifest, appendB.manifest]);

    expect(index.diagnostics).toEqual([]);
    expect(index.segments.map((segment) => [segment.deviceId, segment.sequence])).toEqual([
      ['device-B', 1],
      ['device-A', 1],
    ]);
    const jsonPaths = Array.from(fileStore.jsonFiles.keys()).sort();
    expect(jsonPaths).toContain('truth/review-events/projection-gen-1/device-device-A/manifest.v1.json');
    expect(jsonPaths).toContain('truth/review-events/projection-gen-1/device-device-B/manifest.v1.json');
    expect(jsonPaths.some((path) => path.includes('global'))).toBe(false);
  });

  it('discovers and replays remote Review segments with idempotency and base-memory conflict diagnostics', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const deviceA = createStore(fileStore, 2048);
    const deviceB = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'review-events',
      deviceId: 'device-B',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 2048,
    });
    const appendA = await deviceA.appendRecords([
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        idempotencyKey: 'review:same',
        logicalTime: 10,
        recordedAt: 10,
        source: { cardId: 'card-a' },
        review: { action: 'rating', rating: 3, reviewedAt: 10 },
        memory: { baseMemoryHash: 'hash-a', afterMemoryHash: 'hash-b', projectionGeneration: 1 },
      },
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        idempotencyKey: 'review:conflict',
        logicalTime: 20,
        recordedAt: 20,
        source: { cardId: 'card-a' },
        review: { action: 'rating', rating: 4, reviewedAt: 20 },
        memory: { baseMemoryHash: 'hash-b', afterMemoryHash: 'hash-c', projectionGeneration: 2 },
      },
    ]);
    const appendB = await deviceB.appendRecords([
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        idempotencyKey: 'review:same',
        logicalTime: 11,
        recordedAt: 11,
        source: { cardId: 'card-a' },
        review: { action: 'rating', rating: 3, reviewedAt: 11 },
        memory: { baseMemoryHash: 'hash-a', afterMemoryHash: 'hash-b', projectionGeneration: 1 },
      },
      {
        family: 'review-events',
        schemaVersion: 1,
        type: 'review.feedback.v1',
        idempotencyKey: 'review:offline',
        logicalTime: 21,
        recordedAt: 21,
        source: { cardId: 'card-a' },
        review: { action: 'rating', rating: 2, reviewedAt: 21 },
        memory: { baseMemoryHash: 'stale-base', afterMemoryHash: 'hash-d', projectionGeneration: 2 },
      },
    ]);

    const replay = await replayMessagePackTruthRemoteSegments({
      fileStore,
      manifests: [appendA.manifest, appendB.manifest],
      family: 'review-events',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      dedupeByIdempotencyKey: true,
      detectReviewConflicts: true,
    });

    expect(replay.validationDiagnostics).toEqual([]);
    expect(replay.acceptedRecords.map((entry) => entry.idempotencyKey)).toEqual([
      'review:same',
      'review:conflict',
    ]);
    expect(replay.duplicateRecords.map((entry) => entry.idempotencyKey)).toEqual(['review:same']);
    expect(replay.conflicts).toEqual([
      expect.objectContaining({
        reason: 'base-memory-mismatch',
        cardId: 'card-a',
        idempotencyKey: 'review:offline',
        expectedBaseMemoryHash: 'hash-c',
        actualBaseMemoryHash: 'stale-base',
      }),
    ]);
  });

  it('replays remote card creation and source-binding facts without treating duplicate ids as new facts', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const deviceA = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-A',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 2048,
    });
    const deviceB = createMessagePackTruthSegmentStore({
      fileStore,
      family: 'card-memory-facts',
      deviceId: 'device-B',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      maxSegmentBytes: 2048,
    });
    const appendA = await deviceA.appendRecords([
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.created.v1',
        idempotencyKey: 'card:create:card-a',
        logicalTime: 10,
        recordedAt: 10,
        source: { cardId: 'card-a', blockId: 'block-a', xiuyuanId: 'xy-a' },
        memory: { schedulerOwner: 'fsrs-v6', memoryHash: 'memory-a' },
      },
    ]);
    const appendB = await deviceB.appendRecords([
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'source-binding.created.v1',
        idempotencyKey: 'binding:create:card-a',
        logicalTime: 20,
        recordedAt: 20,
        source: { cardId: 'card-a', blockId: 'block-a', xiuyuanId: 'xy-a' },
        memory: { schedulerOwner: 'fsrs-v6', memoryHash: 'memory-a' },
      },
      {
        family: 'card-memory-facts',
        schemaVersion: 1,
        type: 'card-memory.created.v1',
        idempotencyKey: 'card:create:card-a',
        logicalTime: 30,
        recordedAt: 30,
        source: { cardId: 'card-a', blockId: 'block-a', xiuyuanId: 'xy-a' },
        memory: { schedulerOwner: 'fsrs-v6', memoryHash: 'memory-a' },
      },
    ]);

    const replay = await replayMessagePackTruthRemoteSegments({
      fileStore,
      manifests: [appendA.manifest, appendB.manifest],
      family: 'card-memory-facts',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      dedupeByIdempotencyKey: true,
    });

    expect(replay.acceptedRecords.map((entry) => entry.type)).toEqual([
      'card-memory.created.v1',
      'source-binding.created.v1',
    ]);
    expect(replay.duplicateRecords.map((entry) => entry.idempotencyKey)).toEqual(['card:create:card-a']);
    expect(replay.conflicts).toEqual([]);
  });

  it('reports remote manifest and segment validation failures without accepting corrupted records', async () => {
    const fileStore = new MemoryTruthSegmentFileStore();
    const deviceA = createStore(fileStore, 2048);
    const append = await deviceA.appendRecords([record('remote-corrupt', 10)]);
    const segmentPath = append.segments[0].path;
    const originalSegment = fileStore.binaryFiles.get(segmentPath)!;
    const corruptedSegment = new Uint8Array(originalSegment);
    corruptedSegment[corruptedSegment.length - 1] = corruptedSegment[corruptedSegment.length - 1] ^ 1;
    fileStore.binaryFiles.set(segmentPath, corruptedSegment);

    const replay = await replayMessagePackTruthRemoteSegments({
      fileStore,
      manifests: [append.manifest],
      family: 'review-events',
      generationId: 'projection-gen-1',
      schemaVersion: 1,
      dedupeByIdempotencyKey: true,
    });

    expect(replay.acceptedRecords).toEqual([]);
    expect(replay.validationDiagnostics).toEqual([
      expect.objectContaining({
        reason: 'checksum-mismatch',
        path: segmentPath,
      }),
    ]);

    const wrongGenerationReplay = await replayMessagePackTruthRemoteSegments({
      fileStore,
      manifests: [append.manifest],
      family: 'review-events',
      generationId: 'projection-gen-2',
      schemaVersion: 1,
      dedupeByIdempotencyKey: true,
    });

    expect(wrongGenerationReplay.acceptedRecords).toEqual([]);
    expect(wrongGenerationReplay.validationDiagnostics).toEqual([
      expect.objectContaining({
        reason: 'generation-mismatch',
        path: append.manifest.path,
      }),
    ]);
  });
});

describe('MessagePackTruthValidationError', () => {
  it('carries validation diagnostics for callers', () => {
    const error = new MessagePackTruthValidationError([
      { reason: 'checksum-mismatch', path: 'truth/review-events/projection-gen-1/device-device-A/seg-000001-test.msgpack' },
    ]);

    expect(error.message).toContain('checksum-mismatch');
    expect(error.diagnostics[0]).toMatchObject({ reason: 'checksum-mismatch' });
  });
});
