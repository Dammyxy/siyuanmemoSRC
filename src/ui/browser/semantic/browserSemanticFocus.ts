import type { BrowserCard } from '../types';
import type { BrowserSemanticFocus } from './types';

function normalizeString(value: unknown): string {
  return String(value ?? '').trim();
}

export function isBrowserSemanticConceptCard(card: BrowserCard | null | undefined): card is BrowserCard {
  if (!card) {
    return false;
  }
  const marker = normalizeString(card.meta?.cardTypeMarker ?? card.meta?.type ?? card.cardType).toLowerCase();
  return card.cardType === 'concept' || marker === 'concept';
}

export function resolveBrowserSemanticFocus(card: BrowserCard | null | undefined): BrowserSemanticFocus | null {
  if (!isBrowserSemanticConceptCard(card)) {
    return null;
  }
  const rootFocusNodeId = normalizeString(card.blockId);
  if (!rootFocusNodeId) {
    return null;
  }
  return {
    rootFocusNodeId,
    title: normalizeString(card.content || card.fullContent || card.note) || rootFocusNodeId,
    sourceCard: card,
  };
}
