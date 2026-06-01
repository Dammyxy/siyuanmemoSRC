import { decode, encode } from '@msgpack/msgpack';
import {
  getMessagePackTruthFamilyStoragePolicy,
  type MessagePackTruthFamily,
} from '../../packages/contracts/src/backend-rpc';

export const MESSAGEPACK_TRUTH_MANIFEST_VERSION = 1;

export type MessagePackTruthValidationReason =
  | 'checksum-mismatch'
  | 'family-mismatch'
  | 'generation-mismatch'
  | 'manifest-device-mismatch'
  | 'orphan-segment'
  | 'segment-device-mismatch'
  | 'schema-version-mismatch'
  | 'segment-record-count-mismatch'
  | 'segment-path-mismatch'
  | 'segment-unreadable'
  | 'unsupported-manifest-version'
  | 'unsupported-segment-version';

export interface MessagePackTruthValidationDiagnostic {
  reason: MessagePackTruthValidationReason;
  path: string;
  expected?: unknown;
  actual?: unknown;
}

export class MessagePackTruthValidationError extends Error {
  constructor(readonly diagnostics: MessagePackTruthValidationDiagnostic[]) {
    super(`MessagePack truth validation failed: ${diagnostics.map((item) => item.reason).join(', ')}`);
    this.name = 'MessagePackTruthValidationError';
  }
}

export interface MessagePackTruthSegmentFileStore {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
  readBinary(fileName: string): Promise<Uint8Array | null>;
  writeBinary(fileName: string, bytes: Uint8Array): Promise<void>;
  listFiles?(prefix: string): Promise<string[]>;
}

export type MessagePackTruthRecord = Record<string, unknown>;

export interface MessagePackTruthSegmentManifestEntry {
  version: typeof MESSAGEPACK_TRUTH_MANIFEST_VERSION;
  family: string;
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  sequence: number;
  path: string;
  checksum: string;
  recordCount: number;
  byteSize: number;
  minLogicalTime: number | null;
  maxLogicalTime: number | null;
  closedAt: number;
  compactedFrom: string[];
}

export interface MessagePackTruthSegmentManifest {
  version: typeof MESSAGEPACK_TRUTH_MANIFEST_VERSION;
  path: string;
  family: string;
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  segments: MessagePackTruthSegmentManifestEntry[];
  updatedAt: number;
}

export interface MessagePackTruthSegmentEnvelope {
  version: typeof MESSAGEPACK_TRUTH_MANIFEST_VERSION;
  family: string;
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  sequence: number;
  path: string;
  closedAt: number;
  records: MessagePackTruthRecord[];
}

export interface MessagePackTruthSegmentStoreOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  family: string;
  deviceId: string;
  generationId: string;
  schemaVersion: number;
  maxSegmentBytes?: number;
  basePath?: string;
}

export interface MessagePackTruthAppendOptions {
  targetDeviceId?: string;
}

export interface MessagePackTruthAppendResult {
  manifest: MessagePackTruthSegmentManifest;
  segments: MessagePackTruthSegmentManifestEntry[];
}

export interface MessagePackTruthReplayOptions {
  dedupeByIdempotencyKey?: boolean;
}

export interface MessagePackTruthReplayResult {
  manifest: MessagePackTruthSegmentManifest;
  records: MessagePackTruthRecord[];
  skippedDuplicateCount: number;
  diagnostics: MessagePackTruthValidationDiagnostic[];
}

export interface MessagePackTruthCompactionPlanOptions {
  maxClosedSegments?: number;
}

export interface MessagePackTruthCompactionPlan {
  eligible: boolean;
  reason: 'closed-segment-count-exceeded' | 'within-budget';
  candidateSegments: MessagePackTruthSegmentManifestEntry[];
}

export interface MessagePackTruthLocalSegmentIndex {
  family: string | null;
  schemaVersion: number | null;
  generationIds: string[];
  devices: string[];
  segments: MessagePackTruthSegmentManifestEntry[];
  diagnostics: MessagePackTruthValidationDiagnostic[];
}

export type MessagePackTruthRemoteReplayConflictReason =
  | 'base-memory-mismatch'
  | 'projection-generation-conflict';

export interface MessagePackTruthRemoteReplayConflict {
  reason: MessagePackTruthRemoteReplayConflictReason;
  cardId: string | null;
  idempotencyKey: string | null;
  deviceId: string;
  path: string;
  expectedBaseMemoryHash?: string | null;
  actualBaseMemoryHash?: string | null;
  expectedProjectionGeneration?: number | null;
  actualProjectionGeneration?: number | null;
  record: MessagePackTruthRecord;
}

export interface MessagePackTruthRemoteReplayOptions {
  fileStore: MessagePackTruthSegmentFileStore;
  manifests: MessagePackTruthSegmentManifest[];
  family: string;
  generationId: string;
  schemaVersion: number;
  dedupeByIdempotencyKey?: boolean;
  detectReviewConflicts?: boolean;
}

