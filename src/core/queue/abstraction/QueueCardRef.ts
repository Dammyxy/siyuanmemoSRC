
export interface QueueCardRef {
  /** Map to RiffCard.id or raw card ID */
  cardID: string;
  /** Map to RiffCard.blockID or raw block ID */
  blockID: string;
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

export function normalizeRiffCardId(raw: any): string {
  const v = raw?.riffCardID
    ?? raw?.riffCardId
    ?? raw?.cardID
    ?? raw?.cardId
    ?? raw?.riffCard?.id
    ?? raw?.riffCard?.ID;
  return v ? String(v) : '';
}

export function normalizeBlockId(raw: any): string {
  const v = raw?.blockID ?? raw?.blockId ?? raw?.block_id ?? raw?.id;
  return v ? String(v) : '';
}

export function normalizeDeckId(raw: any, fallbackDeckID = ''): string {
  const v = raw?.deckID ?? raw?.deckId ?? raw?.deck_id ?? fallbackDeckID;
  return v ? String(v) : '';
}
