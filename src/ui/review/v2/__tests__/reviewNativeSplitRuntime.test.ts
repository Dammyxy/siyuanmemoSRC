// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  createReviewNativeSplitRuntime,
  getReviewEventElement,
  isVisibleReviewRoot,
} from '../reviewNativeSplitRuntime';
import { createReviewEditorState } from '../reviewEditorState';

function createRuntime(root: HTMLElement, guardState = { rendererKind: 'main-protyle' as const, blockNativeTabSplit: true }) {
  return createReviewNativeSplitRuntime({
    rootRef: ref(root),
    editorState: ref(createReviewEditorState('empty')),
    mode: () => 'tab',
    reviewSessionId: () => 'review-tab-1',
    resolveGuardState: () => guardState,
    t: (_key, fallback) => fallback,
    showMessage: vi.fn(),
    logger: { debug: vi.fn() },
  });
}

function createActiveTabHeader(): HTMLElement {
  const tabHeader = document.createElement('li');
  tabHeader.setAttribute('data-type', 'tab-header');
  tabHeader.setAttribute('data-id', 'review-tab-1');
  tabHeader.className = 'item item--focus';
  document.body.appendChild(tabHeader);
  return tabHeader;
}

function createNativeTabMenu(): HTMLElement {
  const menu = document.createElement('div');
  menu.id = 'commonMenu';
  menu.setAttribute('data-name', 'tab');

  const splitItem = document.createElement('button');
  splitItem.className = 'b3-menu__item';
  splitItem.setAttribute('data-id', 'split');
  menu.appendChild(splitItem);
  document.body.appendChild(menu);
  return menu;
}

describe('reviewNativeSplitRuntime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('resolves event elements and visible review roots', () => {
    const root = document.createElement('div');
    root.className = 'fsrs-review-v2';
    document.body.appendChild(root);
    const text = document.createTextNode('review');
    root.appendChild(text);

    expect(getReviewEventElement(root)).toBe(root);
    expect(getReviewEventElement(text)).toBe(root);
    expect(isVisibleReviewRoot(root)).toBe(true);

    root.hidden = true;
    expect(isVisibleReviewRoot(root)).toBe(false);
  });

  it('detects active review keyboard and typing contexts', () => {
    const root = document.createElement('div');
    root.className = 'fsrs-review-v2';
    const input = document.createElement('input');
    root.appendChild(input);
    document.body.appendChild(root);
    const runtime = createRuntime(root);

    expect(runtime.isActiveReviewSurface()).toBe(true);
    expect(runtime.isReviewKeyboardContext(input)).toBe(true);
    expect(runtime.isTypingTarget(input)).toBe(true);
  });

  it('prunes native split menu for blocked special review tabs', async () => {
    const root = document.createElement('div');
    root.className = 'fsrs-review-v2';
    document.body.appendChild(root);
    const runtime = createRuntime(root);
    const tabHeader = createActiveTabHeader();
    const menu = createNativeTabMenu();
    const event = new MouseEvent('contextmenu', { bubbles: true });
    Object.defineProperty(event, 'target', { value: tabHeader });

    runtime.handleTabContextMenu(event);
    await vi.runAllTimersAsync();

    expect(menu.querySelector('.b3-menu__item[data-id="split"]')).toBeNull();
  });
});