export interface MessagePackTruthRemoteReplayResult {
  localIndex: MessagePackTruthLocalSegmentIndex;
  acceptedRecords: MessagePackTruthRecord[];
  duplicateRecords: MessagePackTruthRecord[];
  conflicts: MessagePackTruthRemoteReplayConflict[];
  validationDiagnostics: MessagePackTruthValidationDiagnostic[];
}

interface CandidateSegment {
  envelope: MessagePackTruthSegmentEnvelope;
  bytes: Uint8Array;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(normalized) || normalized.includes('..')) {
    throw new Error(`Invalid MessagePack truth ${label}: ${value}`);
  }
  return normalized;
}

function normalizeSchemaVersion(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 1) {
    throw new Error(`Invalid MessagePack truth schema version: ${value}`);
  }
  return normalized;
}

function normalizeSegmentBudget(value: number): number {
  const normalized = Math.floor(Number(value));
  if (!Number.isFinite(normalized) || normalized < 256) {
    throw new Error(`Invalid MessagePack truth segment budget: ${value}`);
  }
  return normalized;
}

function resolveFamilySegmentBudget(family: string, maxSegmentBytes?: number): number {
  if (maxSegmentBytes !== undefined && maxSegmentBytes !== null) {
    return normalizeSegmentBudget(maxSegmentBytes);
  }
  return getMessagePackTruthFamilyStoragePolicy(family as MessagePackTruthFamily).maxSegmentBytes;
}

function resolveFamilyTargetClosedSegments(family: string, maxClosedSegments?: number): number {
  if (maxClosedSegments !== undefined && maxClosedSegments !== null) {
    return Math.max(1, Math.floor(Number(maxClosedSegments) || 1));
  }
  return getMessagePackTruthFamilyStoragePolicy(family as MessagePackTruthFamily).compaction.targetClosedSegments;
}

function cloneRecord(value: MessagePackTruthRecord): MessagePackTruthRecord {
  return structuredClone(value);
}

function getLogicalTime(record: MessagePackTruthRecord): number | null {
  const value = record.logicalTime ?? record.reviewedAt ?? record.recordedAt ?? record.createdAt;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRecordObject(record: MessagePackTruthRecord, field: string): Record<string, unknown> | null {
  const value = record[field];
  return isRecord(value) ? value : null;
}

function getRecordIdempotencyKey(record: MessagePackTruthRecord): string | null {
  return stringField(record.idempotencyKey);
}

function getRecordCardId(record: MessagePackTruthRecord): string | null {
  return stringField(record.cardId) ?? stringField(getRecordObject(record, 'source')?.cardId);
}

function getRecordBaseMemoryHash(record: MessagePackTruthRecord): string | null {
  return stringField(record.baseMemoryHash) ?? stringField(getRecordObject(record, 'memory')?.baseMemoryHash);
}

function getRecordAfterMemoryHash(record: MessagePackTruthRecord): string | null {
  return stringField(record.afterMemoryHash) ?? stringField(getRecordObject(record, 'memory')?.afterMemoryHash);
}

function getRecordProjectionGeneration(record: MessagePackTruthRecord): number | null {
  return numberField(record.projectionGeneration) ?? numberField(getRecordObject(record, 'memory')?.projectionGeneration);
}

function minLogicalTime(records: MessagePackTruthRecord[]): number | null {
  let result: number | null = null;
  for (const record of records) {
    const logicalTime = getLogicalTime(record);
    if (logicalTime === null) {
      continue;
    }
    result = result === null ? logicalTime : Math.min(result, logicalTime);
  }
  return result;
}

function maxLogicalTime(records: MessagePackTruthRecord[]): number | null {
  let result: number | null = null;
  for (const record of records) {
    const logicalTime = getLogicalTime(record);
    if (logicalTime === null) {
      continue;
    }
    result = result === null ? logicalTime : Math.max(result, logicalTime);
  }
  return result;
}

function segmentId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('BACKEND_UNAVAILABLE: MessagePack truth checksum requires SHA-256 support');
  }
  const digest = await subtle.digest('SHA-256', bytes);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

