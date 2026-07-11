import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackCardAggregateSnapshotTruthRecord,
  type MessagePackCardAggregateTombstoneTruthRecord,
  type MessagePackQueueSnapshotTruthRecord,
  type MessagePackQueueStateChangesetTruthRecord,
} from '../../packages/contracts/src/backend-rpc';
import {
  replayCardAggregateTruthRecords,
  replayQueueFamilyTruthRecords,
} from './CompactableCanonicalTruth';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthRecord,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';
import {
  MessagePackTruthSnapshotGenerationStore,
} from './MessagePackTruthSnapshotGenerationStore';

export type WorkerCompactableTruthFamily = 'card-memory-facts' | 'queue-facts';

export interface WorkerTruthCompactionModuleOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  deviceId: string;
  schemaVersion: number;
  sourceGenerationIds: Record<WorkerCompactableTruthFamily, string>;
  maxSegmentBytes?: number;
  maxSegmentRecords?: number;
}

export interface WorkerTruthFamilyCompactionResult {
  family: WorkerCompactableTruthFamily;
  status: 'compacted' | 'noop';
  generationId: string | null;
  previousGenerationId: string | null;
  sourceRecordCount: number;
  snapshotRecordCount: number;
  coveredJournalSequence: number;
  orphanPaths: string[];
  reclaimedPaths: string[];
}

