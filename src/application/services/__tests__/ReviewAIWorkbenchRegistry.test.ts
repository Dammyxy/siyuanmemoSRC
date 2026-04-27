import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewAIWorkbenchRegistry } from '../ReviewAIWorkbenchRegistry';

const { AIWorkbenchServiceMock, serviceRef } = vi.hoisted(() => ({
  AIWorkbenchServiceMock: vi.fn(),
  serviceRef: {
    current: null as null | {
      state: { sessionId: string | null };
      open: ReturnType<typeof vi.fn>;
      updateLiveReviewContext: ReturnType<typeof vi.fn>;
    },
  },
}));

vi.mock('@/application/services/AIWorkbenchService', () => ({
  AIWorkbenchService: AIWorkbenchServiceMock,
}));

describe('ReviewAIWorkbenchRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceRef.current = {
      state: { sessionId: 'ai-session-1' },
      open: vi.fn(async () => undefined),
      updateLiveReviewContext: vi.fn(async () => undefined),
    };
    AIWorkbenchServiceMock.mockImplementation(() => serviceRef.current);
  });

  it('uses runtime-only context update for an initialized review AI service', async () => {
    const registry = new ReviewAIWorkbenchRegistry({} as never);
    registry.getOrCreateReviewSession('review-session-1');

    await registry.updateReviewSessionContext({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: null,
    });

    expect(serviceRef.current?.updateLiveReviewContext).toHaveBeenCalledWith(expect.objectContaining({
      source: 'review',
      sessionId: 'review-session-1',
      sourceReviewSessionId: 'review-session-1',
    }));
    expect(serviceRef.current?.open).not.toHaveBeenCalled();
  });

  it('falls back to full open before a review AI service is hydrated', async () => {
    const registry = new ReviewAIWorkbenchRegistry({} as never);
    registry.getOrCreateReviewSession('review-session-1');
    if (serviceRef.current) {
      serviceRef.current.state.sessionId = null;
    }

    await registry.updateReviewSessionContext({
      source: 'review',
      surface: 'review-dialog-sidecar',
      sessionId: 'review-session-1',
      currentCard: null,
    });

    expect(serviceRef.current?.open).toHaveBeenCalledWith(expect.objectContaining({
      source: 'review',
      sessionId: 'review-session-1',
      sourceReviewSessionId: 'review-session-1',
    }));
    expect(serviceRef.current?.updateLiveReviewContext).not.toHaveBeenCalled();
  });
});
