import { describe, expect, it, vi } from 'vitest';
import { createReviewTruthFlushHostRuntime } from '../reviewHostRuntime';

function createPlugin(client: { requestReviewTruthFlush?: (reason: 'review-exit' | 'queue-complete' | 'manual') => boolean }) {
  return {
    getContext: () => ({
      getSrsBackendClient: () => client,
    }),
  };
}

describe('reviewHostRuntime', () => {
  it('requests Review truth flush through the prop plugin context first', () => {
    const propClient = {
      requestReviewTruthFlush: vi.fn(() => true),
    };
    const windowClient = {
      requestReviewTruthFlush: vi.fn(() => true),
    };
    const runtime = createReviewTruthFlushHostRuntime({
      getPlugin: () => createPlugin(propClient),
      getWindowPlugin: () => createPlugin(windowClient),
      logger: {},
    });

    runtime.requestReviewTruthFlush('queue-complete');

    expect(propClient.requestReviewTruthFlush).toHaveBeenCalledWith('queue-complete');
    expect(windowClient.requestReviewTruthFlush).not.toHaveBeenCalled();
  });

  it('falls back to the window plugin and logs request errors without throwing', () => {
    const windowClient = {
      requestReviewTruthFlush: vi.fn(() => {
        throw new Error('backend unavailable');
      }),
    };
    const logger = {
      warn: vi.fn(),
    };
    const runtime = createReviewTruthFlushHostRuntime({
      getPlugin: () => null,
      getWindowPlugin: () => createPlugin(windowClient),
      logger,
    });

    expect(() => runtime.requestReviewTruthFlush('review-exit')).not.toThrow();

    expect(windowClient.requestReviewTruthFlush).toHaveBeenCalledWith('review-exit');
    expect(logger.warn).toHaveBeenCalledWith(
      '[SiYuanMemo][ReviewView] Failed to request Review truth flush',
      {
        reason: 'review-exit',
        error: 'backend unavailable',
      },
    );
  });
});
