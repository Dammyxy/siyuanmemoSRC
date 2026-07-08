import type { FSRSCard } from '@/types/card';
import type {
  SrsCardCreationReceipt,
  SrsCardSemanticKind,
} from './types';
import { isSrsCardSemanticKind } from './types';

export const SRS_CARD_CREATION_RECEIPT_META_KEY = 'srsCardCreationReceipt';

export type SrsCardCreationFamily =
  | 'quick-card'
  | 'list-template'
  | 'cdf'
  | 'progressive-topic'
  | 'topic-derived-item'
  | 'native-riff'
  | string;

export interface BuildSrsCardCreationReceiptInput {
  semanticKind: SrsCardSemanticKind;
  templateID?: string;
  sourceBlockIds: string[];
  cardIds?: string[];
  creationFamily: SrsCardCreationFamily;
  createdAt?: number;
  details?: Record<string, unknown>;
}

export function buildSrsCardCreationReceipt(
  input: BuildSrsCardCreationReceiptInput,
): SrsCardCreationReceipt {
  return {
    version: 1,
    semanticKind: input.semanticKind,
    ...(input.templateID ? { templateID: input.templateID } : {}),
    sourceBlockIds: normalizeStringArray(input.sourceBlockIds),
    cardIds: normalizeStringArray(input.cardIds),
    creationFamily: input.creationFamily,
    createdAt: normalizeTimestamp(input.createdAt) ?? Date.now(),
    ...(input.details && Object.keys(input.details).length > 0 ? { details: input.details } : {}),
  };
}

export function readSrsCardCreationReceipt(card: FSRSCard): SrsCardCreationReceipt | null {
  const value = isRecord(card.meta) ? card.meta[SRS_CARD_CREATION_RECEIPT_META_KEY] : undefined;
  if (!isRecord(value)) {
    return null;
  }

  const semanticKind = value.semanticKind;
  if (!isSrsCardSemanticKind(semanticKind)) {
    return null;
  }

  const sourceBlockIds = normalizeStringArray(value.sourceBlockIds);
  const cardIds = normalizeStringArray(value.cardIds);
  const creationFamily = normalizeString(value.creationFamily);
  const createdAt = normalizeTimestamp(value.createdAt);
  if (!creationFamily || createdAt === null) {
    return null;
  }

  const templateID = normalizeString(value.templateID);
  return {
    version: 1,
    semanticKind,
    ...(templateID ? { templateID } : {}),
    sourceBlockIds,
    cardIds,
    creationFamily,
    createdAt,
    ...(isRecord(value.details) ? { details: { ...value.details } } : {}),
  };
}

export function attachSrsCardCreationReceiptToMeta(
  meta: Record<string, unknown>,
  receipt: SrsCardCreationReceipt,
): Record<string, unknown> {
  return {
    ...meta,
    [SRS_CARD_CREATION_RECEIPT_META_KEY]: receipt,
  };
}

export function completeSrsCardCreationReceiptForCard(
  meta: Record<string, unknown>,
  card: Pick<FSRSCard, 'id' | 'blockId'>,
): Record<string, unknown> {
  const existing = isRecord(meta[SRS_CARD_CREATION_RECEIPT_META_KEY])
    ? meta[SRS_CARD_CREATION_RECEIPT_META_KEY]
    : null;
  if (!existing || !isSrsCardSemanticKind(existing.semanticKind)) {
    return meta;
  }

  const receipt = buildSrsCardCreationReceipt({
    semanticKind: existing.semanticKind,
    templateID: normalizeString(existing.templateID) || undefined,
    sourceBlockIds: Array.from(new Set([
      ...normalizeStringArray(existing.sourceBlockIds),
      card.blockId,
    ])),
    cardIds: Array.from(new Set([
      ...normalizeStringArray(existing.cardIds),
      card.id,
    ])),
    creationFamily: normalizeString(existing.creationFamily) || 'unknown',
    createdAt: normalizeTimestamp(existing.createdAt) ?? Date.now(),
    details: isRecord(existing.details) ? { ...existing.details } : undefined,
  });

  return attachSrsCardCreationReceiptToMeta(meta, receipt);
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeTimestamp(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
