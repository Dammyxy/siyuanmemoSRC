// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  bindReviewGlobalEvents,
  createReviewDuplicateKeyGuard,
} from '../reviewKeyboardRuntime';

describe('reviewKeyboardRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('guards duplicate key handling during debounce window', async () => {
    let timestamp = 1000;
    const logger = { debug: vi.fn() };
    const guard = createReviewDuplicateKeyGuard({
      debounceMs: 30,
      logger,
      now: () => timestamp,
    });

    expect(guard.shouldIgnore('space')).toBe(false);
    expect(guard.shouldIgnore('space')).toBe(true);

    timestamp += 30;
    await vi.advanceTimersByTimeAsync(30);

    expect(guard.shouldIgnore('space')).toBe(false);
    expect(logger.debug).toHaveBeenCalledWith(
      '[SiYuanMemo][ReviewView] Key is being processed, ignoring:',
      'space',
    );
  });

  it('resets key guard state explicitly', () => {
    const guard = createReviewDuplicateKeyGuard({ debounceMs: 30 });

    expect(guard.shouldIgnore('1')).toBe(false);
    expect(guard.shouldIgnore('1')).toBe(true);

    guard.reset();

    expect(guard.shouldIgnore('1')).toBe(false);
  });

  it('binds and disposes review global events once', () => {
    const target = new EventTarget();
    const listener = vi.fn();
    const dispose = bindReviewGlobalEvents([
      { target, type: 'review-test', listener },
      { target: null, type: 'ignored', listener },
    ]);

    target.dispatchEvent(new Event('review-test'));
    expect(listener).toHaveBeenCalledTimes(1);

    dispose();
    dispose();
    target.dispatchEvent(new Event('review-test'));

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
