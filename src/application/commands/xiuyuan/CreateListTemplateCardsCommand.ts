/**
 * Command object for creating list-template cards.
 */
export interface CreateListTemplateCardsCommand {
  /** Parent list-item block ID (question source). */
  parentBlockId: string;

  /** Child list-item block IDs (answer sources). */
  childBlockIds: string[];

  /** Template ID (storage stays on builtin-list-item for compatibility). */
  templateId: string;

  /** Deck ID (optional). */
  deckId?: string;

  /** Priority (optional, default 50). */
  priority?: number;

  /**
   * Creation mode:
   * - split-v2: one card per child (progressive)
   * - summary-v1: one aggregated summary card
   */
  creationMode?: 'split-v2' | 'summary-v1';

  /** Explicit card type override (optional). */
  cardType?: 'item' | 'descriptor';

  /** Business kind marker for multiline list cards (optional). */
  listKind?: 'default' | 'concept-multiline' | 'descriptor-multiline';

  /** Concept block ID used for contextual linkage (optional). */
  conceptBlockId?: string;
}
