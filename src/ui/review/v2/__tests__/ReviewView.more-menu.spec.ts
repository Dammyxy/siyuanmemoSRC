// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import type { ReviewEditableTarget } from '../types';
import { createEmptyReviewUIState } from '../types';
import {
  REVIEW_DELETE_CURRENT_CARD_REQUEST_EVENT,
  REVIEW_LOCATE_CURRENT_SOURCE_REQUEST_EVENT,
  REVIEW_SET_PRIORITY_REQUEST_EVENT,
  REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT,
} from '@/application/handlers/ReviewCommandRequestEvents';
import { openReviewBlockAtSource } from '@/ui/review/openReviewBlockAtSource';
import { CardType } from '@/types/card';

let reviewContentEditableTargets: ReviewEditableTarget[] = [];
const reviewContentRefreshVisibleContent = vi.fn(async () => true);
const reviewContentExitEditorByEscape = vi.fn(() => false);

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
  inputDialogMock: vi.fn(async () => null),
  threeChoiceDialogMock: vi.fn(async () => 'cancel'),
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
  inputDialog: reviewViewDialogMocks.inputDialogMock,
  threeChoiceDialog: reviewViewDialogMocks.threeChoiceDialogMock,
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

type TestReviewCard = ReturnType<typeof buildCard>;

function buildCdfLiveCard(
  id: string,
  sourceBlockId: string,
  status = 'active-live',
  blockId = sourceBlockId,
): TestReviewCard {
  return {
    ...buildCard(id, blockId),
    type: 'definition',
    meta: {
      relationAuthority: 'live-backlink',
      liveRelationKey: `${sourceBlockId}:concept-1:definition-forward`,
      sourceBlockId,
      conceptBlockId: 'concept-1',
      relationKind: 'definition-forward',
      liveRelationStatus: status,
      liveContentStatus: 'content-complete',
    },
  };
}

function buildEditableTarget(
  id: string,
  blockId: string,
  title: string,
  role: ReviewEditableTarget['role'] = 'current-content',
): ReviewEditableTarget {
  return {
    id,
    blockId,
    title,
    role,
    rendererKind: 'main-protyle',
    sourceKind: 'block-markdown',
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
  props: {
    header: {
      type: Object,
      required: true,
    },
  },
  emits: ['toolbar-action', 'action', 'context', 'breadcrumb-click'],
  setup(props, { emit }) {
    return () => h(
      'div',
      { class: 'review-header-stub' },
      ((props.header as { toolbar?: Array<{ type: string; label?: string; ariaLabel?: string; tooltip?: string; active?: boolean }> }).toolbar || [])
        .map(button => h(
          'button',
          {
            class: ['review-header-toolbar-button', { 'review-header-toolbar-button--active': button.active === true }],
            'data-toolbar-action': button.type,
            'aria-label': button.ariaLabel,
            'aria-pressed': button.active === true ? 'true' : undefined,
            title: button.tooltip,
            onClick: (event: MouseEvent) => emit('toolbar-action', button.type, event),
          },
          button.label ? [h('span', button.label)] : [],
        )),
    );
  },
});

