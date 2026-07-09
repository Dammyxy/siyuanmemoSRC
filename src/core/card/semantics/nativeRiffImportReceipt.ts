import type { NativeRiffImportReceipt } from './types';

export const NATIVE_RIFF_IMPORT_RECEIPT_META_KEY = 'nativeRiffImportReceipt';

export interface BuildNativeRiffImportReceiptInput {
  nativeCardId: string;
  deckId: string;
  importedAt?: number;
}

export function buildNativeRiffImportReceipt(
  input: BuildNativeRiffImportReceiptInput,
): NativeRiffImportReceipt {
  const receipt = normalizeReceipt({
    version: 1,
    nativeCardId: input.nativeCardId,
    deckId: input.deckId,
    importedAt: input.importedAt ?? Date.now(),
  });
  if (!receipt) {
    throw new Error('NATIVE_RIFF_IMPORT_RECEIPT_INVALID');
  }
  return receipt;
}

export function readNativeRiffImportReceipt(
  carrier: Readonly<{ meta?: unknown }>,
): NativeRiffImportReceipt | null {
  if (!isRecord(carrier.meta)) {
    return null;
  }
  return normalizeReceipt(carrier.meta[NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]);
}

export function attachNativeRiffImportReceiptToMeta(
  meta: Record<string, unknown>,
  receipt: NativeRiffImportReceipt,
): Record<string, unknown> {
  const existing = readNativeRiffImportReceipt({ meta });
  if (existing) {
    return {
      ...meta,
      [NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]: existing,
    };
  }

  const normalized = normalizeReceipt(receipt);
  if (!normalized) {
    throw new Error('NATIVE_RIFF_IMPORT_RECEIPT_INVALID');
  }

  return {
    ...meta,
    [NATIVE_RIFF_IMPORT_RECEIPT_META_KEY]: normalized,
  };
}

function normalizeReceipt(value: unknown): NativeRiffImportReceipt | null {
  if (!isRecord(value) || value.version !== 1) {
    return null;
  }

  const nativeCardId = normalizeString(value.nativeCardId);
  const deckId = normalizeString(value.deckId);
  const importedAt = normalizeTimestamp(value.importedAt);
  if (!nativeCardId || !deckId || importedAt === null) {
    return null;
  }

  return Object.freeze({
    version: 1,
    nativeCardId,
    deckId,
    importedAt,
  });
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeTimestamp(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
