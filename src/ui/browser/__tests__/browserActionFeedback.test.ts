import { describe, expect, it } from 'vitest';
import {
  getBrowserActionErrorMessage,
  getBrowserActionLabel,
  parseBrowserAddToQueueResult,
  shouldForceRefreshAfterBrowserAction,
  shouldReloadAfterBrowserAction,
  summarizeBrowserActionResult,
} from '../browserActionFeedback';

describe('browserActionFeedback', () => {
  it('maps known action labels through i18n and leaves unknown labels intact', () => {
    const t = (key: string, fallback: string) => `${key}:${fallback}`;

    expect(getBrowserActionLabel({ id: 'delete-card', label: '' }, t))
      .toBe('deleteCard:取消闪卡');
    expect(getBrowserActionLabel({ id: 'custom-action', label: 'Custom' }, t))
      .toBe('Custom');
  });

  it('parses add-to-queue results only when added is numeric', () => {
    expect(parseBrowserAddToQueueResult('add-to-retrieval-queue', {
      added: 2,
      message: 'Added',
    })).toEqual({ added: 2, message: 'Added' });
    expect(parseBrowserAddToQueueResult('add-to-retrieval-queue', { added: '2' })).toBeNull();
    expect(parseBrowserAddToQueueResult('reset', { added: 2 })).toBeNull();
  });

  it('summarizes numeric and array-shaped batch results', () => {
    expect(summarizeBrowserActionResult({ updated: 3, skipped: 1 })).toEqual({
      updated: 3,
      skipped: 1,
    });
    expect(summarizeBrowserActionResult({ updated: ['a', 'b'], skipped: ['c'] })).toEqual({
      updated: 2,
      skipped: 1,
    });
    expect(summarizeBrowserActionResult(undefined)).toEqual({ updated: 0, skipped: 0 });
  });

  it('keeps reload and force-refresh policy explicit', () => {
    expect(shouldReloadAfterBrowserAction('delete-card')).toBe(true);
    expect(shouldReloadAfterBrowserAction('open')).toBe(false);
    expect(shouldForceRefreshAfterBrowserAction('postpone')).toBe(true);
    expect(shouldForceRefreshAfterBrowserAction('reset')).toBe(false);
  });

  it('extracts useful error messages with fallback', () => {
    expect(getBrowserActionErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(getBrowserActionErrorMessage(' failed ', 'fallback')).toBe(' failed ');
    expect(getBrowserActionErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
