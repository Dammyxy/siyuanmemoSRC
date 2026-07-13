import type { MessagePackTruthFamily } from '../../packages/contracts/src/backend-rpc';
import {
  createMessagePackTruthSegmentStore,
  type MessagePackTruthRecord,
  type MessagePackTruthSegmentFileStore,
  type MessagePackTruthSegmentManifest,
} from './MessagePackTruthSegmentStore';

export const MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION = 1 as const;

export interface MessagePackTruthGenerationReference {
  generationId: string;
  manifestPath: string;
  manifestChecksum: string;
  verifiedAt: number;
}

export interface MessagePackTruthGenerationFence {
  version: typeof MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION;
  path: string;
  family: MessagePackTruthFamily;
  deviceId: string;
  schemaVersion: number;
  fence: number;
  current: MessagePackTruthGenerationReference | null;
  previous: MessagePackTruthGenerationReference | null;
  updatedAt: number;
}

export interface MessagePackTruthSnapshotGeneration {
  version: typeof MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION;
  family: MessagePackTruthFamily;
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  manifest: MessagePackTruthSegmentManifest;
  manifestChecksum: string;
  recordCount: number;
  verifiedAt: number;
}

export interface MessagePackTruthSnapshotGenerationStoreOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  family: MessagePackTruthFamily;
  deviceId: string;
  schemaVersion: number;
  maxSegmentBytes?: number;
  maxSegmentRecords?: number;
  basePath?: string;
}

export interface MessagePackTruthPublishGenerationInput {
  generationId: string;
  records: MessagePackTruthRecord[];
  expectedCurrentGenerationId: string | null;
  recoveryPreviousGenerationId?: string;
}

export interface MessagePackTruthGenerationInspection {
  fence: MessagePackTruthGenerationFence;
  retainedGenerationIds: string[];
  orphanPaths: string[];
}

export interface MessagePackTruthVerifiedGenerationReplay {
  reference: MessagePackTruthGenerationReference;
  generation: MessagePackTruthSnapshotGeneration;
  manifest: MessagePackTruthSegmentManifest;
  records: MessagePackTruthRecord[];
}

export interface MessagePackTruthPublishGenerationResult
  extends MessagePackTruthGenerationInspection {
  generation: MessagePackTruthSnapshotGeneration;
}

