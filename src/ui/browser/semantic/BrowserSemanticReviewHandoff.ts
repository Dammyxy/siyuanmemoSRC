import type { BrowserSemanticReviewHandoff } from './BrowserSemanticStateController';

export interface BrowserSemanticReviewHandoffDeps {
  openSubsetReviewDialog?: (
    blockIds: string[],
    options?: {
      cardIds?: string[];
      preferredCardId?: string;
    },
  ) => Promise<void> | void;
  pushErrMsg: (message: string) => Promise<void> | void;
  t: (key: string, fallback: string) => string;
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

export async function openBrowserSemanticHandoffInReview(
  handoff: BrowserSemanticReviewHandoff,
  deps: BrowserSemanticReviewHandoffDeps,
): Promise<boolean> {
  const blockId = normalizeId(handoff.blockId || handoff.currentNodeId);
  if (!handoff.isReviewCard || !blockId) {
    await deps.pushErrMsg(deps.t(
      'browserSemanticReviewHandoffNodeUnavailable',
      'Current Semantic node is not a review card.',
    ));
    return false;
  }

  if (!deps.openSubsetReviewDialog) {
    await deps.pushErrMsg(deps.t(
      'browserSemanticReviewHandoffUnavailable',
      'Review Semantic handoff is not wired yet; continue in Browser Semantic Workbench.',
    ));
    return false;
  }

  const cardId = normalizeId(handoff.cardId);
  await deps.openSubsetReviewDialog([blockId], cardId
    ? { cardIds: [cardId], preferredCardId: cardId }
    : undefined);
  return true;
}
