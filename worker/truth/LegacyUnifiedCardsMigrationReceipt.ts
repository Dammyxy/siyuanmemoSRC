import {
  LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH,
  MESSAGEPACK_TRUTH_FAMILY_SCHEMAS,
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type BackendStorageErrorCode,
  type MessagePackTruthFamily,
} from '../../packages/contracts/src/backend-rpc';
import { LEGACY_UNIFIED_CARDS_SOURCE_PATH } from './LegacyUnifiedCardsSource';

const LEGACY_UNIFIED_CARDS_MIGRATION_ID = 'legacy-unified-cards-to-truth.v1';
const LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION = 1;
const MESSAGEPACK_TRUTH_FAMILIES = new Set<string>(
  MESSAGEPACK_TRUTH_FAMILY_SCHEMAS.map((schema) => schema.family),
);

export interface LegacyUnifiedCardsMigrationReceiptFileStore {
  readJSON<T>(fileName: string): Promise<T | null>;
  writeJSON(fileName: string, data: unknown): Promise<void>;
}

export interface LegacyUnifiedCardsMigrationReceiptSource {
  file: typeof LEGACY_UNIFIED_CARDS_SOURCE_PATH;
  sha256: `sha256:${string}` | null;
  byteLength: number | null;
}

export interface LegacyUnifiedCardsMigrationReceiptFamily {
  family: MessagePackTruthFamily;
  generationId: string;
  recordCount: number;
  segmentRefs: string[];
}

export interface LegacyUnifiedCardsMigrationReceiptCounts {
  activeCards: number;
  tombstones: number;
  sourceBindings: number;
  reviewEvents: number;
  quarantinedReviewLogs: number;
  skippedDrillLogsV2: number;
  skippedRescheduleLogs: number;
}

export interface LegacyUnifiedCardsMigrationReceiptDiagnostic {
  kind: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details?: Record<string, unknown> | null;
}

export interface LegacyUnifiedCardsMigrationReceipt {
  version: typeof LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION;
  migrationId: typeof LEGACY_UNIFIED_CARDS_MIGRATION_ID;
  status: 'completed' | 'reconciled';
  source: LegacyUnifiedCardsMigrationReceiptSource;
  migratedAt: number | null;
  reconciledAt: number | null;
  localDeviceId: string;
  truthSchemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  families: LegacyUnifiedCardsMigrationReceiptFamily[];
  counts: LegacyUnifiedCardsMigrationReceiptCounts;
  diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
}

export class LegacyUnifiedCardsMigrationReceiptError extends Error {
  readonly code: BackendStorageErrorCode = 'LEGACY_MIGRATION_FAILED';
  readonly receiptPath = LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH;

  constructor(message: string, readonly originalError?: Error) {
    super(`LEGACY_MIGRATION_FAILED: ${message}`);
    this.name = 'LegacyUnifiedCardsMigrationReceiptError';
  }
}

export interface CreateCompletedLegacyUnifiedCardsMigrationReceiptInput {
  migratedAt: number;
  localDeviceId: string;
  source: {
    sourceFile: typeof LEGACY_UNIFIED_CARDS_SOURCE_PATH;
    sha256: `sha256:${string}`;
    byteLength: number;
  };
  truthSchemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  families: LegacyUnifiedCardsMigrationReceiptFamily[];
  counts: LegacyUnifiedCardsMigrationReceiptCounts;
  diagnostics?: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
}

export interface CreateReconciledLegacyUnifiedCardsMigrationReceiptInput {
  reconciledAt: number;
  localDeviceId: string;
  truthSchemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  families: LegacyUnifiedCardsMigrationReceiptFamily[];
  diagnostics?: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
}

export type LegacyUnifiedCardsMigrationReceiptReconcileResult =
  | { status: 'existing'; receipt: LegacyUnifiedCardsMigrationReceipt; wroteReceipt: false }
  | { status: 'missing'; receipt: null; wroteReceipt: false }
  | { status: 'reconciled'; receipt: LegacyUnifiedCardsMigrationReceipt; wroteReceipt: true };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function fail(message: string): never {
  throw new LegacyUnifiedCardsMigrationReceiptError(message);
}

function finiteNonNegativeInteger(value: unknown, label: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    fail(`${label} must be a non-negative finite number`);
  }
  return Math.floor(numberValue);
}

function optionalTimestamp(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    fail(`${label} must be a positive finite timestamp or null`);
  }
  return numberValue;
}

function requiredString(value: unknown, label: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    fail(`${label} is required`);
  }
  return normalized;
}

function normalizeSha256(value: unknown): `sha256:${string}` | null {
  if (value === null) {
    return null;
  }
  const normalized = String(value || '').trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
    fail('source sha256 must be sha256:<64 lowercase hex> or null');
  }
  return normalized as `sha256:${string}`;
}

