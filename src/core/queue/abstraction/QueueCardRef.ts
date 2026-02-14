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

export function normalizeRiffCardId(raw: any): CardID {
  const v = raw?.riffCardID
    ?? raw?.riffCardId
    ?? raw?.cardID
    ?? raw?.cardId
    ?? raw?.riffCard?.id
    ?? raw?.riffCard?.ID;
  return createCardID(v ? String(v) : '');
}

export function normalizeBlockId(raw: any): BlockID {
  const v = raw?.blockID ?? raw?.blockId ?? raw?.block_id ?? raw?.id;
  return createBlockID(v ? String(v) : '');
}

export function normalizeDeckId(raw: any, fallbackDeckID = ''): string {
  const v = raw?.deckID ?? raw?.deckId ?? raw?.deck_id ?? fallbackDeckID;
  return v ? String(v) : '';
}