function normalizeManifest(value: unknown, fallback: MessagePackTruthSegmentManifest): MessagePackTruthSegmentManifest {
  if (!isRecord(value)) {
    return fallback;
  }
  const segments = Array.isArray(value.segments)
    ? value.segments
      .filter(isRecord)
      .map((entry) => ({
        version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
        family: String(entry.family || ''),
        deviceId: String(entry.deviceId || ''),
        generationId: String(entry.generationId || ''),
        schemaVersion: Math.floor(Number(entry.schemaVersion) || 0),
        sequence: Math.max(0, Math.floor(Number(entry.sequence) || 0)),
        path: String(entry.path || ''),
        checksum: String(entry.checksum || ''),
        recordCount: Math.max(0, Math.floor(Number(entry.recordCount) || 0)),
        byteSize: Math.max(0, Math.floor(Number(entry.byteSize) || 0)),
        minLogicalTime: typeof entry.minLogicalTime === 'number' && Number.isFinite(entry.minLogicalTime)
          ? entry.minLogicalTime
          : null,
        maxLogicalTime: typeof entry.maxLogicalTime === 'number' && Number.isFinite(entry.maxLogicalTime)
          ? entry.maxLogicalTime
          : null,
        closedAt: Math.max(0, Math.floor(Number(entry.closedAt) || 0)),
        compactedFrom: Array.isArray(entry.compactedFrom)
          ? entry.compactedFrom.map(String).filter(Boolean)
          : [],
      } satisfies MessagePackTruthSegmentManifestEntry))
      .sort((left, right) => left.sequence - right.sequence)
    : [];
  return {
    version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
    path: String(value.path || fallback.path),
    family: String(value.family || ''),
    deviceId: String(value.deviceId || ''),
    generationId: String(value.generationId || ''),
    schemaVersion: Math.floor(Number(value.schemaVersion) || 0),
    segments,
    updatedAt: Math.max(0, Math.floor(Number(value.updatedAt) || 0)),
  };
}

function validateRecord(value: unknown): MessagePackTruthRecord {
  if (!isRecord(value)) {
    throw new Error('MessagePack truth segment records must be objects');
  }
  return cloneRecord(value);
}

function validateSegmentEnvelope(value: unknown): MessagePackTruthSegmentEnvelope | null {
  if (!isRecord(value) || !Array.isArray(value.records)) {
    return null;
  }
  return {
    version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
    family: String(value.family || ''),
    deviceId: String(value.deviceId || ''),
    generationId: String(value.generationId || ''),
    schemaVersion: Math.floor(Number(value.schemaVersion) || 0),
    sequence: Math.max(0, Math.floor(Number(value.sequence) || 0)),
    path: String(value.path || ''),
    closedAt: Math.max(0, Math.floor(Number(value.closedAt) || 0)),
    records: value.records.map(validateRecord),
  };
}

export class MessagePackTruthSegmentStore {
  private readonly fileStore: MessagePackTruthSegmentFileStore;
  private readonly family: string;
  private readonly deviceId: string;
  private readonly generationId: string;
  private readonly schemaVersion: number;
  private readonly maxSegmentBytes: number;
  private readonly basePath: string;
  private readonly manifestPath: string;

  constructor(options: MessagePackTruthSegmentStoreOptions) {
    this.fileStore = options.fileStore;
    this.family = normalizeIdentity(options.family, 'family');
    this.deviceId = normalizeIdentity(options.deviceId, 'device id');
    this.generationId = normalizeIdentity(options.generationId, 'generation id');
    this.schemaVersion = normalizeSchemaVersion(options.schemaVersion);
    this.maxSegmentBytes = resolveFamilySegmentBudget(this.family, options.maxSegmentBytes);
    this.basePath = (options.basePath || 'truth').replace(/\\/g, '/').replace(/\/+$/g, '');
    if (!this.basePath || this.basePath.includes('..')) {
      throw new Error(`Invalid MessagePack truth base path: ${options.basePath}`);
    }
    this.manifestPath = `${this.deviceDirectory}/manifest.v1.json`;
  }

  async appendRecords(
    records: MessagePackTruthRecord[],
    options: MessagePackTruthAppendOptions = {},
  ): Promise<MessagePackTruthAppendResult> {
    const targetDeviceId = options.targetDeviceId ? normalizeIdentity(options.targetDeviceId, 'target device id') : this.deviceId;
    if (targetDeviceId !== this.deviceId) {
      throw new Error(`device-owned segment violation: ${this.deviceId} cannot append ${targetDeviceId}`);
    }

    const acceptedRecords = records.map(validateRecord);
    const manifest = await this.readManifest();
    this.throwIfManifestInvalid(manifest);
    const nextSequence = manifest.segments.reduce((max, segment) => Math.max(max, segment.sequence), 0) + 1;
    const candidates = this.buildCandidateSegments(acceptedRecords, nextSequence);
    const entries: MessagePackTruthSegmentManifestEntry[] = [];
    for (const candidate of candidates) {
      const entry = await this.writeSegment(candidate);
      entries.push(entry);
    }
    const nextManifest: MessagePackTruthSegmentManifest = {
      ...manifest,
      segments: [...manifest.segments, ...entries].sort((left, right) => left.sequence - right.sequence),
      updatedAt: Date.now(),
    };
    await this.fileStore.writeJSON(this.manifestPath, nextManifest);
    return {
      manifest: nextManifest,
      segments: entries,
    };
  }

