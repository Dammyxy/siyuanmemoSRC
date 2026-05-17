import { describe, expect, it, vi } from 'vitest';
import { openBrowserSemanticHandoffInReview } from '../BrowserSemanticReviewHandoff';

function deps() {
  return {
    openSubsetReviewDialog: vi.fn(async () => undefined),
    openSemanticReviewSession: vi.fn(async () => undefined),
    pushErrMsg: vi.fn(async () => undefined),
    t: vi.fn((_key: string, fallback: string) => fallback),
  };
}

describe('openBrowserSemanticHandoffInReview', () => {
  it('opens Review Semantic sidebar pinned to the selected session', async () => {
    const harness = deps();

    const opened = await openBrowserSemanticHandoffInReview({
      sessionId: 'semantic-session-1',
      currentNodeId: 'node-review-1',
      blockId: 'block-review-1',
      cardId: 'card-review-1',
      isReviewCard: true,
    }, harness);

    expect(opened).toBe(true);
    expect(harness.openSemanticReviewSession).toHaveBeenCalledWith({
      sessionId: 'semantic-session-1',
      currentNodeId: 'node-review-1',
      focusBlockId: 'block-review-1',
    });
    expect(harness.openSubsetReviewDialog).not.toHaveBeenCalled();
    expect(harness.pushErrMsg).not.toHaveBeenCalled();
  });

  it('does not require the selected node to be a review card', async () => {
    const harness = deps();

    const opened = await openBrowserSemanticHandoffInReview({
      sessionId: 'semantic-session-1',
      currentNodeId: 'implicit-node-1',
      blockId: 'implicit-node-1',
      cardId: null,
      isReviewCard: false,
    }, harness);

    expect(opened).toBe(true);
    expect(harness.openSemanticReviewSession).toHaveBeenCalledWith({
      sessionId: 'semantic-session-1',
      currentNodeId: 'implicit-node-1',
      focusBlockId: 'implicit-node-1',
    });
    expect(harness.pushErrMsg).not.toHaveBeenCalled();
  });

  it('fails closed when Review Semantic handoff is unavailable', async () => {
    const harness = {
      pushErrMsg: vi.fn(async () => undefined),
      t: vi.fn((_key: string, fallback: string) => fallback),
    };

    const opened = await openBrowserSemanticHandoffInReview({
      sessionId: 'semantic-session-1',
      currentNodeId: 'node-1',
      blockId: 'block-1',
      cardId: null,
      isReviewCard: false,
    }, harness);

    expect(opened).toBe(false);
    expect(harness.pushErrMsg).toHaveBeenCalledWith('Review Semantic handoff is not wired yet; continue in Browser Semantic Workbench.');
  });
});
