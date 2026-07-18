import {
  createMessagePackTruthSegmentStore,
  replayMessagePackTruthRemoteSegments,
  type MessagePackTruthRecord,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentManifest,
  type MessagePackTruthValidationDiagnostic,
} from './MessagePackTruthSegmentStore';
import {
  reconcileWorkerTruthRecords,
  type WorkerTruthReconciliationResult,
  type WorkerTruthReconciliationSource,
} from './WorkerTruthReconciliationModule';
import {
  MessagePackTruthSnapshotGenerationStore,
  type MessagePackTruthGenerationReference,
} from './MessagePackTruthSnapshotGenerationStore';

export interface WorkerTruthReconciliationRuntimeOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  localDeviceId: string;
  localIdentityEpoch: string;
  schemaVersion: number;
  reviewGenerationId?: string;
  domainSyncGenerationId?: string;
  maxSegmentBytes?: number;
  maxSegmentRecords?: number;
  rebuildProjection?: (input: WorkerTruthReconciliationProjectionInput) => Promise<void> | void;
}

export interface WorkerTruthReconciliationInspectedSource extends WorkerTruthReconciliationSource {
  family: string;
  writable: boolean;
}

export interface WorkerTruthReconciliationInspection {
  sources: WorkerTruthReconciliationInspectedSource[];
  diagnostics: MessagePackTruthValidationDiagnostic[];
}

export interface WorkerTruthReconciliationProjectionInput {
  reconciliation: WorkerTruthReconciliationResult;
  truthRecords: MessagePackTruthRecord[];
  generationIds: {
    card: string | null;
    queue: string | null;
    review: string;
    domainSync: string;
  };
}

