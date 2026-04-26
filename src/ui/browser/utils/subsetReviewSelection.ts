import type { BrowserActionTarget } from '@/application/interfaces/ICardDataSource';

export type SubsetReviewSelectionTarget = Pick<
  BrowserActionTarget,
  'id' | 'blockId' | 'fsrsCardId'
>;

export type SubsetReviewSelection = {
  blockIds: string[];
  cardIds: string[];
  preferredCardId?: string;
};

function normalizeId(value: unknown): string {
  return String(value || '').trim();
}

function uniqueIds(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizeId).filter(Boolean)));
}

function resolveCardId(target: SubsetReviewSelectionTarget | null | undefined): string {
  return normalizeId(target?.fsrsCardId || target?.id);
}

export function resolveSubsetReviewSelection(
  targets: Array<SubsetReviewSelectionTarget | null | undefined>,
  anchorTarget?: SubsetReviewSelectionTarget | null,
): SubsetReviewSelection {
  const blockIds = uniqueIds((targets || []).map((target) => target?.blockId || ''));
  const cardIds = uniqueIds((targets || []).map(resolveCardId));
  const preferredFromAnchor = resolveCardId(anchorTarget);
  const preferredFromSelection = resolveCardId(targets?.[0]);
  const preferredCardId = preferredFromAnchor || preferredFromSelection;

  return {
    blockIds,
    cardIds,
    preferredCardId: preferredCardId || undefined,
  };
}