  async replayRecords(options: MessagePackTruthReplayOptions = {}): Promise<MessagePackTruthReplayResult> {
    const manifest = await this.readManifest();
    this.throwIfManifestInvalid(manifest);
    const validationDiagnostics: MessagePackTruthValidationDiagnostic[] = [];
    const indexedRecords: Array<{
      record: MessagePackTruthRecord;
      segmentSequence: number;
      recordIndex: number;
    }> = [];
    for (const segment of manifest.segments) {
      const envelope = await this.readAndValidateSegment(segment, validationDiagnostics);
      if (!envelope) {
        continue;
      }
      envelope.records.forEach((record, recordIndex) => {
        indexedRecords.push({
          record,
          segmentSequence: segment.sequence,
          recordIndex,
        });
      });
    }
    if (validationDiagnostics.length > 0) {
      throw new MessagePackTruthValidationError(validationDiagnostics);
    }
    const diagnostics = await this.collectOrphanSegmentDiagnostics(manifest);
    indexedRecords.sort((left, right) => {
      const leftTime = getLogicalTime(left.record) ?? Number.MAX_SAFE_INTEGER;
      const rightTime = getLogicalTime(right.record) ?? Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime
        || left.segmentSequence - right.segmentSequence
        || left.recordIndex - right.recordIndex;
    });
    const seenIdempotencyKeys = new Set<string>();
    const records: MessagePackTruthRecord[] = [];
    let skippedDuplicateCount = 0;
    for (const item of indexedRecords) {
      const idempotencyKey = typeof item.record.idempotencyKey === 'string' && item.record.idempotencyKey.trim()
        ? item.record.idempotencyKey
        : null;
      if (options.dedupeByIdempotencyKey && idempotencyKey) {
        if (seenIdempotencyKeys.has(idempotencyKey)) {
          skippedDuplicateCount += 1;
          continue;
        }
        seenIdempotencyKeys.add(idempotencyKey);
      }
      records.push(cloneRecord(item.record));
    }
    return {
      manifest,
      records,
      skippedDuplicateCount,
      diagnostics,
    };
  }

  async planCompaction(options: MessagePackTruthCompactionPlanOptions): Promise<MessagePackTruthCompactionPlan> {
    const manifest = await this.readManifest();
    this.throwIfManifestInvalid(manifest);
    const maxClosedSegments = resolveFamilyTargetClosedSegments(this.family, options.maxClosedSegments);
    if (manifest.segments.length <= maxClosedSegments) {
      return {
        eligible: false,
        reason: 'within-budget',
        candidateSegments: [],
      };
    }
    return {
      eligible: true,
      reason: 'closed-segment-count-exceeded',
      candidateSegments: manifest.segments.slice(0, manifest.segments.length - maxClosedSegments + 1),
    };
  }

  private get deviceDirectory(): string {
    return `${this.basePath}/${this.family}/device-${this.deviceId}`;
  }

  private emptyManifest(): MessagePackTruthSegmentManifest {
    return {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      path: this.manifestPath,
      family: this.family,
      deviceId: this.deviceId,
      generationId: this.generationId,
      schemaVersion: this.schemaVersion,
      segments: [],
      updatedAt: 0,
    };
  }

  private async readManifest(): Promise<MessagePackTruthSegmentManifest> {
    const manifest = normalizeManifest(await this.fileStore.readJSON(this.manifestPath), this.emptyManifest());
    if (manifest.updatedAt === 0 && manifest.segments.length === 0 && !manifest.family) {
      return this.emptyManifest();
    }
    return manifest;
  }

  private throwIfManifestInvalid(manifest: MessagePackTruthSegmentManifest): void {
    const diagnostics: MessagePackTruthValidationDiagnostic[] = [];
    if (manifest.version !== MESSAGEPACK_TRUTH_MANIFEST_VERSION) {
      diagnostics.push({
        reason: 'unsupported-manifest-version',
        path: this.manifestPath,
        expected: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
        actual: manifest.version,
      });
    }
    if (manifest.family !== this.family) {
      diagnostics.push({
        reason: 'family-mismatch',
        path: this.manifestPath,
        expected: this.family,
        actual: manifest.family,
      });
    }
    if (manifest.deviceId !== this.deviceId) {
      diagnostics.push({
        reason: 'manifest-device-mismatch',
        path: this.manifestPath,
        expected: this.deviceId,
        actual: manifest.deviceId,
      });
    }
    if (manifest.generationId !== this.generationId) {
      diagnostics.push({
        reason: 'generation-mismatch',
        path: this.manifestPath,
        expected: this.generationId,
        actual: manifest.generationId,
      });
    }
    if (manifest.schemaVersion !== this.schemaVersion) {
      diagnostics.push({
        reason: 'schema-version-mismatch',
        path: this.manifestPath,
        expected: this.schemaVersion,
        actual: manifest.schemaVersion,
      });
    }
    if (diagnostics.length > 0) {
      throw new MessagePackTruthValidationError(diagnostics);
    }
  }