export interface WorkerTruthCompactionResult {
  families: WorkerTruthFamilyCompactionResult[];
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid truth compaction ${label}: ${value}`);
  }
  return normalized;
}

function normalizeSchemaVersion(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized !== MESSAGEPACK_TRUTH_SCHEMA_VERSION) {
    throw new Error(`Unsupported truth compaction schema version: ${value}`);
  }
  return normalized;
}

function recordJournalSequence(record: MessagePackTruthRecord): number {
  const sequence = Math.floor(Number(record.journalSequence) || 0);
  return Math.max(0, sequence);
}

function deterministicGenerationId(
  family: WorkerCompactableTruthFamily,
  coveredJournalSequence: number,
  snapshotRecordCount: number,
): string {
  return `compact-${family}-${coveredJournalSequence}-${snapshotRecordCount}`;
}

export class WorkerTruthCompactionModule {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly deviceId: string;
  private readonly schemaVersion: number;
  private readonly sourceGenerationIds: Record<WorkerCompactableTruthFamily, string>;
  private readonly maxSegmentBytes?: number;
  private readonly maxSegmentRecords?: number;
  private readonly sourceStores = new Map<WorkerCompactableTruthFamily, MessagePackTruthSegmentStore>();
  private readonly generationStores = new Map<
    WorkerCompactableTruthFamily,
    MessagePackTruthSnapshotGenerationStore
  >();

  constructor(options: WorkerTruthCompactionModuleOptions) {
    this.fileStore = options.fileStore;
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.schemaVersion = normalizeSchemaVersion(options.schemaVersion);
    this.sourceGenerationIds = {
      'card-memory-facts': normalizeIdentity(
        options.sourceGenerationIds['card-memory-facts'],
        'card source generationId',
      ),
      'queue-facts': normalizeIdentity(
        options.sourceGenerationIds['queue-facts'],
        'queue source generationId',
      ),
    };
    this.maxSegmentBytes = options.maxSegmentBytes;
    this.maxSegmentRecords = options.maxSegmentRecords;
  }

  async compactAll(): Promise<WorkerTruthCompactionResult> {
    return {
      families: [
        await this.compactFamily('card-memory-facts'),
        await this.compactFamily('queue-facts'),
      ],
    };
  }

  async compactFamily(
    family: WorkerCompactableTruthFamily,
  ): Promise<WorkerTruthFamilyCompactionResult> {
    const source = await this.getSourceStore(family).replayRecords({
      dedupeByIdempotencyKey: true,
    });
    if (source.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-source-invalid:${family}:${source.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    const coveredJournalSequence = source.records.reduce(
      (maximum, record) => Math.max(maximum, recordJournalSequence(record)),
      0,
    );
    const snapshotRecords = family === 'card-memory-facts'
      ? this.buildCardSnapshotRecords(source.records)
      : this.buildQueueSnapshotRecords(source.records);
    const deterministicGeneration = snapshotRecords.length > 0
      ? deterministicGenerationId(family, coveredJournalSequence, snapshotRecords.length)
      : null;
    const generationStore = this.getGenerationStore(family);
    const inspection = await generationStore.inspectGenerations();
    let recoveryPreviousGenerationId: string | undefined;
    if (inspection.fence.current) {
      try {
        await generationStore.replayVerifiedGeneration(inspection.fence.current);
      } catch (currentError) {
        if (!inspection.fence.previous) {
          throw new Error(
            `truth-compaction-current-generation-invalid:${family}:${inspection.fence.current.generationId}:${errorMessage(currentError)}`,
          );
        }
        try {
          await generationStore.replayVerifiedGeneration(inspection.fence.previous);
        } catch (previousError) {
          throw new Error(
            `truth-compaction-current-and-previous-generation-invalid:${family}:${errorMessage(currentError)}:${errorMessage(previousError)}`,
          );
        }
        recoveryPreviousGenerationId = inspection.fence.previous.generationId;
      }
    }

    if (
      deterministicGeneration === null
      || (
        recoveryPreviousGenerationId === undefined
        && inspection.fence.current?.generationId === deterministicGeneration
      )
    ) {
      return {
        family,
        status: 'noop',
        generationId: inspection.fence.current?.generationId ?? null,
        previousGenerationId: inspection.fence.previous?.generationId ?? null,
        sourceRecordCount: source.records.length,
        snapshotRecordCount: snapshotRecords.length,
        coveredJournalSequence,
        orphanPaths: inspection.orphanPaths,
        reclaimedPaths: [],
      };
    }
    const generationId = recoveryPreviousGenerationId
      && inspection.fence.current?.generationId === deterministicGeneration
      ? `${deterministicGeneration}-recovered-${inspection.fence.fence + 1}`
      : deterministicGeneration;

    const published = await generationStore.publishGeneration({
      generationId,
      records: snapshotRecords,
      expectedCurrentGenerationId: inspection.fence.current?.generationId ?? null,
      recoveryPreviousGenerationId,
    });
    const retention = recoveryPreviousGenerationId
      ? {
          retainedGenerationIds: published.retainedGenerationIds,
          deletedPaths: [],
        }
      : await generationStore.reclaimObsoleteGenerations();
    const retainedInspection = await generationStore.inspectGenerations();
    return {
      family,
      status: 'compacted',
      generationId: published.fence.current?.generationId ?? generationId,
      previousGenerationId: published.fence.previous?.generationId ?? null,
      sourceRecordCount: source.records.length,
      snapshotRecordCount: snapshotRecords.length,
      coveredJournalSequence,
      orphanPaths: retainedInspection.orphanPaths,
      reclaimedPaths: retention.deletedPaths,
    };
  }

  private buildCardSnapshotRecords(
    records: MessagePackTruthRecord[],
  ): Array<MessagePackCardAggregateSnapshotTruthRecord | MessagePackCardAggregateTombstoneTruthRecord> {
    const replay = replayCardAggregateTruthRecords(records);
    if (replay.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-card-replay-invalid:${replay.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    return replay.aggregates.map((state) => {
      const common = {
        family: 'card-memory-facts' as const,
        schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
        idempotencyKey: `compact:card:${state.aggregateId}:${state.revision}`,
        mutationId: state.mutationId,
        aggregateId: state.aggregateId,
        causalBaseRevision: state.causalBaseRevision,
        revision: state.revision,
        journalSequence: state.journalSequence,
        logicalTime: state.journalSequence,
        recordedAt: state.journalSequence,
      };
      if (state.tombstone) {
        return {
          ...common,
          type: 'card-aggregate.tombstone.v1',
          card: null,
          schedule: null,
          tombstone: structuredClone(state.tombstone),
        };
      }
      if (!state.card || !state.schedule) {
        throw new Error(`truth-compaction-card-state-incomplete:${state.aggregateId}`);
      }
      return {
        ...common,
        type: 'card-aggregate.snapshot.v1',
        card: structuredClone(state.card),
        schedule: structuredClone(state.schedule),
        tombstone: null,
      };
    });
  }

  private buildQueueSnapshotRecords(
    records: MessagePackTruthRecord[],
  ): Array<MessagePackQueueSnapshotTruthRecord | MessagePackQueueStateChangesetTruthRecord> {
    const replay = replayQueueFamilyTruthRecords(records);
    if (replay.diagnostics.length > 0) {
      throw new Error(
        `truth-compaction-queue-replay-invalid:${replay.diagnostics.map((item) => item.reason).join(',')}`,
      );
    }
    const queueSnapshots: MessagePackQueueSnapshotTruthRecord[] = replay.queues.map((state) => ({
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-family.snapshot.v1',
      idempotencyKey: `compact:queue:${state.queueFamily}:${state.revision}`,
      mutationId: state.mutationId,
      queueFamily: state.queueFamily,
      causalBaseRevision: state.causalBaseRevision,
      revision: state.revision,
      journalSequence: state.journalSequence,
      logicalTime: state.journalSequence,
      recordedAt: state.journalSequence,
      members: structuredClone(state.members),
      changes: null,
    }));
    const queueState: MessagePackQueueStateChangesetTruthRecord[] = replay.queueState.map((state) => ({
      family: 'queue-facts',
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'queue-state.changeset.v1',
      idempotencyKey: `compact:queue-state:${state.key}:${state.revision}`,
      mutationId: state.mutationId,
      queueFamily: state.key,
      causalBaseRevision: state.causalBaseRevision,
      revision: state.revision,
      journalSequence: state.journalSequence,
      logicalTime: state.journalSequence,
      recordedAt: state.journalSequence,
      members: null,
      changes: null,
      stateChange: {
        operation: 'set',
        key: state.key,
        value: structuredClone(state.value),
      },
    }));
    return [...queueSnapshots, ...queueState].sort((left, right) => (
      left.queueFamily.localeCompare(right.queueFamily)
      || left.type.localeCompare(right.type)
    ));
  }

  private getSourceStore(family: WorkerCompactableTruthFamily): MessagePackTruthSegmentStore {
    const existing = this.sourceStores.get(family);
    if (existing) {
      return existing;
    }
    const store = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.deviceId,
      generationId: this.sourceGenerationIds[family],
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
    });
    this.sourceStores.set(family, store);
    return store;
  }

  private getGenerationStore(
    family: WorkerCompactableTruthFamily,
  ): MessagePackTruthSnapshotGenerationStore {
    const existing = this.generationStores.get(family);
    if (existing) {
      return existing;
    }
    const store = new MessagePackTruthSnapshotGenerationStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.deviceId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    this.generationStores.set(family, store);
    return store;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
