import { describe, expect, it } from 'vitest';
import {
  STORAGE_MUTATION_ENVELOPE_VERSION,
  type StorageMutationEnvelope,
} from '../../../../../packages/contracts/src/backend-rpc';
import {
  SqliteDeltaCheckpointLayer,
  type SqliteDeltaCaptureResult,
} from '../SqliteDeltaCheckpoint';

class MemoryFileService {
  readonly json = new Map<string, unknown>();
  readonly binary = new Map<string, Uint8Array>();

  async readJSON<T>(fileName: string): Promise<T | null> {
    return this.json.has(fileName) ? structuredClone(this.json.get(fileName)) as T : null;
  }

  async writeJSON(fileName: string, data: unknown): Promise<void> {
    this.json.set(fileName, structuredClone(data));
  }

  async readBinary(fileName: string): Promise<Uint8Array | null> {
    const bytes = this.binary.get(fileName);
    return bytes ? bytes.slice() : null;
  }

  async writeBinary(fileName: string, bytes: Uint8Array): Promise<void> {
    this.binary.set(fileName, bytes.slice());
  }

  async deleteFile(fileName: string): Promise<void> {
    this.binary.delete(fileName);
    this.json.delete(fileName);
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
});