  private buildCandidateSegments(records: MessagePackTruthRecord[], firstSequence: number): CandidateSegment[] {
    const candidates: CandidateSegment[] = [];
    let currentRecords: MessagePackTruthRecord[] = [];
    let sequence = firstSequence;
    for (const record of records) {
      const candidateRecords = [...currentRecords, record];
      const candidate = this.buildCandidateSegment(candidateRecords, sequence);
      if (candidate.bytes.byteLength <= this.maxSegmentBytes) {
        currentRecords = candidateRecords;
        continue;
      }
      if (currentRecords.length === 0) {
        throw new Error(`MessagePack truth record exceeds segment budget: ${candidate.bytes.byteLength}/${this.maxSegmentBytes}`);
      }
      candidates.push(this.buildCandidateSegment(currentRecords, sequence));
      sequence += 1;
      currentRecords = [record];
      const single = this.buildCandidateSegment(currentRecords, sequence);
      if (single.bytes.byteLength > this.maxSegmentBytes) {
        throw new Error(`MessagePack truth record exceeds segment budget: ${single.bytes.byteLength}/${this.maxSegmentBytes}`);
      }
    }
    if (currentRecords.length > 0) {
      candidates.push(this.buildCandidateSegment(currentRecords, sequence));
    }
    return candidates;
  }

  private buildCandidateSegment(records: MessagePackTruthRecord[], sequence: number): CandidateSegment {
    const path = `${this.deviceDirectory}/seg-${String(sequence).padStart(6, '0')}-${segmentId()}.msgpack`;
    const envelope: MessagePackTruthSegmentEnvelope = {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      family: this.family,
      deviceId: this.deviceId,
      generationId: this.generationId,
      schemaVersion: this.schemaVersion,
      sequence,
      path,
      closedAt: Date.now(),
      records: records.map(cloneRecord),
    };
    return {
      envelope,
      bytes: encode(envelope),
    };
  }

  private async writeSegment(candidate: CandidateSegment): Promise<MessagePackTruthSegmentManifestEntry> {
    const checksum = await sha256(candidate.bytes);
    await this.fileStore.writeBinary(candidate.envelope.path, candidate.bytes);
    const entry: MessagePackTruthSegmentManifestEntry = {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      family: this.family,
      deviceId: this.deviceId,
      generationId: this.generationId,
      schemaVersion: this.schemaVersion,
      sequence: candidate.envelope.sequence,
      path: candidate.envelope.path,
      checksum,
      recordCount: candidate.envelope.records.length,
      byteSize: candidate.bytes.byteLength,
      minLogicalTime: minLogicalTime(candidate.envelope.records),
      maxLogicalTime: maxLogicalTime(candidate.envelope.records),
      closedAt: candidate.envelope.closedAt,
      compactedFrom: [],
    };
    await this.fileStore.writeJSON(`${candidate.envelope.path}.checksum.json`, {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      path: entry.path,
      checksum: entry.checksum,
      byteSize: entry.byteSize,
      recordCount: entry.recordCount,
      writtenAt: entry.closedAt,
    });
    return entry;
  }

  private async collectOrphanSegmentDiagnostics(
    manifest: MessagePackTruthSegmentManifest,
  ): Promise<MessagePackTruthValidationDiagnostic[]> {
    if (!this.fileStore.listFiles) {
      return [];
    }
    const committedSegmentPaths = new Set(manifest.segments.map((segment) => segment.path));
    const devicePrefix = `${this.deviceDirectory}/`;
    const paths = await this.fileStore.listFiles(this.deviceDirectory);
    return Array.from(new Set(
      paths
        .map((path) => String(path || '').replace(/\\/g, '/').trim())
        .filter((path) => path.startsWith(devicePrefix))
        .filter((path) => path.endsWith('.msgpack'))
        .filter((path) => !committedSegmentPaths.has(path)),
    ))
      .sort()
      .map((path) => ({
        reason: 'orphan-segment',
        path,
      }));
  }

