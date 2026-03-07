import { describe, expect, it } from 'vitest';
import {
  consumeRecentlyModifiedReviewHotkey,
  getForwardedReviewHotkey,
  normalizeReviewKeyboardKey,
  rememberModifiedReviewHotkey,
} from '../reviewKeyboardGuard';

describe('reviewKeyboardGuard', () => {
  it('normalizes forwarded hotkeys and ignores modified detail objects', () => {
    expect(getForwardedReviewHotkey('P')).toBe('p');
    expect(getForwardedReviewHotkey({
      key: 'p',
      ctrlKey: true,
    })).toBeNull();
    expect(getForwardedReviewHotkey({
      key: 'Enter',
    })).toBe('enter');
  });

  it('tracks recent modified hotkeys for forwarded bare-string suppression', () => {
    const recentModifiedHotkeys = new Map<string, number>();

    rememberModifiedReviewHotkey(recentModifiedHotkeys, {
      key: 'P',
      ctrlKey: true,
    }, 100);

    expect(consumeRecentlyModifiedReviewHotkey(recentModifiedHotkeys, 'p', 150)).toBe(true);
    expect(consumeRecentlyModifiedReviewHotkey(recentModifiedHotkeys, 'p', 151)).toBe(false);
  });

  it('keeps key normalization stable for keyboard events', () => {
    expect(normalizeReviewKeyboardKey('Escape')).toBe('escape');
    expect(normalizeReviewKeyboardKey(' ')).toBe(' ');
  });
});
