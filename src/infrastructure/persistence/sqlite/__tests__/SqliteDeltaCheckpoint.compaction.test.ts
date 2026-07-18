import { describe, expect, it } from 'vitest';
import {
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageMutationEnvelope,
} from '../../../../../packages/contracts/src/backend-rpc';
import {
  SQLITE_DELTA_LOG_FILE,
  SqliteDeltaCheckpointLayer,
  type SqliteDeltaCaptureResult,
} from '../SqliteDeltaCheckpoint';

class MemoryFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();
  readonly jsonWrites: string[] = [];
  readonly binaryWrites: string[] = [];
  readonly deletes: string[] = [];
  deleteError: Error | null = null;
  jsonWriteError: Error | null = null;

  async readJSON<T>(fileName: string): Promise<T | null> {
    return this.json.has(fileName) ? structuredClone(this.json.get(fileName)) as T : null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    if (this.jsonWriteError) {
      throw this.jsonWriteError;
    }
    this.jsonWrites.push(fileName);
    this.json.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? bytes.slice() : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binaryWrites.push(fileName);
    this.binary.set(fileName, bytes.slice());
  }

  async listFiles(prefix: string): Promise<Array<{ path: string; size: number | null }>> {
    return [
      ...Array.from(this.json.keys()).map((path) => ({ path, size: null })),
      ...Array.from(this.binary.entries()).map(([path, bytes]) => ({ path, size: bytes.byteLength })),
    ].filter((entry) => entry.path.startsWith(prefix));
  }

  async deleteFile(fileName: string): Promise<void> {
    this.deletes.push(fileName);
    if (this.deleteError) {
      throw this.deleteError;
    }
    this.binary.delete(fileName);
    this.json.delete(fileName);
  }

  clearEffects(): void {
    this.jsonWrites.length = 0;
    this.binaryWrites.length = 0;
    this.deletes.length = 0;
  }
}

function capture(index: number): SqliteDeltaCaptureResult {
  return {
    label: `mutation-${index}`,
    setupError: null,
    touchedTables: ['cards'],
    schemaMismatchedTables: [],
    schemaFingerprints: {},
    changes: [{
      table: 'cards',
      operation: 'insert',
      primaryKey: { id: `card-${index}` },
      row: { id: `card-${index}`, block_id: `block-${index}` },
    }],
    skippedDerivedTables: [],
    skippedDerivedChangeCount: 0,
  };
}

function mutation(index: number): StorageMutationEnvelope {
  return {
    version: STORAGE_MUTATION_ENVELOPE_VERSION,
    mutationId: `mutation-${index}`,
    family: 'card-crud',
    deviceId: 'device-a',
    identityEpoch: 'epoch-1',
    journalSequence: null,
    createdAt: index,
    affectedAggregates: [{
      family: 'card-crud',
      aggregateId: `card-${index}`,
      causalBaseRevision: null,
    }],
    operations: [],
    requiredTruthOutputs: [{
      family: 'card-crud',
      kind: 'changeset',
      aggregateIds: [`card-${index}`],
    }],
  };
}

