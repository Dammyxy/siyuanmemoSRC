// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, type PropType } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReviewView from '../ReviewView.vue';
import { createEmptyReviewUIState, type ReviewUIState } from '../types';
import { CardState, CardType, type FSRSCard } from '@/types/card';

const reviewViewNeuralEntryMocks = vi.hoisted(() => {
  const menuOpen = vi.fn();
  const showMessage = vi.fn();
  const instances: Array<{ addItem: ReturnType<typeof vi.fn>; addSeparator: ReturnType<typeof vi.fn>; open: ReturnType<typeof vi.fn> }> = [];

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

const reviewViewNeuralEntryLoggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  trace: vi.fn(),
}));

vi.mock('siyuan', () => ({
  Menu: reviewViewNeuralEntryMocks.MockMenu,
  showMessage: reviewViewNeuralEntryMocks.showMessage,
}));

vi.mock('@/utils/logger', () => ({
  createLogger: () => reviewViewNeuralEntryLoggerMocks,
  logger: reviewViewNeuralEntryLoggerMocks,
  setGlobalLogLevel: vi.fn(),
  getGlobalLogLevel: vi.fn(() => 'warn'),
}));

vi.mock('@/ui/review/openReviewBlockAtSource', () => ({
  openReviewBlockAtSource: vi.fn(),
}));

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    id: 'card-1',
    xiuyuanID: 'xy-1',
    blockId: 'block-1',
    due: 0,
    stability: 1,
    difficulty: 5,
    reps: 0,
    lapses: 0,
    state: CardState.New,
    lastReview: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    priority: 50,
    type: CardType.Item,
    tags: [],
    leechCount: 0,
    isLeech: false,
    skipped: false,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function createQueue() {
  return {
    getType: () => 'retrieval-practice',
    next: vi.fn(async () => null),
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

function createAdapter(currentCard: FSRSCard) {
  return {
    toUIState: vi.fn(async () => ({
      ...createEmptyReviewUIState(),
      header: {
        ...createEmptyReviewUIState().header,
        title: 'Review',
        toolbar: [
          { type: 'ai-sidebar', icon: '#iconSparkles', ariaLabel: 'AI Sidebar' },
          { type: 'more', icon: '#iconMore', ariaLabel: 'More' },
        ],
      },
      content: {
        type: 'protyle' as const,
        data: currentCard.blockId,
        id: currentCard.blockId,
        card: currentCard,
      },
      actions: {
        ...createEmptyReviewUIState().actions,
        cardMeta: {
          cardID: currentCard.id,
          blockID: currentCard.blockId,
          type: 'item',
          cardType: 'item',
        },
      },
    })),
    cleanup: vi.fn(),
    resetSessionState: vi.fn(),
  };
}

const ReviewHeaderStub = defineComponent({
  name: 'ReviewHeader',
  props: {
    header: {
      type: Object as PropType<ReviewUIState['header']>,
      required: true,
    },
  },
  emits: ['toolbar-action', 'action', 'context', 'breadcrumb-click', 'queue-switch'],
  setup(props) {
    return () => h('div', { class: 'review-header-stub' }, JSON.stringify(props.header.toolbar ?? []));
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
  setup() {
    return () => h('div', { class: 'review-content-stub' });
  },
});

const ReviewActionsStub = defineComponent({
  name: 'ReviewActions',
  emits: ['reveal', 'grade', 'back'],
  setup() {
    return () => h('div', { class: 'review-actions-stub' });
  },
});

describe('ReviewView NeuralRoam entry menu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
    reviewViewNeuralEntryMocks.instances.length = 0;
  });

  it('adds a compact NeuralRoam toolbar trigger when current card has a block id', async () => {
    const entryActionService = {
      startTemporaryCurrentBlockRoam: vi.fn(async () => ({ ok: true })),
    };
    const wrapper = mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: createQueue() as never,
        adapter: createAdapter(card()) as never,
        mode: 'dialog',
        title: 'Review',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getNeuralRoamEntryActionService: () => entryActionService,
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

    await flushPromises();

    const toolbar = wrapper.getComponent(ReviewHeaderStub).props('header').toolbar ?? [];
    expect(toolbar.map((button) => button.type)).toEqual(['ai-sidebar', 'neural-roam-entry', 'more']);
    expect(toolbar.find((button) => button.type === 'neural-roam-entry')).toMatchObject({
      icon: '#iconGraph',
      ariaLabel: '神经漫游',
    });

    wrapper.unmount();
  });

  it('routes temporary current-block menu action through the shared service', async () => {
    const entryActionService = {
      startTemporaryCurrentBlockRoam: vi.fn(async () => ({ ok: true })),
      establishStation: vi.fn(async () => ({ ok: true })),
    };
    const wrapper = mount(ReviewView, {
      attachTo: document.body,
      props: {
        app: {} as never,
        queue: createQueue() as never,
        adapter: createAdapter(card({ id: 'card-current', blockId: 'block-current' })) as never,
        mode: 'dialog',
        title: 'Review',
        headerVariant: 'retrieval-practice',
        plugin: {
          getContext: () => ({
            getNeuralRoamEntryActionService: () => entryActionService,
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

    await flushPromises();
    wrapper.getComponent(ReviewHeaderStub).vm.$emit('toolbar-action', 'neural-roam-entry', new MouseEvent('click'));
    await flushPromises();

    const menu = reviewViewNeuralEntryMocks.instances.at(-1);
    const groups = menu?.addItem.mock.calls.map(([item]) => item) ?? [];
    const temporaryGroup = groups.find((item) => item.label === '临时漫游');
    const currentBlockItem = temporaryGroup?.submenu?.find((item: { id?: string }) => item.id === 'temporary-current-block-roam');
    currentBlockItem.click();
    await flushPromises();

    expect(entryActionService.startTemporaryCurrentBlockRoam).toHaveBeenCalledWith({
      blockId: 'block-current',
      sourceReviewCardId: 'card-current',
    });
    expect(reviewViewNeuralEntryMocks.showMessage).toHaveBeenCalledWith('从当前块临时漫游已完成', 2500, 'info');

    wrapper.unmount();
  });
});
