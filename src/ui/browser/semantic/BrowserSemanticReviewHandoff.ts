import type { BrowserSemanticReviewHandoff } from './BrowserSemanticStateController';

export interface BrowserSemanticReviewHandoffDeps {
  openSemanticReviewSession?: (options: {
    sessionId: string;
    currentNodeId: string;
    focusBlockId?: string;
  }) => Promise<void> | void;
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
  const sessionId = normalizeId(handoff.sessionId);
  const currentNodeId = normalizeId(handoff.currentNodeId);
  if (!sessionId || !currentNodeId) {
    await deps.pushErrMsg(deps.t(
      'browserSemanticReviewHandoffNodeUnavailable',
      'Current Semantic session is not ready for Review handoff.',
    ));
    return false;
  }

  if (!deps.openSemanticReviewSession) {
    await deps.pushErrMsg(deps.t(
      'browserSemanticReviewHandoffUnavailable',
      'Review Semantic handoff is not wired yet; continue in Browser Semantic Workbench.',
    ));
    return false;
  }

  try {
    await deps.openSemanticReviewSession({
      sessionId,
      currentNodeId,
      focusBlockId: normalizeId(handoff.blockId || handoff.currentNodeId) || undefined,
    });
  } catch (error) {
    await deps.pushErrMsg(error instanceof Error ? error.message : String(error));
    return false;
  }
  return true;
}
