import { describe, expect, it } from 'vitest';
import {
  getBrowserActionErrorMessage,
  getBrowserActionLabel,
  parseBrowserRelativePriorityResult,
  PRIORITY_INCREASE_ACTION_ID,
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
    expect(getBrowserActionLabel({ id: 'add-to-retrieval-queue-all', label: '' }, t))
      .toBe('addToRetrievalQueue:提取练习');
    expect(getBrowserActionLabel({ id: 'add-to-incremental-queue-all', label: '' }, t))
      .toBe('addToIncrementalQueue:渐进学习');
    expect(getBrowserActionLabel({ id: PRIORITY_INCREASE_ACTION_ID, label: '' }, t))
      .toBe('priorityPlus10:Priority +10');
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

  it('parses relative priority results only for relative priority actions', () => {
    expect(parseBrowserRelativePriorityResult(PRIORITY_INCREASE_ACTION_ID, {
      delta: 10,
      updated: 2,
      upperBoundReached: true,
    })).toEqual({
      delta: 10,
      lowerBoundReached: false,
      updated: 2,
      upperBoundReached: true,
    });
    expect(parseBrowserRelativePriorityResult('priority-minus-10', {
      delta: -10,
      lowerBoundReached: true,
      updated: ['card-1'],
    })).toEqual({
      delta: -10,
      lowerBoundReached: true,
      updated: 1,
      upperBoundReached: false,
    });
    expect(parseBrowserRelativePriorityResult('set-priority', { updated: 1 })).toBeNull();
  });

  it('keeps reload and force-refresh policy explicit', () => {
    expect(shouldReloadAfterBrowserAction('delete-card')).toBe(true);
    expect(shouldReloadAfterBrowserAction(PRIORITY_INCREASE_ACTION_ID)).toBe(true);
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
