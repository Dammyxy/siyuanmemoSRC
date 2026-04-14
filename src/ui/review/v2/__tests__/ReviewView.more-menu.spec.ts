// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState } from '../types';
import {
  REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
  REVIEW_SET_PRIORITY_REQUEST_EVENT,
  REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT,
} from '@/application/handlers/ReviewCommandRequestEvents';

const reviewViewMoreMenuMocks = vi.hoisted(() => {
  const menuOpen = vi.fn();
  const showMessage = vi.fn();
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; addSeparator: ReturnType<typeof vi.fn> }> = [];

  class MockMenu {
    addItem = vi.fn();
    addSeparator = vi.fn();
    open = menuOpen;

    constructor() {
      instances.push(this);
    }
  }

  return {
    menuOpen,
    showMessage,
    instances,
    MockMenu,
  };
});

const reviewViewDialogMocks = vi.hoisted(() => ({
  createVueDialogMock: vi.fn(() => ({
    dialog: {} as never,
    destroy: vi.fn(),
  })),
  confirmDialogMock: vi.fn(async () => true),
}));

const reviewViewLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewMoreMenuMocks.MockMenu,
  showMessage: reviewViewMoreMenuMocks.showMessage,
}));

vi.mock('@/utils/dialog', () => ({
  createVueDialog: reviewViewDialogMocks.createVueDialogMock,
  confirmDialog: reviewViewDialogMocks.confirmDialogMock,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewLoggerMocks,
  logger: reviewViewLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

function buildCard(id: string, blockId = 'block-1') {
  const now = Date.now();
  return {
    id,
    cardID: id,
    blockId,
    blockID: blockId,
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

function createQueue(cards: Array<ReturnType<typeof buildCard>>, queueType = 'retrieval-practice') {
  let index = 0;

  return {
    queueType,
    next: vi.fn(async () => cards[index++] ?? null),
    onFeedback: vi.fn(async () => undefined),
    getStats: vi.fn(async () => ({ size: cards.length, label: `${cards.length} due` })),
    getUIConfig: vi.fn(() => ({
      statsType: 'queue-size' as const,
      showRatingButtons: true,
      allowSkip: true,
    })),
    canGoBack: vi.fn(() => false),
    removeCard: vi.fn(async () => undefined),
  };
}

function createAdapter() {
  return {
    toUIState: vi.fn(async (_queue: unknown, item: ReturnType<typeof buildCard> | null, context: { showAnswer?: boolean }) => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        title: 'Review',
        stats: {
          current: item ? 1 : 0,
          total: 2,
          label: item ? '1 due' : '0 due',
          queueName: 'Unified Queue',
        },
        toolbar: [
          { type: 'ai-sidebar', icon: '#iconSparkles', ariaLabel: 'AI Sidebar' },
          { type: 'more', icon: '#iconMore', ariaLabel: 'More' },
        ],
      },
      content: {
        type: 'protyle' as const,
        data: item?.blockId ?? '',
        id: item?.blockId ?? 'empty',
        card: item as never,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        showAnswer: Boolean(context.showAnswer),
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
      meta: {
        ...createEmptyReviewUIState().meta,
        queueProgress: {
          queueType: 'retrieval-practice',
          queueLabel: 'Unified Queue',
          completed: 0,
          remaining: item ? 1 : 0,
          total: 2,
        },
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
  props: {
    content: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    return () => h(
      'div',
      { class: 'fsrs-review-v2-content review-content-card-id' },
      String((props.content as { card?: { id?: string } }).card?.id || ''),
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

function createToolbarEvent(): MouseEvent {
  const target = document.createElement('button');
  Object.defineProperty(target, 'getBoundingClientRect', {
    value: () => ({ left: 12, bottom: 24 }),
  });
  const event = new MouseEvent('click');
  Object.defineProperty(event, 'currentTarget', {
    value: target,
  });
  return event;
}

function getLatestMenuItems() {
  const latestMenu = reviewViewMoreMenuMocks.instances.at(-1);
  expect(latestMenu).toBeDefined();
  return latestMenu!.addItem.mock.calls.map(([item]) => item);
}

function createPluginContext(overrides?: {
  cardService?: {
    getCardsByBlockId: ReturnType<typeof vi.fn>;
    deleteCard: ReturnType<typeof vi.fn>;
    deleteCards: ReturnType<typeof vi.fn>;
  };
  cardEditorService?: {
    updatePriority: ReturnType<typeof vi.fn>;
    setDismissed: ReturnType<typeof vi.fn>;
    setDismissedMany: ReturnType<typeof vi.fn>;
  };
  registry?: {
    hasReviewSession?: ReturnType<typeof vi.fn>;
    getReviewSession?: ReturnType<typeof vi.fn>;
    openReviewSession?: ReturnType<typeof vi.fn>;
    updateReviewSessionContext?: ReturnType<typeof vi.fn>;
  };
  tabManager?: {
    openReviewTab: ReturnType<typeof vi.fn>;
    openReviewTabInNewTab?: ReturnType<typeof vi.fn>;
    openReviewInNewWindow?: ReturnType<typeof vi.fn>;
    openReviewAICompanionTab?: ReturnType<typeof vi.fn>;
    focusReviewAICompanionTab?: ReturnType<typeof vi.fn>;
  };
}) {
  return {
    getUnifiedDataSourceManager: () => null,
    getStorage: () => ({
      getSettings: () => ({
        progressiveReading: {
          altXExcerptEnabled: true,
        },
      }),
      getCard: (cardId: string) => ({ id: cardId, blockId: 'block-1' }),
      getCardByBlockId: (blockId: string) => ({ id: 'card-1', blockId }),
    }),
    getReviewService: () => ({
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    }),
    getCardService: () => overrides?.cardService,
    getCardEditorService: () => overrides?.cardEditorService,
    getReviewAIWorkbenchRegistry: () => overrides?.registry,
    getTabManager: () => overrides?.tabManager,
  };
}

function mountReviewView(options?: {
  queueType?: string;
  cards?: Array<ReturnType<typeof buildCard>>;
  peerCards?: Array<ReturnType<typeof buildCard>>;
  cardService?: {
    getCardsByBlockId: ReturnType<typeof vi.fn>;
    deleteCard: ReturnType<typeof vi.fn>;
    deleteCards: ReturnType<typeof vi.fn>;
  };
  cardEditorService?: {
    updatePriority: ReturnType<typeof vi.fn>;
    setDismissed: ReturnType<typeof vi.fn>;
    setDismissedMany: ReturnType<typeof vi.fn>;
  };
  registry?: {
    hasReviewSession?: ReturnType<typeof vi.fn>;
    getReviewSession?: ReturnType<typeof vi.fn>;
    openReviewSession?: ReturnType<typeof vi.fn>;
    updateReviewSessionContext?: ReturnType<typeof vi.fn>;
  };
  attachInDialog?: boolean;
}) {
  const cards = options?.cards ?? [buildCard('card-1'), buildCard('card-2', 'block-2')];
  const queue = createQueue(cards, options?.queueType);
  const adapter = createAdapter();

  const cardService = options?.cardService ?? {
    getCardsByBlockId: vi.fn(() => options?.peerCards ?? [cards[0], buildCard('peer-1'), buildCard('peer-2')]),
    deleteCard: vi.fn(async () => ({ ok: true, value: undefined })),
    deleteCards: vi.fn(async () => ({
      ok: true,
      value: {
        deletedCount: 2,
        deletedCardIds: ['peer-1', 'peer-2'],
        failedCardIds: [],
      },
    })),
  };
  const cardEditorService = options?.cardEditorService ?? {
    updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
      card: {
        ...cards[0],
        priority,
      },
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    setDismissed: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    setDismissedMany: vi.fn(async () => ({
      updatedCardIds: ['peer-1', 'peer-2'],
      failedCardIds: [],
    })),
  };
  const registry = options?.registry ?? {
    hasReviewSession: vi.fn(() => false),
    getReviewSession: vi.fn(() => null),
    openReviewSession: vi.fn(async (input) => ({
      state: {
        activeView: input.view,
      },
    })),
    updateReviewSessionContext: vi.fn(async (input) => ({
      state: {
        activeView: input.view,
      },
    })),
  };
  const tabManager = {
    openReviewTab: vi.fn(),
    openReviewTabInNewTab: vi.fn(),
    openReviewInNewWindow: vi.fn(),
    openReviewAICompanionTab: vi.fn(),
    focusReviewAICompanionTab: vi.fn(() => false),
  };

  let attachTo: HTMLElement | undefined;
  if (options?.attachInDialog) {
    const dialogContainer = document.createElement('div');
    dialogContainer.className = 'b3-dialog__container siyuanmemo-review-dialog-container';
    const host = document.createElement('div');
    dialogContainer.appendChild(host);
    document.body.appendChild(dialogContainer);
    attachTo = host;
  }

  const wrapper = mount(ReviewView, {
    attachTo,
    props: {
      app: {} as never,
      queue: queue as never,
      adapter: adapter as never,
      mode: 'dialog',
      plugin: {
        getContext: () => createPluginContext({
          cardService,
          cardEditorService,
          registry,
          tabManager,
        }),
      },
    },
    global: {
      stubs: {
        ReviewHeader: ReviewHeaderStub,
        ReviewContent: ReviewContentStub,
        ReviewActions: ReviewActionsStub,
        FilterDialog: true,
        AiWorkbenchPane: true,
        teleport: true,
      },
    },
  });

  return {
    wrapper,
    queue,
    cardService,
    cardEditorService,
    registry,
    tabManager,
  };
}

describe('ReviewView more menu', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1440,
      writable: true,
    });
    reviewViewMoreMenuMocks.menuOpen.mockReset();
    reviewViewMoreMenuMocks.showMessage.mockReset();
    reviewViewMoreMenuMocks.instances.length = 0;
    reviewViewDialogMocks.createVueDialogMock.mockClear();
    reviewViewDialogMocks.confirmDialogMock.mockReset();
    reviewViewDialogMocks.confirmDialogMock.mockResolvedValue(true);
    reviewViewLoggerMocks.error.mockReset();
    reviewViewLoggerMocks.warn.mockReset();
    reviewViewLoggerMocks.debug.mockReset();
    reviewViewLoggerMocks.info.mockReset();
    reviewViewLoggerMocks.log.mockReset();
    reviewViewLoggerMocks.trace.mockReset();
    document.body.innerHTML = '';
  });

  it('opens more-menu entries for open-as, edit SRS, and fullscreen', async () => {
    const { wrapper } = mountReviewView({ attachInDialog: true });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const items = getLatestMenuItems();
    const openAsItem = items.find((item) => item.id === 'open-as');
    const editSrsItem = items.find((item) => item.id === 'edit-srs');
    const fullscreenItem = items.find((item) => item.id === 'fullscreen');
    const dialogContainer = wrapper.element.closest('.b3-dialog__container.siyuanmemo-review-dialog-container');

    expect(openAsItem?.submenu?.map((item: { id?: string }) => item.id)).toEqual(expect.arrayContaining([
      'openByTab',
      'insertRight',
    ]));

    editSrsItem?.click();
    await flushPromises();
    expect(reviewViewDialogMocks.createVueDialogMock).toHaveBeenCalledTimes(1);

    fullscreenItem?.click();
    await flushPromises();
    expect(dialogContainer?.classList.contains('fullscreen')).toBe(true);
    expect(wrapper.get('.fsrs-review-v2-content').classes()).toContain('fullscreen');

    wrapper.unmount();
  });

  it('shows the current priority and updates it from the more menu', async () => {
    const { wrapper, cardEditorService } = mountReviewView();
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    let items = getLatestMenuItems();
    const priorityItem = items.find((item) => item.id === 'edit-current-priority');
    expect(priorityItem?.label).toBe('优先级：42');

    await priorityItem?.click?.();
    await flushPromises();

    const priorityDialogConfig = reviewViewDialogMocks.createVueDialogMock.mock.calls.at(-1)?.[0];
    expect(priorityDialogConfig?.props?.defaultValue).toBe(42);
    priorityDialogConfig?.events?.confirm?.(18);
    await flushPromises();

    expect(cardEditorService.updatePriority).toHaveBeenCalledWith('card-1', 18);

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    items = getLatestMenuItems();
    expect(items.find((item) => item.id === 'edit-current-priority')?.label).toBe('优先级：18');

    wrapper.unmount();
  });

  it('suspends the current card from the more menu and advances to the next card', async () => {
    const { wrapper, queue, cardEditorService } = mountReviewView();
    await flushPromises();

    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const suspendItem = getLatestMenuItems().find((item) => item.id === 'pause-current-card');
    await suspendItem?.click?.();
    await flushPromises();

    expect(cardEditorService.setDismissed).toHaveBeenCalledWith('card-1', true);
    expect(queue.removeCard).toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-1' }),
      { action: 'skip' },
    );
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('suspends and deletes peer cards without advancing the current card', async () => {
    const { wrapper, queue, cardService, cardEditorService } = mountReviewView();
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    let items = getLatestMenuItems();
    const suspendPeersItem = items.find((item) => item.id === 'pause-peer-cards');
    await suspendPeersItem?.click?.();
    await flushPromises();

    expect(cardEditorService.setDismissedMany).toHaveBeenCalledWith(['peer-1', 'peer-2'], true);
    expect(queue.removeCard).toHaveBeenCalledWith('peer-1');
    expect(queue.removeCard).toHaveBeenCalledWith('peer-2');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(true);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    items = getLatestMenuItems();
    const deletePeersItem = items.find((item) => item.id === 'delete-peer-cards');
    await deletePeersItem?.click?.();
    await flushPromises();

    expect(cardService.deleteCards).toHaveBeenCalledWith({ cardIds: ['peer-1', 'peer-2'] });
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(queue.onFeedback).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('confirms before deleting the current card', async () => {
    const { wrapper, queue, cardService } = mountReviewView();
    await flushPromises();

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(false);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    let deleteCurrentItem = getLatestMenuItems().find((item) => item.id === 'delete-current-card');
    await deleteCurrentItem?.click?.();
    await flushPromises();

    expect(cardService.deleteCard).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(true);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    deleteCurrentItem = getLatestMenuItems().find((item) => item.id === 'delete-current-card');
    await deleteCurrentItem?.click?.();
    await flushPromises();

    expect(cardService.deleteCard).toHaveBeenCalledWith({ cardId: 'card-1' });
    expect(queue.removeCard).toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-1' }),
      { action: 'skip' },
    );
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('handles current-card review command requests on the active review surface', async () => {
    const { wrapper, cardEditorService, cardService } = mountReviewView({ attachInDialog: true });
    await flushPromises();

    const priorityEvent = new CustomEvent(REVIEW_SET_PRIORITY_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(priorityEvent);
    await flushPromises();

    expect(priorityEvent.defaultPrevented).toBe(true);
    const priorityDialogConfig = reviewViewDialogMocks.createVueDialogMock.mock.calls.at(-1)?.[0];
    priorityDialogConfig?.events?.confirm?.(12);
    await flushPromises();
    expect(cardEditorService.updatePriority).toHaveBeenCalledWith('card-1', 12);

    const suspendEvent = new CustomEvent(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(suspendEvent);
    await flushPromises();
    expect(suspendEvent.defaultPrevented).toBe(true);
    expect(cardEditorService.setDismissed).toHaveBeenCalledWith('card-1', true);

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(true);
    const deleteEvent = new CustomEvent(REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(deleteEvent);
    await flushPromises();
    expect(deleteEvent.defaultPrevented).toBe(true);
    expect(cardService.deleteCard).toHaveBeenCalledWith({ cardId: 'card-2' });

    wrapper.unmount();
  });

  it('shows a no-current-card message when review commands are consumed without an actionable card', async () => {
    const { wrapper, cardEditorService } = mountReviewView({
      cards: [],
      peerCards: [],
      attachInDialog: true,
    });
    await flushPromises();

    const suspendEvent = new CustomEvent(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(suspendEvent);
    await flushPromises();

    expect(suspendEvent.defaultPrevented).toBe(true);
    expect(cardEditorService.setDismissed).not.toHaveBeenCalled();
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith('当前没有可操作的卡片', 3000, 'info');

    wrapper.unmount();
  });

  it('opens AI sidebar in explain mode by default and tutor mode for neural roam', async () => {
    const explainMount = mountReviewView({ queueType: 'retrieval-practice' });
    await flushPromises();

    explainMount.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', createToolbarEvent());
    await flushPromises();
    expect(explainMount.registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      view: 'explain',
    }));
    explainMount.wrapper.unmount();

    const tutorMount = mountReviewView({ queueType: 'neural-roam' });
    await flushPromises();

    tutorMount.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', createToolbarEvent());
    await flushPromises();
    expect(tutorMount.registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      view: 'tutor',
    }));
    tutorMount.wrapper.unmount();
  });

  it('reuses the existing AI sidebar active view when reopening', async () => {
    const activeSession = {
      state: {
        activeView: 'make-cards',
      },
    };
    const registry = {
      hasReviewSession: vi.fn(() => true),
      getReviewSession: vi.fn(() => activeSession),
      openReviewSession: vi.fn(async (input) => ({
        state: {
          activeView: input.view,
        },
      })),
      updateReviewSessionContext: vi.fn(async (input) => ({
        state: {
          activeView: input.view,
        },
      })),
    };
    const { wrapper } = mountReviewView({ registry });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', createToolbarEvent());
    await flushPromises();

    expect(registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      view: 'make-cards',
    }));

    wrapper.unmount();
  });
});