function normalizeSource(value: unknown): LegacyUnifiedCardsMigrationReceiptSource {
  if (!isRecord(value)) {
    fail('source is required');
  }
  const file = String(value.file || '').trim();
  if (file !== LEGACY_UNIFIED_CARDS_SOURCE_PATH) {
    fail(`source.file must be ${LEGACY_UNIFIED_CARDS_SOURCE_PATH}`);
  }
  const byteLength = value.byteLength === null
    ? null
    : finiteNonNegativeInteger(value.byteLength, 'source.byteLength');
  return {
    file: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
    sha256: normalizeSha256(value.sha256),
    byteLength,
  };
}

function normalizeFamily(value: unknown): LegacyUnifiedCardsMigrationReceiptFamily {
  if (!isRecord(value)) {
    fail('families entries must be objects');
  }
  const family = requiredString(value.family, 'family');
  if (!MESSAGEPACK_TRUTH_FAMILIES.has(family)) {
    fail(`unsupported truth family: ${family}`);
  }
  const generationId = requiredString(value.generationId, 'generationId');
  const segmentRefs = Array.isArray(value.segmentRefs)
    ? value.segmentRefs.map((entry) => requiredString(entry, 'segmentRefs entry'))
    : fail('segmentRefs must be an array');
  return {
    family: family as MessagePackTruthFamily,
    generationId,
    recordCount: finiteNonNegativeInteger(value.recordCount, 'recordCount'),
    segmentRefs,
  };
}

function normalizeCounts(value: unknown): LegacyUnifiedCardsMigrationReceiptCounts {
  const source = isRecord(value) ? value : {};
  return {
    activeCards: finiteNonNegativeInteger(source.activeCards ?? 0, 'counts.activeCards'),
    tombstones: finiteNonNegativeInteger(source.tombstones ?? 0, 'counts.tombstones'),
    sourceBindings: finiteNonNegativeInteger(source.sourceBindings ?? 0, 'counts.sourceBindings'),
    reviewEvents: finiteNonNegativeInteger(source.reviewEvents ?? 0, 'counts.reviewEvents'),
    quarantinedReviewLogs: finiteNonNegativeInteger(source.quarantinedReviewLogs ?? 0, 'counts.quarantinedReviewLogs'),
    skippedDrillLogsV2: finiteNonNegativeInteger(source.skippedDrillLogsV2 ?? 0, 'counts.skippedDrillLogsV2'),
    skippedRescheduleLogs: finiteNonNegativeInteger(source.skippedRescheduleLogs ?? 0, 'counts.skippedRescheduleLogs'),
  };
}

function normalizeDiagnostic(value: unknown): LegacyUnifiedCardsMigrationReceiptDiagnostic {
  if (!isRecord(value)) {
    fail('diagnostics entries must be objects');
  }
  const severity = String(value.severity || '').trim();
  if (severity !== 'info' && severity !== 'warning' && severity !== 'error') {
    fail('diagnostic severity must be info, warning, or error');
  }
  return {
    kind: requiredString(value.kind, 'diagnostic.kind'),
    severity,
    message: requiredString(value.message, 'diagnostic.message'),
    details: isRecord(value.details) ? { ...value.details } : null,
  };
}

function normalizeReceipt(value: unknown): LegacyUnifiedCardsMigrationReceipt {
  if (!isRecord(value)) {
    fail('receipt must be an object');
  }
  if (value.version !== LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION) {
    fail('unsupported receipt version');
  }
  if (value.migrationId !== LEGACY_UNIFIED_CARDS_MIGRATION_ID) {
    fail('unsupported migration id');
  }
  const status = String(value.status || '').trim();
  if (status !== 'completed' && status !== 'reconciled') {
    fail('receipt status must be completed or reconciled');
  }
  const families = Array.isArray(value.families)
    ? value.families.map(normalizeFamily)
    : fail('families must be an array');
  if (families.length === 0) {
    fail('receipt must include at least one truth family');
  }
  const source = normalizeSource(value.source);
  if (status === 'completed' && (!source.sha256 || source.byteLength === null)) {
    fail('completed receipt requires source hash and byte length');
  }
  const migratedAt = optionalTimestamp(value.migratedAt, 'migratedAt');
  const reconciledAt = optionalTimestamp(value.reconciledAt, 'reconciledAt');
  if (status === 'completed' && migratedAt === null) {
    fail('completed receipt requires migratedAt');
  }
  if (status === 'reconciled' && reconciledAt === null) {
    fail('reconciled receipt requires reconciledAt');
  }
  if (value.truthSchemaVersion !== MESSAGEPACK_TRUTH_SCHEMA_VERSION) {
    fail('unsupported truth schema version');
  }
  return {
    version: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION,
    migrationId: LEGACY_UNIFIED_CARDS_MIGRATION_ID,
    status,
    source,
    migratedAt,
    reconciledAt,
    localDeviceId: requiredString(value.localDeviceId, 'localDeviceId'),
    truthSchemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    families,
    counts: normalizeCounts(value.counts),
    diagnostics: Array.isArray(value.diagnostics)
      ? value.diagnostics.map(normalizeDiagnostic)
      : [],
  };
}

