import type { BrowserCard } from '../types';

type BrowserCardIdentityLike = Pick<BrowserCard, 'id' | 'blockId' | 'fsrsCardId'>;

export function resolveBrowserCardActionId(
  card: BrowserCardIdentityLike | null | undefined,
): string {
  return String(card?.fsrsCardId || card?.id || '').trim();
}

export function resolveBrowserCardStableId(
  card: BrowserCardIdentityLike | null | undefined,
): string {
  return resolveBrowserCardActionId(card) || String(card?.blockId || '').trim();
}
