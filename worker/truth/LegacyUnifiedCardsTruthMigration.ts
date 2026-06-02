import { decode } from '@msgpack/msgpack';
import { Rating, default_w, roundTo } from 'ts-fsrs';
import {
  MESSAGEPACK_TRUTH_SCHEMA_VERSION,
  type MessagePackTruthFamily,
} from '../../packages/contracts/src/backend-rpc';
import {
  type LegacyUnifiedCardsMigrationReceipt,
  type LegacyUnifiedCardsMigrationReceiptCounts,
  type LegacyUnifiedCardsMigrationReceiptDiagnostic,
  type LegacyUnifiedCardsMigrationReceiptFileStore,
  createCompletedLegacyUnifiedCardsMigrationReceipt,
  writeLegacyUnifiedCardsMigrationReceipt,
} from './LegacyUnifiedCardsMigrationReceipt';
import {
  LEGACY_SPLIT_SOURCE_PATHS,
  LegacyUnifiedCardsSourceReadError,
  detectLegacyUnifiedCardsSource,
  type LegacyUnifiedCardsSourceAbsent,
  type LegacyUnifiedCardsSourceFileStore,
  type LegacyUnifiedCardsSourcePresent,
} from './LegacyUnifiedCardsSource';
import type {
  MessagePackTruthAppendResult,
  MessagePackTruthRecord,
  MessagePackTruthSegmentStore,
} from './MessagePackTruthSegmentStore';

export type LegacyCardMemorySnapshotImportedType =
  | 'card-memory.snapshot-imported'
  | 'card-memory.tombstone-imported'
  | 'source-binding.snapshot-imported';

export type LegacyUnifiedCardsTruthMigrationFileStore =
  LegacyUnifiedCardsSourceFileStore
  & LegacyUnifiedCardsMigrationReceiptFileStore;

const LEGACY_CARD_STATE = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;

const LEGACY_REVIEWED_EMPTY_MEMORY_REPAIR = Object.freeze({
  stability: Math.max(default_w[Rating.Hard - 1] ?? 0, 0.1),
  difficulty: roundTo((default_w[4] ?? 0) - Math.exp((Rating.Hard - 1) * (default_w[5] ?? 0)) + 1, 8),
});

export interface LegacyUnifiedCardsTruthMigrationOptions {
  sourceFileStore: LegacyUnifiedCardsSourceFileStore;
  receiptFileStore: LegacyUnifiedCardsMigrationReceiptFileStore;
  truthStore: MessagePackTruthSegmentStore;
  truthExists: boolean;
  localDeviceId: string;
  generationId: string;
  truthSchemaVersion: typeof MESSAGEPACK_TRUTH_SCHEMA_VERSION;
  now?: () => number;
}

export type LegacyUnifiedCardsTruthMigrationResult =
  | {
      status: 'skipped-truth-exists';
      source: null;
      counts: LegacyUnifiedCardsMigrationReceiptCounts;
      recordsWritten: 0;
      receipt: null;
      diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
    }
  | {
      status: 'source-absent';
      source: LegacyUnifiedCardsSourceAbsent;
      counts: LegacyUnifiedCardsMigrationReceiptCounts;
      recordsWritten: 0;
      receipt: null;
      diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
    }
  | {
      status: 'migrated';
      source: LegacyUnifiedCardsSourcePresent;
      counts: LegacyUnifiedCardsMigrationReceiptCounts;
      recordsWritten: number;
      append: MessagePackTruthAppendResult;
      receipt: LegacyUnifiedCardsMigrationReceipt;
      diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
    };

export class LegacyUnifiedCardsTruthMigrationError extends Error {
  readonly code = 'LEGACY_MIGRATION_FAILED' as const;