export function createCompletedLegacyUnifiedCardsMigrationReceipt(
  input: CreateCompletedLegacyUnifiedCardsMigrationReceiptInput,
): LegacyUnifiedCardsMigrationReceipt {
  return normalizeReceipt({
    version: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION,
    migrationId: LEGACY_UNIFIED_CARDS_MIGRATION_ID,
    status: 'completed',
    source: {
      file: input.source.sourceFile,
      sha256: input.source.sha256,
      byteLength: input.source.byteLength,
    },
    migratedAt: input.migratedAt,
    reconciledAt: null,
    localDeviceId: input.localDeviceId,
    truthSchemaVersion: input.truthSchemaVersion,
    families: input.families,
    counts: input.counts,
    diagnostics: input.diagnostics ?? [],
  });
}

export function createReconciledLegacyUnifiedCardsMigrationReceipt(
  input: CreateReconciledLegacyUnifiedCardsMigrationReceiptInput,
): LegacyUnifiedCardsMigrationReceipt {
  return normalizeReceipt({
    version: LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_VERSION,
    migrationId: LEGACY_UNIFIED_CARDS_MIGRATION_ID,
    status: 'reconciled',
    source: {
      file: LEGACY_UNIFIED_CARDS_SOURCE_PATH,
      sha256: null,
      byteLength: null,
    },
    migratedAt: null,
    reconciledAt: input.reconciledAt,
    localDeviceId: input.localDeviceId,
    truthSchemaVersion: input.truthSchemaVersion,
    families: input.families,
    counts: {
      activeCards: 0,
      tombstones: 0,
      sourceBindings: 0,
      reviewEvents: 0,
      quarantinedReviewLogs: 0,
      skippedDrillLogsV2: 0,
      skippedRescheduleLogs: 0,
    },
    diagnostics: input.diagnostics ?? [],
  });
}

export async function readLegacyUnifiedCardsMigrationReceipt(
  fileStore: LegacyUnifiedCardsMigrationReceiptFileStore,
): Promise<LegacyUnifiedCardsMigrationReceipt | null> {
  try {
    const receipt = await fileStore.readJSON<unknown>(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH);
    return receipt === null ? null : normalizeReceipt(receipt);
  } catch (error) {
    if (error instanceof LegacyUnifiedCardsMigrationReceiptError) {
      throw error;
    }
    throw new LegacyUnifiedCardsMigrationReceiptError(
      `failed to read ${LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH}: ${toError(error).message}`,
      toError(error),
    );
  }
}

export async function writeLegacyUnifiedCardsMigrationReceipt(
  fileStore: LegacyUnifiedCardsMigrationReceiptFileStore,
  receipt: LegacyUnifiedCardsMigrationReceipt,
): Promise<void> {
  const normalized = normalizeReceipt(receipt);
  try {
    await fileStore.writeJSON(LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH, normalized);
  } catch (error) {
    throw new LegacyUnifiedCardsMigrationReceiptError(
      `failed to write ${LEGACY_UNIFIED_CARDS_MIGRATION_RECEIPT_PATH}: ${toError(error).message}`,
      toError(error),
    );
  }
}

export async function reconcileLegacyUnifiedCardsMigrationReceipt(
  fileStore: LegacyUnifiedCardsMigrationReceiptFileStore,
  options: {
    truthExists: boolean;
    reconciledReceipt: LegacyUnifiedCardsMigrationReceipt;
  },
): Promise<LegacyUnifiedCardsMigrationReceiptReconcileResult> {
  const existing = await readLegacyUnifiedCardsMigrationReceipt(fileStore);
  if (existing) {
    return {
      status: 'existing',
      receipt: existing,
      wroteReceipt: false,
    };
  }
  if (!options.truthExists) {
    return {
      status: 'missing',
      receipt: null,
      wroteReceipt: false,
    };
  }
  const receipt = normalizeReceipt(options.reconciledReceipt);
  if (receipt.status !== 'reconciled') {
    fail('truth-without-receipt reconciliation requires a reconciled receipt');
  }
  await writeLegacyUnifiedCardsMigrationReceipt(fileStore, receipt);
  return {
    status: 'reconciled',
    receipt,
    wroteReceipt: true,
  };
}