export interface WorkerTruthReconciliationPublication {
  reconciliation: WorkerTruthReconciliationResult;
  generationIds: WorkerTruthReconciliationProjectionInput['generationIds'];
  projectionRebuilt: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid truth reconciliation ${label}: ${value}`);
  }
  return normalized;
}

function recordEpoch(record: Record<string, unknown>, deviceId: string): string | null {
  const direct = typeof record.identityEpoch === 'string' ? record.identityEpoch.trim() : '';
  if (direct) {
    return direct;
  }
  const tombstone = isRecord(record.tombstone) && typeof record.tombstone.identityEpoch === 'string'
    ? record.tombstone.identityEpoch.trim()
    : '';
  if (tombstone) {
    return tombstone;
  }
  const revision = typeof record.revision === 'string' ? record.revision.trim() : '';
  const prefix = `${deviceId}:`;
  if (!revision.startsWith(prefix)) {
    return null;
  }
  const remainder = revision.slice(prefix.length);
  const separator = remainder.indexOf(':');
  return separator > 0 ? remainder.slice(0, separator) : null;
}

function manifestPath(path: string): boolean {
  return /^truth\/[^/]+\/[^/]+\/device-[^/]+\/manifest\.v1\.json$/.test(path);
}

function compactableFamily(
  family: string,
): family is 'card-memory-facts' | 'queue-facts' {
  return family === 'card-memory-facts' || family === 'queue-facts';
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

function deterministicHash(value: unknown): string {
  const input = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function recordsEquivalent(left: MessagePackTruthRecord[], right: MessagePackTruthRecord[]): boolean {
  return left.length === right.length
    && JSON.stringify(left.map(stableValue)) === JSON.stringify(right.map(stableValue));
}

function recordIdempotencyKey(record: MessagePackTruthRecord): string | null {
  const value = typeof record.idempotencyKey === 'string'
    ? record.idempotencyKey.trim()
    : '';
  return value || null;
}

export class WorkerTruthReconciliationRuntime {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly localDeviceId: string;
  private readonly localIdentityEpoch: string;
  private readonly schemaVersion: number;
  private readonly reviewGenerationId: string;
  private readonly domainSyncGenerationId: string;
  private readonly maxSegmentBytes?: number;
  private readonly maxSegmentRecords?: number;
  private readonly rebuildProjection?: WorkerTruthReconciliationRuntimeOptions['rebuildProjection'];

  constructor(options: WorkerTruthReconciliationRuntimeOptions) {
    this.fileStore = options.fileStore;
    this.localDeviceId = normalizeIdentity(options.localDeviceId, 'localDeviceId');
    this.localIdentityEpoch = normalizeIdentity(options.localIdentityEpoch, 'localIdentityEpoch');
    this.schemaVersion = Math.max(1, Math.floor(Number(options.schemaVersion) || 1));
    this.reviewGenerationId = normalizeIdentity(
      options.reviewGenerationId ?? `review-events-v${this.schemaVersion}`,
      'reviewGenerationId',
    );
    this.domainSyncGenerationId = normalizeIdentity(
      options.domainSyncGenerationId ?? `domain-sync-operations-v${this.schemaVersion}`,
      'domainSyncGenerationId',
    );
    this.maxSegmentBytes = options.maxSegmentBytes;
    this.maxSegmentRecords = options.maxSegmentRecords;
    this.rebuildProjection = options.rebuildProjection;
  }

  async inspectSources(): Promise<WorkerTruthReconciliationInspection> {
    if (!this.fileStore.listFiles) {
      return {
        sources: [],
        diagnostics: [{
          reason: 'segment-unreadable',
          path: 'truth',
          expected: 'listFiles capability',
          actual: 'unavailable',
        }],
      };
    }
    const paths = (await this.fileStore.listFiles('truth'))
      .map((path) => path.replace(/\\/g, '/'))
      .filter(manifestPath)
      .sort();
    const sources: WorkerTruthReconciliationInspectedSource[] = [];
    const diagnostics: MessagePackTruthValidationDiagnostic[] = [];
    const activeGenerationByNamespace = new Map<string, string | null>();

    for (const path of paths) {
      const manifest = await this.fileStore.readJSON<MessagePackTruthSegmentManifest>(path);
      if (!manifest) {
        diagnostics.push({ reason: 'segment-unreadable', path });
        continue;
      }
      if (compactableFamily(manifest.family)) {
        const namespace = `${manifest.family}:${manifest.deviceId}`;
        if (!activeGenerationByNamespace.has(namespace)) {
          const generationStore = new MessagePackTruthSnapshotGenerationStore({
            fileStore: this.fileStore,
            family: manifest.family,
            deviceId: manifest.deviceId,
            schemaVersion: this.schemaVersion,
            maxSegmentBytes: this.maxSegmentBytes,
            maxSegmentRecords: this.maxSegmentRecords,
          });
          const generationInspection = await generationStore.inspectGenerations();
          activeGenerationByNamespace.set(
            namespace,
            generationInspection.fence.current?.generationId ?? null,
          );
        }
        const activeGenerationId = activeGenerationByNamespace.get(namespace);
        if (activeGenerationId && manifest.generationId !== activeGenerationId) {
          continue;
        }
      }
      const replay = await replayMessagePackTruthRemoteSegments({
        fileStore: this.fileStore,
        manifests: [manifest],
        family: String(manifest.family || ''),
        generationId: String(manifest.generationId || ''),
        schemaVersion: this.schemaVersion,
        dedupeByIdempotencyKey: false,
        detectReviewConflicts: false,
      });
      diagnostics.push(...replay.validationDiagnostics);
      const recordsByEpoch = new Map<string, Record<string, unknown>[]>();
      for (const record of replay.acceptedRecords) {
        const epoch = recordEpoch(record, manifest.deviceId)
          ?? (manifest.deviceId === this.localDeviceId ? this.localIdentityEpoch : 'unknown');
        const epochRecords = recordsByEpoch.get(epoch) ?? [];
        epochRecords.push(structuredClone(record));
        recordsByEpoch.set(epoch, epochRecords);
      }
      if (recordsByEpoch.size === 0) {
        const epoch = manifest.deviceId === this.localDeviceId ? this.localIdentityEpoch : 'unknown';
        recordsByEpoch.set(epoch, []);
      }
      for (const [identityEpoch, records] of recordsByEpoch) {
        sources.push({
          sourceId: [
            manifest.deviceId,
            identityEpoch,
            manifest.family,
            manifest.generationId,
          ].join(':'),
          deviceId: manifest.deviceId,
          identityEpoch,
          family: manifest.family,
          manifestPath: path,
          generationId: manifest.generationId,
          records,
          writable: manifest.deviceId === this.localDeviceId
            && identityEpoch === this.localIdentityEpoch,
        });
      }
    }

    sources.sort((left, right) => (
      Number(right.writable) - Number(left.writable)
      || left.deviceId.localeCompare(right.deviceId)
      || left.identityEpoch.localeCompare(right.identityEpoch)
      || left.family.localeCompare(right.family)
      || left.generationId.localeCompare(right.generationId)
    ));
    return {
      sources,
      diagnostics,
    };
  }

  async reconcile(): Promise<WorkerTruthReconciliationPublication> {
    const inspection = await this.inspectSources();
    if (inspection.diagnostics.length > 0) {
      throw new Error(
        `truth-reconciliation-source-invalid:${inspection.diagnostics
          .map((diagnostic) => `${diagnostic.reason}:${diagnostic.path}`)
          .join(',')}`,
      );
    }
    const reconciliation = reconcileWorkerTruthRecords(inspection.sources);
    const decisionRecords = this.buildDecisionRecords(reconciliation);
    await this.appendMissingRecords(
      'review-events',
      this.reviewGenerationId,
      reconciliation.reviewFacts,
    );
    await this.appendMissingRecords(
      'domain-sync-operations',
      this.domainSyncGenerationId,
      decisionRecords,
    );

    const cardReference = await this.publishCompactableFamily(
      'card-memory-facts',
      reconciliation.effectiveCardRecords,
      reconciliation,
    );
    const queueReference = await this.publishCompactableFamily(
      'queue-facts',
      reconciliation.effectiveQueueRecords,
      reconciliation,
    );
    const generationIds = {
      card: cardReference?.generationId ?? null,
      queue: queueReference?.generationId ?? null,
      review: this.reviewGenerationId,
      domainSync: this.domainSyncGenerationId,
    };
    const truthRecords = [
      ...reconciliation.effectiveCardRecords,
      ...reconciliation.effectiveQueueRecords,
      ...reconciliation.reviewFacts,
      ...decisionRecords,
    ].map((record) => structuredClone(record));
    if (this.rebuildProjection) {
      await this.rebuildProjection({
        reconciliation,
        truthRecords,
        generationIds,
      });
    }
    return {
      reconciliation,
      generationIds,
      projectionRebuilt: Boolean(this.rebuildProjection),
    };
  }

  private async appendMissingRecords(
    family: 'review-events' | 'domain-sync-operations',
    generationId: string,
    records: MessagePackTruthRecord[],
  ): Promise<void> {
    if (records.length === 0) {
      return;
    }
    const store = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.localDeviceId,
      generationId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    const replay = await store.replayRecords({ dedupeByIdempotencyKey: true });
    if (replay.diagnostics.length > 0) {
      throw new Error(
        `truth-reconciliation-target-invalid:${family}:${replay.diagnostics
          .map((diagnostic) => diagnostic.reason)
          .join(',')}`,
      );
    }
    const existingKeys = new Set(
      replay.records
        .map(recordIdempotencyKey)
        .filter((key): key is string => Boolean(key)),
    );
    const missing = records.filter((record) => {
      const key = recordIdempotencyKey(record);
      return !key || !existingKeys.has(key);
    });
    if (missing.length > 0) {
      await store.appendRecords(missing);
    }
    const verified = await store.replayRecords({ dedupeByIdempotencyKey: true });
    const verifiedKeys = new Set(
      verified.records
        .map(recordIdempotencyKey)
        .filter((key): key is string => Boolean(key)),
    );
    for (const record of records) {
      const key = recordIdempotencyKey(record);
      if (key && !verifiedKeys.has(key)) {
        throw new Error(`truth-reconciliation-append-verification-failed:${family}:${key}`);
      }
    }
  }

  private async publishCompactableFamily(
    family: 'card-memory-facts' | 'queue-facts',
    records: MessagePackTruthRecord[],
    reconciliation: WorkerTruthReconciliationResult,
  ): Promise<MessagePackTruthGenerationReference | null> {
    if (records.length === 0) {
      return null;
    }
    const generationStore = new MessagePackTruthSnapshotGenerationStore({
      fileStore: this.fileStore,
      family,
      deviceId: this.localDeviceId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
    });
    const generationId = `reconcile-${family}-${deterministicHash({
      acceptedMutationIds: reconciliation.acceptedMutationIds,
      blockedAggregateIds: reconciliation.blockedAggregateIds,
      conflicts: reconciliation.conflicts,
      mergeDecisions: reconciliation.mergeDecisions,
      records,
    })}`;
    const inspection = await generationStore.inspectGenerations();
    if (inspection.fence.current) {
      const current = await generationStore.replayVerifiedGeneration(inspection.fence.current);
      if (
        inspection.fence.current.generationId === generationId
        || recordsEquivalent(current.records, records)
      ) {
        return inspection.fence.current;
      }
    }
    const publishGenerationId = inspection.fence.previous?.generationId === generationId
      ? `${generationId}-recovered-${inspection.fence.fence + 1}`
      : generationId;
    if (inspection.fence.previous?.generationId === generationId) {
      const previous = await generationStore.replayVerifiedGeneration(inspection.fence.previous);
      if (!recordsEquivalent(previous.records, records)) {
        throw new Error(`truth-reconciliation-previous-generation-conflict:${family}:${generationId}`);
      }
    }
    const published = await generationStore.publishGeneration({
      generationId: publishGenerationId,
      records,
      expectedCurrentGenerationId: inspection.fence.current?.generationId ?? null,
      recoveryPreviousGenerationId: inspection.fence.previous?.generationId === generationId
        ? generationId
        : undefined,
    });
    const reference = published.fence.current;
    if (!reference || reference.generationId !== publishGenerationId) {
      throw new Error(`truth-reconciliation-publication-unverified:${family}:${publishGenerationId}`);
    }
    await generationStore.replayVerifiedGeneration(reference);
    return reference;
  }

  private buildDecisionRecords(
    reconciliation: WorkerTruthReconciliationResult,
  ): MessagePackTruthRecord[] {
    const recordedAt = Math.max(
      1,
      ...reconciliation.acceptedRecords.map((record) => (
        Math.max(0, Math.floor(Number(record.recordedAt ?? record.logicalTime ?? 0)))
      )),
    );
    const conflictRecords = reconciliation.conflicts.map((conflict) => {
      const hash = deterministicHash(conflict);
      return {
        family: 'domain-sync-operations',
        schemaVersion: this.schemaVersion,
        type: 'domain-sync.conflict-decision.v1',
        operationId: `reconciliation-conflict:${hash}`,
        idempotencyKey: `reconciliation-conflict:${hash}`,
        logicalTime: recordedAt,
        recordedAt,
        operationType: 'reconciliation-conflict',
        source: {},
        payload: {
          decision: 'blocked',
          localDeviceId: this.localDeviceId,
          localIdentityEpoch: this.localIdentityEpoch,
          conflict: structuredClone(conflict),
        },
      } satisfies MessagePackTruthRecord;
    });
    const mergeRecords = reconciliation.mergeDecisions.map((decision) => {
      const hash = deterministicHash(decision);
      return {
        family: 'domain-sync-operations',
        schemaVersion: this.schemaVersion,
        type: 'domain-sync.conflict-decision.v1',
        operationId: `reconciliation-merge:${hash}`,
        idempotencyKey: `reconciliation-merge:${hash}`,
        logicalTime: recordedAt,
        recordedAt,
        operationType: 'reconciliation-merge',
        source: {},
        payload: {
          decision: 'merged',
          localDeviceId: this.localDeviceId,
          localIdentityEpoch: this.localIdentityEpoch,
          merge: structuredClone(decision),
        },
      } satisfies MessagePackTruthRecord;
    });
    return [...conflictRecords, ...mergeRecords].sort((left, right) => (
      String(left.idempotencyKey).localeCompare(String(right.idempotencyKey))
    ));
  }
}