  private async readAndValidateSegment(
    entry: MessagePackTruthSegmentManifestEntry,
    diagnostics: MessagePackTruthValidationDiagnostic[],
  ): Promise<MessagePackTruthSegmentEnvelope | null> {
    const bytes = await this.fileStore.readBinary(entry.path);
    if (!bytes) {
      diagnostics.push({ reason: 'segment-unreadable', path: entry.path });
      return null;
    }
    const actualChecksum = await sha256(bytes);
    if (actualChecksum !== entry.checksum) {
      diagnostics.push({
        reason: 'checksum-mismatch',
        path: entry.path,
        expected: entry.checksum,
        actual: actualChecksum,
      });
      return null;
    }
    const envelope = validateSegmentEnvelope(decode(bytes));
    if (!envelope) {
      diagnostics.push({ reason: 'segment-unreadable', path: entry.path });
      return null;
    }
    if (envelope.version !== MESSAGEPACK_TRUTH_MANIFEST_VERSION) {
      diagnostics.push({
        reason: 'unsupported-segment-version',
        path: entry.path,
        expected: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
        actual: envelope.version,
      });
    }
    if (envelope.path !== entry.path) {
      diagnostics.push({
        reason: 'segment-path-mismatch',
        path: entry.path,
        expected: entry.path,
        actual: envelope.path,
      });
    }
    if (envelope.deviceId !== this.deviceId || entry.deviceId !== this.deviceId) {
      diagnostics.push({
        reason: 'segment-device-mismatch',
        path: entry.path,
        expected: this.deviceId,
        actual: envelope.deviceId,
      });
    }
    if (envelope.family !== this.family || entry.family !== this.family) {
      diagnostics.push({
        reason: 'family-mismatch',
        path: entry.path,
        expected: this.family,
        actual: envelope.family,
      });
    }
    if (envelope.generationId !== this.generationId || entry.generationId !== this.generationId) {
      diagnostics.push({
        reason: 'generation-mismatch',
        path: entry.path,
        expected: this.generationId,
        actual: envelope.generationId,
      });
    }
    if (envelope.schemaVersion !== this.schemaVersion || entry.schemaVersion !== this.schemaVersion) {
      diagnostics.push({
        reason: 'schema-version-mismatch',
        path: entry.path,
        expected: this.schemaVersion,
        actual: envelope.schemaVersion,
      });
    }
    if (envelope.records.length !== entry.recordCount) {
      diagnostics.push({
        reason: 'segment-record-count-mismatch',
        path: entry.path,
        expected: entry.recordCount,
        actual: envelope.records.length,
      });
    }
    return envelope;
  }
}

export function createMessagePackTruthSegmentStore(
  options: MessagePackTruthSegmentStoreOptions,
): MessagePackTruthSegmentStore {
  return new MessagePackTruthSegmentStore(options);
}

export function buildMessagePackTruthLocalSegmentIndex(
  manifests: MessagePackTruthSegmentManifest[],
): MessagePackTruthLocalSegmentIndex {
  const diagnostics: MessagePackTruthValidationDiagnostic[] = [];
  const normalizedManifests = manifests
    .filter(isRecord)
    .map((manifest) => normalizeManifest(manifest, {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      path: String(manifest.path || ''),
      family: String(manifest.family || ''),
      deviceId: String(manifest.deviceId || ''),
      generationId: String(manifest.generationId || ''),
      schemaVersion: Math.floor(Number(manifest.schemaVersion) || 0),
      segments: [],
      updatedAt: Math.max(0, Math.floor(Number(manifest.updatedAt) || 0)),
    }));
  const family = normalizedManifests[0]?.family || null;
  const schemaVersion = normalizedManifests[0]?.schemaVersion || null;
  for (const manifest of normalizedManifests) {
    if (family !== null && manifest.family !== family) {
      diagnostics.push({
        reason: 'family-mismatch',
        path: manifest.path,
        expected: family,
        actual: manifest.family,
      });
    }
    if (schemaVersion !== null && manifest.schemaVersion !== schemaVersion) {
      diagnostics.push({
        reason: 'schema-version-mismatch',
        path: manifest.path,
        expected: schemaVersion,
        actual: manifest.schemaVersion,
      });
    }
    for (const segment of manifest.segments) {
      if (segment.deviceId !== manifest.deviceId) {
        diagnostics.push({
          reason: 'segment-device-mismatch',
          path: segment.path,
          expected: manifest.deviceId,
          actual: segment.deviceId,
        });
      }
    }
  }
  const segments = normalizedManifests
    .flatMap((manifest) => manifest.segments)
    .sort((left, right) => {
      const leftTime = left.minLogicalTime ?? left.closedAt;
      const rightTime = right.minLogicalTime ?? right.closedAt;
      return leftTime - rightTime
        || left.deviceId.localeCompare(right.deviceId)
        || left.sequence - right.sequence;
    });
  return {
    family,
    schemaVersion,
    generationIds: Array.from(new Set(normalizedManifests.map((manifest) => manifest.generationId).filter(Boolean))).sort(),
    devices: Array.from(new Set(normalizedManifests.map((manifest) => manifest.deviceId).filter(Boolean))).sort(),
    segments,
    diagnostics,
  };
}