export interface MessagePackTruthGenerationRetentionResult {
  retainedGenerationIds: string[];
  deletedPaths: string[];
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid snapshot generation ${label}: ${value}`);
  }
  return normalized;
}

function normalizeSchemaVersion(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`Invalid snapshot generation schema version: ${value}`);
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeReference(value: unknown): MessagePackTruthGenerationReference | null {
  if (!isRecord(value)) {
    return null;
  }
  const generationId = String(value.generationId || '').trim();
  const manifestPath = String(value.manifestPath || '').trim();
  const manifestChecksum = String(value.manifestChecksum || '').trim();
  const verifiedAt = Math.max(0, Math.floor(Number(value.verifiedAt) || 0));
  if (!generationId || !manifestPath || !/^sha256:[a-f0-9]{64}$/.test(manifestChecksum) || verifiedAt < 1) {
    return null;
  }
  return {
    generationId,
    manifestPath,
    manifestChecksum,
    verifiedAt,
  };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Json(value: unknown): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('BACKEND_UNAVAILABLE: snapshot generation checksum requires SHA-256 support');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function canonicalRecordValue(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(canonicalRecordValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        canonicalRecordValue((value as Record<string, unknown>)[key]),
      ]),
    );
  }
  return value;
}

function recordSignatures(records: MessagePackTruthRecord[]): string[] {
  return records
    .map((record) => JSON.stringify(canonicalRecordValue(record)))
    .sort();
}

function recordsEquivalent(left: MessagePackTruthRecord[], right: MessagePackTruthRecord[]): boolean {
  return JSON.stringify(recordSignatures(left)) === JSON.stringify(recordSignatures(right));
}

export class MessagePackTruthSnapshotGenerationStore {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly family: MessagePackTruthFamily;
  private readonly deviceId: string;
  private readonly schemaVersion: number;
  private readonly maxSegmentBytes?: number;
  private readonly maxSegmentRecords?: number;
  private readonly basePath: string;

  readonly fencePath: string;

  constructor(options: MessagePackTruthSnapshotGenerationStoreOptions) {
    if (options.family !== 'card-memory-facts' && options.family !== 'queue-facts') {
      throw new Error(`Unsupported compactable snapshot family: ${options.family}`);
    }
    this.fileStore = options.fileStore;
    this.family = options.family;
    this.deviceId = normalizeIdentity(options.deviceId, 'device id');
    this.schemaVersion = normalizeSchemaVersion(options.schemaVersion);
    this.maxSegmentBytes = options.maxSegmentBytes;
    this.maxSegmentRecords = options.maxSegmentRecords;
    this.basePath = (options.basePath || 'truth').replace(/\\/g, '/').replace(/\/+$/g, '');
    if (!this.basePath || this.basePath.includes('..')) {
      throw new Error(`Invalid snapshot generation base path: ${options.basePath}`);
    }
    this.fencePath = `${this.basePath}/${this.family}/device-${this.deviceId}/generation-fence.v1.json`;
  }

  async publishGeneration(
    input: MessagePackTruthPublishGenerationInput,
  ): Promise<MessagePackTruthPublishGenerationResult> {
    const generationId = normalizeIdentity(input.generationId, 'generation id');
    const fence = await this.readFence();
    const actualCurrentGenerationId = fence.current?.generationId ?? null;
    if (actualCurrentGenerationId !== input.expectedCurrentGenerationId) {
      throw new Error(
        `snapshot-generation-fence-conflict:${input.expectedCurrentGenerationId ?? 'null'}:${actualCurrentGenerationId ?? 'null'}`,
      );
    }
    if (generationId === actualCurrentGenerationId || generationId === fence.previous?.generationId) {
      throw new Error(`snapshot-generation-id-not-new:${generationId}`);
    }
    const previousReference = input.recoveryPreviousGenerationId === undefined
      ? fence.current
      : fence.previous?.generationId === input.recoveryPreviousGenerationId
        ? fence.previous
        : null;
    if (
      input.recoveryPreviousGenerationId !== undefined
      && previousReference === null
    ) {
      throw new Error(
        `snapshot-generation-recovery-previous-conflict:${input.recoveryPreviousGenerationId}:${fence.previous?.generationId ?? 'null'}`,
      );
    }

    const segmentStore = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family: this.family,
      deviceId: this.deviceId,
      generationId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
      basePath: this.basePath,
    });
    const existing = await segmentStore.replayRecords({ dedupeByIdempotencyKey: false });
    let manifest = existing.manifest;
    if (existing.records.length === 0 && existing.manifest.segments.length === 0) {
      manifest = (await segmentStore.appendRecords(input.records)).manifest;
    } else if (!recordsEquivalent(existing.records, input.records)) {
      throw new Error(`snapshot-generation-immutable-conflict:${generationId}`);
    }

    const verified = await segmentStore.replayRecords({ dedupeByIdempotencyKey: false });
    if (
      verified.records.length !== input.records.length
      || !recordsEquivalent(verified.records, input.records)
    ) {
      throw new Error(`snapshot-generation-verification-failed:${generationId}`);
    }
    manifest = verified.manifest;
    const manifestChecksum = await sha256Json(manifest);
    const verifiedAt = Date.now();
    const candidateGeneration: MessagePackTruthSnapshotGeneration = {
      version: MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION,
      family: this.family,
      deviceId: this.deviceId,
      generationId,
      schemaVersion: this.schemaVersion,
      manifest,
      manifestChecksum,
      recordCount: verified.records.length,
      verifiedAt,
    };
    const generation = await this.writeImmutableGenerationDescriptor(candidateGeneration);

    const reference: MessagePackTruthGenerationReference = {
      generationId,
      manifestPath: manifest.path,
      manifestChecksum,
      verifiedAt,
    };
    const nextFence: MessagePackTruthGenerationFence = {
      version: MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION,
      path: this.fencePath,
      family: this.family,
      deviceId: this.deviceId,
      schemaVersion: this.schemaVersion,
      fence: fence.fence + 1,
      current: reference,
      previous: previousReference,
      updatedAt: verifiedAt,
    };
    await this.fileStore.writeJSON(this.fencePath, nextFence);
    const publishedFence = await this.readFence();
    if (
      publishedFence.fence !== nextFence.fence
      || publishedFence.current?.generationId !== generationId
      || publishedFence.current.manifestChecksum !== manifestChecksum
    ) {
      throw new Error(`snapshot-generation-fence-verification-failed:${generationId}`);
    }
    const inspection = await this.inspectGenerations();
    return {
      generation,
      ...inspection,
    };
  }

  async inspectGenerations(): Promise<MessagePackTruthGenerationInspection> {
    const fence = await this.readFence();
    const retainedGenerationIds = Array.from(new Set(
      [fence.current?.generationId, fence.previous?.generationId].filter(
        (generationId): generationId is string => Boolean(generationId),
      ),
    ));
    if (!this.fileStore.listFiles) {
      return {
        fence,
        retainedGenerationIds,
        orphanPaths: [],
      };
    }
    const retained = new Set(retainedGenerationIds);
    const familyPrefix = `${this.basePath}/${this.family}/`;
    const generationPathPattern = new RegExp(
      `^${escapeRegExp(familyPrefix)}([^/]+)/device-${escapeRegExp(this.deviceId)}/`,
    );
    const generationDescriptorPattern = new RegExp(
      `^${escapeRegExp(familyPrefix)}([^/]+)/device-${escapeRegExp(this.deviceId)}/generation\\.v1\\.json$`,
    );
    const paths = (await this.fileStore.listFiles(familyPrefix))
      .map((path) => String(path || '').replace(/\\/g, '/').trim())
      .filter(Boolean);
    const orphanGenerationIds = new Set(paths
      .map((path) => generationDescriptorPattern.exec(path)?.[1] ?? null)
      .filter((generationId): generationId is string => Boolean(generationId) && !retained.has(generationId)));
    const orphanPaths = Array.from(new Set(paths
      .map((path) => ({ path, match: generationPathPattern.exec(path) }))
      .filter((candidate) => candidate.match && orphanGenerationIds.has(candidate.match[1]))
      .map((candidate) => candidate.path)))
      .sort();
    return {
      fence,
      retainedGenerationIds,
      orphanPaths,
    };
  }

  async replayVerifiedGeneration(
    reference: MessagePackTruthGenerationReference,
  ): Promise<MessagePackTruthVerifiedGenerationReplay> {
    const generationId = normalizeIdentity(reference.generationId, 'generation id');
    const generationPath = this.generationDescriptorPath(generationId);
    const generation = await this.fileStore.readJSON<MessagePackTruthSnapshotGeneration>(generationPath);
    if (!generation) {
      throw new Error(`snapshot-generation-descriptor-missing:${generationId}`);
    }
    if (
      generation.version !== MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION
      || generation.family !== this.family
      || generation.deviceId !== this.deviceId
      || generation.generationId !== generationId
      || generation.schemaVersion !== this.schemaVersion
      || generation.manifest.path !== reference.manifestPath
      || generation.manifestChecksum !== reference.manifestChecksum
    ) {
      throw new Error(`snapshot-generation-descriptor-invalid:${generationId}`);
    }

    const segmentStore = createMessagePackTruthSegmentStore({
      fileStore: this.fileStore,
      family: this.family,
      deviceId: this.deviceId,
      generationId,
      schemaVersion: this.schemaVersion,
      maxSegmentBytes: this.maxSegmentBytes,
      maxSegmentRecords: this.maxSegmentRecords,
      basePath: this.basePath,
    });
    const replay = await segmentStore.replayRecords({ dedupeByIdempotencyKey: false });
    const manifestChecksum = await sha256Json(replay.manifest);
    if (
      replay.manifest.path !== reference.manifestPath
      || manifestChecksum !== reference.manifestChecksum
      || manifestChecksum !== generation.manifestChecksum
      || replay.records.length !== generation.recordCount
      || JSON.stringify(replay.manifest) !== JSON.stringify(generation.manifest)
    ) {
      throw new Error(`snapshot-generation-reference-verification-failed:${generationId}`);
    }
    return {
      reference,
      generation,
      manifest: replay.manifest,
      records: replay.records,
    };
  }

  async reclaimObsoleteGenerations(): Promise<MessagePackTruthGenerationRetentionResult> {
    const inspection = await this.inspectGenerations();
    if (inspection.orphanPaths.length === 0) {
      return {
        retainedGenerationIds: inspection.retainedGenerationIds,
        deletedPaths: [],
      };
    }
    if (!this.fileStore.deleteFile) {
      throw new Error('snapshot-generation-delete-unavailable');
    }
    const deletedPaths: string[] = [];
    for (const path of inspection.orphanPaths) {
      await this.fileStore.deleteFile(path);
      deletedPaths.push(path);
    }
    const remaining = await this.inspectGenerations();
    if (remaining.orphanPaths.length > 0) {
      throw new Error(`snapshot-generation-retention-incomplete:${remaining.orphanPaths.join(',')}`);
    }
    return {
      retainedGenerationIds: remaining.retainedGenerationIds,
      deletedPaths,
    };
  }

  private generationDescriptorPath(generationId: string): string {
    return `${this.basePath}/${this.family}/${generationId}/device-${this.deviceId}/generation.v1.json`;
  }

  private async writeImmutableGenerationDescriptor(
    generation: MessagePackTruthSnapshotGeneration,
  ): Promise<MessagePackTruthSnapshotGeneration> {
    const path = this.generationDescriptorPath(generation.generationId);
    const existing = await this.fileStore.readJSON<MessagePackTruthSnapshotGeneration>(path);
    if (existing) {
      if (!generationDescriptorsEquivalent(existing, generation)) {
        throw new Error(`snapshot-generation-descriptor-immutable-conflict:${generation.generationId}`);
      }
      return existing;
    }
    await this.fileStore.writeJSON(path, generation);
    return generation;
  }

  private emptyFence(): MessagePackTruthGenerationFence {
    return {
      version: MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION,
      path: this.fencePath,
      family: this.family,
      deviceId: this.deviceId,
      schemaVersion: this.schemaVersion,
      fence: 0,
      current: null,
      previous: null,
      updatedAt: 0,
    };
  }

  private async readFence(): Promise<MessagePackTruthGenerationFence> {
    const value = await this.fileStore.readJSON<unknown>(this.fencePath);
    if (value === null) {
      return this.emptyFence();
    }
    if (!isRecord(value)) {
      throw new Error('snapshot-generation-fence-invalid');
    }
    const version = Math.floor(Number(value.version) || 0);
    if (version !== MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION) {
      throw new Error(`snapshot-generation-fence-version-unsupported:${version}`);
    }
    const normalized: MessagePackTruthGenerationFence = {
      version: MESSAGEPACK_TRUTH_GENERATION_FENCE_VERSION,
      path: String(value.path || ''),
      family: String(value.family || '') as MessagePackTruthFamily,
      deviceId: String(value.deviceId || ''),
      schemaVersion: Math.floor(Number(value.schemaVersion) || 0),
      fence: Math.max(0, Math.floor(Number(value.fence) || 0)),
      current: normalizeReference(value.current),
      previous: normalizeReference(value.previous),
      updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || 0)),
    };
    if (
      normalized.path !== this.fencePath
      || normalized.family !== this.family
      || normalized.deviceId !== this.deviceId
      || normalized.schemaVersion !== this.schemaVersion
      || (value.current !== null && !normalized.current)
      || (value.previous !== null && !normalized.previous)
    ) {
      throw new Error('snapshot-generation-fence-invalid');
    }
    return normalized;
  }
}

function generationDescriptorsEquivalent(
  left: MessagePackTruthSnapshotGeneration,
  right: MessagePackTruthSnapshotGeneration,
): boolean {
  return JSON.stringify({
    ...left,
    verifiedAt: 0,
  }) === JSON.stringify({
    ...right,
    verifiedAt: 0,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
