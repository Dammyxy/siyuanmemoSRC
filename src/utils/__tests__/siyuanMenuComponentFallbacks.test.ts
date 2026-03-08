import { afterEach, describe, expect, it } from 'vitest';

import {
  ensureSiyuanMenuComponentFallbacks,
  isMissingSiyuanMenuComponentReferenceError,
} from '../siyuanMenuComponentFallbacks';

type GlobalWithMenuFallbacks = typeof globalThis & {
  MenuSeparator?: unknown;
  ViewSelect?: unknown;
};

const globalWithMenuFallbacks = globalThis as GlobalWithMenuFallbacks;
const originalViewSelect = globalWithMenuFallbacks.ViewSelect;
const originalMenuSeparator = globalWithMenuFallbacks.MenuSeparator;

function restoreGlobals(): void {
  if (typeof originalViewSelect === 'undefined') {
    delete globalWithMenuFallbacks.ViewSelect;
  } else {
    globalWithMenuFallbacks.ViewSelect = originalViewSelect;
  }

  if (typeof originalMenuSeparator === 'undefined') {
    delete globalWithMenuFallbacks.MenuSeparator;
  } else {
    globalWithMenuFallbacks.MenuSeparator = originalMenuSeparator;
  }
}

afterEach(() => {
  restoreGlobals();
});

describe('ensureSiyuanMenuComponentFallbacks', () => {
  it('installs missing menu component globals', () => {
    delete globalWithMenuFallbacks.ViewSelect;
    delete globalWithMenuFallbacks.MenuSeparator;

    const patched = ensureSiyuanMenuComponentFallbacks();
    expect(patched).toEqual(['ViewSelect', 'MenuSeparator']);

    const viewSelect = new (globalWithMenuFallbacks.ViewSelect as new (...args: unknown[]) => HTMLElement)('Label');
    expect(viewSelect).toBeInstanceOf(HTMLElement);
    expect(viewSelect.className).toBe('b3-menu__item');
    expect(viewSelect.textContent).toContain('Label');

    const separator = new (globalWithMenuFallbacks.MenuSeparator as new () => HTMLElement)();
    expect(separator).toBeInstanceOf(HTMLElement);
    expect(separator.className).toBe('b3-menu__separator');
  });

  it('does not override existing menu component globals', () => {
    const existingViewSelect = function ExistingViewSelect() {
      return document.createElement('div');
    };
    globalWithMenuFallbacks.ViewSelect = existingViewSelect;
    delete globalWithMenuFallbacks.MenuSeparator;

    const patched = ensureSiyuanMenuComponentFallbacks();
    expect(patched).toEqual(['MenuSeparator']);
    expect(globalWithMenuFallbacks.ViewSelect).toBe(existingViewSelect);
  });
});

describe('isMissingSiyuanMenuComponentReferenceError', () => {
  it('matches missing menu component reference errors', () => {
    expect(isMissingSiyuanMenuComponentReferenceError(new Error('ViewSelect is not defined'))).toBe(true);
    expect(isMissingSiyuanMenuComponentReferenceError(new Error('MenuSeparator is not defined'))).toBe(true);
    expect(isMissingSiyuanMenuComponentReferenceError(new Error('something else'))).toBe(false);
    expect(isMissingSiyuanMenuComponentReferenceError('ViewSelect is not defined')).toBe(false);
  });
});