async function readAndValidateRemoteSegment(
  fileStore: MessagePackTruthSegmentFileStore,
  manifest: MessagePackTruthSegmentManifest,
  entry: MessagePackTruthSegmentManifestEntry,
  diagnostics: MessagePackTruthValidationDiagnostic[],
): Promise<MessagePackTruthSegmentEnvelope | null> {
  const bytes = await fileStore.readBinary(entry.path);
  if (!bytes) {
    diagnostics.push({ reason: 'segment-unreadable', path: entry.path });
    return null;
  }
  const actualChecksum = await sha256(bytes);
  if (actualChecksum !== entry.checksum) {
    diagnostics.push({
      reason: 'checksum-mismatch',
      path: entry.path,
      expected: entry.checksum,
      actual: actualChecksum,
    });
    return null;
  }
  const envelope = validateSegmentEnvelope(decode(bytes));
  if (!envelope) {
    diagnostics.push({ reason: 'segment-unreadable', path: entry.path });
    return null;
  }
  if (envelope.version !== MESSAGEPACK_TRUTH_MANIFEST_VERSION) {
    diagnostics.push({
      reason: 'unsupported-segment-version',
      path: entry.path,
      expected: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      actual: envelope.version,
    });
  }
  if (envelope.path !== entry.path) {
    diagnostics.push({
      reason: 'segment-path-mismatch',
      path: entry.path,
      expected: entry.path,
      actual: envelope.path,
    });
  }
  if (manifest.deviceId !== entry.deviceId || envelope.deviceId !== entry.deviceId) {
    diagnostics.push({
      reason: 'segment-device-mismatch',
      path: entry.path,
      expected: manifest.deviceId,
      actual: envelope.deviceId,
    });
  }
  if (manifest.family !== entry.family || envelope.family !== entry.family) {
    diagnostics.push({
      reason: 'family-mismatch',
      path: entry.path,
      expected: manifest.family,
      actual: envelope.family,
    });
  }
  if (manifest.generationId !== entry.generationId || envelope.generationId !== entry.generationId) {
    diagnostics.push({
      reason: 'generation-mismatch',
      path: entry.path,
      expected: manifest.generationId,
      actual: envelope.generationId,
    });
  }
  if (manifest.schemaVersion !== entry.schemaVersion || envelope.schemaVersion !== entry.schemaVersion) {
    diagnostics.push({
      reason: 'schema-version-mismatch',
      path: entry.path,
      expected: manifest.schemaVersion,
      actual: envelope.schemaVersion,
    });
  }
  if (envelope.records.length !== entry.recordCount) {
    diagnostics.push({
      reason: 'segment-record-count-mismatch',
      path: entry.path,
      expected: entry.recordCount,
      actual: envelope.records.length,
    });
  }
  return envelope;
}

function isReplayableManifest(
  manifest: MessagePackTruthSegmentManifest,
  options: Pick<MessagePackTruthRemoteReplayOptions, 'family' | 'generationId' | 'schemaVersion'>,
  diagnostics: MessagePackTruthValidationDiagnostic[],
): boolean {
  let replayable = true;
  if (manifest.version !== MESSAGEPACK_TRUTH_MANIFEST_VERSION) {
    diagnostics.push({
      reason: 'unsupported-manifest-version',
      path: manifest.path,
      expected: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      actual: manifest.version,
    });
    replayable = false;
  }
  if (manifest.family !== options.family) {
    diagnostics.push({
      reason: 'family-mismatch',
      path: manifest.path,
      expected: options.family,
      actual: manifest.family,
    });
    replayable = false;
  }
  if (manifest.generationId !== options.generationId) {
    diagnostics.push({
      reason: 'generation-mismatch',
      path: manifest.path,
      expected: options.generationId,
      actual: manifest.generationId,
    });
    replayable = false;
  }
  if (manifest.schemaVersion !== options.schemaVersion) {
    diagnostics.push({
      reason: 'schema-version-mismatch',
      path: manifest.path,
      expected: options.schemaVersion,
      actual: manifest.schemaVersion,
    });
    replayable = false;
  }
  return replayable;
}

function buildReviewReplayConflict(
  record: MessagePackTruthRecord,
  segment: MessagePackTruthSegmentManifestEntry,
  reason: MessagePackTruthRemoteReplayConflictReason,
  expected: { baseMemoryHash?: string | null; projectionGeneration?: number | null },
): MessagePackTruthRemoteReplayConflict {
  return {
    reason,
    cardId: getRecordCardId(record),
    idempotencyKey: getRecordIdempotencyKey(record),
    deviceId: segment.deviceId,
    path: segment.path,
    expectedBaseMemoryHash: expected.baseMemoryHash,
    actualBaseMemoryHash: getRecordBaseMemoryHash(record),
    expectedProjectionGeneration: expected.projectionGeneration,
    actualProjectionGeneration: getRecordProjectionGeneration(record),
    record: cloneRecord(record),
  };
}

