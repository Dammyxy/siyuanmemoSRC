// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState, type ReviewNativeSplitGuardState } from '../types';

let reviewNativeSplitGuardState: ReviewNativeSplitGuardState = {
  rendererKind: 'main-protyle',
  blockNativeTabSplit: false,
};

const reviewViewNativeSplitMocks = vi.hoisted(() => {
  const showMessage = vi.fn();

  class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = vi.fn();
  }

  return {
    showMessage,
    MockMenu,
  };
});

const reviewViewNativeSplitLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewNativeSplitMocks.MockMenu,
  showMessage: reviewViewNativeSplitMocks.showMessage,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewNativeSplitLoggerMocks,
  logger: reviewViewNativeSplitLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

function buildCard() {
  const now = Date.now();
  return {
    id: 'card-1',
    cardID: 'card-1',
    blockId: 'block-1',
    blockID: 'block-1',
    deckId: 'deck-1',
    due: now,
    stability: 1,
    difficulty: 1,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    state: 0,
    lastReview: 0,
    priority: 42,
    type: 'item',
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: now,
    updatedAt: now,
    meta: {},
  };
}

function createQueue(card: ReturnType<typeof buildCard>) {
  return {
    next: vi.fn(async () => card),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: 1, label: '1 due' })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
  };
}

