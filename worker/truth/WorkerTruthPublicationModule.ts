import type {
  StorageRequiredTruthOutput,
} from '../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthRecord,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';
import type {
  WorkerTruthPromotionJournalEntry,
  WorkerTruthPromotionPublisher,
  WorkerTruthPromotionPublisherResult,
} from './WorkerTruthPromotionModule';
import {
  encodeCardAggregateTruthRecords,
  encodeQueueFamilyTruthRecords,
} from './CompactableCanonicalTruth';

export type WorkerTruthPhysicalFamily = 'review-events' | 'card-memory-facts' | 'queue-facts';

export interface WorkerTruthPublicationModuleOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  deviceId: string;
  identityEpoch: string;
  generationIds: Record<WorkerTruthPhysicalFamily, string>;
  schemaVersion: number;
  maxSegmentBytes?: number;
}

interface PlannedRecord {
  mutationId: string;
  family: WorkerTruthPhysicalFamily;
  idempotencyKey: string;
  record: MessagePackTruthRecord;
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid truth publication ${label}: ${value}`);
  }
  return normalized;
}

function physicalFamily(output: StorageRequiredTruthOutput): WorkerTruthPhysicalFamily {
  switch (output.family) {
    case 'review':
      return 'review-events';
    case 'card-schedule':
    case 'card-crud':
      return 'card-memory-facts';
    case 'queue':
      return 'queue-facts';
    default:
      throw new Error(`truth-output-family-unsupported:${output.family}`);
  }
}

function recordKey(record: MessagePackTruthRecord): string | null {
  return typeof record.idempotencyKey === 'string' && record.idempotencyKey.trim()
    ? record.idempotencyKey.trim()
    : null;
}

export class WorkerTruthPublicationModule implements WorkerTruthPromotionPublisher {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly deviceId: string;
  private readonly identityEpoch: string;
  private readonly generationIds: Record<WorkerTruthPhysicalFamily, string>;
  private readonly schemaVersion: number;
  private readonly maxSegmentBytes?: number;
  private readonly stores = new Map<WorkerTruthPhysicalFamily, MessagePackTruthSegmentStore>();

  constructor(options: WorkerTruthPublicationModuleOptions) {
    this.fileStore = options.fileStore;
    this.deviceId = normalizeIdentity(options.deviceId, 'deviceId');
    this.identityEpoch = normalizeIdentity(options.identityEpoch, 'identityEpoch');
    this.generationIds = {
      'review-events': normalizeIdentity(options.generationIds['review-events'], 'review generationId'),
      'card-memory-facts': normalizeIdentity(options.generationIds['card-memory-facts'], 'card generationId'),
      'queue-facts': normalizeIdentity(options.generationIds['queue-facts'], 'queue generationId'),
    };
    this.schemaVersion = Math.max(1, Math.floor(Number(options.schemaVersion) || 1));
    this.maxSegmentBytes = options.maxSegmentBytes;
  }

  async publishBatch(entries: WorkerTruthPromotionJournalEntry[]): Promise<WorkerTruthPromotionPublisherResult> {
    const planned = entries.flatMap((entry) => this.planEntry(entry));
    const byFamily = new Map<WorkerTruthPhysicalFamily, PlannedRecord[]>();
    for (const item of planned) {
      const familyRecords = byFamily.get(item.family) ?? [];
      familyRecords.push(item);
      byFamily.set(item.family, familyRecords);
    }

    for (const [family, familyRecords] of byFamily) {
      const store = this.getStore(family);
      const replay = await store.replayRecords({ dedupeByIdempotencyKey: true });
      const existing = new Set(replay.records.map(recordKey).filter((key): key is string => Boolean(key)));
      const missing = familyRecords.filter((item) => !existing.has(item.idempotencyKey));
      if (missing.length > 0) {
        await store.appendRecords(missing.map((item) => item.record));
      }
    }

    const verifiedKeys = new Set<string>();
    for (const family of byFamily.keys()) {
      const replay = await this.getStore(family).replayRecords({ dedupeByIdempotencyKey: true });
      for (const record of replay.records) {
        const key = recordKey(record);
        if (key) {
          verifiedKeys.add(key);
        }
      }
    }

    const verifiedMutationIds = entries
      .filter((entry) => planned
        .filter((item) => item.mutationId === entry.mutationEnvelope.mutationId)
        .every((item) => verifiedKeys.has(item.idempotencyKey)))
      .map((entry) => entry.mutationEnvelope.mutationId);
    const lastSequence = entries.at(-1)?.mutationEnvelope.journalSequence ?? 0;
    return {
      generationId: `truth-promotion-${this.deviceId}-${lastSequence}`,
      verifiedMutationIds,
    };
  }

  getFamilyStore(family: WorkerTruthPhysicalFamily): Pick<MessagePackTruthSegmentStore, 'appendRecords' | 'replayRecords'> {
    const store = this.getStore(family);
    return {
      appendRecords: (records, options) => store.appendRecords(records, options),
      replayRecords: (options) => store.replayRecords(options),
    };
  }

  private planEntry(entry: WorkerTruthPromotionJournalEntry): PlannedRecord[] {
    const envelope = entry.mutationEnvelope;
    if (envelope.deviceId !== this.deviceId || envelope.identityEpoch !== this.identityEpoch) {
      throw new Error(`truth-promotion-mutation-identity-mismatch:${envelope.mutationId}`);
    }
    if (envelope.journalSequence === null || envelope.journalSequence < 1) {
      throw new Error(`truth-promotion-journal-sequence-missing:${envelope.mutationId}`);
    }
    const planned: PlannedRecord[] = [];
    const cardOutputs = envelope.requiredTruthOutputs.filter((output) => (
      output.family === 'card-schedule' || output.family === 'card-crud'
    ));
    if (cardOutputs.length > 0) {
      const records = encodeCardAggregateTruthRecords(envelope);
      const expected = new Set(cardOutputs.flatMap((output) => (
        output.aggregateIds.map((aggregateId) => `${output.kind}:${aggregateId}`)
      )));
      const actual = new Set(records.map((record) => (
        `${record.type === 'card-aggregate.tombstone.v1' ? 'tombstone' : 'changeset'}:${record.aggregateId}`
      )));
      for (const key of expected) {
        if (!actual.has(key)) {
          throw new Error(`truth-card-output-unencoded:${envelope.mutationId}:${key}`);
        }
      }
      for (const record of records) {
        planned.push({
          mutationId: envelope.mutationId,
          family: 'card-memory-facts',
          idempotencyKey: record.idempotencyKey,
          record,
        });
      }
    }
    envelope.requiredTruthOutputs.forEach((output, outputIndex) => {
      if (
        output.family === 'card-schedule'
        || output.family === 'card-crud'
        || output.family === 'queue'
      ) {
        return;
      }
      const family = physicalFamily(output);
      const idempotencyKey = [
        'truth-output',
        envelope.mutationId,
        String(outputIndex),
        output.family,
        output.kind,
      ].join(':');
      planned.push({
        mutationId: envelope.mutationId,
        family,
        idempotencyKey,
        record: {
          family,
          schemaVersion: this.schemaVersion,
          type: `storage.${output.family}.${output.kind}.v1`,
          idempotencyKey,
          mutationId: envelope.mutationId,
          mutationFamily: envelope.family,
          deviceId: envelope.deviceId,
          identityEpoch: envelope.identityEpoch,
          journalSequence: envelope.journalSequence,
          logicalTime: envelope.createdAt,
          recordedAt: envelope.createdAt,
          output: structuredClone(output),
          affectedAggregates: structuredClone(envelope.affectedAggregates),
          operations: structuredClone(envelope.operations),
        },
      });
    });
    const queueOutputs = envelope.requiredTruthOutputs.filter((output) => output.family === 'queue');
    if (queueOutputs.length > 0) {
      const records = encodeQueueFamilyTruthRecords(envelope);
      const expected = new Set(queueOutputs.flatMap((output) => (
        output.aggregateIds.map((aggregateId) => `${output.kind}:${aggregateId}`)
      )));
      const actual = new Set(records.map((record) => `changeset:${record.queueFamily}`));
      for (const key of expected) {
        if (!actual.has(key)) {
          throw new Error(`truth-queue-output-unencoded:${envelope.mutationId}:${key}`);
        }
      }
      for (const record of records) {
        planned.push({
          mutationId: envelope.mutationId,
          family: 'queue-facts',
          idempotencyKey: record.idempotencyKey,
          record,
        });
      }
    }
    return planned;
  }

  private getStore(family: WorkerTruthPhysicalFamily): MessagePackTruthSegmentStore {
    const existing = this.stores.get(family);
    if (existing) {
      return existing;
    }
    const store = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.deviceId,
      generationId: this.generationIds[family],
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
    });
    this.stores.set(family, store);
    return store;
  }
}