function applyReviewConflictPolicy(input: {
  record: MessagePackTruthRecord;
  segment: MessagePackTruthSegmentManifestEntry;
  latestAfterMemoryByCard: Map<string, string>;
  latestProjectionGenerationByCard: Map<string, number>;
}): MessagePackTruthRemoteReplayConflict | null {
  const cardId = getRecordCardId(input.record);
  if (!cardId) {
    return null;
  }
  const baseMemoryHash = getRecordBaseMemoryHash(input.record);
  const expectedBaseMemoryHash = input.latestAfterMemoryByCard.get(cardId) ?? null;
  if (expectedBaseMemoryHash && baseMemoryHash && baseMemoryHash !== expectedBaseMemoryHash) {
    return buildReviewReplayConflict(input.record, input.segment, 'base-memory-mismatch', {
      baseMemoryHash: expectedBaseMemoryHash,
      projectionGeneration: input.latestProjectionGenerationByCard.get(cardId) ?? null,
    });
  }
  const projectionGeneration = getRecordProjectionGeneration(input.record);
  const expectedProjectionGeneration = input.latestProjectionGenerationByCard.get(cardId) ?? null;
  if (
    expectedProjectionGeneration !== null
    && projectionGeneration !== null
    && projectionGeneration < expectedProjectionGeneration
  ) {
    return buildReviewReplayConflict(input.record, input.segment, 'projection-generation-conflict', {
      baseMemoryHash: expectedBaseMemoryHash,
      projectionGeneration: expectedProjectionGeneration,
    });
  }
  return null;
}

export async function replayMessagePackTruthRemoteSegments(
  options: MessagePackTruthRemoteReplayOptions,
): Promise<MessagePackTruthRemoteReplayResult> {
  const localIndex = buildMessagePackTruthLocalSegmentIndex(options.manifests);
  const validationDiagnostics = [...localIndex.diagnostics];
  const normalizedManifests = options.manifests
    .filter(isRecord)
    .map((manifest) => normalizeManifest(manifest, {
      version: MESSAGEPACK_TRUTH_MANIFEST_VERSION,
      path: String(manifest.path || ''),
      family: String(manifest.family || ''),
      deviceId: String(manifest.deviceId || ''),
      generationId: String(manifest.generationId || ''),
      schemaVersion: Math.floor(Number(manifest.schemaVersion) || 0),
      segments: [],
      updatedAt: Math.max(0, Math.floor(Number(manifest.updatedAt) || 0)),
    }));
  const indexedRecords: Array<{
    record: MessagePackTruthRecord;
    segment: MessagePackTruthSegmentManifestEntry;
    recordIndex: number;
  }> = [];

  for (const manifest of normalizedManifests) {
    if (!isReplayableManifest(manifest, options, validationDiagnostics)) {
      continue;
    }
    for (const segment of manifest.segments) {
      const envelope = await readAndValidateRemoteSegment(options.fileStore, manifest, segment, validationDiagnostics);
      if (!envelope) {
        continue;
      }
      envelope.records.forEach((record, recordIndex) => {
        indexedRecords.push({
          record,
          segment,
          recordIndex,
        });
      });
    }
  }

  indexedRecords.sort((left, right) => {
    const leftTime = getLogicalTime(left.record) ?? Number.MAX_SAFE_INTEGER;
    const rightTime = getLogicalTime(right.record) ?? Number.MAX_SAFE_INTEGER;
    return leftTime - rightTime
      || left.segment.deviceId.localeCompare(right.segment.deviceId)
      || left.segment.sequence - right.segment.sequence
      || left.recordIndex - right.recordIndex;
  });

  const acceptedRecords: MessagePackTruthRecord[] = [];
  const duplicateRecords: MessagePackTruthRecord[] = [];
  const conflicts: MessagePackTruthRemoteReplayConflict[] = [];
  const seenIdempotencyKeys = new Set<string>();
  const latestAfterMemoryByCard = new Map<string, string>();
  const latestProjectionGenerationByCard = new Map<string, number>();

  for (const item of indexedRecords) {
    const idempotencyKey = getRecordIdempotencyKey(item.record);
    if (options.dedupeByIdempotencyKey && idempotencyKey) {
      if (seenIdempotencyKeys.has(idempotencyKey)) {
        duplicateRecords.push(cloneRecord(item.record));
        continue;
      }
      seenIdempotencyKeys.add(idempotencyKey);
    }

    const conflict = options.detectReviewConflicts
      ? applyReviewConflictPolicy({
        record: item.record,
        segment: item.segment,
        latestAfterMemoryByCard,
        latestProjectionGenerationByCard,
      })
      : null;
    if (conflict) {
      conflicts.push(conflict);
      continue;
    }

    acceptedRecords.push(cloneRecord(item.record));
    const cardId = getRecordCardId(item.record);
    const afterMemoryHash = getRecordAfterMemoryHash(item.record);
    const projectionGeneration = getRecordProjectionGeneration(item.record);
    if (cardId && afterMemoryHash) {
      latestAfterMemoryByCard.set(cardId, afterMemoryHash);
    }
    if (cardId && projectionGeneration !== null) {
      latestProjectionGenerationByCard.set(cardId, projectionGeneration);
    }
  }

  return {
    localIndex,
    acceptedRecords,
    duplicateRecords,
    conflicts,
    validationDiagnostics,
  };
}