describe('SqliteDeltaCheckpointLayer coverage compaction', () => {
  it('does not rewrite fully uncovered legacy segments when compaction cannot reclaim storage', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `legacy-mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    expect(await layer.getStorageInventory()).toMatchObject({
      sealedFiles: 2,
      openFiles: 0,
      entries: 32,
    });
    files.clearEffects();

    const result = await layer.compactCoveredSegments({
      coveredJournalSequence: 0,
      retainSealedSegments: 1,
    });

    expect(result).toMatchObject({
      status: 'no-progress',
      reason: 'no-progress-uncovered',
      coveredJournalSequence: 0,
      candidateSegmentCount: 1,
      candidateEntryCount: 16,
      reclaimableEntryCount: 0,
      retainedEntryCount: 16,
      deletedSegmentPaths: [],
      relocatedEntryCount: 0,
      relocatedSegmentPaths: [],
      remainingSealedSegmentCount: 2,
    });
    expect(files.jsonWrites).toEqual([]);
    expect(files.binaryWrites).toEqual([]);
    expect(files.deletes).toEqual([]);
    expect(await layer.getStorageInventory()).toMatchObject({
      sealedFiles: 2,
      entries: 32,
    });
  });

  it('relocates uncovered mutations before deleting covered sealed segments', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: mutation(index),
      });
    }
    expect(await layer.getStorageInventory()).toMatchObject({
      sealedFiles: 2,
      openFiles: 0,
      entries: 32,
    });

    const result = await layer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    });

    expect(result).toMatchObject({
      coveredJournalSequence: 8,
      candidateSegmentCount: 1,
      relocatedEntryCount: 8,
      remainingSealedSegmentCount: 2,
    });
    expect(result.deletedSegmentPaths).toHaveLength(1);
    expect(result.relocatedSegmentPaths).toHaveLength(1);
    expect(files.binary.has(result.deletedSegmentPaths[0])).toBe(false);
    const remaining = await layer.listJournaledMutations({
      afterJournalSequence: 8,
      limit: 100,
    });
    expect(remaining.map((entry) => entry.mutationEnvelope.journalSequence)).toEqual(
      Array.from({ length: 24 }, (_, offset) => offset + 9),
    );
  });

  it('retains the cleanup checkpoint until superseded segment deletion succeeds', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: mutation(index),
      });
    }
    files.deleteError = new Error('host-delete-unverified');

    await expect(layer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    })).rejects.toThrow('host-delete-unverified');

    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    expect(interruptedManifest.checkpoint).toMatchObject({
      reason: 'coverage-compaction',
      coveredSegmentPaths: ['sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack'],
    });
    expect(files.binary.has('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack')).toBe(true);

    files.deleteError = null;
    await expect(layer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    })).resolves.toMatchObject({
      status: 'no-progress',
      reason: 'no-progress-uncovered',
    });
    const resumedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as { checkpoint: unknown };
    expect(resumedManifest.checkpoint).toBeNull();
    expect(files.binary.has('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack')).toBe(false);
  });

  it('clears a resumed coverage compaction checkpoint when covered paths are already absent', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: mutation(index),
      });
    }
    files.deleteError = new Error('coverage-delete-interrupted');

    await expect(layer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    })).rejects.toThrow('coverage-delete-interrupted');
    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    const stalePath = interruptedManifest.checkpoint?.coveredSegmentPaths[0];
    expect(stalePath).toBe('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack');
    files.binary.delete(stalePath!);
    files.deleteError = new Error('absent checkpoint path must not be deleted again');
    files.clearEffects();

    await expect(layer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    })).resolves.toMatchObject({
      status: 'no-progress',
      reason: 'no-progress-uncovered',
    });

    expect(files.deletes).toEqual([]);
    expect((files.json.get(SQLITE_DELTA_LOG_FILE) as { checkpoint: unknown }).checkpoint).toBeNull();
  });

  it('does not replay deleted cleanup paths from an interrupted coverage compaction checkpoint', async () => {
    const files = new MemoryFileService();
    const writer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await writer.persistCommittedTransaction({
        label: `mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: mutation(index),
      });
    }
    files.deleteError = new Error('coverage-delete-interrupted');

    await expect(writer.compactCoveredSegments({
      coveredJournalSequence: 8,
      retainSealedSegments: 1,
    })).rejects.toThrow('coverage-delete-interrupted');
    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    expect(interruptedManifest.checkpoint?.reason).toBe('coverage-compaction');
    for (const path of interruptedManifest.checkpoint?.coveredSegmentPaths ?? []) {
      files.binary.delete(path);
    }

    const restartedReader = new SqliteDeltaCheckpointLayer(files, SQLITE_DELTA_LOG_FILE, {
      checkpointStorageClass: 'volatile-projection',
    });

    await expect(restartedReader.listJournaledMutations({
      afterJournalSequence: 8,
      limit: 100,
    })).resolves.toSatisfy((entries: Array<{ mutationEnvelope: { journalSequence: number } }>) => (
      entries.length === 24
      && entries[0]?.mutationEnvelope.journalSequence === 9
      && entries.at(-1)?.mutationEnvelope.journalSequence === 32
    ));
  });

  it('inventories and deletes only manifest-proven orphan segments within each budget', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `legacy-mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    const activePaths = [
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-2.msgpack',
    ];
    const orphanPaths = [
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-100.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-101.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-102.msgpack',
    ];
    for (const [index, path] of orphanPaths.entries()) {
      files.binary.set(path, new Uint8Array(10 + index));
    }
    files.binary.set('sqlite-delta/v2/not-a-segment.bin', new Uint8Array([1]));
    files.clearEffects();

    await expect(layer.cleanupOrphanSegments({ dryRun: true })).resolves.toMatchObject({
      status: 'dry-run',
      protectedSegmentCount: 2,
      orphanFileCount: 3,
      orphanBytes: 33,
      deletedFiles: [],
      remainingOrphanFileCount: 3,
    });
    expect(files.deletes).toEqual([]);

    const firstBatch = await layer.cleanupOrphanSegments({
      maxFiles: 2,
      maxBytes: 1_000,
    });
    expect(firstBatch).toMatchObject({
      status: 'partial',
      orphanFileCount: 3,
      remainingOrphanFileCount: 1,
      remainingOrphanBytes: 12,
    });
    expect(firstBatch.deletedFiles.map((entry) => entry.path)).toEqual(orphanPaths.slice(0, 2));
    expect(activePaths.every((path) => files.binary.has(path))).toBe(true);

    const secondBatch = await layer.cleanupOrphanSegments({
      maxFiles: 2,
      maxBytes: 1_000,
    });
    expect(secondBatch).toMatchObject({
      status: 'completed',
      orphanFileCount: 1,
      remainingOrphanFileCount: 0,
      remainingOrphanBytes: 0,
    });
    expect(secondBatch.deletedFiles.map((entry) => entry.path)).toEqual(orphanPaths.slice(2));
    expect(activePaths.every((path) => files.binary.has(path))).toBe(true);
    expect(files.binary.has('sqlite-delta/v2/not-a-segment.bin')).toBe(true);
  });

  it('keeps active segments protected while bounding cleanup of a real-scale orphan inventory', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `legacy-mutation-${index}`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    const activePaths = [
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-2.msgpack',
    ];
    for (let index = 1_000; index < 4_867; index += 1) {
      files.binary.set(
        `sqlite-delta/v2/sqlite-delta-log.v2.sealed-${index}.msgpack`,
        new Uint8Array([index % 255]),
      );
    }
    files.clearEffects();

    await expect(layer.cleanupOrphanSegments({ dryRun: true })).resolves.toMatchObject({
      status: 'dry-run',
      orphanFileCount: 3_867,
      orphanBytes: 3_867,
      remainingOrphanFileCount: 3_867,
    });
    const firstBatch = await layer.cleanupOrphanSegments({
      maxFiles: 64,
      maxBytes: 64,
    });

    expect(firstBatch).toMatchObject({
      status: 'partial',
      orphanFileCount: 3_867,
      orphanBytes: 3_867,
      remainingOrphanFileCount: 3_803,
      remainingOrphanBytes: 3_803,
    });
    expect(firstBatch.deletedFiles).toHaveLength(64);
    expect(activePaths.every((path) => files.binary.has(path))).toBe(true);
    expect(files.deletes).not.toEqual(expect.arrayContaining(activePaths));
  });

  it('rewrites supported legacy entries as a contiguous journal before deleting source segments', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 32; index += 1) {
      await layer.persistCommittedTransaction({
        label: `source-existence.sweep`,
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    files.clearEffects();

    const result = await layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    });

    expect(result).toMatchObject({
      status: 'adopted',
      adoptedEntryCount: 32,
      firstJournalSequence: 1,
      lastJournalSequence: 32,
      nextJournalSequence: 33,
      replacedSegmentPaths: [
        'sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack',
        'sqlite-delta/v2/sqlite-delta-log.v2.sealed-2.msgpack',
      ],
    });
    expect(result.adoptedSegmentPaths).toEqual([
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-3.msgpack',
      'sqlite-delta/v2/sqlite-delta-log.v2.sealed-4.msgpack',
    ]);
    expect(result.replacedSegmentPaths.every((path) => !files.binary.has(path))).toBe(true);
    expect(result.adoptedSegmentPaths.every((path) => files.binary.has(path))).toBe(true);
    const journal = await layer.listJournaledMutations({ limit: 100 });
    expect(journal.map((candidate) => candidate.mutationEnvelope.journalSequence)).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
    expect(journal.every((candidate) => (
      candidate.durabilityReceipt.stage === 'journaled'
      && candidate.mutationEnvelope.operations.length === 1
    ))).toBe(true);
  });

  it('retries deterministic legacy adoption after replacement writes fail before manifest publication', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 16; index += 1) {
      await layer.persistCommittedTransaction({
        label: 'source-existence.sweep',
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    const originalManifest = structuredClone(files.json.get(SQLITE_DELTA_LOG_FILE)) as {
      openSegment?: { path: string } | null;
      sealedSegments?: Array<{ path: string }>;
    };
    const originalActivePaths = [
      ...(originalManifest.sealedSegments ?? []).map((segment) => segment.path),
      ...(originalManifest.openSegment ? [originalManifest.openSegment.path] : []),
    ];
    const originalPaths = Array.from(files.binary.keys());
    const originalOrphanPaths = originalPaths.filter((path) => !originalActivePaths.includes(path));
    files.clearEffects();
    files.jsonWriteError = new Error('adoption-manifest-publication-interrupted');

    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).rejects.toThrow('adoption-manifest-publication-interrupted');

    expect(files.json.get(SQLITE_DELTA_LOG_FILE)).toEqual(originalManifest);
    expect(originalPaths.every((path) => files.binary.has(path))).toBe(true);
    expect(files.deletes).toEqual([]);
    const replacementPaths = files.binaryWrites.slice();
    expect(replacementPaths).not.toEqual([]);

    files.jsonWriteError = null;
    files.clearEffects();
    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).resolves.toMatchObject({
      status: 'adopted',
      adoptedEntryCount: 16,
      firstJournalSequence: 1,
      lastJournalSequence: 16,
    });
    expect(files.binaryWrites).toEqual(replacementPaths);
    expect(originalActivePaths.every((path) => !files.binary.has(path))).toBe(true);
    expect(originalOrphanPaths.every((path) => files.binary.has(path))).toBe(true);
  });

  it('resumes legacy adoption cleanup without rewriting adopted entries again', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 16; index += 1) {
      await layer.persistCommittedTransaction({
        label: 'source-existence.sweep',
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    files.deleteError = new Error('adoption-delete-interrupted');

    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).rejects.toThrow('adoption-delete-interrupted');
    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    expect(interruptedManifest.checkpoint).toMatchObject({
      reason: 'legacy-adoption',
      coveredSegmentPaths: ['sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack'],
    });
    const writesAfterInterruption = files.binaryWrites.length;

    files.deleteError = null;
    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).resolves.toMatchObject({
      status: 'not-needed',
      adoptedEntryCount: 0,
      adoptedSegmentPaths: [],
    });
    expect(files.binaryWrites).toHaveLength(writesAfterInterruption);
    const resumedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as { checkpoint: unknown };
    expect(resumedManifest.checkpoint).toBeNull();
    expect(files.binary.has('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack')).toBe(false);
    expect(files.binary.has('sqlite-delta/v2/sqlite-delta-log.v2.sealed-2.msgpack')).toBe(true);
  });

  it('clears a resumed legacy adoption checkpoint without deleting paths that are already absent', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files);
    for (let index = 1; index <= 16; index += 1) {
      await layer.persistCommittedTransaction({
        label: 'source-existence.sweep',
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    files.deleteError = new Error('adoption-delete-interrupted');

    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).rejects.toThrow('adoption-delete-interrupted');
    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    const stalePath = interruptedManifest.checkpoint?.coveredSegmentPaths[0];
    expect(stalePath).toBe('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack');
    files.binary.delete(stalePath!);
    files.deleteError = new Error('absent checkpoint path must not be deleted again');
    files.clearEffects();

    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).resolves.toMatchObject({
      status: 'not-needed',
      adoptedEntryCount: 0,
    });

    expect(files.deletes).toEqual([]);
    expect((files.json.get(SQLITE_DELTA_LOG_FILE) as { checkpoint: unknown }).checkpoint).toBeNull();
  });

  it('does not replay legacy adoption cleanup checkpoints for volatile projections', async () => {
    const files = new MemoryFileService();
    const layer = new SqliteDeltaCheckpointLayer(files, undefined, {
      checkpointStorageClass: 'volatile-projection',
    });
    for (let index = 1; index <= 16; index += 1) {
      await layer.persistCommittedTransaction({
        label: 'source-existence.sweep',
        capture: capture(index),
        schemaChanged: false,
        mutationEnvelope: null,
      });
    }
    files.deleteError = new Error('adoption-delete-interrupted');

    await expect(layer.adoptLegacyEntries({
      deviceId: 'device-adoption',
      identityEpoch: 'epoch-adoption',
      afterJournalSequence: 0,
    })).rejects.toThrow('adoption-delete-interrupted');
    const interruptedManifest = files.json.get(SQLITE_DELTA_LOG_FILE) as {
      checkpoint: { reason: string; coveredSegmentPaths: string[] } | null;
    };
    expect(interruptedManifest.checkpoint).toMatchObject({
      reason: 'legacy-adoption',
      coveredSegmentPaths: ['sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack'],
    });
    files.binary.set('sqlite-delta/v2/sqlite-delta-log.v2.sealed-1.msgpack', new Uint8Array(52));

    await expect(layer.getDiagnostics()).resolves.toMatchObject({
      pendingCount: 16,
    });
  });
});