function createAdapter() {
  return {
    toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        stats: {
          current: item ? 1 : 0,
          total: 1,
          label: item ? '1 due' : '0 due',
          queueName: 'Unified Queue',
        },
      },
      content: {
        type: 'protyle' as const,
        data: item?.blockId ?? '',
        id: item?.blockId ?? 'empty',
        card: item as never,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        showAnswer: !context.showAnswer,
        cardMeta: item
          ? {
              cardID: item.id,
              blockID: item.blockId,
              deckID: item.deckId,
              type: 'item',
              cardType: 'item',
            }
          : undefined,
      },
    })),
    cleanup: vi.fn(),
  };
}

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  emits: ['toolbar-action', 'action', 'context', 'breadcrumb-click'],
  setup() {
    return () => h('div', { class: 'review-header-stub' });
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  setup(_props, { expose }) {
    expose({
      exitEditorByEscape: () => false,
      getEditableTargets: () => [],
      getNativeSplitGuardState: () => reviewNativeSplitGuardState,
    });
    return () => h('div', { class: 'review-content-stub' });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function installWindowSiyuanKeymap(): void {
  (window as unknown as { siyuan?: unknown }).siyuan = {
    config: {
      keymap: {
        general: {
          splitLR: { custom: '⌥.' },
          splitMoveR: { custom: '⌥⇧.' },
          splitTB: { custom: '⌥,' },
          splitMoveB: { custom: '⌥⇧,' },
        },
      },
    },
  };
}

function removeHostFixtures(): void {
  document.querySelectorAll('[data-type="tab-header"]').forEach((element) => element.remove());
  document.getElementById('commonMenu')?.remove();
}

function createActiveTabHeader(tabId: string): HTMLElement {
  const tabHeader = document.createElement('li');
  tabHeader.setAttribute('data-type', 'tab-header');
  tabHeader.setAttribute('data-id', tabId);
  tabHeader.className = 'item item--focus';
  document.body.appendChild(tabHeader);
  return tabHeader;
}

function createKeyboardEvent(
  key: string,
  keyCode: number,
  init: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperty(event, 'keyCode', {
    configurable: true,
    get: () => keyCode,
  });
  return event;
}

function createNativeTabMenu(): HTMLElement {
  document.getElementById('commonMenu')?.remove();
  const menu = document.createElement('div');
  menu.id = 'commonMenu';
  menu.setAttribute('data-name', 'tab');

  const menuItems = document.createElement('div');
  menuItems.className = 'b3-menu__items';
  const splitItem = document.createElement('button');
  splitItem.className = 'b3-menu__item';
  splitItem.setAttribute('data-id', 'split');
  splitItem.textContent = 'split';
  menuItems.appendChild(splitItem);
  menu.appendChild(menuItems);
  document.body.appendChild(menu);
  return menu;
}

async function settleNativeMenuPrune(): Promise<void> {
  await flushPromises();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function mountReviewView(reviewSessionId = 'review-tab-guard') {
  const card = buildCard();
  const queue = createQueue(card);
  const adapter = createAdapter();

  return mount(ReviewView, {
    props: {
      app: {} as never,
      queue: queue as never,
      adapter: adapter as never,
      mode: 'tab',
      reviewSessionId,
      title: '提取练习',
      headerVariant: 'retrieval-practice',
      plugin: {
        getContext: () => ({
          getUnifiedDataSourceManager: () => null,
          getStorage: () => ({
            getSettings: () => ({}),
          }),
        }),
      },
    },
    global: {
      stubs: {
        ReviewHeader: ReviewHeaderStub,
        ReviewContent: ReviewContentStub,
        ReviewActions: ReviewActionsStub,
        FilterDialog: true,
        teleport: true,
      },
    },
  });
}

describe('ReviewView native split guard', () => {
  beforeEach(() => {
    reviewViewNativeSplitMocks.showMessage.mockReset();
    reviewViewNativeSplitLoggerMocks.error.mockReset();
    reviewViewNativeSplitLoggerMocks.warn.mockReset();
    reviewViewNativeSplitLoggerMocks.debug.mockReset();
    reviewViewNativeSplitLoggerMocks.info.mockReset();
    reviewViewNativeSplitLoggerMocks.log.mockReset();
    reviewViewNativeSplitLoggerMocks.trace.mockReset();
    reviewNativeSplitGuardState = {
      rendererKind: 'main-protyle',
      blockNativeTabSplit: false,
    };
    installWindowSiyuanKeymap();
    removeHostFixtures();
  });

  afterEach(() => {
    removeHostFixtures();
    delete (window as unknown as { siyuan?: unknown }).siyuan;
  });

  it('blocks all native split hotkeys for active special-render review tabs', async () => {
    reviewNativeSplitGuardState = {
      rendererKind: 'quick',
      blockNativeTabSplit: true,
    };
    createActiveTabHeader('review-tab-guard');
    const wrapper = mountReviewView();

    await flushPromises();

    let now = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 2000;
      return now;
    });

    const events = [
      createKeyboardEvent('.', 190, { altKey: true }),
      createKeyboardEvent('.', 190, { altKey: true, shiftKey: true }),
      createKeyboardEvent(',', 188, { altKey: true }),
      createKeyboardEvent(',', 188, { altKey: true, shiftKey: true }),
    ];

    for (const event of events) {
      document.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    }

    expect(reviewViewNativeSplitMocks.showMessage).toHaveBeenCalledTimes(4);

    wrapper.unmount();
    dateNowSpy.mockRestore();
  });

  it('does not block native split hotkeys for main-protyle cards or inactive review tabs', async () => {
    const wrapper = mountReviewView();
    createActiveTabHeader('review-tab-guard');

    await flushPromises();

    const mainProtyleEvent = createKeyboardEvent('.', 190, { altKey: true });
    document.dispatchEvent(mainProtyleEvent);
    expect(mainProtyleEvent.defaultPrevented).toBe(false);

    reviewNativeSplitGuardState = {
      rendererKind: 'descriptor',
      blockNativeTabSplit: true,
    };
    removeHostFixtures();
    createActiveTabHeader('other-tab');

    const inactiveEvent = createKeyboardEvent('.', 190, { altKey: true });
    document.dispatchEvent(inactiveEvent);
    expect(inactiveEvent.defaultPrevented).toBe(false);
    expect(reviewViewNativeSplitMocks.showMessage).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('removes the native split tab menu only for the active guarded review tab', async () => {
    reviewNativeSplitGuardState = {
      rendererKind: 'multi-cloze',
      blockNativeTabSplit: true,
    };
    const guardedTabHeader = createActiveTabHeader('review-tab-guard');
    const wrapper = mountReviewView();

    await flushPromises();

    createNativeTabMenu();
    guardedTabHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settleNativeMenuPrune();
    expect(document.querySelector('#commonMenu .b3-menu__item[data-id="split"]')).toBeNull();

    reviewNativeSplitGuardState = {
      rendererKind: 'main-protyle',
      blockNativeTabSplit: false,
    };
    createNativeTabMenu();
    guardedTabHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settleNativeMenuPrune();
    expect(document.querySelector('#commonMenu .b3-menu__item[data-id="split"]')).not.toBeNull();

    reviewNativeSplitGuardState = {
      rendererKind: 'concept',
      blockNativeTabSplit: true,
    };
    removeHostFixtures();
    const otherTabHeader = createActiveTabHeader('other-tab');
    createNativeTabMenu();
    otherTabHeader.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await settleNativeMenuPrune();
    expect(document.querySelector('#commonMenu .b3-menu__item[data-id="split"]')).not.toBeNull();

    wrapper.unmount();
  });
});