  constructor(message: string, readonly originalError?: Error) {
    super(`LEGACY_MIGRATION_FAILED: ${message}`);
    this.name = 'LegacyUnifiedCardsTruthMigrationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function stableEntries(value: unknown): Array<[string, Record<string, unknown>]> {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .sort(([left], [right]) => left.localeCompare(right));
}

function emptyCounts(): LegacyUnifiedCardsMigrationReceiptCounts {
  return {
    activeCards: 0,
    tombstones: 0,
    sourceBindings: 0,
    reviewEvents: 0,
  };
}

function decodeLegacyUnifiedCards(bytes: Uint8Array): Record<string, unknown> {
  try {
    const decoded = decode(bytes);
    if (!isRecord(decoded)) {
      throw new Error('decoded legacy unified store is not an object');
    }
    return decoded;
  } catch (error) {
    throw new LegacyUnifiedCardsTruthMigrationError(
      `failed to decode legacy unified cards: ${toError(error).message}`,
      toError(error),
    );
  }
}

async function detectLegacySplitFallbackDiagnostics(
  fileStore: LegacyUnifiedCardsSourceFileStore,
): Promise<LegacyUnifiedCardsMigrationReceiptDiagnostic[]> {
  const diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[] = [];
  for (const sourceFile of LEGACY_SPLIT_SOURCE_PATHS) {
    try {
      const bytes = await fileStore.readBinary(sourceFile);
      if (!bytes) {
        continue;
      }
      diagnostics.push({
        kind: 'legacy-split-source-fallback',
        severity: 'info',
        message: `Detected legacy split source ${sourceFile} after unified-cards.msgpack was absent.`,
        details: {
          sourceFile,
          byteLength: bytes.byteLength,
          reason: 'unified-source-absent',
        },
      });
    } catch (error) {
      throw new LegacyUnifiedCardsSourceReadError(sourceFile, toError(error));
    }
  }
  return diagnostics;
}

function selectActiveCardEntries(store: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  const cardDtoEntries = stableEntries(store.cardDTOs);
  if (cardDtoEntries.length > 0) {
    return cardDtoEntries;
  }
  return stableEntries(store.cards);
}

function selectTombstoneEntries(store: Record<string, unknown>): Array<[string, Record<string, unknown>]> {
  return stableEntries(store.deletedCardDTOs);
}

function cardIdFromEntry(id: string, card: Record<string, unknown>): string {
  return readString(card.id) ?? id;
}

function blockIdFromCard(card: Record<string, unknown>): string | null {
  return readString(card.blockId) ?? readString(card.blockID);
}

function xiuyuanIdFromCard(card: Record<string, unknown>): string | null {
  const meta = isRecord(card.meta) ? card.meta : {};
  return readString(card.xiuyuanID)
    ?? readString(card.xiuyuanId)
    ?? readString(meta.xiuyuanID)
    ?? readString(meta.xiuyuanId);
}

function sourceHashFromCard(card: Record<string, unknown>): string | null {
  const meta = isRecord(card.meta) ? card.meta : {};
  return readString(card.sourceHash)
    ?? readString(meta.sourceHash)
    ?? readString(meta.contentHash);
}

function faceKeyFromCard(card: Record<string, unknown>): Record<string, unknown> | null {
  const meta = isRecord(card.meta) ? card.meta : {};
  return isRecord(card.faceKey)
    ? card.faceKey
    : isRecord(meta.faceKey)
      ? meta.faceKey
      : null;
}

function schedulerOwnerFromCard(card: Record<string, unknown>): string | null {
  return readString(card.schedulerType) ?? readString(card.scheduler) ?? null;
}

function isEmptySchedulingValue(value: number): boolean {
  return !Number.isFinite(value) || value <= 0;
}

function hasReviewEvidence(card: Record<string, unknown>, state: number): boolean {
  if (
    state === LEGACY_CARD_STATE.Learning
    || state === LEGACY_CARD_STATE.Review
    || state === LEGACY_CARD_STATE.Relearning
  ) {
    return true;
  }
  return (readNumber(card.reps) ?? 0) > 0 || (readNumber(card.lastReview) ?? 0) > 0;
}

function schedulingMemoryFromCard(input: {
  cardId: string;
  card: Record<string, unknown>;
  state: number;
}): {
    stability: number;
    difficulty: number;
    diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
  } {
  const originalStability = readNumber(input.card.stability) ?? 0;
  const originalDifficulty = readNumber(input.card.difficulty) ?? 0;
  const isEmptyMemory = isEmptySchedulingValue(originalStability) && isEmptySchedulingValue(originalDifficulty);
  if (!isEmptyMemory || !hasReviewEvidence(input.card, input.state)) {
    return {
      stability: originalStability,
      difficulty: originalDifficulty,
      diagnostics: [],
    };
  }
  return {
    stability: LEGACY_REVIEWED_EMPTY_MEMORY_REPAIR.stability,
    difficulty: LEGACY_REVIEWED_EMPTY_MEMORY_REPAIR.difficulty,
    diagnostics: [{
      kind: 'repaired-scheduling-memory',
      severity: 'warning',
      message: `Repaired reviewed empty scheduling memory for legacy card ${input.cardId}.`,
      details: {
        cardId: input.cardId,
        state: input.state,
        schedulerType: schedulerOwnerFromCard(input.card),
        originalStability,
        originalDifficulty,
        repairedStability: LEGACY_REVIEWED_EMPTY_MEMORY_REPAIR.stability,
        repairedDifficulty: LEGACY_REVIEWED_EMPTY_MEMORY_REPAIR.difficulty,
        reason: 'reviewed-empty-memory',
      },
    }],
  };
}

function lineageFromCard(input: {
  cardId: string;
  card: Record<string, unknown>;
}): { lineage: Record<string, unknown>; diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[] } {
  const { card, cardId } = input;
  const meta = isRecord(card.meta) ? card.meta : {};
  const faceKey = faceKeyFromCard(card);
  const state = readNumber(card.state) ?? LEGACY_CARD_STATE.New;
  const schedulingMemory = schedulingMemoryFromCard({ cardId, card, state });
  return {
    lineage: {
      type: readString(card.type) ?? readString(card.cardType) ?? null,
      state,
      due: readNumber(card.due) ?? 0,
      stability: schedulingMemory.stability,
      difficulty: schedulingMemory.difficulty,
      reps: readNumber(card.reps) ?? 0,
      lapses: readNumber(card.lapses) ?? 0,
      lastReview: readNumber(card.lastReview) ?? 0,
      elapsedDays: readNumber(card.elapsedDays) ?? 0,
      scheduledDays: readNumber(card.scheduledDays) ?? 0,
      priority: readNumber(card.priority) ?? 50,
      tags: readStringArray(card.tags),
      leechCount: readNumber(card.leechCount) ?? 0,
      isLeech: card.isLeech === true,
      skipped: card.skipped === true,
      createdAt: readNumber(card.createdAt) ?? readNumber(card.created) ?? 0,
      updatedAt: readNumber(card.updatedAt) ?? readNumber(card.updated) ?? 0,
      schedulerType: schedulerOwnerFromCard(card),
      cardTypeMarker: readString(card.cardTypeMarker) ?? readString(meta.cardTypeMarker),
      ...(faceKey ? { faceKey } : {}),
    },
    diagnostics: schedulingMemory.diagnostics,
  };
}

function idempotencyKey(input: {
  sourceHash: string;
  type: LegacyCardMemorySnapshotImportedType;
  id: string;
}): string {
  return `legacy-unified-cards:${input.sourceHash}:${input.type}:${input.id}`;
}

function buildSnapshotRecord(input: {
  sourceHash: string;
  importedAt: number;
  id: string;
  card: Record<string, unknown>;
}): { record: MessagePackTruthRecord; diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[] } {
  const cardId = cardIdFromEntry(input.id, input.card);
  const blockId = blockIdFromCard(input.card) ?? cardId;
  const xiuyuanId = xiuyuanIdFromCard(input.card);
  const lineage = lineageFromCard({
    cardId,
    card: input.card,
  });
  return {
    record: {
      family: 'card-memory-facts' satisfies MessagePackTruthFamily,
      schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
      type: 'card-memory.snapshot-imported' satisfies LegacyCardMemorySnapshotImportedType,
      idempotencyKey: idempotencyKey({
        sourceHash: input.sourceHash,
        type: 'card-memory.snapshot-imported',
        id: cardId,
      }),
      logicalTime: input.importedAt,
      recordedAt: input.importedAt,
      source: {
        cardId,
        blockId,
        sourceBlockId: blockId,
        ...(xiuyuanId ? { xiuyuanId } : {}),
        legacySource: 'unified-cards.msgpack',
        legacySourceHash: input.sourceHash,
      },
      memory: {
        schedulerOwner: schedulerOwnerFromCard(input.card),
        memoryHash: `${input.sourceHash}:${cardId}`,
        lineage: lineage.lineage,
      },
    },
    diagnostics: lineage.diagnostics,
  };
}

function buildSourceBindingRecord(input: {
  sourceHash: string;
  importedAt: number;
  id: string;
  card: Record<string, unknown>;
}): MessagePackTruthRecord | null {
  const cardId = cardIdFromEntry(input.id, input.card);
  const blockId = blockIdFromCard(input.card);
  if (!blockId) {
    return null;
  }
  const xiuyuanId = xiuyuanIdFromCard(input.card);
  const sourceHash = sourceHashFromCard(input.card);
  return {
    family: 'card-memory-facts' satisfies MessagePackTruthFamily,
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'source-binding.snapshot-imported' satisfies LegacyCardMemorySnapshotImportedType,
    idempotencyKey: idempotencyKey({
      sourceHash: input.sourceHash,
      type: 'source-binding.snapshot-imported',
      id: cardId,
    }),
    logicalTime: input.importedAt,
    recordedAt: input.importedAt,
    source: {
      cardId,
      blockId,
      sourceBlockId: blockId,
      ...(xiuyuanId ? { xiuyuanId } : {}),
      ...(sourceHash ? { sourceHash } : {}),
      legacySource: 'unified-cards.msgpack',
      legacySourceHash: input.sourceHash,
    },
    memory: {
      schedulerOwner: schedulerOwnerFromCard(input.card),
      memoryHash: `${input.sourceHash}:${cardId}`,
      lineage: {
        ...(xiuyuanId ? { xiuyuanId } : {}),
        ...(sourceHash ? { sourceHash } : {}),
      },
    },
  };
}

function buildTombstoneRecord(input: {
  sourceHash: string;
  importedAt: number;
  id: string;
  tombstone: Record<string, unknown>;
}): MessagePackTruthRecord {
  const deletedAt = readNumber(input.tombstone.deletedAt) ?? input.importedAt;
  const deletedBy = readString(input.tombstone.deletedBy);
  return {
    family: 'card-memory-facts' satisfies MessagePackTruthFamily,
    schemaVersion: MESSAGEPACK_TRUTH_SCHEMA_VERSION,
    type: 'card-memory.tombstone-imported' satisfies LegacyCardMemorySnapshotImportedType,
    idempotencyKey: idempotencyKey({
      sourceHash: input.sourceHash,
      type: 'card-memory.tombstone-imported',
      id: input.id,
    }),
    logicalTime: deletedAt,
    recordedAt: input.importedAt,
    source: {
      cardId: input.id,
      legacySource: 'unified-cards.msgpack',
      legacySourceHash: input.sourceHash,
    },
    memory: {
      schedulerOwner: null,
      memoryHash: `${input.sourceHash}:${input.id}:tombstone`,
      lineage: {
        deletedAt,
        ...(deletedBy ? { deletedBy } : {}),
      },
    },
  };
}

function buildLegacyCardMemoryRecords(input: {
  store: Record<string, unknown>;
  sourceHash: string;
  importedAt: number;
}): {
    records: MessagePackTruthRecord[];
    counts: LegacyUnifiedCardsMigrationReceiptCounts;
    diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[];
  } {
  const records: MessagePackTruthRecord[] = [];
  const diagnostics: LegacyUnifiedCardsMigrationReceiptDiagnostic[] = [];
  const counts = emptyCounts();
  for (const [id, card] of selectActiveCardEntries(input.store)) {
    const snapshot = buildSnapshotRecord({
      sourceHash: input.sourceHash,
      importedAt: input.importedAt,
      id,
      card,
    });
    records.push(snapshot.record);
    diagnostics.push(...snapshot.diagnostics);
    counts.activeCards += 1;
    const binding = buildSourceBindingRecord({
      sourceHash: input.sourceHash,
      importedAt: input.importedAt,
      id,
      card,
    });
    if (binding) {
      records.push(binding);
      counts.sourceBindings += 1;
    }
  }
  for (const [id, tombstone] of selectTombstoneEntries(input.store)) {
    records.push(buildTombstoneRecord({
      sourceHash: input.sourceHash,
      importedAt: input.importedAt,
      id,
      tombstone,
    }));
    counts.tombstones += 1;
  }
  return { records, counts, diagnostics };
}

export async function migrateLegacyUnifiedCardsToCardMemoryTruth(
  options: LegacyUnifiedCardsTruthMigrationOptions,
): Promise<LegacyUnifiedCardsTruthMigrationResult> {
  if (options.truthExists) {
    return {
      status: 'skipped-truth-exists',
      source: null,
      counts: emptyCounts(),
      recordsWritten: 0,
      receipt: null,
      diagnostics: [],
    };
  }

  const source = await detectLegacyUnifiedCardsSource(options.sourceFileStore);
  if (source.status === 'absent') {
    const diagnostics = await detectLegacySplitFallbackDiagnostics(options.sourceFileStore);
    return {
      status: 'source-absent',
      source,
      counts: emptyCounts(),
      recordsWritten: 0,
      receipt: null,
      diagnostics,
    };
  }

  const importedAt = options.now?.() ?? Date.now();
  const store = decodeLegacyUnifiedCards(source.bytes);
  const { records, counts, diagnostics } = buildLegacyCardMemoryRecords({
    store,
    sourceHash: source.sha256,
    importedAt,
  });
  let append: MessagePackTruthAppendResult;
  try {
    append = await options.truthStore.appendRecords(records);
  } catch (error) {
    throw new LegacyUnifiedCardsTruthMigrationError(
      `failed to commit card-memory truth: ${toError(error).message}`,
      toError(error),
    );
  }
  const receipt = createCompletedLegacyUnifiedCardsMigrationReceipt({
    migratedAt: importedAt,
    localDeviceId: options.localDeviceId,
    source: {
      sourceFile: source.sourceFile,
      sha256: source.sha256,
      byteLength: source.byteLength,
    },
    truthSchemaVersion: options.truthSchemaVersion,
    families: [{
      family: 'card-memory-facts',
      generationId: options.generationId,
      recordCount: records.length,
      segmentRefs: append.segments.map((segment) => segment.path),
    }],
    counts,
    diagnostics,
  });
  await writeLegacyUnifiedCardsMigrationReceipt(options.receiptFileStore, receipt);
  return {
    status: 'migrated',
    source,
    counts,
    recordsWritten: records.length,
    append,
    receipt,
    diagnostics,
  };
}
