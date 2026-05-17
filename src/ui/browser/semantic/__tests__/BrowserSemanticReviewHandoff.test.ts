import { describe, expect, it, vi } from 'vitest';
import { openBrowserSemanticHandoffInReview } from '../BrowserSemanticReviewHandoff';

function deps() {
  return {
    openSubsetReviewDialog: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    t: vi.fn((_key: string, fallback: string) => fallback),
  };
}

describe('openBrowserSemanticHandoffInReview', () => {
  it('opens the current real review-card node as a one-card subset review', async () => {
    const harness = deps();

    const opened = await openBrowserSemanticHandoffInReview({
      sessionId: 'semantic-session-1',
      currentNodeId: 'node-review-1',
      blockId: 'block-review-1',
      cardId: 'card-review-1',
      isReviewCard: true,
    }, harness);

    expect(opened).toBe(true);
    expect(harness.openSubsetReviewDialog).toHaveBeenCalledWith(['block-review-1'], {
      cardIds: ['card-review-1'],
      preferredCardId: 'card-review-1',
    });
    expect(harness.pushErrMsg).not.toHaveBeenCalled();
  });

  it('fails closed for implicit semantic nodes', async () => {
    const harness = deps();

    const opened = await openBrowserSemanticHandoffInReview({
      sessionId: 'semantic-session-1',
      currentNodeId: 'implicit-node-1',
      blockId: 'implicit-node-1',
      cardId: null,
      isReviewCard: false,
    }, harness);

    expect(opened).toBe(false);
    expect(harness.openSubsetReviewDialog).not.toHaveBeenCalled();
    expect(harness.pushErrMsg).toHaveBeenCalledWith('Current Semantic node is not a review card.');
  });
});
