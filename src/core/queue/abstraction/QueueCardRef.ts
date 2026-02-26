import type { BlockID, CardID } from '../../../types/branded';
import { createBlockID, createCardID } from '../../../types/branded';

export interface QueueCardRef {
  /** Map to RiffCard.id or raw card ID */
  cardID: CardID;
  /** Map to RiffCard.blockID or raw block ID */
  blockID: BlockID;
  /** Map to RiffCard.deckID or raw deck ID */
  deckID: string;
  /**
   * Normalized priority (0-100).
   * 0 = Highest, 100 = Lowest.
   * Defaults to 50 if undefined.
   */
  priority: number;
  /**
   * Optional reference to original source object (avoid re-fetching).
   * Use with caution, do not rely on its shape.
   */
  originalRef?: unknown;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null;
}

function pickValue(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== undefined && candidate !== null) {
      return candidate;
    }
  }
  return undefined;
}

function toStringOrEmpty(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

export function normalizeRiffCardId(raw: unknown): CardID {
  const record = isRecord(raw) ? raw : {};
  const riffCard = isRecord(record.riffCard) ? record.riffCard : null;

  const value = pickValue(record, ['riffCardID', 'riffCardId', 'cardID', 'cardId'])
    ?? (riffCard ? pickValue(riffCard, ['id', 'ID']) : undefined);

  return createCardID(toStringOrEmpty(value));
}

export function normalizeBlockId(raw: unknown): BlockID {
  const record = isRecord(raw) ? raw : {};
  const value = pickValue(record, ['blockID', 'blockId', 'block_id', 'id']);
  return createBlockID(toStringOrEmpty(value));
}

export function normalizeDeckId(raw: unknown, fallbackDeckID = ''): string {
  const record = isRecord(raw) ? raw : {};
  const value = pickValue(record, ['deckID', 'deckId', 'deck_id']) ?? fallbackDeckID;
  return toStringOrEmpty(value);
}