const ReviewContentStub = defineComponent({
  name: 'ReviewContent',
  props: {
    content: {
      type: Object,
      required: true,
    },
    showAnswer: {
      type: Boolean,
      default: false,
    },
    renderEpoch: {
      type: Number,
      default: 0,
    },
  },
  setup(props, { expose }) {
    expose({
      exitEditorByEscape: reviewContentExitEditorByEscape,
      getEditableTargets: () => reviewContentEditableTargets,
      refreshVisibleContent: reviewContentRefreshVisibleContent,
    });
    return () => h(
      'div',
      {
        class: 'fsrs-review-v2-content review-content-card-id',
        'data-render-epoch': String((props as { renderEpoch?: number }).renderEpoch ?? 0),
        'data-show-answer': String((props as { showAnswer?: boolean }).showAnswer === true),
      },
      String((props.content as { card?: { id?: string } }).card?.id || ''),
    );
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  emits: ['reveal', 'grade', 'skip', 'back', 'command', 'openMenu'],
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
    loadSnapshot?: ReturnType<typeof vi.fn>;
    updateCardType?: ReturnType<typeof vi.fn>;
    updateRender?: ReturnType<typeof vi.fn>;
    updatePriority: ReturnType<typeof vi.fn>;
    scheduleCard?: ReturnType<typeof vi.fn>;
    setDismissed: ReturnType<typeof vi.fn>;
    setDismissedMany: ReturnType<typeof vi.fn>;
    resetProgress?: ReturnType<typeof vi.fn>;
  };
  unifiedManager?: {
    getCards: ReturnType<typeof vi.fn>;
    getCard: ReturnType<typeof vi.fn>;
    registerObserver?: ReturnType<typeof vi.fn>;
    unregisterObserver?: ReturnType<typeof vi.fn>;
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
    hasReviewAICompanionTab?: ReturnType<typeof vi.fn>;
  };
  dialogManager?: {
    openBrowserDialog?: ReturnType<typeof vi.fn>;
  };
  reviewService?: {
    getEditableBlockMarkdown: ReturnType<typeof vi.fn>;
    getBlockKramdown: ReturnType<typeof vi.fn>;
    updateBlockMarkdown: ReturnType<typeof vi.fn>;
    reconcileCdfLiveRelationsInWriteRepairFlow?: ReturnType<typeof vi.fn>;
    getSiyuanApi: () => {
      BUILTIN_DECK_ID: string;
    };
  };
}) {
  return {
    getUnifiedDataSourceManager: () => overrides?.unifiedManager ?? null,
    getStorage: () => ({
      getSettings: () => ({
        progressiveReading: {
          altXExcerptEnabled: true,
        },
      }),
      getCard: (cardId: string) => ({ id: cardId, blockId: 'block-1' }),
      getCardByBlockId: (blockId: string) => ({ id: 'card-1', blockId }),
    }),
    getReviewService: () => overrides?.reviewService ?? ({
      getEditableBlockMarkdown: vi.fn(async () => ''),
      getBlockKramdown: vi.fn(async () => ''),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    }),
    getCardService: () => overrides?.cardService,
    getCardEditorService: () => overrides?.cardEditorService,
    getDialogManager: () => overrides?.dialogManager,
    getReviewAIWorkbenchRegistry: () => overrides?.registry,
    getTabManager: () => overrides?.tabManager,
    readDomainSyncDiagnostics: vi.fn(async () => ({
      ok: true,
      sanity: {
        status: 'clean',
        repairableDivergenceCount: 0,
        unrepairableDivergenceCount: 0,
        divergentLedgerCount: 0,
        skippedSourceCount: 0,
        pendingImportCount: 0,
        divergentCardCount: 0,
        reasonCounts: {},
        affectedCardIds: [],
        truncated: false,
      },
    })),
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
    loadSnapshot?: ReturnType<typeof vi.fn>;
    updateCardType?: ReturnType<typeof vi.fn>;
    updateRender?: ReturnType<typeof vi.fn>;
    updatePriority: ReturnType<typeof vi.fn>;
    scheduleCard?: ReturnType<typeof vi.fn>;
    setDismissed: ReturnType<typeof vi.fn>;
    setDismissedMany: ReturnType<typeof vi.fn>;
    resetProgress?: ReturnType<typeof vi.fn>;
  };
  unifiedManager?: {
    getCards: ReturnType<typeof vi.fn>;
    getCard: ReturnType<typeof vi.fn>;
    registerObserver?: ReturnType<typeof vi.fn>;
    unregisterObserver?: ReturnType<typeof vi.fn>;
  };
  registry?: {
    hasReviewSession?: ReturnType<typeof vi.fn>;
    getReviewSession?: ReturnType<typeof vi.fn>;
    openReviewSession?: ReturnType<typeof vi.fn>;
    updateReviewSessionContext?: ReturnType<typeof vi.fn>;
  };
  tabManager?: {
    openReviewTab?: ReturnType<typeof vi.fn>;
    openReviewTabInNewTab?: ReturnType<typeof vi.fn>;
    openReviewInNewWindow?: ReturnType<typeof vi.fn>;
    openReviewAICompanionTab?: ReturnType<typeof vi.fn>;
    focusReviewAICompanionTab?: ReturnType<typeof vi.fn>;
    hasReviewAICompanionTab?: ReturnType<typeof vi.fn>;
  };
  dialogManager?: {
    openBrowserDialog?: ReturnType<typeof vi.fn>;
  };
  reviewService?: {
    getEditableBlockMarkdown: ReturnType<typeof vi.fn>;
    getBlockKramdown: ReturnType<typeof vi.fn>;
    updateBlockMarkdown: ReturnType<typeof vi.fn>;
    reconcileCdfLiveRelationsInWriteRepairFlow?: ReturnType<typeof vi.fn>;
    getSiyuanApi: () => {
      BUILTIN_DECK_ID: string;
    };
  };
  attachInDialog?: boolean;
  mode?: 'dialog' | 'tab';
}) {
  const cards = options?.cards ?? [buildCard('card-1'), buildCard('card-2', 'block-2')];
  const queue = createQueue(cards, options?.queueType);
  const adapter = createAdapter();
  const unifiedManager = {
    getCards: vi.fn(async () => cards),
    getCard: vi.fn(async (cardId: string) => (
      cards.find((card) => card.id === cardId) ?? buildCard(cardId)
    )),
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
    ...options?.unifiedManager,
  };

  const cardService = options?.cardService ?? {
    getCardsByBlockId: vi.fn(() => options?.peerCards ?? [cards[0], buildCard('peer-1'), buildCard('peer-2')]),
    deleteCard: vi.fn(async () => ({ ok: true, value: undefined })),
    deleteCards: vi.fn(async () => ({
      ok: true,
      value: {
        deletedCount: 3,
        deletedCardIds: ['card-1', 'peer-1', 'peer-2'],
        failedCardIds: [],
      },
    })),
  };
  const cardEditorService = options?.cardEditorService ?? {
    loadSnapshot: vi.fn(async (_blockId: string, cardId?: string) => ({
      card: {
        ...cards[0],
        id: cardId || cards[0].id,
      },
      blockInfo: { createdAt: cards[0].createdAt, updatedAt: cards[0].updatedAt },
    })),
    updateCardType: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    updateRender: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
      card: {
        ...cards[0],
        priority,
      },
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    scheduleCard: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    setDismissed: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
    })),
    setDismissedMany: vi.fn(async () => ({
      updatedCardIds: ['card-1', 'peer-1', 'peer-2'],
      failedCardIds: [],
    })),
    resetProgress: vi.fn(async () => ({
      card: cards[0],
      blockInfo: { createdAt: null, updatedAt: null },
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
    hasReviewAICompanionTab: vi.fn(() => false),
    ...options?.tabManager,
  };
  const dialogManager = options?.dialogManager ?? {
    openBrowserDialog: vi.fn(),
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
      mode: options?.mode ?? 'dialog',
      plugin: {
        getContext: () => createPluginContext({
          cardService,
          cardEditorService,
          unifiedManager,
          registry,
          reviewService: options?.reviewService,
          tabManager,
          dialogManager,
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
    unifiedManager,
    registry,
    tabManager,
    dialogManager,
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
    reviewContentEditableTargets = [];
    reviewContentRefreshVisibleContent.mockClear();
    reviewContentExitEditorByEscape.mockClear();
    reviewContentExitEditorByEscape.mockReturnValue(false);
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

  it('exits native editor focus with repeated Escape in tab review surfaces', async () => {
    reviewContentExitEditorByEscape.mockReturnValue(true);
    const { wrapper } = mountReviewView({ mode: 'tab', attachInDialog: true });
    await flushPromises();

    wrapper.getComponent(ReviewContentStub).vm.$emit('editor-state-change', {
      renderer: 'main-protyle',
      supportsNativeEdit: true,
      isEditing: true,
    });
    await flushPromises();

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escapeEvent);

    expect(reviewContentExitEditorByEscape).toHaveBeenCalledTimes(1);
    expect(escapeEvent.defaultPrevented).toBe(true);

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

  it('resets current card progress from the more menu without scoring or advancing', async () => {
    const { wrapper, queue, cardEditorService } = mountReviewView();
    await flushPromises();
    const initialNextCalls = queue.next.mock.calls.length;

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const resetItem = getLatestMenuItems().find((item) => item.id === 'reset-current-progress');
    expect(resetItem?.disabled).toBe(false);
    await resetItem?.click?.();
    await flushPromises();

    expect(reviewViewDialogMocks.confirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '确认重置进度',
      content: '这会清空本卡的复习历史，且不能撤销。是否继续？',
    }));
    expect(cardEditorService.resetProgress).toHaveBeenCalledWith('card-1');
    expect(queue.next).toHaveBeenCalledTimes(initialNextCalls);
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith('已重置卡片', 3000, 'info');

    wrapper.unmount();
  });

  it('does not reset current card progress when confirmation is cancelled', async () => {
    const { wrapper, cardEditorService } = mountReviewView();
    await flushPromises();

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(false);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const resetItem = getLatestMenuItems().find((item) => item.id === 'reset-current-progress');
    await resetItem?.click?.();
    await flushPromises();

    expect(cardEditorService.resetProgress).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    wrapper.unmount();
  });

  it('resets only same-source active-live CDF relation cards from the more menu', async () => {
    const currentCard = buildCdfLiveCard('card-1', 'source-1');
    const peerActive = buildCdfLiveCard('card-peer-active', 'source-1', 'active-live', 'peer-block');
    const orphaned = buildCdfLiveCard('card-orphaned', 'source-1', 'orphaned-by-live-relation', 'orphan-block');
    const duplicate = buildCdfLiveCard('card-duplicate', 'source-1', 'duplicate-live-relation', 'duplicate-block');
    const legacyUnavailable = buildCdfLiveCard('card-legacy', 'source-1', 'legacy-relation-unavailable', 'legacy-block');
    const otherSourceActive = buildCdfLiveCard('card-other-source', 'source-2', 'active-live', 'other-block');
    const sameSourceCards = [
      currentCard,
      peerActive,
      orphaned,
      duplicate,
      legacyUnavailable,
      otherSourceActive,
      buildCard('ordinary-card', 'source-1'),
    ];
    const unifiedManager = {
      getCards: vi.fn(async () => sameSourceCards),
      getCard: vi.fn(async (cardId: string) => (
        sameSourceCards.find((card) => card.id === cardId) ?? buildCard(cardId)
      )),
    };
    const cardEditorService = {
      updatePriority: vi.fn(async () => ({
        card: currentCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: currentCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: [],
        failedCardIds: [],
      })),
      resetProgress: vi.fn(async (cardId: string) => ({
        card: sameSourceCards.find((card) => card.id === cardId) ?? buildCard(cardId),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [currentCard, buildCard('card-2', 'block-2')],
      cardEditorService,
      unifiedManager,
    });
    await flushPromises();
    const initialNextCalls = queue.next.mock.calls.length;

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const resetSameSourceItem = getLatestMenuItems().find((item) => item.id === 'reset-same-source-progress');
    expect(resetSameSourceItem?.disabled).toBe(false);
    await resetSameSourceItem?.click?.();
    await flushPromises();

    expect(unifiedManager.getCards).toHaveBeenCalledTimes(1);
    expect(reviewViewDialogMocks.confirmDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '重置同源活跃关系卡',
      content: expect.stringContaining('2 张 active-live 关系卡'),
    }));
    expect(cardEditorService.resetProgress.mock.calls.map(([cardId]) => cardId)).toEqual([
      'card-1',
      'card-peer-active',
    ]);
    expect(cardEditorService.resetProgress).not.toHaveBeenCalledWith('card-orphaned');
    expect(cardEditorService.resetProgress).not.toHaveBeenCalledWith('card-duplicate');
    expect(cardEditorService.resetProgress).not.toHaveBeenCalledWith('card-legacy');
    expect(cardEditorService.resetProgress).not.toHaveBeenCalledWith('card-other-source');
    expect(queue.next).toHaveBeenCalledTimes(initialNextCalls);
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith(
      '已重置 2 张同源活跃关系卡',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('does not reset same-source CDF progress when confirmation is cancelled', async () => {
    const currentCard = buildCdfLiveCard('card-1', 'source-1');
    const peerActive = buildCdfLiveCard('card-peer-active', 'source-1', 'active-live', 'peer-block');
    const unifiedManager = {
      getCards: vi.fn(async () => [currentCard, peerActive]),
      getCard: vi.fn(async (cardId: string) => (
        [currentCard, peerActive].find((card) => card.id === cardId) ?? buildCard(cardId)
      )),
    };
    const cardEditorService = {
      updatePriority: vi.fn(async () => ({
        card: currentCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: currentCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: [],
        failedCardIds: [],
      })),
      resetProgress: vi.fn(async () => ({
        card: currentCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
    };
    const { wrapper } = mountReviewView({
      cards: [currentCard, buildCard('card-2', 'block-2')],
      cardEditorService,
      unifiedManager,
    });
    await flushPromises();

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(false);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const resetSameSourceItem = getLatestMenuItems().find((item) => item.id === 'reset-same-source-progress');
    await resetSameSourceItem?.click?.();
    await flushPromises();

    expect(unifiedManager.getCards).toHaveBeenCalledTimes(1);
    expect(cardEditorService.resetProgress).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    wrapper.unmount();
  });

  it('shows edit-current-content for editable renderers and saves without advancing the session', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:block-1', 'block-1', '编辑当前内容'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'Original body'),
      getBlockKramdown: vi.fn(async () => 'Original body'),
      updateBlockMarkdown: vi.fn(async (blockId: string) => blockId),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper, queue } = mountReviewView({ reviewService });
    await flushPromises();

    const header = wrapper.getComponent(ReviewHeaderStub);
    const editToolbarButton = (header.props('header') as { toolbar: Array<{ type: string; label?: string; ariaLabel?: string; tooltip?: string; active?: boolean }> })
      .toolbar.find(button => button.type === 'edit-current-content');
    expect(editToolbarButton).toMatchObject({
      ariaLabel: '编辑当前内容',
      tooltip: '编辑当前内容',
    });
    expect(editToolbarButton?.label).toBeUndefined();
    expect(wrapper.get('[data-toolbar-action="edit-current-content"]').text()).toBe('');
    expect(wrapper.find('[data-testid="review-inline-edit-button"]').exists()).toBe(false);

    header.vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const editCurrentContentItem = getLatestMenuItems().find((item) => item.id === 'edit-current-content');
    expect(editCurrentContentItem?.label).toBe('编辑当前内容');

    header.vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('block-1');
    expect(reviewService.getBlockKramdown).not.toHaveBeenCalled();
    const activeEditToolbarButton = (wrapper.getComponent(ReviewHeaderStub).props('header') as { toolbar: Array<{ type: string; active?: boolean }> })
      .toolbar.find(button => button.type === 'edit-current-content');
    expect(activeEditToolbarButton?.active).toBe(true);
    expect(wrapper.get('[data-toolbar-action="edit-current-content"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-structured-content-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-inline-card-secondary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-inline-card-secondary"]').element.tagName.toLowerCase()).toBe('details');
    expect(wrapper.find('[data-testid="review-inline-card-secondary"]').attributes('open')).toBeUndefined();
    expect(wrapper.find('[data-testid="review-inline-card-metadata"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="review-structured-content-editor"]').find('[data-field="cardType"]').exists()).toBe(false);
    expect(wrapper.get('.fsrs-review-v2-content').attributes('style')).toContain('display: none');

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    await textarea.setValue('Updated body');
    await flushPromises();

    header.vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledTimes(1);
    expect((wrapper.get('textarea.review-editable-targets-panel__textarea').element as HTMLTextAreaElement).value).toBe('Updated body');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('block-1', 'Updated body');
    expect(queue.next).toHaveBeenCalledTimes(1);
    expect(reviewContentRefreshVisibleContent).toHaveBeenCalledWith('manual-edit-save');
    expect(wrapper.getComponent(ReviewContentStub).props('renderEpoch')).toBe(0);
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(false);
    expect(wrapper.get('.fsrs-review-v2-content').attributes('style') || '').not.toContain('display: none');

    wrapper.unmount();
  });

  it('shows structured question and answer fields from explicit mapping while preserving block writes', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:question-block', 'question-block', '编辑问题'),
      buildEditableTarget('main-protyle:current-content:answer-block', 'answer-block', '编辑答案'),
    ];
    const mappedCard = {
      ...buildCard('card-1', 'question-block'),
      meta: {
        fieldMapping: {
          question: 'question-block',
          answer: 'answer-block',
        },
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async (blockId: string) => (
        blockId === 'answer-block' ? 'Original answer' : 'Original question'
      )),
      getBlockKramdown: vi.fn(async () => ''),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [mappedCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['Question', 'Answer']);
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('question-block');
    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('answer-block');

    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('Original question');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Original answer');
    await textareas[1].setValue('Updated answer');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('answer-block', 'Updated answer');

    wrapper.unmount();
  });

  it('opens forward Item grammar as question and answer fields and preserves source grammar on save', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'What does TCP provide? >> Reliable ordered byte streams.';
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => itemSource),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['Question', 'Answer']);
    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('What does TCP provide?');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Reliable ordered byte streams.');

    await textareas[1].setValue('Reliable, ordered byte streams.');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'What does TCP provide? >> Reliable, ordered byte streams.',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'item-block',
      'Reliable, ordered byte streams.',
    );

    wrapper.unmount();
  });

  it('preserves untouched external grammar fields when saving a dirty Item field', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Original question >> Original answer.';
    const latestSource = 'Externally revised question >> Original answer.';
    let readCount = 0;
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => {
        readCount += 1;
        return readCount === 1 ? itemSource : latestSource;
      }),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    await textareas[1].setValue('Local answer draft.');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'Externally revised question >> Local answer draft.',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'item-block',
      'Original question >> Local answer draft.',
    );

    wrapper.unmount();
  });

  it('keeps the editor open when a dirty Item field changed externally', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Question >> Original answer.';
    const latestSource = 'Question >> External answer.';
    let readCount = 0;
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => {
        readCount += 1;
        return readCount === 1 ? itemSource : latestSource;
      }),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    await textareas[1].setValue('Local answer draft.');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);
    expect(wrapper.get('[role="alert"]').text()).toContain('Answer');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenLastCalledWith(
      '保存当前内容失败：源文档中的「Answer」已被外部修改，请先处理冲突',
      5000,
      'error',
    );

    wrapper.unmount();
  });

  it('uses source latest for a dirty Item field conflict and updates the field draft', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Question >> Original answer.';
    const latestSource = 'Question >> External answer.';
    let readCount = 0;
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => {
        readCount += 1;
        return readCount === 1 ? itemSource : latestSource;
      }),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    let textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    await textareas[1].setValue('Local answer draft.');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="review-editable-target-conflict"]').text()).toContain('Answer');
    const useSourceLatestButton = wrapper.findAll('button').find((button) => button.text() === '使用源文档最新');
    expect(useSourceLatestButton).toBeTruthy();
    await useSourceLatestButton!.trigger('click');
    await flushPromises();

    textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('External answer.');
    expect(wrapper.find('[data-testid="review-editable-target-conflict"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('keeps a dirty Item field draft after conflict choice and saves it into the source-latest grammar', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Original question >> Original answer.';
    const latestSource = 'Externally revised question >> External answer.';
    let readCount = 0;
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => {
        readCount += 1;
        return readCount === 1 ? itemSource : latestSource;
      }),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    await textareas[1].setValue('Local answer draft.');
    await flushPromises();

    let saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    const keepDraftButton = wrapper.findAll('button').find((button) => button.text() === '保留我的草稿');
    expect(keepDraftButton).toBeTruthy();
    await keepDraftButton!.trigger('click');
    await flushPromises();

    saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'Externally revised question >> Local answer draft.',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'item-block',
      'Original question >> Local answer draft.',
    );
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('opens reverse Item grammar in logical question-answer order and preserves << source format', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Reliable ordered byte streams. << What does TCP provide?';
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
        typeMarker: 'reverse',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => itemSource),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.get('[data-testid="review-structured-direction"]').text()).toBe('反向');
    const fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['Question', 'Answer']);
    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('What does TCP provide?');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Reliable ordered byte streams.');

    await textareas[0].setValue('Which service does TCP provide?');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'Reliable ordered byte streams. << Which service does TCP provide?',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'item-block',
      'Which service does TCP provide?',
    );

    wrapper.unmount();
  });

  it('opens both-direction Item grammar and preserves <> source format on save', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const itemSource = 'Question <> Answer';
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-bidirectional',
        typeMarker: 'both',
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => itemSource),
      getBlockKramdown: vi.fn(async () => itemSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.get('[data-testid="review-structured-direction"]').text()).toBe('双向');
    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('Question');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Answer');

    await textareas[0].setValue('Updated question');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'Updated question <> Answer',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'item-block',
      'Updated question',
    );

    wrapper.unmount();
  });

  it('opens invalid Item grammar in source mode and restores structured fields after a valid edit', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:item-block', 'item-block', '编辑问答'),
    ];
    const invalidSource = 'Question >> Answer >> Extra';
    const itemCard = {
      ...buildCard('card-1', 'item-block'),
      type: 'item',
      meta: {
        templateID: 'builtin-quick-card',
        liveRelationIssues: [{
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }],
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => invalidSource),
      getBlockKramdown: vi.fn(async () => invalidSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [itemCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.get('[data-testid="review-structured-field-warning"]').text())
      .toContain('源码语法无效');
    let fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['编辑问答']);

    const sourceTextarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    expect((sourceTextarea.element as HTMLTextAreaElement).value).toBe(invalidSource);
    await sourceTextarea.setValue('Question >> Answer');
    await flushPromises();

    expect(wrapper.find('[data-testid="review-structured-field-warning"]').exists()).toBe(false);
    fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['Question', 'Answer']);
    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('Question');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Answer');

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'item-block',
      'Question >> Answer',
    );

    wrapper.unmount();
  });

  it('previews CDF relation changes and cancels without writing source content', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('definition:definition:definition-block', 'definition-block', '编辑定义', 'definition'),
    ];
    const originalSource = '((20240101010101-aaaaaaa "A")) :> old >> invalid';
    const draftSource = '((20240101010101-bbbbbbb "B")) :> new definition';
    const cdfCard = {
      ...buildCard('card-1', 'definition-block'),
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
        sourceBlockId: 'definition-block',
        conceptBlockId: '20240101010101-aaaaaaa',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [{
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }],
        fieldMapping: {
          concept: '20240101010101-aaaaaaa',
          definition: 'definition-block',
        },
      },
    };
    const dryRun = {
      attempted: true,
      actions: [
        {
          kind: 'create-card',
          relation: {
            conceptBlockId: '20240101010101-bbbbbbb',
            relationKind: 'definition-forward',
            relationKey: 'definition-block:20240101010101-bbbbbbb:definition-forward',
            sourceBlockId: 'definition-block',
          },
          reason: 'missing-live-relation',
        },
        {
          kind: 'update-card-meta',
          cardId: 'card-1',
          status: 'orphaned-by-live-relation',
          relation: null,
          meta: {},
          reason: 'orphaned',
        },
      ],
      createdCards: [],
      updatedCards: [],
      derivedRelationCount: 1,
      reason: 'reconciled',
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => originalSource),
      getBlockKramdown: vi.fn(async () => originalSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      reconcileCdfLiveRelationsInWriteRepairFlow: vi.fn(async () => dryRun),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    reviewViewDialogMocks.createVueDialogMock.mockImplementationOnce((options) => {
      queueMicrotask(() => options.events?.cancel?.());
      return {
        dialog: {} as never,
        destroy: vi.fn(),
      };
    });
    const { wrapper } = mountReviewView({
      cards: [cdfCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toBe(originalSource);
    await textarea.setValue(draftSource);
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow).toHaveBeenCalledTimes(1);
    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow).toHaveBeenCalledWith(expect.objectContaining({
      sourceBlockId: 'definition-block',
      changedBlockId: 'definition-block',
      reconciliationScope: 'block-edit',
      persist: false,
      draftMarkdownByBlockId: {
        'definition-block': draftSource,
      },
    }));
    expect(reviewViewDialogMocks.confirmDialogMock).not.toHaveBeenCalled();
    expect(reviewViewDialogMocks.createVueDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '保存前预览关系变化',
      props: expect.objectContaining({
        currentImpact: '当前卡保存后将移出本轮复习且不评分',
        sessionImpact: '新建或恢复的到期卡后续会按会话规则追加到队尾',
        summary: expect.arrayContaining([
          expect.objectContaining({ key: 'create', count: 1 }),
          expect.objectContaining({ key: 'orphan', count: 1 }),
        ]),
        details: expect.arrayContaining([
          expect.objectContaining({ kind: '新建', text: expect.stringContaining('20240101010101-bbbbbbb') }),
          expect.objectContaining({ kind: '暂停孤儿', text: expect.stringContaining('card-1') }),
        ]),
      }),
    }));
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('confirms CDF relation preview before writing source content and executing reconciliation', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('definition:definition:definition-block', 'definition-block', '编辑定义', 'definition'),
    ];
    const originalSource = '((20240101010101-aaaaaaa "A")) :> old >> invalid';
    const draftSource = '((20240101010101-bbbbbbb "B")) :> new definition';
    const cdfCard = {
      ...buildCard('card-1', 'definition-block'),
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
        sourceBlockId: 'definition-block',
        conceptBlockId: '20240101010101-aaaaaaa',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        liveRelationIssues: [{
          code: 'invalid-source-grammar',
          severity: 'blocking',
        }],
        fieldMapping: {
          concept: '20240101010101-aaaaaaa',
          definition: 'definition-block',
        },
      },
    };
    const dryRun = {
      attempted: true,
      actions: [{
        kind: 'create-card',
        relation: {
          conceptBlockId: '20240101010101-bbbbbbb',
          relationKind: 'definition-forward',
          relationKey: 'definition-block:20240101010101-bbbbbbb:definition-forward',
          sourceBlockId: 'definition-block',
        },
        reason: 'missing-live-relation',
      }],
      createdCards: [],
      updatedCards: [],
      derivedRelationCount: 1,
      reason: 'reconciled',
    };
    const executed = {
      ...dryRun,
      actions: [],
      reason: 'unchanged',
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => originalSource),
      getBlockKramdown: vi.fn(async () => originalSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      reconcileCdfLiveRelationsInWriteRepairFlow: vi.fn(async (options: { persist?: boolean }) => (
        options.persist === false ? dryRun : executed
      )),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    reviewViewDialogMocks.createVueDialogMock.mockImplementationOnce((options) => {
      queueMicrotask(() => options.events?.confirm?.());
      return {
        dialog: {} as never,
        destroy: vi.fn(),
      };
    });
    const { wrapper } = mountReviewView({
      cards: [cdfCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    await textarea.setValue(draftSource);
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewViewDialogMocks.confirmDialogMock).not.toHaveBeenCalled();
    expect(reviewViewDialogMocks.createVueDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      title: '保存前预览关系变化',
      props: expect.objectContaining({
        summary: expect.arrayContaining([
          expect.objectContaining({ key: 'create', count: 1 }),
        ]),
        details: expect.arrayContaining([
          expect.objectContaining({ kind: '新建', text: expect.stringContaining('definition-forward') }),
        ]),
        currentImpact: '当前卡保存后保持在本轮复习中',
      }),
    }));
    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow).toHaveBeenCalledTimes(2);
    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow).toHaveBeenNthCalledWith(1, expect.objectContaining({
      persist: false,
      draftMarkdownByBlockId: {
        'definition-block': draftSource,
      },
    }));
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('definition-block', draftSource);
    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow).toHaveBeenNthCalledWith(2, expect.objectContaining({
      sourceBlockId: 'definition-block',
      changedBlockId: 'definition-block',
      reconciliationScope: 'block-edit',
      persist: true,
    }));
    expect(reviewService.reconcileCdfLiveRelationsInWriteRepairFlow.mock.calls[1]?.[0])
      .not.toHaveProperty('draftMarkdownByBlockId');
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('preserves reveal state when CDF editor save leaves the current card active', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('definition:definition:definition-block', 'definition-block', '编辑定义', 'definition'),
    ];
    const originalSource = '((20240101010101-aaaaaaa "A")) :> old definition';
    const updatedSource = '((20240101010101-aaaaaaa "A")) :> updated definition';
    const cdfCard = {
      ...buildCard('card-1', 'definition-block'),
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
        sourceBlockId: 'definition-block',
        conceptBlockId: '20240101010101-aaaaaaa',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        fieldMapping: {
          concept: '20240101010101-aaaaaaa',
          definition: 'definition-block',
        },
      },
    };
    const updatedCard = {
      ...cdfCard,
      updatedAt: cdfCard.updatedAt + 1,
      meta: {
        ...cdfCard.meta,
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
      },
    };
    const activeResult = {
      attempted: true,
      actions: [{
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'active-live',
        relation: {
          conceptBlockId: '20240101010101-aaaaaaa',
          relationKind: 'definition-forward',
          relationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
          sourceBlockId: 'definition-block',
          contentStatus: 'content-complete',
        },
        meta: updatedCard.meta,
        reason: 'active-live',
      }],
      createdCards: [],
      updatedCards: [updatedCard],
      derivedRelationCount: 1,
      reason: 'reconciled',
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => originalSource),
      getBlockKramdown: vi.fn(async () => originalSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      reconcileCdfLiveRelationsInWriteRepairFlow: vi.fn(async () => activeResult),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [cdfCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewActionsStub).vm.$emit('reveal');
    await flushPromises();
    expect(wrapper.get('.review-content-card-id').attributes('data-show-answer')).toBe('true');

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    await textarea.setValue('updated definition');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewViewDialogMocks.createVueDialogMock).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '保存前预览关系变化',
    }));
    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith('definition-block', updatedSource);
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(wrapper.get('.review-content-card-id').attributes('data-show-answer')).toBe('true');
    expect(queue.removeCard).not.toHaveBeenCalled();
    expect(queue.onFeedback).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('removes current CDF card without scoring when editor save makes content incomplete', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('definition:definition:definition-block', 'definition-block', '编辑定义', 'definition'),
    ];
    const originalSource = '((20240101010101-aaaaaaa "A")) :> old definition';
    const cdfCard = {
      ...buildCard('card-1', 'definition-block'),
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        liveRelationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
        sourceBlockId: 'definition-block',
        conceptBlockId: '20240101010101-aaaaaaa',
        relationKind: 'definition-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        fieldMapping: {
          concept: '20240101010101-aaaaaaa',
          definition: 'definition-block',
        },
      },
    };
    const incompleteMeta = {
      ...cdfCard.meta,
      liveRelationStatus: 'active-live',
      liveContentStatus: 'content-incomplete',
    };
    const incompleteResult = {
      attempted: true,
      actions: [{
        kind: 'update-card-meta',
        cardId: 'card-1',
        status: 'active-live',
        relation: {
          conceptBlockId: '20240101010101-aaaaaaa',
          relationKind: 'definition-forward',
          relationKey: 'definition-block:20240101010101-aaaaaaa:definition-forward',
          sourceBlockId: 'definition-block',
          contentStatus: 'content-incomplete',
        },
        meta: incompleteMeta,
        reason: 'active-live',
      }],
      createdCards: [],
      updatedCards: [{
        ...cdfCard,
        meta: incompleteMeta,
      }],
      derivedRelationCount: 1,
      reason: 'reconciled',
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => originalSource),
      getBlockKramdown: vi.fn(async () => originalSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      reconcileCdfLiveRelationsInWriteRepairFlow: vi.fn(async () => incompleteResult),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [cdfCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    await textarea.setValue('');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(queue.removeCard).toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('opens inline current-content editor with e outside text input only', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:block-1', 'block-1', '编辑当前内容'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'Original body'),
      getBlockKramdown: vi.fn(async () => 'Original body'),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper } = mountReviewView({ reviewService, attachInDialog: true });
    await flushPromises();

    const typingInput = document.createElement('input');
    document.body.appendChild(typingInput);
    typingInput.focus();
    typingInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'e',
      bubbles: true,
      cancelable: true,
    }));
    await flushPromises();
    expect(reviewService.getEditableBlockMarkdown).not.toHaveBeenCalled();

    typingInput.blur();
    document.body.focus();
    wrapper.element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'e',
      bubbles: true,
      cancelable: true,
    }));
    await flushPromises();

    expect(reviewService.getEditableBlockMarkdown).toHaveBeenCalledWith('block-1');
    expect(reviewService.getBlockKramdown).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="review-editable-targets-panel"]').exists()).toBe(true);

    typingInput.remove();
    wrapper.unmount();
  });

  it('opens metadata-only inline card editor when source targets are unavailable', async () => {
    const { wrapper, cardEditorService } = mountReviewView({ attachInDialog: true });
    await flushPromises();

    document.body.focus();
    wrapper.element.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'e',
      bubbles: true,
      cancelable: true,
    }));
    await flushPromises();

    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-structured-content-editor"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-editable-targets-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="review-structured-content-placeholder"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-inline-card-secondary"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="review-inline-card-metadata"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="review-structured-content-editor"]').find('[data-field="cardType"]').exists()).toBe(false);
    expect(wrapper.get('.fsrs-review-v2-content').attributes('style')).toContain('display: none');
    expect(cardEditorService.loadSnapshot).toHaveBeenCalledWith('block-1', 'card-1');
    expect(reviewViewMoreMenuMocks.showMessage).not.toHaveBeenCalledWith('当前内容暂不支持编辑', 3000, 'info');

    wrapper.unmount();
  });

  it('shows readonly live relation context in the structured editor shell', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('descriptor:descriptor:descriptor-block', 'descriptor-block', '编辑描述符', 'descriptor'),
    ];
    const cdfCard = {
      ...buildCard('card-1', 'descriptor-block'),
      type: 'descriptor',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'descriptor-block',
        conceptBlockId: 'concept-doc',
        relationKind: 'descriptor-reverse',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: '操作系统',
          order: 0,
        },
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'Descriptor body'),
      getBlockKramdown: vi.fn(async () => 'Descriptor body'),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [cdfCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.find('[data-testid="review-structured-field-context"]').exists()).toBe(true);
    const chip = wrapper.get('[data-testid="review-structured-relation-chip"]');
    expect(chip.text()).toBe('操作系统');
    expect(chip.attributes('data-readonly')).toBe('true');
    const direction = wrapper.get('[data-testid="review-structured-direction"]');
    expect(direction.text()).toBe('反向');
    expect(direction.attributes('data-readonly')).toBe('true');

    wrapper.unmount();
  });

  it('opens definition grammar as an editable definition field and preserves source grammar on save', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('definition:definition:definition-block', 'definition-block', '编辑定义', 'definition'),
    ];
    const definitionSource = '((20240101010101-abcdefg "TCP")) :< Reliable transport protocol.';
    const definitionCard = {
      ...buildCard('card-1', 'definition-block'),
      type: 'concept',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'definition-block',
        conceptBlockId: '20240101010101-abcdefg',
        relationKind: 'definition-reverse',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        conceptSnapshot: {
          conceptBlockId: '20240101010101-abcdefg',
          displayText: 'TCP',
          order: 0,
        },
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => definitionSource),
      getBlockKramdown: vi.fn(async () => definitionSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [definitionCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.find('[data-testid="review-structured-field-context"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="review-structured-relation-chip"]').text()).toBe('TCP');
    expect(wrapper.get('[data-testid="review-structured-direction"]').text()).toBe('反向');
    expect(wrapper.get('.review-editable-targets-panel__target-title').text()).toBe('Definition');
    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Reliable transport protocol.');

    await textarea.setValue('Connection-oriented transport.');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'definition-block',
      '((20240101010101-abcdefg "TCP")) :< Connection-oriented transport.',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'definition-block',
      'Connection-oriented transport.',
    );

    wrapper.unmount();
  });

  it('opens descriptor grammar as cue and answer fields and preserves source grammar on save', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('descriptor:descriptor:descriptor-block', 'descriptor-block', '编辑描述符', 'descriptor'),
    ];
    const descriptorSource = 'Kernel role ;<> Controls hardware access';
    const descriptorCard = {
      ...buildCard('card-1', 'descriptor-block'),
      type: 'descriptor',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'descriptor-block',
        conceptBlockId: 'concept-doc',
        relationKind: 'descriptor-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Operating System',
          order: 0,
        },
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => descriptorSource),
      getBlockKramdown: vi.fn(async () => descriptorSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [descriptorCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const fieldTitles = wrapper.findAll('.review-editable-targets-panel__target-title')
      .map(title => title.text());
    expect(fieldTitles).toEqual(['Cue', 'Answer']);
    const textareas = wrapper.findAll('textarea.review-editable-targets-panel__textarea');
    expect((textareas[0].element as HTMLTextAreaElement).value).toBe('Kernel role');
    expect((textareas[1].element as HTMLTextAreaElement).value).toBe('Controls hardware access');

    await textareas[1].setValue('Coordinates hardware access');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'descriptor-block',
      'Kernel role ;<> Coordinates hardware access',
    );
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalledWith(
      'descriptor-block',
      'Coordinates hardware access',
    );

    wrapper.unmount();
  });

  it('opens grouped plain descriptor leaf as answer-only and preserves source attributes on save', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('descriptor:descriptor:descriptor-leaf', 'descriptor-leaf', '编辑描述符', 'descriptor'),
    ];
    const descriptorSource = 'Answer only  {: id="leaf-1"}';
    const descriptorCard = {
      ...buildCard('card-1', 'descriptor-leaf'),
      type: 'descriptor',
      meta: {
        relationAuthority: 'live-backlink',
        sourceBlockId: 'descriptor-leaf',
        conceptBlockId: 'concept-doc',
        relationKind: 'descriptor-forward',
        liveRelationStatus: 'active-live',
        liveContentStatus: 'content-complete',
        contentShape: 'descriptor-group-plain',
        conceptSnapshot: {
          conceptBlockId: 'concept-doc',
          displayText: 'Operating System',
          order: 0,
        },
      },
    };
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => descriptorSource),
      getBlockKramdown: vi.fn(async () => descriptorSource),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper } = mountReviewView({
      cards: [descriptorCard, buildCard('card-2', 'block-2')],
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.get('.review-editable-targets-panel__target-title').text()).toBe('Answer');
    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('Answer only');

    await textarea.setValue('Updated answer');
    await flushPromises();

    const saveButton = wrapper.findAll('button').find((button) => button.text() === '保存');
    expect(saveButton).toBeTruthy();
    await saveButton!.trigger('click');
    await flushPromises();

    expect(reviewService.updateBlockMarkdown).toHaveBeenCalledWith(
      'descriptor-leaf',
      'Updated answer  {: id="leaf-1"}',
    );

    wrapper.unmount();
  });

  it('applies card type changes through the inline metadata editor and syncs the render family', async () => {
    const conceptCard = {
      ...buildCard('card-1'),
      type: CardType.Concept,
      cardTypeMarker: 'concept',
      meta: {
        renderProfile: 'concept',
        typeMarker: 'C',
        templateID: 'builtin-concept-simple',
        cardTypeMarker: 'concept',
      },
    };
    const updateCardType = vi.fn(async (_cardId: string, targetType: CardType) => ({
      card: {
        ...conceptCard,
        type: targetType,
      },
      status: 'applied',
      blockInfo: { createdAt: null, updatedAt: null },
    }));
    const cardEditorService = {
      loadSnapshot: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      updateCardType,
      updateRender: vi.fn(async () => ({
        card: conceptCard,
        status: 'unchanged',
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
        card: { ...conceptCard, priority },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      scheduleCard: vi.fn(async () => ({
        card: conceptCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: conceptCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: ['card-1'],
        failedCardIds: [],
      })),
      resetProgress: vi.fn(async () => ({
        card: conceptCard,
        blockInfo: { createdAt: null, updatedAt: null },
      })),
    };
    const { wrapper } = mountReviewView({ cardEditorService, attachInDialog: true });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);
    await wrapper.findAll('[data-field="cardType"] .srs-type-option')[2].trigger('click');
    await flushPromises();

    expect(updateCardType).toHaveBeenCalledWith('card-1', CardType.Concept);
    expect((wrapper.get('[data-field="render"] select').element as HTMLSelectElement).value).toBe('concept');
    expect(wrapper.get('[data-field="render"]').text()).toContain('当前为推荐渲染');

    wrapper.unmount();
  });

  it('keeps card attribute mutations outside the dirty content draft save path', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:block-1', 'block-1', '编辑当前内容'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'Original body'),
      getBlockKramdown: vi.fn(async () => 'Original body'),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
        pushMsg: vi.fn(),
        pushErrMsg: vi.fn(),
      }),
    };
    const updateCardType = vi.fn(async (_cardId: string, targetType: CardType) => ({
      card: {
        ...buildCard('card-1'),
        type: targetType,
      },
      status: 'applied',
      blockInfo: { createdAt: null, updatedAt: null },
    }));
    const cardEditorService = {
      loadSnapshot: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      updateCardType,
      updateRender: vi.fn(async () => ({
        card: buildCard('card-1'),
        status: 'unchanged',
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
        card: { ...buildCard('card-1'), priority },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      scheduleCard: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: ['card-1'],
        failedCardIds: [],
      })),
      resetProgress: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
    };
    const { wrapper } = mountReviewView({
      cardEditorService,
      reviewService,
      attachInDialog: true,
    });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();

    const textarea = wrapper.get('textarea.review-editable-targets-panel__textarea');
    await textarea.setValue('Dirty content draft');
    await flushPromises();

    await wrapper.findAll('[data-field="cardType"] .srs-type-option')[2].trigger('click');
    await flushPromises();

    expect(updateCardType).toHaveBeenCalledWith('card-1', CardType.Concept);
    expect(reviewService.updateBlockMarkdown).not.toHaveBeenCalled();
    expect((wrapper.get('textarea.review-editable-targets-panel__textarea').element as HTMLTextAreaElement).value)
      .toBe('Dirty content draft');
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(true);

    wrapper.unmount();
  });

  it('pauses review actions while the inline editor is open and resumes after cancel', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:block-1', 'block-1', '编辑当前内容'),
    ];
    const reviewService = {
      getEditableBlockMarkdown: vi.fn(async () => 'Original body'),
      getBlockKramdown: vi.fn(async () => 'Original body'),
      updateBlockMarkdown: vi.fn(async () => undefined),
      getSiyuanApi: () => ({
        BUILTIN_DECK_ID: 'deck-1',
      }),
    };
    const { wrapper, queue } = mountReviewView({ reviewService, attachInDialog: true });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'edit-current-content', createToolbarEvent());
    await flushPromises();
    expect(wrapper.find('[data-testid="review-editable-targets-panel"]').exists()).toBe(true);
    expect(wrapper.get('.fsrs-review-v2-content').attributes('style')).toContain('display: none');

    wrapper.getComponent(ReviewActionsStub).vm.$emit('reveal');
    wrapper.getComponent(ReviewActionsStub).vm.$emit('grade', 3);
    wrapper.getComponent(ReviewActionsStub).vm.$emit('skip');
    wrapper.getComponent(ReviewActionsStub).vm.$emit('back');
    wrapper.element.dispatchEvent(new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true,
    }));
    wrapper.element.dispatchEvent(new KeyboardEvent('keydown', {
      key: '3',
      bubbles: true,
      cancelable: true,
    }));
    await flushPromises();

    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(queue.next).toHaveBeenCalledTimes(1);

    const cancelButton = wrapper.findAll('button').find((button) => button.text() === '取消');
    await cancelButton!.trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="review-editable-targets-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="review-inline-card-editor"]').exists()).toBe(false);
    expect(wrapper.get('.fsrs-review-v2-content').attributes('style') || '').not.toContain('display: none');

    wrapper.getComponent(ReviewActionsStub).vm.$emit('reveal');
    await flushPromises();
    wrapper.getComponent(ReviewActionsStub).vm.$emit('grade', 3);

    await vi.waitFor(() => {
      expect(queue.onFeedback).toHaveBeenCalledTimes(1);
    });

    wrapper.unmount();
  });

  it('hides edit-current-content when the active renderer is not editable', async () => {
    const { wrapper } = mountReviewView();
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    expect(getLatestMenuItems().find((item) => item.id === 'edit-current-content')).toBeUndefined();

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

  it('unsuspends an already suspended current card from the more menu without advancing', async () => {
    const suspendedCard = {
      ...buildCard('card-1'),
      meta: {
        suspended: true,
      },
    };
    const cardEditorService = {
      updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
        card: {
          ...suspendedCard,
          priority,
        },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: {
          ...suspendedCard,
          meta: {},
        },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: ['card-1', 'peer-1', 'peer-2'],
        failedCardIds: [],
      })),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [suspendedCard, buildCard('card-2', 'block-2')],
      cardEditorService,
    });
    await flushPromises();

    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const suspendItem = getLatestMenuItems().find((item) => item.id === 'pause-current-card');
    expect(suspendItem?.label).toBe('取消暂停这张卡片');
    await suspendItem?.click?.();
    await flushPromises();

    expect(cardEditorService.setDismissed).toHaveBeenCalledWith('card-1', false);
    expect(queue.removeCard).not.toHaveBeenCalled();
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith(
      '已取消暂停这张卡片',
      3000,
      'info',
    );

    wrapper.unmount();
  });

  it('suspends current and peer cards from the more menu and advances the current card', async () => {
    const { wrapper, queue, cardEditorService } = mountReviewView();
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    let items = getLatestMenuItems();
    const suspendPeersItem = items.find((item) => item.id === 'pause-peer-cards');
    expect(suspendPeersItem?.label).toBe('暂停这张卡片和同块的其余 2 张卡片');
    await suspendPeersItem?.click?.();
    await flushPromises();

    expect(cardEditorService.setDismissedMany).toHaveBeenCalledWith(['card-1', 'peer-1', 'peer-2'], true);
    expect(queue.removeCard).toHaveBeenCalledWith('peer-1');
    expect(queue.removeCard).toHaveBeenCalledWith('peer-2');
    expect(queue.removeCard).toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-1' }),
      { action: 'skip' },
    );
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('deletes current and peer cards from the more menu and advances the current card', async () => {
    const { wrapper, queue, cardService } = mountReviewView();
    await flushPromises();

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(true);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const items = getLatestMenuItems();
    const deletePeersItem = items.find((item) => item.id === 'delete-peer-cards');
    expect(deletePeersItem?.label).toBe('删除这张卡片和同块的其余 2 张卡片');
    await deletePeersItem?.click?.();
    await flushPromises();

    expect(cardService.deleteCards).toHaveBeenCalledWith({ cardIds: ['card-1', 'peer-1', 'peer-2'] });
    expect(queue.removeCard).toHaveBeenCalledWith('peer-1');
    expect(queue.removeCard).toHaveBeenCalledWith('peer-2');
    expect(queue.removeCard).toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'card-1' }),
      { action: 'skip' },
    );
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('keeps the current card when a batch suspend only updates peer cards', async () => {
    const cardEditorService = {
      updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
        card: {
          ...buildCard('card-1'),
          priority,
        },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: buildCard('card-1'),
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: ['peer-1', 'peer-2'],
        failedCardIds: ['card-1'],
      })),
    };
    const { wrapper, queue } = mountReviewView({ cardEditorService });
    await flushPromises();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const suspendPeersItem = getLatestMenuItems().find((item) => item.id === 'pause-peer-cards');
    await suspendPeersItem?.click?.();
    await flushPromises();

    expect(cardEditorService.setDismissedMany).toHaveBeenCalledWith(['card-1', 'peer-1', 'peer-2'], true);
    expect(queue.removeCard).toHaveBeenCalledWith('peer-1');
    expect(queue.removeCard).toHaveBeenCalledWith('peer-2');
    expect(queue.removeCard).not.toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith(
      '已暂停 2 张卡片，另有 1 张失败',
      4000,
      'error',
    );

    wrapper.unmount();
  });

  it('keeps the current card when a batch delete only deletes peer cards', async () => {
    const cards = [buildCard('card-1'), buildCard('card-2', 'block-2')];
    const cardService = {
      getCardsByBlockId: vi.fn(() => [cards[0], buildCard('peer-1'), buildCard('peer-2')]),
      deleteCard: vi.fn(async () => ({ ok: true, value: undefined })),
      deleteCards: vi.fn(async () => ({
        ok: true,
        value: {
          deletedCount: 2,
          deletedCardIds: ['peer-1', 'peer-2'],
          failedCardIds: ['card-1'],
        },
      })),
    };
    const { wrapper, queue } = mountReviewView({ cards, cardService });
    await flushPromises();

    reviewViewDialogMocks.confirmDialogMock.mockResolvedValueOnce(true);
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();

    const deletePeersItem = getLatestMenuItems().find((item) => item.id === 'delete-peer-cards');
    await deletePeersItem?.click?.();
    await flushPromises();

    expect(cardService.deleteCards).toHaveBeenCalledWith({ cardIds: ['card-1', 'peer-1', 'peer-2'] });
    expect(queue.removeCard).toHaveBeenCalledWith('peer-1');
    expect(queue.removeCard).toHaveBeenCalledWith('peer-2');
    expect(queue.removeCard).not.toHaveBeenCalledWith('card-1');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');
    expect(reviewViewMoreMenuMocks.showMessage).toHaveBeenCalledWith(
      '已删除 2 张卡片，另有 1 张失败',
      4000,
      'error',
    );

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

  it('locates the current review source through review command requests', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:source-block-1', 'source-block-1', 'Source'),
    ];
    const { wrapper } = mountReviewView({ attachInDialog: true });
    await flushPromises();

    const locateEvent = new CustomEvent(REVIEW_LOCATE_CURRENT_SOURCE_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(locateEvent);
    await flushPromises();

    expect(locateEvent.defaultPrevented).toBe(true);
    expect(openReviewBlockAtSource).toHaveBeenCalledWith({
      app: {},
      blockId: 'source-block-1',
    });

    wrapper.unmount();
  });

  it('shows a CDF blocking interruption panel and advances without review feedback', async () => {
    reviewContentEditableTargets = [
      buildEditableTarget('main-protyle:current-content:source-block-1', 'source-block-1', 'Source'),
    ];
    const blockedCard = {
      ...buildCdfLiveCard('blocked-cdf-card', 'source-block-1'),
      meta: {
        ...buildCdfLiveCard('blocked-cdf-card', 'source-block-1').meta,
        liveContentStatus: 'content-incomplete',
      },
    };
    const nextCard = buildCard('card-2', 'block-2');
    const dialogManager = {
      openBrowserDialog: vi.fn(),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [blockedCard, nextCard],
      dialogManager,
      attachInDialog: true,
    });
    await flushPromises();

    expect(wrapper.get('.fsrs-review-v2__cdf-interruption').text()).toContain('Content incomplete');
    expect(wrapper.findComponent(ReviewActionsStub).exists()).toBe(false);

    await wrapper.get('.fsrs-review-v2__cdf-interruption-actions .b3-button--outline').trigger('click');
    await flushPromises();
    expect(openReviewBlockAtSource).toHaveBeenCalledWith({
      app: {},
      blockId: 'source-block-1',
    });

    const actionButtons = wrapper.findAll('.fsrs-review-v2__cdf-interruption-actions button');
    await actionButtons[2].trigger('click');
    expect(dialogManager.openBrowserDialog).toHaveBeenCalledWith({
      initialOpenState: {
        preset: 'cdf-abnormal',
        queryText: 'source-block-1',
      },
    });

    await wrapper.get('[data-review-cdf-blocking-next]').trigger('click');
    await flushPromises();

    expect(queue.removeCard).toHaveBeenCalledWith('blocked-cdf-card');
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-2');

    wrapper.unmount();
  });

  it('does not interrupt Review for warning-only CDF issues', async () => {
    const warningCard = {
      ...buildCdfLiveCard('warning-cdf-card', 'source-block-1'),
      meta: {
        ...buildCdfLiveCard('warning-cdf-card', 'source-block-1').meta,
        liveRelationIssues: [
          {
            code: 'duplicate-ref',
            severity: 'warning',
          },
        ],
      },
    };
    const { wrapper } = mountReviewView({
      cards: [warningCard, buildCard('card-2', 'block-2')],
    });
    await flushPromises();

    expect(wrapper.find('.fsrs-review-v2__cdf-interruption').exists()).toBe(false);
    expect(wrapper.findComponent(ReviewActionsStub).exists()).toBe(true);

    wrapper.unmount();
  });

  it('unsuspends the current card through review command requests on the active review surface', async () => {
    const suspendedCard = {
      ...buildCard('card-1'),
      meta: {
        suspended: true,
      },
    };
    const cardEditorService = {
      updatePriority: vi.fn(async (_cardId: string, priority: number) => ({
        card: {
          ...suspendedCard,
          priority,
        },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissed: vi.fn(async () => ({
        card: {
          ...suspendedCard,
          meta: {},
        },
        blockInfo: { createdAt: null, updatedAt: null },
      })),
      setDismissedMany: vi.fn(async () => ({
        updatedCardIds: ['card-1', 'peer-1', 'peer-2'],
        failedCardIds: [],
      })),
    };
    const { wrapper, queue } = mountReviewView({
      cards: [suspendedCard, buildCard('card-2', 'block-2')],
      cardEditorService,
      attachInDialog: true,
    });
    await flushPromises();

    const suspendEvent = new CustomEvent(REVIEW_SUSPEND_CURRENT_CARD_REQUEST_EVENT, { cancelable: true });
    window.dispatchEvent(suspendEvent);
    await flushPromises();

    expect(suspendEvent.defaultPrevented).toBe(true);
    expect(cardEditorService.setDismissed).toHaveBeenCalledWith('card-1', false);
    expect(queue.removeCard).not.toHaveBeenCalled();
    expect(queue.onFeedback).not.toHaveBeenCalled();
    expect(wrapper.get('.review-content-card-id').text()).toBe('card-1');

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

  it('opens AI sidebar with the configured default view and keeps neural roam on concept-coach', async () => {
    const explainMount = mountReviewView({ queueType: 'retrieval-practice' });
    await flushPromises();

    explainMount.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', createToolbarEvent());
    await flushPromises();
    expect(explainMount.registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      view: 'general-chat',
    }));
    explainMount.wrapper.unmount();

    const tutorMount = mountReviewView({ queueType: 'neural-roam' });
    await flushPromises();

    tutorMount.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'ai-sidebar', createToolbarEvent());
    await flushPromises();
    expect(tutorMount.registry.openReviewSession).toHaveBeenCalledWith(expect.objectContaining({
      view: 'general-chat',
    }));
    tutorMount.wrapper.unmount();
  });

  it('reuses the existing AI sidebar active view when reopening', async () => {
    const activeSession = {
      state: {
        activeView: 'concept-coach',
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
      view: 'concept-coach',
    }));

    wrapper.unmount();
  });

  it('does not sync review AI context while the dialog sidecar is hidden', async () => {
    const registry = {
      hasReviewSession: vi.fn(() => true),
      getReviewSession: vi.fn(() => ({
        state: {
          activeView: 'general-chat',
        },
      })),
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
    registry.updateReviewSessionContext.mockClear();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    await getLatestMenuItems().find((item) => item.id === 'pause-current-card')?.click?.();
    await flushPromises();

    expect(registry.updateReviewSessionContext).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('syncs review AI context while the dialog sidecar is visible', async () => {
    const registry = {
      hasReviewSession: vi.fn(() => true),
      getReviewSession: vi.fn(() => ({
        state: {
          activeView: 'general-chat',
        },
      })),
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
    registry.updateReviewSessionContext.mockClear();

    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    await getLatestMenuItems().find((item) => item.id === 'pause-current-card')?.click?.();
    await flushPromises();

    expect(registry.updateReviewSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-dialog-sidecar',
      currentBlockId: 'block-2',
      currentCard: expect.objectContaining({
        id: 'card-2',
      }),
    }));

    wrapper.unmount();
  });

  it('syncs review AI context in tab mode only while the companion tab exists', async () => {
    const registry = {
      hasReviewSession: vi.fn(() => true),
      getReviewSession: vi.fn(() => ({
        state: {
          activeView: 'general-chat',
        },
      })),
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
    const hiddenCompanion = mountReviewView({
      mode: 'tab',
      registry,
      tabManager: {
        hasReviewAICompanionTab: vi.fn(() => false),
      },
    });
    await flushPromises();
    registry.updateReviewSessionContext.mockClear();

    hiddenCompanion.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    await getLatestMenuItems().find((item) => item.id === 'pause-current-card')?.click?.();
    await flushPromises();

    expect(registry.updateReviewSessionContext).not.toHaveBeenCalled();
    hiddenCompanion.wrapper.unmount();

    const reviewAICompanionRuntimes = {
      has: vi.fn(() => true),
    };
    const hasReviewAICompanionTab = vi.fn(function (
      this: { reviewAICompanionRuntimes: { has: (reviewSessionId: string) => boolean } },
      reviewSessionId: string,
    ) {
      return this.reviewAICompanionRuntimes.has(reviewSessionId);
    });
    const visibleCompanion = mountReviewView({
      mode: 'tab',
      registry,
      tabManager: {
        reviewAICompanionRuntimes,
        hasReviewAICompanionTab,
      } as never,
    });
    await flushPromises();
    registry.updateReviewSessionContext.mockClear();

    visibleCompanion.wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'more', createToolbarEvent());
    await flushPromises();
    await getLatestMenuItems().find((item) => item.id === 'pause-current-card')?.click?.();
    await flushPromises();

    expect(registry.updateReviewSessionContext).toHaveBeenCalledWith(expect.objectContaining({
      surface: 'review-tab-companion',
    }));
    expect(reviewAICompanionRuntimes.has).toHaveBeenCalled();
    visibleCompanion.wrapper.unmount();
  });
});
